#!/usr/bin/env sh

redshift -O 5000
~/.scripts/pywal.sh
clear

~/.scripts/feed.sh

# fetch
fastfetch --logo "$HOME/03-documents/04-misc/fetch-logo.txt"

echo " "
name="$USER"
echo "Hallo, $name!"
echo "Heute ist $(date +%A), $(date +%B) $(date +%d), $(date +%Y)."
echo " "
