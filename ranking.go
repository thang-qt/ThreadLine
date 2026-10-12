package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"html/template"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"time"
)

type rankingSettings struct {
	Mode                             string `json:"mode"`
	HN, Lobsters, HalfLife, Comments float64
}

const rankingCookie = "threadline.ranking.v1"

func defaultRanking() rankingSettings {
	return rankingSettings{Mode: "tuned", HN: 1, Lobsters: 1, HalfLife: 24, Comments: .35}
}
func bounded(n, fallback, low, high float64) float64 {
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return fallback
	}
	return math.Max(low, math.Min(high, n))
}
func (s rankingSettings) normalized() rankingSettings {
	if s.Mode != "tuned" {
		s.Mode = "native"
	}
	s.HN = bounded(s.HN, 1, 0, 2)
	s.Lobsters = bounded(s.Lobsters, 1, 0, 2)
	if s.HN == 0 && s.Lobsters == 0 {
		s.HN = 1
		s.Lobsters = 1
	}
	s.HalfLife = bounded(s.HalfLife, 24, 4, 72)
	s.Comments = bounded(s.Comments, .35, 0, 1.5)
	return s
}
func readRanking(r *http.Request) rankingSettings {
	s := defaultRanking()
	if c, e := r.Cookie(rankingCookie); e == nil && len(c.Value) < 512 {
		if raw, e := base64.RawURLEncoding.DecodeString(c.Value); e == nil {
			saved := defaultRanking()
			if json.Unmarshal(raw, &saved) == nil {
				s = saved.normalized()
			}
		}
	}
	return s
}
func (a *app) saveRanking(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		w.Header().Set("Allow", "POST")
		http.Error(w, "Method not allowed", 405)
		return
	}
	if origin := r.Header.Get("Origin"); origin != "" {
		u, e := url.Parse(origin)
		if e != nil || u.Host != r.Host || (u.Scheme != "http" && u.Scheme != "https") {
			http.Error(w, "Invalid origin", 403)
			return
		}
	}
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		http.Error(w, "Invalid origin", 403)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if r.ParseForm() != nil {
		http.Error(w, "Invalid settings", 400)
		return
	}
	s := defaultRanking()
	s.Mode = r.Form.Get("ranking")
	for key, target := range map[string]*float64{"hn": &s.HN, "lobsters": &s.Lobsters, "half_life": &s.HalfLife, "comments": &s.Comments} {
		if n, e := strconv.ParseFloat(r.Form.Get(key), 64); e == nil {
			*target = n
		}
	}
	s = s.normalized()
	raw, _ := json.Marshal(s)
	cookie := &http.Cookie{Name: rankingCookie, Value: base64.RawURLEncoding.EncodeToString(raw), Path: "/", MaxAge: 365 * 24 * 60 * 60, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: r.TLS != nil}
	if r.Form.Get("action") == "reset" {
		cookie.Value = ""
		cookie.MaxAge = -1
	}
	http.SetCookie(w, cookie)
	w.Header().Set("Cache-Control", "no-store")
	target := "/settings?saved=1"
	if r.Form.Get("action") == "reset" {
		target = "/settings?reset=1"
	}
	http.Redirect(w, r, target, http.StatusSeeOther)
}
func rankStories(stories []Story, s rankingSettings, now time.Time) []Story {
	maxima := map[string]float64{"hn": 1, "lobsters": 1}
	for _, story := range stories {
		e := math.Log1p(float64(max(0, story.Points))) + math.Log1p(float64(max(0, story.Comments)))
		maxima[story.Source] = math.Max(maxima[story.Source], e)
	}
	type ranked struct {
		story Story
		score float64
	}
	rows := make([]ranked, 0, len(stories))
	for _, story := range stories {
		weight := s.HN
		if story.Source == "lobsters" {
			weight = s.Lobsters
		}
		if weight == 0 {
			continue
		}
		age := math.Max(0, now.Sub(story.Created).Hours())
		if story.Created.IsZero() {
			age = 0
		}
		native := 1 / math.Sqrt(float64(max(0, story.Rank)+1))
		engagement := (math.Log1p(float64(max(0, story.Points))) + s.Comments*math.Log1p(float64(max(0, story.Comments)))) / maxima[story.Source]
		score := weight * math.Exp2(-age/s.HalfLife) * (.58*native + .3*math.Min(1.5, engagement) + .12/(1+age/24))
		rows = append(rows, ranked{story, score})
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].score == rows[j].score {
			return rows[i].story.Created.After(rows[j].story.Created)
		}
		return rows[i].score > rows[j].score
	})
	result := make([]Story, 0, len(rows))
	for len(rows) > 0 {
		index := 0
		n := len(result)
		if n >= 3 && result[n-1].Source == result[n-2].Source && result[n-1].Source == result[n-3].Source {
			for i, row := range rows {
				if row.story.Source != result[n-1].Source {
					index = i
					break
				}
			}
		}
		result = append(result, rows[index].story)
		rows = append(rows[:index], rows[index+1:]...)
	}
	return result
}

func (d pageData) includesSource(source string) bool {
	if d.Source != "all" {
		return d.Source == source
	}
	if d.Mode == "active" && d.Ranking.Mode == "tuned" {
		if source == "hn" {
			return d.Ranking.HN > 0
		}
		return d.Ranking.Lobsters > 0
	}
	return true
}

func (a *app) settings(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" && r.Method != "HEAD" {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", 405)
		return
	}
	data := struct {
		Ranking      rankingSettings
		CSS          template.CSS
		Saved, Reset bool
	}{readRanking(r), a.css, r.URL.Query().Get("saved") == "1", r.URL.Query().Get("reset") == "1"}
	var body bytes.Buffer
	if err := a.page.ExecuteTemplate(&body, "settings.html", data); err != nil {
		http.Error(w, "Unable to render settings", 500)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	a.respond(w, r, body.Bytes())
}
