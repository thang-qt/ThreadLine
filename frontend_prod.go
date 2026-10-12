//go:build production

package main

import (
	"embed"
	"io/fs"
)

//go:embed .build/web/*
var productionAssets embed.FS

var frontend = func() fs.FS {
	assets, err := fs.Sub(productionAssets, ".build")
	if err != nil {
		panic(err)
	}
	return assets
}()
