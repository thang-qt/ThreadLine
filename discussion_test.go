package main

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func fixtureApp(fixtures map[string]string, calls *atomic.Int32) *app {
	return newApp(&http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		body, ok := fixtures[r.URL.Path]
		if !ok {
			return nil, fmt.Errorf("unexpected request %s", r.URL.Path)
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})})
}
func TestHNDiscussion(t *testing.T) {
	var calls atomic.Int32
	a := fixtureApp(map[string]string{
		"/v0/item/1.json": `{"id":1,"type":"story","title":"Test story","by":"submitter","descendants":5,"kids":[2]}`,
		"/v0/item/2.json": `{"id":2,"parent":1,"type":"comment","deleted":true,"text":"secret deleted text","kids":[3,4,5,6]}`,
		"/v0/item/3.json": `{"id":3,"parent":2,"type":"comment","by":"alice","text":"<p>A <strong>nested reply</strong></p>"}`,
		"/v0/item/4.json": `{"id":4,"parent":2,"type":"comment","text":"Four"}`,
		"/v0/item/5.json": `{"id":5,"parent":2,"type":"comment","text":"Five"}`,
		"/v0/item/6.json": `{"id":6,"parent":2,"type":"comment","text":"Six"}`,
	}, &calls)
	w := httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/discussion/hn/1", nil))
	body := w.Body.String()
	for _, want := range []string{"Test story", "Comment deleted", "<strong>nested reply</strong>", "?parent=2", "More replies"} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %q: %s", want, body)
		}
	}
	if strings.Contains(body, "secret deleted text") || strings.Contains(body, ">Six<") {
		t.Fatal("deleted text leaked or reply limit ignored")
	}
	before := calls.Load()
	w = httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/discussion/hn/1", nil))
	if calls.Load() != before {
		t.Fatal("warm thread refetched")
	}
	w = httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/discussion/hn/1?parent=2", nil))
	if !strings.Contains(w.Body.String(), ">Six<") || !strings.Contains(w.Body.String(), "Full discussion") {
		t.Fatal("local reply expansion failed")
	}
}
func TestLobstersDiscussion(t *testing.T) {
	var calls atomic.Int32
	a := fixtureApp(map[string]string{"/s/abc123.json": `{"title":"Lobsters thread","comments_url":"https://lobste.rs/s/abc123","description":"<p>Story body</p>","comments":[{"short_id":"child","parent_comment":"root","commenting_user":"bob","comment":"<p>Nested reply</p>","score":3},{"short_id":"root","commenting_user":"alice","comment":"<p>Root reply</p>"},{"short_id":"gone","is_deleted":true,"comment":"private deleted text"}]}`}, &calls)
	w := httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/discussion/lobsters/abc123", nil))
	body := w.Body.String()
	if w.Code != 200 {
		t.Fatal(w.Code, body)
	}
	if strings.Index(body, `id="comment-root"`) > strings.Index(body, `id="comment-child"`) {
		t.Fatal("parent rendered after child")
	}
	if !strings.Contains(body, "Nested reply") || !strings.Contains(body, "3 points") || strings.Contains(body, "private deleted text") {
		t.Fatal("incorrect thread rendering")
	}
}
func TestSafeCommentHTML(t *testing.T) {
	raw := `<p onclick="alert(1)">hello <strong>world</strong><script>alert(1)</script><img src="https://tracker.test"><a href="jav&#x61;script:alert(1)">bad</a><a href="/item?id=1" style="color:red">good</a><iframe src="https://tracker.test"></iframe><svg onload="bad()"></svg></p><pre>&lt;script&gt;</pre>`
	out := string(safeHTML(raw, "https://news.ycombinator.com"))
	for _, bad := range []string{"onclick", "javascript:", "tracker.test", "<script>", "style=", "onload"} {
		if strings.Contains(out, bad) {
			t.Fatalf("unsafe HTML %s: %s", bad, out)
		}
	}
	for _, want := range []string{"<strong>world</strong>", `href="https://news.ycombinator.com/item?id=1"`, "&lt;script&gt;"} {
		if !strings.Contains(out, want) {
			t.Fatalf("formatting lost: %s", out)
		}
	}
}
func TestDiscussionErrors(t *testing.T) {
	var calls atomic.Int32
	a := fixtureApp(nil, &calls)
	for _, path := range []string{"/discussion/other/1", "/discussion/hn/../bad", "/discussion/lobsters/a/b"} {
		w := httptest.NewRecorder()
		a.serve(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 404 {
			t.Fatal(path, w.Code)
		}
	}
	w := httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/discussion/hn/1", nil))
	if w.Code != 502 || w.Header().Get("Cache-Control") != "no-store" || !strings.Contains(w.Body.String(), "Original discussion") {
		t.Fatal("unhelpful upstream failure", w.Code, w.Header())
	}
}
