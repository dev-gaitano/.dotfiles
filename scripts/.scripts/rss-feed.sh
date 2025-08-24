#!/usr/bin/env sh

# fetch
fastfetch --logo "~/Documents/fetch-logo.txt"

name="$USER"

echo "Goood Morning, $name!"
echo "Today is $(date +%A), $(date +%B) $(date +%d), $(date +%Y)."
echo " "

newsboat -x reload

DB="$HOME/.newsboat/cache.db"

sqlite3 "$DB" <<'EOF'
.mode list
.headers off
SELECT rss_feed.title || ': ' || rss_item.title
FROM rss_item
JOIN rss_feed ON rss_feed.rssurl = rss_item.feedurl
WHERE rss_item.unread = 1
ORDER BY pubDate DESC
LIMIT 5;
EOF

