package main

import (
	"bytes"
	"context"
	"fmt"
	stdhtml "html"
	"html/template"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/net/html"
)

type staleKey struct{}

func staleFallback(ctx context.Context, body []byte, target any) bool {
	flag, _ := ctx.Value(staleKey{}).(*atomic.Bool)
	if flag != nil && len(body) > 0 && decodeResource(body, target) == nil {
		flag.Store(true)
		return true
	}
	return false
}

type Comment struct {
	ID, Author, URL, MoreURL string
	Body                     template.HTML
	Created                  time.Time
	Children                 []*Comment
	Points                   int
	HasPoints                bool
}
type discussionData struct {
	Story                                   Story
	Body                                    template.HTML
	Comments                                []*Comment
	CSS                                     template.CSS
	Error, NextURL, PreviousURL, ContextURL string
	ProviderNotice                          string
}
type hnItem struct {
	ID, Parent                 int
	Type, Title, URL, By, Text string
	Score, Descendants         int
	Time                       int64
	Kids                       []int
	Deleted, Dead              bool
}

func (s Story) LocalDiscussion() string {
	u, err := url.Parse(s.Discussion)
	if err != nil {
		return s.Discussion
	}
	id := ""
	if s.Source == "hn" {
		id = u.Query().Get("id")
	} else {
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(parts) >= 2 && parts[0] == "s" {
			id = parts[1]
		}
	}
	if !validID(s.Source, id) {
		return s.Discussion
	}
	return "/discussion/" + s.Source + "/" + id
}
func validID(source, id string) bool {
	if len(id) == 0 || len(id) > 12 {
		return false
	}
	for _, c := range id {
		if c >= '0' && c <= '9' {
			continue
		}
		if source == "lobsters" && c >= 'a' && c <= 'z' {
			continue
		}
		return false
	}
	return source == "hn" || source == "lobsters"
}

