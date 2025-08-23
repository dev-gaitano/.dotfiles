#!/usr/bin/env bash

status=$(playerctl --player=spotify status 2>/dev/null)
artist=$(playerctl --player=spotify metadata artist 2>/dev/null)
title=$(playerctl --player=spotify metadata title 2>/dev/null)

if [ "$status" = "Playing" ]; then
    icon="󰐊"
elif [ "$status" = "Paused" ]; then
    icon="󰏤"
elif [ "$status" = "Stopped" ]; then
    icon="󰓛"
else
    echo "󰝚 Spotify is offline"
    exit
fi

# Output: 󰒮 󰐊 󰒭 artist - title
echo "   󰒮  $icon  󰒭  󰽰 $artist - $title"
