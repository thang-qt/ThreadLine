package main

import (
	"bytes"
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/html"
)

func nodeAttr(n *html.Node, key string) string {
	if n == nil {
		return ""
	}
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}
func hasClass(n *html.Node, name string) bool {
	for _, c := range strings.Fields(nodeAttr(n, "class")) {
		if c == name {
			return true
		}
	}
	return false
}
func findNode(n *html.Node, test func(*html.Node) bool) *html.Node {
	if n == nil {
		return nil
	}
	if test(n) {
		return n
	}
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		if found := findNode(child, test); found != nil {
			return found
		}
	}
	return nil
}
func classNode(n *html.Node, name string) *html.Node {
	return findNode(n, func(n *html.Node) bool { return hasClass(n, name) })
}
func nodeText(n *html.Node) string {
	if n == nil {
		return ""
	}
	var out strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			out.WriteString(n.Data)
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(n)
	return strings.TrimSpace(out.String())
}
func innerHTML(n *html.Node) string {
	if n == nil {
		return ""
	}
	var out bytes.Buffer
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		html.Render(&out, child)
	}
	return out.String()
}
func hnDate(n *html.Node) time.Time {
	age := classNode(n, "age")
	parts := strings.Fields(nodeAttr(age, "title"))
	if len(parts) > 0 {
		for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05"} {
			if t, e := time.Parse(layout, parts[0]); e == nil {
				return t
			}
		}
	}
	return time.Time{}
}
func firstNumber(s string) int {
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return 0
	}
	n, _ := strconv.Atoi(fields[0])
	return n
}
func (a *app) hnHTMLDiscussion(ctx context.Context, id string, q url.Values, d *discussionData) error {
	page := 1
	if n, e := strconv.Atoi(q.Get("page")); e == nil && n > 0 && n < 10000 {
		page = n
	}
	address := "https://news.ycombinator.com/item?id=" + id
	if page > 1 {
		address += "&p=" + strconv.Itoa(page)
	}
	var raw rawPage
	if err := a.get(ctx, address, &raw); err != nil {
		return err
	}
	return parseHNPage(string(raw), id, page, q.Get("parent"), d)
}
func parseHNPage(raw, id string, page int, parent string, d *discussionData) error {
	doc, err := html.Parse(strings.NewReader(raw))
	if err != nil {
		return err
	}
	submission := findNode(doc, func(n *html.Node) bool {
		return hasClass(n, "athing") && nodeAttr(n, "id") == id && !hasClass(n, "comtr")
	})
	if submission == nil {
		return fmt.Errorf("HN story markup unavailable")
	}
	titleline := classNode(submission, "titleline")
	link := findNode(titleline, func(n *html.Node) bool { return n.Data == "a" })
	if link == nil || nodeText(link) == "" {
		return fmt.Errorf("HN story title unavailable")
	}
	fat := classNode(doc, "fatitem")
	if fat == nil {
		return fmt.Errorf("HN story container unavailable")
	}
	discussion := "https://news.ycombinator.com/item?id=" + id
	article := nodeAttr(link, "href")
	u, e := url.Parse(article)
	base, _ := url.Parse("https://news.ycombinator.com/")
	if e != nil {
		return fmt.Errorf("invalid article link")
	}
	article = base.ResolveReference(u).String()
	count := 0
	var scanCount func(*html.Node)
	scanCount = func(n *html.Node) {
		if n.Data == "a" && strings.Contains(nodeText(n), "comment") {
			count = firstNumber(nodeText(n))
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			scanCount(child)
		}
	}
	scanCount(fat)
	d.Story = normalize(Story{Title: nodeText(link), URL: article, Discussion: discussion, Author: nodeText(classNode(fat, "hnuser")), Source: "hn", Points: firstNumber(nodeText(classNode(fat, "score"))), Comments: count, Created: hnDate(fat)})
	d.Body = safeHTML(innerHTML(classNode(fat, "toptext")), "https://news.ycombinator.com/")
	tree := classNode(doc, "comment-tree")
	if tree == nil {
		if count > 0 {
			return fmt.Errorf("HN comment markup unavailable")
		}
		return nil
	}
	var rows []*html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if hasClass(n, "comtr") {
			rows = append(rows, n)
			return
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(tree)
	type level struct {
		depth int
		node  *Comment
	}
	var stack []level
	nodes := map[string]*Comment{}
	for _, row := range rows {
		commentID := nodeAttr(row, "id")
		if !validID("hn", commentID) || nodes[commentID] != nil {
			continue
		}
		if len(nodes) >= 1000 {
			d.Error = "This discussion is large; open HN for additional comments."
			break
		}
		depth, e := strconv.Atoi(nodeAttr(classNode(row, "ind"), "indent"))
		if e != nil || depth < 0 || depth > 256 {
			return fmt.Errorf("HN comment indentation unavailable")
		}
		text := classNode(row, "commtext")
		body := safeHTML(innerHTML(text), "https://news.ycombinator.com/")
		if text == nil || hasClass(row, "dead") || hasClass(row, "deleted") {
			body = "[Comment deleted or unavailable]"
		}
		c := &Comment{ID: commentID, Author: nodeText(classNode(row, "hnuser")), URL: "https://news.ycombinator.com/item?id=" + commentID, Body: body, Created: hnDate(row)}
		nodes[commentID] = c
		for len(stack) > 0 && stack[len(stack)-1].depth >= depth {
			stack = stack[:len(stack)-1]
		}
		if len(stack) > 0 && len(stack) < 32 {
			p := stack[len(stack)-1].node
			p.Children = append(p.Children, c)
		} else {
			d.Comments = append(d.Comments, c)
		}
		stack = append(stack, level{depth, c})
	}
	if len(rows) == 0 && count > 0 {
		return fmt.Errorf("HN comment rows unavailable")
	}
	local := "/discussion/hn/" + id
	if parent != "" {
		if !validID("hn", parent) || nodes[parent] == nil {
			return fmt.Errorf("comment not on HN page")
		}
		d.Comments = []*Comment{nodes[parent]}
		d.ContextURL = fmt.Sprintf("%s?page=%d", local, page)
	}
	more := classNode(doc, "morelink")
	if more != nil {
		u, e := url.Parse(nodeAttr(more, "href"))
		if e != nil {
			return fmt.Errorf("invalid HN pagination")
		}
		if (u.Host == "" || u.Host == "news.ycombinator.com") && (u.Path == "item" || u.Path == "/item") && u.Query().Get("id") == id {
			if next, e := strconv.Atoi(u.Query().Get("p")); e == nil && next > page && next < 10000 {
				d.NextURL = fmt.Sprintf("%s?page=%d", local, next)
			}
		}
	}
	if page > 1 {
		d.PreviousURL = fmt.Sprintf("%s?page=%d", local, page-1)
	}
	return nil
}
