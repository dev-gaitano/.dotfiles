#!/usr/bin/env sh

# fetch
fastfetch --logo "~/04-documents/04-misc/fetch-logo.txt"

name="$USER"

echo "Hallo, $name!"
echo "Heute ist $(date +%A), $(date +%B) $(date +%d), $(date +%Y)."
echo " "

newsboat -x reload

DB="$HOME/.newsboat/cache.db"

sqlite3 "$DB" <<'EOF' | awk '{print "\033[34m"$0"\033[0m"}'
.mode list
.headers off
SELECT rss_feed.title || ': ' || rss_item.title
FROM rss_item
JOIN rss_feed ON rss_feed.rssurl = rss_item.feedurl
WHERE rss_item.unread = 1
ORDER BY pubDate DESC
LIMIT 4;
EOF

# Task List
task list

