package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const defaultUserAgent = "Threadline/1.0 (+https://github.com/thang-qt/ThreadLine; community news reader)"

type Story struct {
	Title, URL, Discussion, Domain, Author, Source string
	Points, Comments, Rank                         int
	Created                                        time.Time
	Tags                                           []string
}
type snapshot struct {
	Stories     []Story
	Updated     time.Time
	Error       string
	NextRefresh time.Time
	Loading     chan struct{}
}
type resource struct {
	mu             sync.Mutex
	body           []byte
	etag, modified string
	checked        time.Time
	accessed       time.Time
	freshUntil     time.Time
	retryAt        time.Time
	failures       int
	lastError      error
}
type app struct {
	hnProviders      []string
	hnHTMLGate       chan struct{}
	hnHTMLNext       time.Time
	userAgent        string
	resourcesMu      sync.Mutex
	resources        map[string]*resource
	lobstersGate     chan struct{}
	lobstersNext     time.Time
	lobstersBlocked  time.Time
	lobstersRequests []time.Time
	life             context.Context
	slots            chan struct{}
	mu               sync.RWMutex
	feeds            map[string]snapshot
	client           *http.Client
	page             *template.Template
	css              template.CSS
}
type pageData struct {
	Ranking                         rankingSettings
	Stories                         []Story
	Mode, Source, Query, Tag, Error string
	Page, Next, Previous            int
	CSS                             template.CSS
}

