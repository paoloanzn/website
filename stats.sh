#!/usr/bin/env bash
#
# Read the page-view stats back out of Workers Analytics Engine.
#
#   ./stats.sh                 # summary: views per day for the last 14 days
#   ./stats.sh pages [DAYS]    # most-read pages
#   ./stats.sh refs [DAYS]     # where readers came from
#   ./stats.sh countries [DAYS]
#   ./stats.sh feed [DAYS]     # feed fetches per day (rough subscriber count)
#   ./stats.sh errors [DAYS]   # 404s, i.e. broken links worth fixing
#   ./stats.sh sql "SELECT ..."  # anything else
#
# Needs two environment variables:
#
#   CF_ACCOUNT_ID  32-char account ID (Cloudflare dashboard, or `wrangler whoami`)
#   CF_API_TOKEN   token with Account -> Account Analytics -> Read
#                  https://dash.cloudflare.com/profile/api-tokens
#
# Put them in .env (gitignored) and `source .env` before running.

set -Eeuo pipefail

DATASET="website_pageviews"
: "${CF_ACCOUNT_ID:?set CF_ACCOUNT_ID}"
: "${CF_API_TOKEN:?set CF_API_TOKEN}"

# Counts must be SUM(_sample_interval), not COUNT(): Analytics Engine samples
# high-volume indexes, and _sample_interval says how many real events each
# stored row stands for. COUNT() would silently under-report once that kicks in.
run() {
    local sql="$1"
    curl -sS "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql" \
        --header "Authorization: Bearer ${CF_API_TOKEN}" \
        --data "$sql" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    doc = json.loads(raw)
except json.JSONDecodeError:
    sys.exit(f"API error: {raw.strip()[:400]}")
if isinstance(doc, dict) and doc.get("errors"):
    sys.exit("API error: " + json.dumps(doc["errors"]))
rows = doc.get("data", [])
if not rows:
    print("  (no data yet)")
    sys.exit()
cols = list(rows[0].keys())
def fmt(v):
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else f"{v:.2f}"
    return str(v)
widths = [max(len(c), *(len(fmt(r[c])) for r in rows)) for c in cols]
print("  " + "  ".join(c.ljust(w) for c, w in zip(cols, widths)))
print("  " + "  ".join("-" * w for w in widths))
for r in rows:
    print("  " + "  ".join(fmt(r[c]).ljust(w) for c, w in zip(cols, widths)))
'
}

cmd="${1:-summary}"
days="${2:-30}"

case "$cmd" in
summary)
    days="${2:-14}"
    echo "Page views per day, last ${days} days:"
    run "SELECT toDate(timestamp) AS day,
                SUM(_sample_interval) AS views
         FROM ${DATASET}
         WHERE timestamp >= NOW() - INTERVAL '${days}' DAY
           AND blob4 = 'page' AND double1 = 200
         GROUP BY day ORDER BY day DESC
         FORMAT JSON"
    ;;
pages)
    echo "Most-read pages, last ${days} days:"
    run "SELECT blob1 AS path,
                SUM(_sample_interval) AS views
         FROM ${DATASET}
         WHERE timestamp >= NOW() - INTERVAL '${days}' DAY
           AND blob4 = 'page' AND double1 = 200
         GROUP BY path ORDER BY views DESC LIMIT 25
         FORMAT JSON"
    ;;
refs)
    echo "Referrers, last ${days} days:"
    run "SELECT blob2 AS referrer,
                SUM(_sample_interval) AS views
         FROM ${DATASET}
         WHERE timestamp >= NOW() - INTERVAL '${days}' DAY
           AND blob4 = 'page' AND double1 = 200
         GROUP BY referrer ORDER BY views DESC LIMIT 25
         FORMAT JSON"
    ;;
countries)
    echo "Countries, last ${days} days:"
    run "SELECT blob3 AS country,
                SUM(_sample_interval) AS views
         FROM ${DATASET}
         WHERE timestamp >= NOW() - INTERVAL '${days}' DAY
           AND blob4 = 'page' AND double1 = 200
         GROUP BY country ORDER BY views DESC LIMIT 25
         FORMAT JSON"
    ;;
feed)
    echo "Feed fetches per day, last ${days} days:"
    run "SELECT toDate(timestamp) AS day,
                SUM(_sample_interval) AS fetches
         FROM ${DATASET}
         WHERE timestamp >= NOW() - INTERVAL '${days}' DAY
           AND blob4 = 'feed'
         GROUP BY day ORDER BY day DESC
         FORMAT JSON"
    ;;
errors)
    echo "Not-found paths, last ${days} days:"
    run "SELECT blob1 AS path, blob2 AS referrer,
                SUM(_sample_interval) AS hits
         FROM ${DATASET}
         WHERE timestamp >= NOW() - INTERVAL '${days}' DAY
           AND double1 = 404
         GROUP BY path, referrer ORDER BY hits DESC LIMIT 25
         FORMAT JSON"
    ;;
sql)
    [ $# -ge 2 ] || { echo "usage: $0 sql \"SELECT ...\"" >&2; exit 1; }
    run "$2"
    ;;
*)
    sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
