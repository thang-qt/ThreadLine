package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const hnPageFixture = `<html><table class="fatitem"><tr class="athing submission" id="1"><td><span class="titleline"><a href="https://example.com/story">HTML story</a></span></td></tr><tr><td><span class="score">123 points</span><a class="hnuser">submitter</a><span class="age" title="2026-10-12T09:00:00"></span><a href="item?id=1">3 comments</a></td></tr><tr><td><div class="toptext"><p>Story description</p></div></td></tr></table><table class="comment-tree"><tr class="athing comtr" id="2"><td class="ind" indent="0"></td><td><a class="hnuser">alice</a><span class="age" title="2026-10-12T10:00:00"></span><div class="commtext"><p>Root <strong>comment</strong><script>unsafe()</script></p></div></td></tr><tr class="athing comtr deleted" id="3"><td class="ind" indent="1"></td><td><div class="commtext">deleted secret</div></td></tr><tr class="athing comtr" id="4"><td class="ind" indent="2"></td><td><a class="hnuser">bob</a><div class="commtext">Reply below deleted parent</div></td></tr></table><a class="morelink" href="item?id=1&amp;p=2">More</a></html>`

func TestHTMLProviderPreferred(t *testing.T) {
	var calls atomic.Int32
	a := fixtureApp(map[string]string{"/item": hnPageFixture}, &calls)
	w := httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/discussion/hn/1", nil))
	body := w.Body.String()
	if w.Code != 200 || !strings.Contains(body, "HTML story") || !strings.Contains(body, "Reply below deleted parent") || strings.Contains(body, "deleted secret") || strings.Contains(body, "unsafe()") {
		t.Fatal("HTML discussion failed", w.Code, body)
	}
	if !strings.Contains(body, "page=2&amp;via=html") || calls.Load() != 1 {
		t.Fatal("HTML provider not first or pagination lost", calls.Load())
	}
	before := calls.Load()
	w = httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/discussion/hn/1", nil))
	if calls.Load() != before {
		t.Fatal("cached HTML refetched")
	}
}
func TestFallbackToFullAlgoliaTree(t *testing.T) {
	var calls atomic.Int32
	a := fixtureApp(map[string]string{"/api/v1/items/1": `{"id":1,"type":"story","title":"Indexed story","author":"submitter","children":[{"id":2,"children":[{"id":3,"type":"comment","author":"alice","text":"<p>Nested reply</p>","children":[{"id":4,"author":"bob","text":"Four","children":[{"id":5,"author":"c","text":"Five","children":[{"id":6,"author":"d","text":"Deep reply"}]}]}]}]}]}`}, &calls)
	w := httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/discussion/hn/1", nil))
	body := w.Body.String()
	if w.Code != 200 || !strings.Contains(body, "Deep reply") || !strings.Contains(body, "Updates may lag") || !strings.Contains(body, "Comment deleted") {
		t.Fatal("Algolia fallback lost full tree", w.Code, body)
	}
	if calls.Load() != 3 {
		t.Fatal("unexpected fallback order", calls.Load())
	}
	before := calls.Load()
	w = httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/discussion/hn/1?parent=3&via=algolia", nil))
	if calls.Load() != before || !strings.Contains(w.Body.String(), "Full discussion") || !strings.Contains(w.Body.String(), "Deep reply") {
		t.Fatal("Algolia branch did not reuse full-tree cache")
	}
}
func TestHTMLCrawlDelay(t *testing.T) {
	var calls atomic.Int32
	a := fixtureApp(map[string]string{"/item": hnPageFixture}, &calls)
	var raw rawPage
	if err := a.get(context.Background(), "https://news.ycombinator.com/item?id=1", &raw); err != nil {
		t.Fatal(err)
	}
	if err := a.get(context.Background(), "https://news.ycombinator.com/item?id=2", &raw); err == nil || calls.Load() != 1 {
		t.Fatal("crawl delay not enforced")
	}
	if time.Until(a.hnHTMLNext) < 29*time.Second {
		t.Fatal("crawl delay too short")
	}
}
func TestProviderConfiguration(t *testing.T) {
	providers, err := parseHNProviders("html, firebase,algolia,html")
	if err != nil || strings.Join(providers, ",") != "html,firebase,algolia" {
		t.Fatal(providers, err)
	}
	for _, raw := range []string{"", "html,other", "algolia,"} {
		if _, err := parseHNProviders(raw); err == nil {
			t.Fatal("invalid provider accepted", raw)
		}
	}
	var calls atomic.Int32
	a := fixtureApp(map[string]string{"/api/v1/items/1": `{"id":1,"type":"story","title":"Only configured provider"}`}, &calls)
	a.hnProviders = []string{"algolia"}
	var d discussionData
	if err := a.hnDiscussion(context.Background(), "1", url.Values{"via": {"html"}}, &d); err != nil || calls.Load() != 1 {
		t.Fatal("query enabled disabled provider", err, calls.Load())
	}
}
func TestMalformedHTMLFallsBack(t *testing.T) {
	var calls atomic.Int32
	a := fixtureApp(map[string]string{"/item": `<html><title>Try again later</title></html>`, "/v0/item/1.json": `{"id":1,"type":"story","title":"Live API story"}`}, &calls)
	w := httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/discussion/hn/1", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Live API story") || !strings.Contains(w.Body.String(), "official HN API") {
		t.Fatal("malformed HTML prevented fallback")
	}
}
func TestTimeoutStillFallsBack(t *testing.T) {
	var calls atomic.Int32
	a := newApp(&http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		if r.URL.Host == "news.ycombinator.com" {
			return nil, context.DeadlineExceeded
		}
		if r.URL.Host == "hacker-news.firebaseio.com" {
			return nil, fmt.Errorf("offline")
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"id":1,"type":"story","title":"Fallback story"}`))}, nil
	})})
	var d discussionData
	if err := a.hnDiscussion(context.Background(), "1", url.Values{}, &d); err != nil || d.Story.Title != "Fallback story" || calls.Load() != 3 {
		t.Fatal("timeout prevented fallback", err, calls.Load())
	}
}
