#!/usr/bin/env zsh

newsboat -x reload

DB="$HOME/.newsboat/cache.db"

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

# Send each headline as its own notification
for h in "${headlines[@]}"; do
    IFS='|' read -r feed article <<< "$h"
    notify-send -u critical "$feed" "$article"
    sleep 0.5
done
