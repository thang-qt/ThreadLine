//go:build !production

package main

import "embed"

//go:embed web/*
var frontend embed.FS
