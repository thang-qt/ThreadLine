package main

import (
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestRankingControls(t *testing.T) {
	now := time.Now()
	s := defaultRanking()
	s.Mode = "tuned"
	old := Story{Title: "Old leader", Source: "hn", Rank: 0, Points: 10000, Created: now.Add(-36 * time.Hour)}
	fresh := Story{Title: "Fresh", Source: "hn", Rank: 3, Points: 1, Created: now}
	s.HalfLife = 4
	if rankStories([]Story{old, fresh}, s, now)[0].Title != "Fresh" {
		t.Fatal("short half-life did not favor freshness")
	}
	s.HalfLife = 72
	if rankStories([]Story{old, fresh}, s, now)[0].Title != "Old leader" {
		t.Fatal("long half-life did not preserve strong older stories")
	}
	quiet := Story{Title: "Quiet", Source: "hn", Rank: 0, Points: 10, Created: now}
	busy := quiet
	busy.Title = "Busy"
	busy.Comments = 100
	s.Comments = 0
	if rankStories([]Story{quiet, busy}, s, now)[0].Title != "Quiet" {
		t.Fatal("comments affected zero-weight ranking")
	}
	s.Comments = 1.5
	if rankStories([]Story{quiet, busy}, s, now)[0].Title != "Busy" {
		t.Fatal("comment weight ineffective")
	}
	lob := quiet
	lob.Title = "Lobsters"
	lob.Source = "lobsters"
	s.Lobsters = 2
	s.HN = .5
	if rankStories([]Story{quiet, lob}, s, now)[0].Title != "Lobsters" {
		t.Fatal("source weight ineffective")
	}
	s.HN = 0
	if len(rankStories([]Story{quiet, lob}, s, now)) != 1 {
		t.Fatal("zero-weight source not hidden")
	}
}
func TestRankingSourceBalance(t *testing.T) {
	now := time.Now()
	var stories []Story
	for range 10 {
		stories = append(stories, Story{Source: "hn", Created: now, Points: 100, Rank: 0})
	}
	stories = append(stories, Story{Source: "lobsters", Created: now.Add(-24 * time.Hour), Rank: 25})
	result := rankStories(stories, defaultRanking(), now)
	if len(result) != 11 || result[3].Source != "lobsters" {
		t.Fatal("source diversity safeguard lost")
	}
}
func TestRankingPreferences(t *testing.T) {
	a := newApp(http.DefaultClient)
	now := time.Now()
	a.feeds["hnactive"] = snapshot{Updated: now, Stories: []Story{{Title: "HN story", Source: "hn", Created: now}}}
	a.feeds["lobstersactive"] = snapshot{Updated: now, Stories: []Story{{Title: "Lobsters story", Source: "lobsters", Created: now}}}
	form := url.Values{"ranking": {"tuned"}, "hn": {"0"}, "lobsters": {"2"}, "half_life": {"24"}, "comments": {"1.2"}, "source": {"all"}}
	req := httptest.NewRequest("POST", "/settings/ranking", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	a.serve(w, req)
	if w.Code != 303 || w.Header().Get("Location") != "/settings?saved=1" {
		t.Fatal(w.Code, w.Header().Get("Location"))
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly {
		t.Fatal("preference cookie missing")
	}
	req = httptest.NewRequest("GET", "/settings?saved=1", nil)
	req.AddCookie(cookies[0])
	w = httptest.NewRecorder()
	a.serve(w, req)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Preferences saved.") || !strings.Contains(w.Body.String(), `value="1.2"`) {
		t.Fatal("settings page did not show saved preferences", w.Code)
	}
	delete(a.feeds, "hnactive")
	req = httptest.NewRequest("GET", "/", nil)
	req.AddCookie(cookies[0])
	w = httptest.NewRecorder()
	a.serve(w, req)
	if !strings.Contains(w.Body.String(), "Lobsters story") || strings.Contains(w.Body.String(), "HN story") || strings.Contains(w.Body.String(), "Loading Hacker News") {
		t.Fatal("saved source tuning not applied")
	}
	if strings.Contains(w.Body.String(), `class="ranking-form"`) {
		t.Fatal("ranking form still appears on front page")
	}
	if !strings.HasPrefix(w.Header().Get("Cache-Control"), "private") {
		t.Fatal("personalized page publicly cached")
	}
	req = httptest.NewRequest("GET", "/?mode=recent", nil)
	req.AddCookie(cookies[0])
	if got := readRanking(req); got.HN != 0 || got.HalfLife != 24 {
		t.Fatal("preferences changed", got)
	}
	req = httptest.NewRequest("POST", "/settings/ranking", strings.NewReader("action=reset"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w = httptest.NewRecorder()
	a.serve(w, req)
	if w.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("reset did not remove cookie")
	}
	req = httptest.NewRequest("POST", "/settings/ranking", nil)
	req.Header.Set("Origin", "https://other.example")
	w = httptest.NewRecorder()
	a.serve(w, req)
	if w.Code != 403 {
		t.Fatal("cross-origin preference write accepted")
	}
}
func TestRankingValidation(t *testing.T) {
	s := (rankingSettings{Mode: "unknown", HN: math.NaN(), Lobsters: math.Inf(1), HalfLife: -10, Comments: 20}).normalized()
	if s.Mode != "native" || s.HN != 1 || s.Lobsters != 1 || s.HalfLife != 4 || s.Comments != 1.5 {
		t.Fatal(s)
	}
	s = (rankingSettings{HN: 0, Lobsters: 0}).normalized()
	if s.HN != 1 || s.Lobsters != 1 {
		t.Fatal("all sources hidden")
	}
}
