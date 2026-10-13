.PHONY: format format-check test assets build

format:
	gofmt -w $$(find . -path './node_modules' -prune -o -name '*.go' -print)
	npm run format

format-check:
	@test -z "$$(gofmt -l $$(find . -path './node_modules' -prune -o -name '*.go' -print))" || { echo 'Run make format'; exit 1; }
	npm run format:check

test:
	go test -race ./...
	go vet ./...

assets:
	go run ./internal/buildassets

build: assets
	CGO_ENABLED=0 go build -tags production -trimpath -ldflags='-s -w' -o threadline .
