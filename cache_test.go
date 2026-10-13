package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestDemandDrivenFeed(t *testing.T) {
	var calls atomic.Int32
	a := fixtureApp(map[string]string{"/hottest.json": `[{"title":"One story","comments_url":"https://lobste.rs/s/abc123"}]`}, &calls)
	if calls.Load() != 0 {
		t.Fatal("startup fetched feeds")
	}
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() { defer wg.Done(); a.ensureFeed(context.Background(), "lobsters", "active") }()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatal("cold requests did not coalesce", calls.Load())
	}
	a.ensureFeed(context.Background(), "lobsters", "active")
	if calls.Load() != 1 || len(a.feeds) != 1 {
		t.Fatal("fresh or unused feed fetched", calls.Load(), len(a.feeds))
	}
	a.mu.Lock()
	s := a.feeds["lobstersactive"]
	s.Updated = time.Now().Add(-3 * time.Minute)
	s.NextRefresh = time.Time{}
	a.feeds["lobstersactive"] = s
	a.mu.Unlock()
	a.resources["https://lobste.rs/hottest.json"].checked = time.Now().Add(-3 * time.Minute)
	a.lobstersNext = time.Time{}
	a.ensureFeed(context.Background(), "lobsters", "active")
	a.mu.RLock()
	done := a.feeds["lobstersactive"].Loading
	a.mu.RUnlock()
	if done != nil {
		<-done
	}
	if calls.Load() != 2 {
		t.Fatal("demand did not revalidate stale feed", calls.Load())
	}
}
func TestLobstersHostCooldown(t *testing.T) {
	var calls atomic.Int32
	a := newApp(&http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		return &http.Response{StatusCode: 429, Header: http.Header{"Retry-After": []string{"1800"}}, Body: io.NopCloser(strings.NewReader("throttled"))}, nil
	})})
	var data any
	if err := a.get(context.Background(), "https://lobste.rs/hottest.json", &data); err == nil {
		t.Fatal("expected throttle")
	}
	if time.Until(a.lobstersBlocked) < 29*time.Minute {
		t.Fatal("Retry-After ignored")
	}
	for _, u := range []string{"https://lobste.rs/hottest.json", "https://lobste.rs/newest.json", "https://lobste.rs/s/abc123.json"} {
		if err := a.get(context.Background(), u, &data); err == nil {
			t.Fatal("expected cooldown")
		}
	}
	if calls.Load() != 1 {
		t.Fatal("requests sent during host cooldown", calls.Load())
	}
}
func TestLobstersHourlyBudget(t *testing.T) {
	var calls atomic.Int32
	a := fixtureApp(nil, &calls)
	for range 120 {
		a.lobstersRequests = append(a.lobstersRequests, time.Now())
	}
	var v any
	if a.get(context.Background(), "https://lobste.rs/hottest.json", &v) == nil || calls.Load() != 0 {
		t.Fatal("hourly budget ignored")
	}
}
func TestCachedDiscussionOnFailure(t *testing.T) {
	var fail atomic.Bool
	var calls atomic.Int32
	a := newApp(&http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		if fail.Load() {
			return nil, fmt.Errorf("offline")
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"title":"Saved thread","comments_url":"https://lobste.rs/s/abc123","comments":[{"short_id":"a","comment":"Saved reply"}]}`))}, nil
	})})
	request := func() *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		a.serve(w, httptest.NewRequest("GET", "/discussion/lobsters/abc123", nil))
		return w
	}
	if request().Code != 200 {
		t.Fatal("initial fetch failed")
	}
	a.resources["https://lobste.rs/s/abc123.json"].checked = time.Now().Add(-3 * time.Minute)
	a.lobstersNext = time.Time{}
	fail.Store(true)
	w := request()
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Saved reply") || !strings.Contains(w.Body.String(), "showing cached comments") {
		t.Fatal("stale discussion unavailable", w.Code, w.Body.String())
	}
	request()
	if calls.Load() != 2 {
		t.Fatal("failed request was retried during backoff", calls.Load())
	}
}
func TestUpstreamFreshnessAndRetryHeaders(t *testing.T) {
	now := time.Now()
	h := http.Header{"Retry-After": []string{now.Add(10 * time.Minute).UTC().Format(http.TimeFormat)}, "Ratelimit-Reset": []string{fmt.Sprint(now.Add(20 * time.Minute).Unix())}}
	if d := retryDelay(h, now); d < 19*time.Minute || d > 21*time.Minute {
		t.Fatal("incorrect backoff", d)
	}
	var c resource
	c.validated(http.Header{"Cache-Control": []string{"public, max-age=600"}, "Age": []string{"100"}})
	if time.Until(c.freshUntil) < 499*time.Second {
		t.Fatal("upstream freshness ignored")
	}
}

func TestApplicationUserAgent(t *testing.T) {
	var observed string
	a := newApp(&http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		observed = r.Header.Get("User-Agent")
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{}`))}, nil
	})})
	var value any
	if err := a.get(context.Background(), "https://lobste.rs/hottest.json", &value); err != nil {
		t.Fatal(err)
	}
	if observed != defaultUserAgent || !strings.Contains(observed, "github.com/thang-qt/ThreadLine") {
		t.Fatal("application not identified", observed)
	}
}
