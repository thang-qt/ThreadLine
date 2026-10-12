// Command buildassets prepares minified frontend files for the production binary.
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/tdewolff/minify/v2"
	"github.com/tdewolff/minify/v2/css"
	"github.com/tdewolff/minify/v2/html"
)

func main() {
	if err := build(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func build() error {
	m := minify.New()
	m.AddFunc("text/css", css.Minify)
	m.Add("text/html", &html.Minifier{
		TemplateDelims:   html.GoTemplateDelims,
		KeepDocumentTags: true,
		KeepEndTags:      true,
		KeepQuotes:       true,
	})
	files, err := filepath.Glob("web/*")
	if err != nil {
		return err
	}
	if len(files) == 0 {
		return fmt.Errorf("no frontend assets found; run from the project root")
	}
	if err := os.MkdirAll(".build/web", 0755); err != nil {
		return err
	}
	for _, path := range files {
		body, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		originalSize := len(body)
		var mediaType string
		switch filepath.Ext(path) {
		case ".css":
			mediaType = "text/css"
		case ".html":
			mediaType = "text/html"
		}
		if mediaType != "" {
			body, err = m.Bytes(mediaType, body)
			if err != nil {
				return fmt.Errorf("minify %s: %w", path, err)
			}
		}
		if err := os.WriteFile(filepath.Join(".build", path), body, 0644); err != nil {
			return err
		}
		fmt.Printf("%s: %d → %d bytes\n", path, originalSize, len(body))
	}
	return nil
}
