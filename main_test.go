package main

import (
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestPage(t *testing.T) {
	a := newApp(http.DefaultClient)
	a.feeds["hnactive"] = snapshot{Updated: time.Now(), Stories: []Story{{Title: "<script>alert(1)</script>", URL: "javascript:alert(1)", Discussion: "https://news.ycombinator.com/item?id=1", Source: "hn", Created: time.Now(), Points: 12}}}
	a.feeds["lobstersactive"] = snapshot{Updated: time.Now()}
	r := httptest.NewRequest("GET", "/?source=hn", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	a.serve(w, r)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	z, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(z)
	if strings.Contains(string(body), "<script>") || strings.Contains(string(body), `href="javascript:`) {
		t.Fatal("unsafe upstream content rendered")
	}
	if !strings.Contains(string(body), "12 points") {
		t.Fatal("story missing")
	}
	r.Header.Set("If-None-Match", w.Header().Get("ETag"))
	w = httptest.NewRecorder()
	a.serve(w, r)
	if w.Code != 304 {
		t.Fatal(w.Code)
	}
	r = httptest.NewRequest("HEAD", "/", nil)
	w = httptest.NewRecorder()
	a.serve(w, r)
	if w.Body.Len() != 0 || w.Header().Get("Content-Length") == "" {
		t.Fatal("invalid HEAD")
	}
}
func TestResourceCoalescingAndValidation(t *testing.T) {
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("If-None-Match") == `"v1"` {
			w.WriteHeader(304)
			return
		}
		w.Header().Set("ETag", `"v1"`)
		io.WriteString(w, `{"value":42}`)
	}))
	defer upstream.Close()
	a := newApp(upstream.Client())
	var wg sync.WaitGroup
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			var v map[string]int
			if err := a.get(context.Background(), upstream.URL, &v); err != nil || v["value"] != 42 {
				t.Errorf("get: %v %v", v, err)
			}
		}()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatal("duplicate fetches", calls.Load())
	}
	cached := a.resources[upstream.URL]
	cached.mu.Lock()
	cached.checked = time.Now().Add(-time.Minute)
	cached.mu.Unlock()
	var v map[string]int
	if err := a.get(context.Background(), upstream.URL, &v); err != nil || v["value"] != 42 || calls.Load() != 2 {
		t.Fatal("304 body reuse failed", v, err, calls.Load())
	}
}
func TestFilters(t *testing.T) {
	a := newApp(http.DefaultClient)
	a.feeds["lobstersrecent"] = snapshot{Updated: time.Now(), Stories: []Story{{Title: "Go performance", Domain: "go.dev", Source: "lobsters", Tags: []string{"go"}, Created: time.Now()}, {Title: "Rust story", Source: "lobsters", Created: time.Now()}}}
	w := httptest.NewRecorder()
	a.serve(w, httptest.NewRequest("GET", "/?mode=recent&source=lobsters&q=performance&tag=go", nil))
	if !strings.Contains(w.Body.String(), "Go performance") || strings.Contains(w.Body.String(), "Rust story") {
		t.Fatal("filter mismatch")
	}
}