func newApp(client *http.Client) *app {
	css, err := fs.ReadFile(frontend, "web/style.css")
	if err != nil {
		panic(err)
	}
	logo, err := fs.ReadFile(frontend, "web/logo.svg")
	if err != nil {
		panic(err)
	}
	inlineLogo := strings.Replace(string(logo), `role="img" aria-labelledby="title desc"`, `class="brand-logo" width="34" height="34" aria-hidden="true"`, 1)
	funcs := template.FuncMap{
		"logo": func() template.HTML { return template.HTML(inlineLogo) },
		"favicon": func() template.URL {
			return template.URL("data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString(logo))
		},
		"age":   age,
		"label": labelSource,
	}
	page := template.Must(template.New("index.html").Funcs(funcs).ParseFS(
		frontend, "web/index.html", "web/discussion.html", "web/settings.html",
	))
	return &app{
		hnProviders:  []string{"html", "firebase", "algolia"},
		hnHTMLGate:   make(chan struct{}, 1),
		userAgent:    defaultUserAgent,
		feeds:        make(map[string]snapshot),
		resources:    make(map[string]*resource),
		slots:        make(chan struct{}, 8),
		lobstersGate: make(chan struct{}, 1),
		life:         context.Background(),
		client:       client,
		css:          template.CSS(css),
		page:         page,
	}
}

func age(t time.Time) string {
	d := time.Since(t)
	if d < time.Hour {
		return fmt.Sprintf("%dm", max(0, int(d.Minutes())))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}
func (a *app) get(ctx context.Context, address string, target any) (resultErr error) {
	a.resourcesMu.Lock()
	cached := a.resources[address]
	if cached == nil {
		cached = &resource{}
		a.resources[address] = cached
	}
	cached.accessed = time.Now()
	// Evict the least recently used resource rather than flushing hot threads.
	if len(a.resources) > 512 {
		var oldest string
		var used time.Time
		for key, value := range a.resources {
			if key != address && (oldest == "" || value.accessed.Before(used)) {
				oldest = key
				used = value.accessed
			}
		}
		delete(a.resources, oldest)
	}
	a.resourcesMu.Unlock()
	cached.mu.Lock()
	defer cached.mu.Unlock()
	defer func() {
		if resultErr != nil && staleFallback(ctx, cached.body, target) {
			resultErr = nil
		}
	}()
	if len(cached.body) > 0 && time.Now().Before(cached.checked.Add(resourceTTL(address))) || len(cached.body) > 0 && time.Now().Before(cached.freshUntil) {
		return decodeResource(cached.body, target)
	}
	if time.Now().Before(cached.retryAt) {
		return cached.lastError
	}
	if strings.HasPrefix(address, "https://news.ycombinator.com/item?") {
		select {
		case a.hnHTMLGate <- struct{}{}:
		case <-ctx.Done():
			return ctx.Err()
		}
		defer func() { <-a.hnHTMLGate }()
		if time.Now().Before(a.hnHTMLNext) {
			return fmt.Errorf("HN HTML crawl delay in effect")
		}
		a.hnHTMLNext = time.Now().Add(30 * time.Second)
	}
	isLobsters := strings.HasPrefix(address, "https://lobste.rs/")
	if isLobsters {
		select {
		case a.lobstersGate <- struct{}{}:
		case <-ctx.Done():
			return ctx.Err()
		}
		defer func() { <-a.lobstersGate }()
		if time.Now().Before(a.lobstersBlocked) {
			return fmt.Errorf("Lobsters cooling down until %s", a.lobstersBlocked.Format(time.RFC3339))
		}
		if delay := time.Until(a.lobstersNext); delay > 0 {
			timer := time.NewTimer(delay)
			defer timer.Stop()
			select {
			case <-timer.C:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		now := time.Now()
		cut := 0
		for cut < len(a.lobstersRequests) && now.Sub(a.lobstersRequests[cut]) >= time.Hour {
			cut++
		}
		a.lobstersRequests = a.lobstersRequests[cut:]
		if len(a.lobstersRequests) >= 120 {
			return fmt.Errorf("Lobsters hourly request budget reached")
		}
		a.lobstersRequests = append(a.lobstersRequests, now)
		a.lobstersNext = now.Add(3 * time.Second)
	}
	select {
	case a.slots <- struct{}{}:
	case <-ctx.Done():
		return ctx.Err()
	}
	defer func() { <-a.slots }()
	req, err := http.NewRequestWithContext(ctx, "GET", address, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", a.userAgent)
	req.Header.Set("Accept", "application/json")
	if _, ok := target.(*rawPage); ok {
		req.Header.Set("Accept", "text/html")
	}
	if cached.etag != "" {
		req.Header.Set("If-None-Match", cached.etag)
	}
	if cached.modified != "" {
		req.Header.Set("If-Modified-Since", cached.modified)
	}
	res, err := a.client.Do(req)
	if err != nil {
		cached.fail(err, 0)
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == 304 && len(cached.body) > 0 {
		cached.validated(res.Header)
		return decodeResource(cached.body, target)
	}
	if res.StatusCode != 200 {
		err := fmt.Errorf("upstream status %d", res.StatusCode)
		delay := retryDelay(res.Header, time.Now())
		if strings.HasPrefix(address, "https://news.ycombinator.com/item?") && (res.StatusCode == 429 || res.StatusCode == 503) {
			a.hnHTMLNext = time.Now().Add(max(delay, time.Minute))
		}
		if isLobsters && (res.StatusCode == 429 || res.StatusCode == 503) {
			a.lobstersBlocked = time.Now().Add(max(delay, 5*time.Minute))
		}
		cached.fail(err, delay)
		return err
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, (4<<20)+1))
	if err != nil {
		return err
	}
	if len(body) > 4<<20 {
		return fmt.Errorf("upstream response too large")
	}
	if err = decodeResource(body, target); err != nil {
		return err
	}
	cached.body = body
	cached.etag = res.Header.Get("ETag")
	cached.modified = res.Header.Get("Last-Modified")
	cached.validated(res.Header)
	return nil
}
func (a *app) fetch(ctx context.Context, source, mode string) ([]Story, error) {
	if source == "lobsters" {
		path := "hottest"
		if mode == "recent" {
			path = "newest"
		}
		var rows []struct {
			Title      string    `json:"title"`
			URL        string    `json:"url"`
			Discussion string    `json:"comments_url"`
			Author     string    `json:"submitter_user"`
			Points     int       `json:"score"`
			Comments   int       `json:"comment_count"`
			Created    time.Time `json:"created_at"`
			Tags       []string  `json:"tags"`
		}
		if err := a.get(ctx, "https://lobste.rs/"+path+".json", &rows); err != nil {
			return nil, err
		}
		out := make([]Story, 0, len(rows))
		for i, r := range rows {
			out = append(out, normalize(Story{Title: r.Title, URL: r.URL, Discussion: r.Discussion, Author: r.Author, Points: r.Points, Comments: r.Comments, Created: r.Created, Tags: r.Tags, Source: source, Rank: i}))
		}
		return out, nil
	}
	path := "topstories"
	if mode == "recent" {
		path = "newstories"
	}
	var ids []int
	if err := a.get(ctx, "https://hacker-news.firebaseio.com/v0/"+path+".json", &ids); err != nil {
		return nil, err
	}
	if len(ids) > 30 {
		ids = ids[:30]
	}
	out := make([]Story, len(ids))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	for i, id := range ids {
		wg.Add(1)
		go func(i, id int) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-sem }()
			var r struct {
				Title, URL, By     string
				Score, Descendants int
				Time               int64
				Deleted, Dead      bool
			}
			if err := a.get(ctx, fmt.Sprintf("https://hacker-news.firebaseio.com/v0/item/%d.json", id), &r); err != nil || r.Deleted || r.Dead {
				return
			}
			out[i] = normalize(Story{Title: r.Title, URL: r.URL, Discussion: fmt.Sprintf("https://news.ycombinator.com/item?id=%d", id), Author: r.By, Points: r.Score, Comments: r.Descendants, Created: time.Unix(r.Time, 0), Source: source, Rank: i})
		}(i, id)
	}
	wg.Wait()
	valid := out[:0]
	for _, s := range out {
		if s.Title != "" {
			valid = append(valid, s)
		}
	}
	if len(valid) == 0 {
		return nil, fmt.Errorf("no stories returned")
	}
	return valid, nil
}
func normalize(s Story) Story {
	if s.URL == "" {
		s.URL = s.Discussion
	}
	u, err := url.Parse(s.URL)
	if err == nil {
		s.Domain = strings.TrimPrefix(u.Hostname(), "www.")
	}
	return s
}

// Only the requested source/mode is refreshed. Warm pages return immediately;
// cold pages share and wait for the same fetch.
func (a *app) ensureFeed(ctx context.Context, source, mode string) {
	key := source + mode
	a.mu.Lock()
	s := a.feeds[key]
	deadline := s.NextRefresh
	if deadline.IsZero() {
		deadline = s.Updated.Add(feedTTL(source))
	}
	if s.Loading == nil && time.Now().Before(deadline) {
		a.mu.Unlock()
		return
	}
	if s.Loading == nil {
		s.Loading = make(chan struct{})
		a.feeds[key] = s
		go func() {
			fetchCtx, cancel := context.WithTimeout(a.life, 20*time.Second)
			defer cancel()
			stories, err := a.fetch(fetchCtx, source, mode)
			a.mu.Lock()
			defer a.mu.Unlock()
			old := a.feeds[key]
			done := old.Loading
			old.Loading = nil
			old.NextRefresh = time.Now().Add(feedTTL(source))
			if err != nil {
				old.Error = labelSource(source) + " is unavailable; showing saved stories when available."
				log.Printf("refresh %s: %v", key, err)
			} else {
				old.Stories = stories
				old.Updated = time.Now()
				old.Error = ""
			}
			a.feeds[key] = old
			close(done)
		}()
	}
	done := s.Loading
	warm := len(s.Stories) > 0
	a.mu.Unlock()
	if !warm {
		select {
		case <-done:
		case <-ctx.Done():
		}
	}
}
func feedTTL(source string) time.Duration {
	if source == "lobsters" {
		return 2 * time.Minute
	}
	return 30 * time.Second
}
func resourceTTL(address string) time.Duration {
	if strings.HasPrefix(address, "https://news.ycombinator.com/") {
		return time.Minute
	}
	if strings.HasPrefix(address, "https://hn.algolia.com/") {
		return time.Minute
	}
	if strings.HasPrefix(address, "https://lobste.rs/") {
		return 2 * time.Minute
	}
	return 25 * time.Second
}
func (c *resource) fail(err error, delay time.Duration) {
	c.failures = min(c.failures+1, 6)
	c.lastError = err
	c.retryAt = time.Now().Add(max(delay, time.Duration(1<<c.failures)*15*time.Second))
}
func (c *resource) validated(h http.Header) {
	c.checked = time.Now()
	c.failures = 0
	c.lastError = nil
	c.retryAt = time.Time{}
	c.freshUntil = time.Time{}
	for _, part := range strings.Split(h.Get("Cache-Control"), ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if ok && key == "max-age" {
			if n, err := strconv.Atoi(strings.Trim(value, `"`)); err == nil && n > 0 && n <= 86400 {
				age, _ := strconv.Atoi(h.Get("Age"))
				c.freshUntil = c.checked.Add(time.Duration(max(0, n-age)) * time.Second)
			}
		}
	}
}
func retryDelay(h http.Header, now time.Time) time.Duration {
	delay := time.Duration(0)
	if n, err := strconv.Atoi(h.Get("Retry-After")); err == nil && n > 0 && n < 604800 {
		delay = time.Duration(n) * time.Second
	} else if t, err := http.ParseTime(h.Get("Retry-After")); err == nil {
		delay = max(delay, t.Sub(now))
	}
	// Lobsters currently emits an epoch timestamp; also accept delta seconds.
	if n, err := strconv.ParseInt(h.Get("RateLimit-Reset"), 10, 64); err == nil && n > 0 {
		if n > now.Unix() {
			delay = max(delay, time.Unix(n, 0).Sub(now))
		} else if n < 604800 {
			delay = max(delay, time.Duration(n)*time.Second)
		}
	}
	return delay
}
func labelSource(s string) string {
	if s == "hn" {
		return "Hacker News"
	}
	return "Lobsters"
}
func (a *app) serve(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/settings" {
		a.settings(w, r)
		return
	}
	if r.URL.Path == "/settings/ranking" {
		a.saveRanking(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/discussion/") {
		a.discussion(w, r)
		return
	}
	if r.URL.Path == "/healthz" {
		w.WriteHeader(200)
		io.WriteString(w, "ok\n")
		return
	}
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	if r.Method != "GET" && r.Method != "HEAD" {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", 405)
		return
	}
	q := r.URL.Query()
	d := pageData{Mode: q.Get("mode"), Source: q.Get("source"), Query: q.Get("q"), Tag: q.Get("tag"), CSS: a.css, Page: 1, Ranking: readRanking(r)}
	if d.Mode != "recent" {
		d.Mode = "active"
	}
	if d.Source != "hn" && d.Source != "lobsters" {
		d.Source = "all"
	}
	if n, e := strconv.Atoi(q.Get("page")); e == nil && n > 0 && n < 1000 {
		d.Page = n
	}
	feedCtx, cancelFeed := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancelFeed()
	var feedWG sync.WaitGroup
	for _, source := range []string{"hn", "lobsters"} {
		if !d.includesSource(source) {
			continue
		}
		feedWG.Add(1)
		go func(source string) { defer feedWG.Done(); a.ensureFeed(feedCtx, source, d.Mode) }(source)
	}
	feedWG.Wait()
	a.mu.RLock()
	for _, source := range []string{"hn", "lobsters"} {
		if !d.includesSource(source) {
			continue
		}
		s := a.feeds[source+d.Mode]
		if s.Error != "" {
			d.Error += s.Error + " "
		}
		if s.Updated.IsZero() && s.Error == "" {
			d.Error += "Loading " + labelSource(source) + ". Refresh in a moment. "
		}
		for _, story := range s.Stories {
			if d.Query != "" && !strings.Contains(strings.ToLower(story.Title+" "+story.Domain), strings.ToLower(d.Query)) {
				continue
			}
			if d.Tag != "" && !contains(story.Tags, d.Tag) {
				continue
			}
			d.Stories = append(d.Stories, story)
		}
	}
	a.mu.RUnlock()
	if d.Mode == "active" && d.Ranking.Mode == "tuned" {
		settings := d.Ranking
		if d.Source != "all" {
			settings.HN = 1
			settings.Lobsters = 1
		}
		d.Stories = rankStories(d.Stories, settings, time.Now())
	} else {
		sort.SliceStable(d.Stories, func(i, j int) bool {
			if d.Mode == "recent" {
				return d.Stories[i].Created.After(d.Stories[j].Created)
			}
			return d.Stories[i].Rank < d.Stories[j].Rank
		})
	}
	w.Header().Set("Cache-Control", "private, max-age=5, must-revalidate")
	start := (d.Page - 1) * 25
	if start > len(d.Stories) {
		start = len(d.Stories)
	}
	end := min(start+25, len(d.Stories))
	if end < len(d.Stories) {
		d.Next = d.Page + 1
	}
	if d.Page > 1 {
		d.Previous = d.Page - 1
	}
	d.Stories = d.Stories[start:end]
	var body bytes.Buffer
	if err := a.page.Execute(&body, d); err != nil {
		log.Print(err)
		http.Error(w, "Unable to render page", 500)
		return
	}
	a.respond(w, r, body.Bytes())
}
func (a *app) respond(w http.ResponseWriter, r *http.Request, payload []byte, status ...int) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
	if w.Header().Get("Cache-Control") == "" {
		w.Header().Set("Cache-Control", "public, max-age=5, must-revalidate")
	}
	w.Header().Set("Vary", "Accept-Encoding")
	if acceptsGzip(r.Header.Get("Accept-Encoding")) {
		var b bytes.Buffer
		z := gzip.NewWriter(&b)
		z.Write(payload)
		z.Close()
		payload = b.Bytes()
		w.Header().Set("Content-Encoding", "gzip")
	}
	etag := fmt.Sprintf(`"%x"`, sha256.Sum256(payload))
	w.Header().Set("ETag", etag)
	if len(status) == 0 && r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(304)
		return
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
	if len(status) > 0 {
		w.WriteHeader(status[0])
	}
	if r.Method != "HEAD" {
		w.Write(payload)
	}
}
func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}
func acceptsGzip(s string) bool {
	for _, part := range strings.Split(s, ",") {
		bits := strings.Split(strings.TrimSpace(part), ";")
		if bits[0] != "gzip" {
			continue
		}
		for _, p := range bits[1:] {
			if key, value, ok := strings.Cut(strings.TrimSpace(p), "="); ok && key == "q" {
				quality, err := strconv.ParseFloat(value, 64)
				if err != nil || quality <= 0 {
					return false
				}
			}
		}
		return true
	}
	return false
}
func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	a := newApp(&http.Client{Timeout: 10 * time.Second})
	a.life = ctx
	if configured := os.Getenv("HN_DISCUSSION_PROVIDERS"); configured != "" {
		providers, err := parseHNProviders(configured)
		if err != nil {
			log.Fatal(err)
		}
		a.hnProviders = providers
	}
	if contact := strings.TrimSpace(os.Getenv("THREADLINE_CONTACT")); contact != "" {
		if len(contact) > 200 || strings.ContainsAny(contact, "()") {
			log.Fatal("THREADLINE_CONTACT must be a short email address or contact URL")
		}
		for _, c := range contact {
			if c < 32 || c > 126 {
				log.Fatal("THREADLINE_CONTACT must contain printable ASCII characters")
			}
		}
		a.userAgent = strings.TrimSuffix(defaultUserAgent, ")") + "; contact=" + contact + ")"
	}
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	s := &http.Server{Addr: addr, Handler: http.HandlerFunc(a.serve), ReadHeaderTimeout: 5 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.Shutdown(shutdown)
	}()
	log.Printf("Threadline listening on %s", addr)
	if err := s.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
