#!/usr/bin/env sh

wal -i ~/02-media/01-pictures/03-wallpapers/

# Restart Dunst to apply colors
killall dunst
dunst --config ~/.config/dunst/dunstrc &

clear

echo "Pywal applied"
