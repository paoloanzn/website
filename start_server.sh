#!/usr/bin/env bash
# Serve the site locally at http://localhost:1000 with live reload.
set -Eeuo pipefail
cd "$(dirname "$0")"
exec npx @11ty/eleventy --serve --port 1000