// Rebuild only known formatting elements. All text and URL attributes are escaped;
// active content, style, image requests, and event attributes never reach the page.
func safeHTML(raw, base string) template.HTML {
	doc, err := html.Parse(strings.NewReader(raw))
	if err != nil {
		return template.HTML(stdhtml.EscapeString(raw))
	}
	var out bytes.Buffer
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			out.WriteString(stdhtml.EscapeString(n.Data))
			return
		}
		if n.Type != html.ElementNode && n.Type != html.DocumentNode {
			return
		}
		tag := n.Data
		switch tag {
		case "script", "style", "iframe", "object", "embed", "svg", "math", "form", "input", "button", "textarea", "select", "template":
			return
		}
		allowed := false
		switch tag {
		case "p", "br", "em", "i", "strong", "b", "pre", "code", "blockquote", "ul", "ol", "li", "hr", "s", "del":
			allowed = true
		case "a":
			allowed = true
		}
		if allowed {
			out.WriteByte('<')
			out.WriteString(tag)
			if tag == "a" {
				for _, attr := range n.Attr {
					if attr.Key != "href" {
						continue
					}
					u, e := url.Parse(strings.TrimSpace(attr.Val))
					if e != nil {
						break
					}
					b, _ := url.Parse(base)
					u = b.ResolveReference(u)
					if u.Scheme == "http" || u.Scheme == "https" || u.Scheme == "mailto" {
						out.WriteString(` href="` + stdhtml.EscapeString(u.String()) + `" rel="nofollow noopener"`)
					}
					break
				}
			}
			out.WriteByte('>')
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
		if allowed && tag != "br" && tag != "hr" {
			out.WriteString("</" + tag + ">")
		}
	}
	walk(doc)
	return template.HTML(out.String())
}
func (a *app) discussion(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) != 3 || !validID(parts[1], parts[2]) {
		http.NotFound(w, r)
		return
	}
	if r.Method != "GET" && r.Method != "HEAD" {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", 405)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	var stale atomic.Bool
	ctx = context.WithValue(ctx, staleKey{}, &stale)
	d := discussionData{CSS: a.css}
	var err error
	if parts[1] == "hn" {
		err = a.hnDiscussion(ctx, parts[2], r.URL.Query(), &d)
	} else {
		err = a.lobstersDiscussion(ctx, parts[2], &d)
	}
	if err != nil {
		d.Error = "Discussion is temporarily unavailable. Try again, or open it on the source site."
		if d.Story.Title == "" {
			d.Story.Title = "Discussion"
		}
		if parts[1] == "hn" {
			d.Story.Discussion = "https://news.ycombinator.com/item?id=" + parts[2]
		} else {
			d.Story.Discussion = "https://lobste.rs/s/" + parts[2]
		}
		d.Story.Source = parts[1]
	}
	if stale.Load() {
		d.Error += " Upstream is unavailable; showing cached comments."
	}
	if d.Error != "" {
		w.Header().Set("Cache-Control", "no-store")
	}
	var body bytes.Buffer
	if err := a.page.ExecuteTemplate(&body, "discussion.html", d); err != nil {
		http.Error(w, "Unable to render discussion", 500)
		return
	}
	if err != nil {
		w.Header().Set("Cache-Control", "no-store")
		a.respond(w, r, body.Bytes(), http.StatusBadGateway)
		return
	}
	a.respond(w, r, body.Bytes())
}
func (a *app) hnFirebaseDiscussion(ctx context.Context, id string, q url.Values, d *discussionData) error {
	var story hnItem
	if err := a.get(ctx, "https://hacker-news.firebaseio.com/v0/item/"+id+".json", &story); err != nil {
		return err
	}
	if story.ID == 0 || story.Deleted || story.Dead || (story.Type != "story" && story.Type != "poll" && story.Type != "job") {
		return fmt.Errorf("story unavailable")
	}
	d.Story = normalize(Story{Title: story.Title, URL: story.URL, Discussion: "https://news.ycombinator.com/item?id=" + id, Author: story.By, Source: "hn", Comments: story.Descendants, Points: story.Score, Created: time.Unix(story.Time, 0)})
	d.Body = safeHTML(story.Text, "https://news.ycombinator.com")
	base := "/discussion/hn/" + id
	kids := story.Kids
	var focus *Comment
	if parent := q.Get("parent"); parent != "" {
		if !validID("hn", parent) {
			return fmt.Errorf("invalid parent")
		}
		var item hnItem
		if err := a.get(ctx, "https://hacker-news.firebaseio.com/v0/item/"+parent+".json", &item); err != nil {
			return err
		}
		if item.Type != "comment" {
			return fmt.Errorf("invalid comment")
		}
		ancestor := item.Parent
		for depth := 0; ancestor != story.ID && depth < 32; depth++ {
			if ancestor <= 0 {
				return fmt.Errorf("invalid ancestry")
			}
			var p hnItem
			if err := a.get(ctx, fmt.Sprintf("https://hacker-news.firebaseio.com/v0/item/%d.json", ancestor), &p); err != nil {
				return err
			}
			ancestor = p.Parent
		}
		if ancestor != story.ID {
			return fmt.Errorf("comment outside thread")
		}
		focus = hnComment(item)
		d.Comments = []*Comment{focus}
		kids = item.Kids
		d.ContextURL = base
	}
	page := 1
	if n, e := strconv.Atoi(q.Get("page")); e == nil && n > 0 && n < 10000 {
		page = n
	}
	start := min((page-1)*20, len(kids))
	end := min(start+20, len(kids))
	suffix := ""
	if focus != nil {
		suffix = "&parent=" + focus.ID
	}
	if end < len(kids) {
		d.NextURL = fmt.Sprintf("%s?page=%d%s", base, page+1, suffix)
	}
	if page > 1 {
		d.PreviousURL = fmt.Sprintf("%s?page=%d%s", base, page-1, suffix)
	}
	type job struct {
		id   int
		node *Comment
	}
	var jobs []job
	seen := map[int]bool{story.ID: true}
	if focus != nil {
		n, _ := strconv.Atoi(focus.ID)
		seen[n] = true
	}
	add := func(ids []int, dest *[]*Comment) {
		for _, id := range ids {
			if seen[id] {
				continue
			}
			seen[id] = true
			c := &Comment{ID: strconv.Itoa(id)}
			*dest = append(*dest, c)
			jobs = append(jobs, job{id, c})
		}
	}
	if focus != nil {
		add(kids[start:end], &focus.Children)
	} else {
		add(kids[start:end], &d.Comments)
	}
	fetched := 0
	for depth := 0; len(jobs) > 0 && depth < 4; depth++ {
		batch := jobs
		jobs = nil
		items := make([]hnItem, len(batch))
		failed := make([]bool, len(batch))
		var wg sync.WaitGroup
		queue := make(chan int)
		for range min(8, len(batch)) {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for i := range queue {
					err := a.get(ctx, fmt.Sprintf("https://hacker-news.firebaseio.com/v0/item/%d.json", batch[i].id), &items[i])
					failed[i] = err != nil || items[i].ID == 0
				}
			}()
		}
		for i := range batch {
			queue <- i
		}
		close(queue)
		wg.Wait()
		fetched += len(batch)
		for i, j := range batch {
			if failed[i] {
				j.node.Body = "[Comment unavailable]"
				d.Error = "Some comments could not be loaded. Refresh to retry."
				continue
			}
			*j.node = *hnComment(items[i])
			remaining := items[i].Kids
			limit := min(3, len(remaining), max(0, 100-fetched-len(jobs)))
			if depth == 3 {
				limit = 0
			}
			add(remaining[:limit], &j.node.Children)
			if limit < len(remaining) {
				j.node.MoreURL = base + "?parent=" + j.node.ID
			}
		}
	}
	return nil
}
func hnComment(item hnItem) *Comment {
	body := safeHTML(item.Text, "https://news.ycombinator.com")
	if item.Deleted || item.Dead {
		body = "[Comment deleted or unavailable]"
	}
	created := time.Time{}
	if item.Time > 0 {
		created = time.Unix(item.Time, 0)
	}
	return &Comment{ID: strconv.Itoa(item.ID), Author: item.By, URL: fmt.Sprintf("https://news.ycombinator.com/item?id=%d", item.ID), Body: body, Created: created}
}
func (a *app) lobstersDiscussion(ctx context.Context, id string, d *discussionData) error {
	var raw struct {
		Title, URL  string
		Discussion  string    `json:"comments_url"`
		Author      string    `json:"submitter_user"`
		Points      int       `json:"score"`
		Count       int       `json:"comment_count"`
		Created     time.Time `json:"created_at"`
		Description string    `json:"description"`
		Comments    []struct {
			ID        string    `json:"short_id"`
			Parent    string    `json:"parent_comment"`
			Author    string    `json:"commenting_user"`
			Body      string    `json:"comment"`
			URL       string    `json:"url"`
			Created   time.Time `json:"created_at"`
			Points    int       `json:"score"`
			Deleted   bool      `json:"is_deleted"`
			Moderated bool      `json:"is_moderated"`
		}
	}
	if err := a.get(ctx, "https://lobste.rs/s/"+id+".json", &raw); err != nil {
		return err
	}
	if raw.Title == "" {
		return fmt.Errorf("story unavailable")
	}
	d.Story = normalize(Story{Title: raw.Title, URL: raw.URL, Discussion: raw.Discussion, Author: raw.Author, Source: "lobsters", Comments: raw.Count, Points: raw.Points, Created: raw.Created})
	d.Body = safeHTML(raw.Description, "https://lobste.rs")
	nodes := map[string]*Comment{}
	parents := map[string]string{}
	var order []string
	for _, r := range raw.Comments {
		if _, ok := nodes[r.ID]; ok || r.ID == "" {
			continue
		}
		if len(nodes) >= 1000 {
			d.Error = "This discussion is large; open the original for additional comments."
			break
		}
		body := safeHTML(r.Body, "https://lobste.rs")
		if r.Deleted || r.Moderated {
			body = "[Comment deleted or moderated]"
		}
		nodes[r.ID] = &Comment{ID: r.ID, Author: r.Author, URL: r.URL, Body: body, Created: r.Created, Points: r.Points, HasPoints: true}
		parents[r.ID] = r.Parent
		order = append(order, r.ID)
	}
	for _, id := range order {
		node := nodes[id]
		parent := parents[id]
		valid := nodes[parent] != nil
		ancestor := parent
		seen := map[string]bool{id: true}
		for depth := 0; valid && ancestor != ""; depth++ {
			if seen[ancestor] || depth >= 32 {
				valid = false
				break
			}
			seen[ancestor] = true
			ancestor = parents[ancestor]
		}
		if valid {
			nodes[parent].Children = append(nodes[parent].Children, node)
		} else {
			d.Comments = append(d.Comments, node)
		}
	}
	return nil
}
