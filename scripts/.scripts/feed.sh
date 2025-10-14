#!/usr/bin/env zsh

newsboat -x reload

DB="$HOME/.newsboat/cache.db"
STATE="$HOME/.cache/newsboat_last_seen.txt"

# Ensure cache dir exists
mkdir -p "$(dirname "$STATE")"

# Fetch feed + article titles, separated by |
headlines=("${(@f)$(sqlite3 "$DB" <<'EOF'
.mode list
.headers off
SELECT rss_feed.title || '|' || rss_item.title
FROM rss_item
JOIN rss_feed ON rss_feed.rssurl = rss_item.feedurl
WHERE rss_item.unread = 1
ORDER BY pubDate DESC
LIMIT 10;
EOF
)}")

# If first run, store state and exit
if [ ! -f "$STATE" ]; then
    printf "%s\n" "${headlines[@]}" > "$STATE"
    exit 0
fi

# Compare with previous headlines
new_headlines=()
for h in "${headlines[@]}"; do
    if ! grep -qxF "$h" "$STATE"; then
        new_headlines+=("$h")
    fi
done

# Send notifications only for new headlines
if (( ${#new_headlines[@]} > 0 )); then
    for h in "${new_headlines[@]}"; do
        IFS='|' read -r feed article <<< "$h"
        notify-send -u critical "$feed" "$article"
        sleep 0.5
    done
fi

# Update stored headlines
printf "%s\n" "${headlines[@]}" > "$STATE"

