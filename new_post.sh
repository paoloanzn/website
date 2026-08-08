#!/usr/bin/env bash
# Create a new post: ./new_post.sh "My Post Title"
set -Eeuo pipefail
cd "$(dirname "$0")"

[ $# -ge 1 ] || { echo "usage: $0 \"Post Title\"" >&2; exit 1; }

title="$1"
slug=$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
file="posts/${slug}.md"

[ -e "$file" ] && { echo "already exists: $file" >&2; exit 1; }

# YAML-quote the title: colons, quotes and the like would otherwise break
# the front matter (a title such as "Post: A Subtitle" is not valid YAML).
yaml_title=$(printf '%s' "$title" | sed 's/"/\\"/g')

cat > "$file" <<POST
---
layout: layouts/post.njk
title: "${yaml_title}"
date: $(date +%Y-%m-%d)
tags: post
---

# ${title}

POST

echo "created $file"
