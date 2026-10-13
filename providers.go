package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

type rawPage string

func decodeResource(body []byte, target any) error {
	if page, ok := target.(*rawPage); ok {
		*page = rawPage(body)
		return nil
	}
	return json.Unmarshal(body, target)
}
func parseHNProviders(raw string) ([]string, error) {
	var out []string
	seen := map[string]bool{}
	for _, name := range strings.Split(raw, ",") {
		name = strings.TrimSpace(name)
		if name != "algolia" && name != "firebase" && name != "html" {
			return nil, fmt.Errorf("HN_DISCUSSION_PROVIDERS accepts algolia, firebase, html")
		}
		if !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out, nil
}
func (a *app) hnDiscussion(ctx context.Context, id string, q url.Values, d *discussionData) error {
	providers := append([]string(nil), a.hnProviders...)
	// Keep pagination/branch navigation with the provider that produced it,
	// but never allow a query to enable a disabled provider.
	if preferred := q.Get("via"); preferred != "" {
		for i, name := range providers {
			if name == preferred {
				providers = append([]string{name}, append(providers[:i], providers[i+1:]...)...)
				break
			}
		}
	}
	var failures []error
	var partial *discussionData
	var partialStale bool
	for _, name := range providers {
		if ctx.Err() != nil {
			break
		}
		timeout := 3 * time.Second
		if name == "firebase" {
			timeout = 5 * time.Second
		}
		providerCtx, cancel := context.WithTimeout(ctx, timeout)
		var stale atomic.Bool
		providerCtx = context.WithValue(providerCtx, staleKey{}, &stale)
		candidate := discussionData{CSS: d.CSS}
		var err error
		switch name {
		case "algolia":
			err = a.hnAlgoliaDiscussion(providerCtx, id, q, &candidate)
		case "firebase":
			err = a.hnFirebaseDiscussion(providerCtx, id, q, &candidate)
		case "html":
			err = a.hnHTMLDiscussion(providerCtx, id, q, &candidate)
		}
		cancel()
		if err != nil {
			failures = append(failures, fmt.Errorf("%s: %w", name, err))
			continue
		}
		switch name {
		case "algolia":
			candidate.ProviderNotice = "Comments via HN Search. Updates may lag and comment order can differ from HN."
		case "firebase":
			candidate.ProviderNotice = "Comments via the official HN API."
		}
		markProviderLinks(&candidate, name)
		if candidate.Error != "" || stale.Load() {
			if partial == nil {
				copy := candidate
				partial = &copy
				partialStale = stale.Load()
			}
			continue
		}
		*d = candidate
		return nil
	}
	if partial != nil {
		*d = *partial
		if flag, ok := ctx.Value(staleKey{}).(*atomic.Bool); ok && partialStale {
			flag.Store(true)
		}
		return nil
	}
	if len(failures) == 0 {
		return fmt.Errorf("discussion providers unavailable")
	}
	return errors.Join(failures...)
}
func markProviderLinks(d *discussionData, name string) {
	add := func(raw string) string {
		if raw == "" {
			return ""
		}
		u, e := url.Parse(raw)
		if e != nil {
			return raw
		}
		q := u.Query()
		q.Set("via", name)
		u.RawQuery = q.Encode()
		return u.String()
	}
	d.NextURL = add(d.NextURL)
	d.PreviousURL = add(d.PreviousURL)
	d.ContextURL = add(d.ContextURL)
	var walk func([]*Comment)
	walk = func(nodes []*Comment) {
		for _, n := range nodes {
			n.MoreURL = add(n.MoreURL)
			walk(n.Children)
		}
	}
	walk(d.Comments)
}

type algoliaItem struct {
	ID                             int
	Type, Author, Title, URL, Text string
	Points                         int
	Created                        int64 `json:"created_at_i"`
	Children                       []*algoliaItem
}

func (a *app) hnAlgoliaDiscussion(ctx context.Context, id string, q url.Values, d *discussionData) error {
	var root algoliaItem
	if err := a.get(ctx, "https://hn.algolia.com/api/v1/items/"+id, &root); err != nil {
		return err
	}
	if strconv.Itoa(root.ID) != id || root.Title == "" || (root.Type != "story" && root.Type != "poll" && root.Type != "job") {
		return fmt.Errorf("story not indexed")
	}
	count := 0
	seen := map[int]bool{}
	var visit func(*algoliaItem, int)
	visit = func(n *algoliaItem, depth int) {
		if depth > 256 || seen[n.ID] || count >= 10000 {
			return
		}
		seen[n.ID] = true
		for _, child := range n.Children {
			if child != nil && child.Type != "pollopt" {
				count++
				visit(child, depth+1)
			}
		}
	}
	visit(&root, 0)
	// A newly indexed empty tree must not mask comments already seen in the live feed.
	if count == 0 {
		a.mu.RLock()
		missing := false
		for _, feed := range a.feeds {
			for _, story := range feed.Stories {
				if story.Source == "hn" && story.Discussion == "https://news.ycombinator.com/item?id="+id && story.Comments > 0 {
					missing = true
				}
			}
		}
		a.mu.RUnlock()
		if missing {
			return fmt.Errorf("comments not indexed yet")
		}
	}
	d.Story = normalize(Story{Title: root.Title, URL: root.URL, Discussion: "https://news.ycombinator.com/item?id=" + id, Source: "hn", Author: root.Author, Points: root.Points, Comments: count, Created: time.Unix(root.Created, 0)})
	d.Body = safeHTML(root.Text, "https://news.ycombinator.com")
	base := "/discussion/hn/" + id
	children := root.Children
	var focus *algoliaItem
	if parent := q.Get("parent"); parent != "" {
		if !validID("hn", parent) {
			return fmt.Errorf("invalid comment ID")
		}
		var find func(*algoliaItem, int)
		find = func(n *algoliaItem, depth int) {
			if depth > 256 || focus != nil {
				return
			}
			if strconv.Itoa(n.ID) == parent {
				focus = n
				return
			}
			for _, child := range n.Children {
				if child != nil {
					find(child, depth+1)
				}
			}
		}
		for _, child := range root.Children {
			if child != nil {
				find(child, 0)
			}
		}
		if focus == nil {
			return fmt.Errorf("reply not indexed")
		}
		children = focus.Children
		d.ContextURL = base
	}
	var visible []*algoliaItem
	for _, child := range children {
		if child != nil && child.Type != "pollopt" {
			visible = append(visible, child)
		}
	}
	page := 1
	if n, e := strconv.Atoi(q.Get("page")); e == nil && n > 0 && n < 10000 {
		page = n
	}
	start := min((page-1)*20, len(visible))
	end := min(start+20, len(visible))
	suffix := ""
	if focus != nil {
		suffix = "&parent=" + strconv.Itoa(focus.ID)
	}
	if end < len(visible) {
		d.NextURL = fmt.Sprintf("%s?page=%d%s", base, page+1, suffix)
	}
	if page > 1 {
		d.PreviousURL = fmt.Sprintf("%s?page=%d%s", base, page-1, suffix)
	}
	budget := 1000
	rendered := map[int]bool{}
	var convert func(*algoliaItem, int) *Comment
	convert = func(n *algoliaItem, depth int) *Comment {
		if n == nil || rendered[n.ID] {
			return nil
		}
		rendered[n.ID] = true
		body := safeHTML(n.Text, "https://news.ycombinator.com")
		if n.Author == "" && n.Text == "" {
			body = "[Comment deleted or unavailable]"
		}
		c := &Comment{ID: strconv.Itoa(n.ID), Author: n.Author, Body: body, URL: fmt.Sprintf("https://news.ycombinator.com/item?id=%d", n.ID)}
		if n.Created > 0 {
			c.Created = time.Unix(n.Created, 0)
		}
		budget--
		for _, child := range n.Children {
			if child == nil || child.Type == "pollopt" {
				continue
			}
			if depth >= 32 || budget <= 0 {
				c.MoreURL = base + "?parent=" + c.ID
				break
			}
			if reply := convert(child, depth+1); reply != nil {
				c.Children = append(c.Children, reply)
			}
		}
		return c
	}
	// Reserve a slot for every visible top-level node, even if one branch is huge.
	budget -= end - start
	for _, node := range visible[start:end] {
		budget++
		if c := convert(node, 0); c != nil {
			d.Comments = append(d.Comments, c)
		}
	}
	if focus != nil {
		body := safeHTML(focus.Text, "https://news.ycombinator.com")
		if focus.Author == "" && focus.Text == "" {
			body = "[Comment deleted or unavailable]"
		}
		c := &Comment{ID: strconv.Itoa(focus.ID), Author: focus.Author, Body: body, URL: fmt.Sprintf("https://news.ycombinator.com/item?id=%d", focus.ID), Children: d.Comments}
		if focus.Created > 0 {
			c.Created = time.Unix(focus.Created, 0)
		}
		d.Comments = []*Comment{c}
	}
	return nil
}
