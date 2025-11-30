#!/usr/bin/env sh

NOTES_DIR="$HOME/01-studio/02-obsidian/gaitanos-mind"
NUM_FILES=10

# Find recent files ignoring .obsidian/, preserve spaces
recent_files=$(find "$NOTES_DIR" -type d -name ".obsidian" -prune -o -type f -print0 \
               | xargs -0 stat -c "%Y %n" 2>/dev/null \
               | sort -nr \
               | head -n "$NUM_FILES" \
               | cut -d' ' -f2-)

# Show filenames in rofi and get selection
selected_file=$(echo "$recent_files" | awk -F/ '{print $NF}' \
                    | rofi -dmenu -i -p "Recent Notes" \
                           -theme-str 'window {width: 50%; height: 29%;}' \
                           -columns 1 -lines "$NUM_FILES")

# Open the full path for the selected file
[ -n "$selected_file" ] && \
echo "$recent_files" | while IFS= read -r f; do
    [ "$(basename "$f")" = "$selected_file" ] && nvim "$f" && break
done
