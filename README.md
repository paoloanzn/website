# paoloanzn.website

Personal site and blog of Paolo Anzani. Static HTML built with
[Eleventy](https://www.11ty.dev/), served from Cloudflare Workers static assets.
No JavaScript ships to the browser, and there is no analytics of any kind.

## Commands

```bash
npm install          # once
npm run dev          # serve at http://localhost:1000 with live reload
npm run build        # one-off build into _site/
npm run deploy       # build, then wrangler deploy
npm run clean        # remove _site/
npm run format       # prettier over js/css/json/md
./new_post.sh "My Post Title"   # scaffold posts/my-post-title.md
```

## Layout

```
.eleventy.js            all config: filters, plugins, markdown-it setup
_data/metadata.js       site title, canonical URL, author, GPG details
_data/series.json       post-series definitions, matched to posts by slug
_data/featured.json     the "Start here" list: [{ slug, image }]
_data/pubkey.js         reads paoloanzn.gpg so /gpg can't drift from the file
_includes/layouts/      base.njk (page shell) and post.njk
_includes/logo.njk      inline SVG logo, inherits colour from CSS
posts/*.md              one file per post; filename is the URL slug
index.njk               paginated post list, 30 per page
start_here.njk          featured posts
about.njk, gpg.njk      standalone pages
feed.njk                Atom feed at /feed.xml
robots.njk, sitemap.njk generated from the canonical URL
css/index.css           the theme
css/fonts.css           @font-face declarations
fonts/                  subset Junicode + Iosevka woff2, plus their licences
img/                    logo, icons, post images
_headers, _redirects    Cloudflare static-asset config
_site/                  build output; never edit, never committed
```

## Writing a post

`./new_post.sh "Title"` creates:

```yaml
---
layout: layouts/post.njk
title: "Title"
date: 2026-08-08
tags: post
---
# Title
```

The `tags: post` is what puts it in the feed and the home page listing. The body
repeats the title as an `<h1>`; the `removeTitle` filter strips it from the
rendered page so it isn't shown twice, which keeps the markdown readable on its
own.

Conventions:

- Write `--` for dashes and plain straight quotes; markdown-it's typographer
  converts them to en-dashes and curly quotes.
- Footnotes use `[^1]` syntax.
- Optional front matter: `description` (overrides the meta description),
  and `hn_link` / `lobsters_link` / `x_link` to add "comment via" links.

### Images

Hero images get a 1-bit dithered treatment via `./dither.sh`, which reads
`img_original/hero/` and writes `img/hero/` (needs ImageMagick). Add
`class="dither"` and the CSS inverts them to white-on-black for the dark theme:

```html
<img class="dither" src="/img/hero/thing.png" alt="" />
```

Photographs should use `class="photo"` instead, which knocks the brightness back
so they don't glare against the dark background.

### Featuring a post

Add it to `_data/featured.json`:

```json
[{ "slug": "my-post-title", "image": "/img/hero/my-post-thumbnail.png" }]
```

Entries whose slug doesn't match a real post are ignored rather than breaking
the build.

## Deployment

Cloudflare serves `_site/` as static assets (`wrangler.jsonc`). From a local
machine:

```bash
npm run deploy
```

If you wire up Cloudflare Workers Builds (git-connected deploys) instead, set:

- **Build command:** `npm ci && npm run build`
- **Deploy command:** `npx wrangler deploy`

### SITE_URL

**`_data/metadata.js` currently defaults to `https://jolly-frog-b8bf.workers.dev`.**
That URL is a placeholder. It is used for the Atom feed, `<link rel="canonical">`,
OpenGraph tags, the sitemap and the `curl` command shown on the GPG page — all of
which need an absolute origin, so it must be correct in production.

Set it via the environment rather than editing the file:

```bash
SITE_URL="https://example.com" npm run build
```

In Cloudflare, add `SITE_URL` as a build environment variable.

## GPG

`paoloanzn.gpg` in the repo root is the armoured public key, mirroring
<https://github.com/paoloanzn.gpg>. It is served at `/paoloanzn.gpg` and rendered
on `/gpg`, both from that one file. The fingerprint shown on the page lives in
`_data/metadata.js` — if the key is ever rotated, replace the file _and_ update
the fingerprint, created and expires fields there.

Current key: `0551 8883 A068 010A 58E9  5413 14B7 786A 2415 E2A0`

## Licensing

- **Code** — MIT. See `LICENSE`. The design and templates are adapted from
  [Erich Grunewald's blog](https://github.com/erwald/blog), which is MIT-licensed;
  his copyright notice is retained.
- **Content** — the posts and pages are
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). See
  `LICENSE-CONTENT`.
- **Fonts** — Junicode and Iosevka, both SIL OFL 1.1, subset for the web. See
  `NOTICE` and `fonts/LICENSE-*.txt`.
- **Logo** — not licensed for reuse.

`NOTICE` records what was borrowed and what was changed.
