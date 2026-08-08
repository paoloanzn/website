# paoloanzn.website

Personal site and blog of Paolo Anzani. Static HTML built with
[Eleventy](https://www.11ty.dev/), served from Cloudflare Workers static assets
at <https://paoloanzn.com>. No JavaScript ships to the browser; page views are
counted server-side (see [Analytics](#analytics)).

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
worker/index.js         serves _site/ via the ASSETS binding, counts page views
stats.sh                reads the counts back out of Analytics Engine
_data/metadata.js       site title, canonical URL, author, GPG details
_data/series.json       post-series definitions, matched to posts by slug
_data/featured.json     the "Start here" list: [{ slug, image }]
_data/pubkey.js         reads paoloanzn.gpg so /gpg can't drift from the file
_includes/layouts/      base.njk (page shell) and post.njk
_includes/logo.njk      inline SVG logo, inherits colour from CSS
posts/*.md              one file per post; filename is the URL slug
index.njk               paginated post list, 30 per page
start_here.njk          featured posts
gpg.njk                 public key and encryption instructions
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

### Domain

`paoloanzn.com` and `www.paoloanzn.com` are attached to the Worker as Custom
Domains in `wrangler.jsonc`; Cloudflare creates the DNS records and certificates
on deploy. The apex is canonical and the Worker 301-redirects `www` to it.

The first deploy will fail if a conflicting DNS record already exists on either
hostname — Custom Domains can't be created over an existing CNAME. Delete the
old record in the dashboard and deploy again.

### SITE_URL

`_data/metadata.js` defaults to `https://paoloanzn.com`, which feeds the Atom
feed, `<link rel="canonical">`, OpenGraph tags, the sitemap and the `curl`
command on the GPG page. Override it for a build aimed somewhere else:

```bash
SITE_URL="https://staging.example.com" npm run build
```

## Analytics

Page views are counted in the Worker and written to
[Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/).
Nothing runs in the browser: no script, no pixel, no cookie, no consent banner.

Each request stores four things the server already sees — path, referrer
_hostname_, country, status code. No IP addresses, user agents, query strings,
session or visitor identifiers. Readers cannot be told apart, so there are no
"unique visitors", only page views. Crawlers are filtered out by user agent,
which is read and discarded rather than stored.

`run_worker_first` in `wrangler.jsonc` limits Worker invocations to pages and
the feed; CSS, fonts and images are served straight from the edge. Free tier is
100,000 data points per day.

Read the numbers back with `./stats.sh`:

```bash
export CF_ACCOUNT_ID=...   # `npx wrangler whoami`
export CF_API_TOKEN=...    # Account -> Account Analytics -> Read

./stats.sh                 # views per day, last 14 days
./stats.sh pages 30        # most-read pages
./stats.sh refs            # referrers
./stats.sh countries
./stats.sh feed            # feed fetches, i.e. roughly subscribers
./stats.sh errors          # 404s worth fixing
./stats.sh sql "SELECT ..."
```

Counts use `SUM(_sample_interval)` rather than `COUNT()`, because Analytics
Engine samples high-volume rows and `COUNT()` would under-report.

To turn analytics off entirely: drop `analytics_engine_datasets` from
`wrangler.jsonc`. The Worker checks for the binding and simply skips recording
if it isn't there.

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
