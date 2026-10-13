# Threadline

A compact Hacker News and Lobsters reader with local discussions and adjustable feed ranking. Go serves the bundled HTML, CSS, and original logo; no frontend build or JavaScript is required.

## Run

Requires Go 1.24 or later, available through `nix develop`.

```sh
go run .
# http://localhost:8080
```

To build a standalone binary:

```sh
make build
```

## Configuration

| Environment variable      | Default                 | Purpose                                                      |
| ------------------------- | ----------------------- | ------------------------------------------------------------ |
| `ADDR`                    | `:8080`                 | Listen address                                               |
| `HN_DISCUSSION_PROVIDERS` | `html,firebase,algolia` | Ordered discussion providers; omit providers to disable them |
| `THREADLINE_CONTACT`      | Unset                   | Public operator email or URL appended to the User-Agent      |

All upstream requests identify Threadline and its repository. Fetching is demand-driven with shared in-memory caching, request coalescing, and failure backoff. HN HTML requests are spaced at least 30 seconds apart; Lobsters requests are spaced at least three seconds apart and capped at 120 per hour. Restarting clears cached data. Algolia can lag; Firebase fallback previews replies with links to expand them.

Ranking preferences are saved in a browser cookie through Settings. Login, voting, and posting use links to the original sites.

## Development

`nix develop` includes Go, Node.js, and Make. Node.js is used only for source formatting.

```sh
npm ci
make format        # gofmt + Prettier (including Go HTML templates)
make format-check
make test          # race tests + go vet
make build         # minify assets, then embed in the production binary
```

Development (`go run .`) embeds readable files from `web/`. Production builds embed minified HTML and CSS from `.build/`; generated files are ignored by Git. Minification runs at build time, with no runtime dependency. The binary still includes the entire frontend.

GitHub Actions checks formatting, tests both asset variants, and uploads the Linux binary.
