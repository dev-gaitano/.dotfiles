#!/usr/bin/env sh

redshift -O 5000
clear

# fetch
fastfetch --logo "~/04-documents/04-misc/fetch-logo.txt"

name="$USER"

echo "Hallo, $name!"
echo "Heute ist $(date +%A), $(date +%B) $(date +%d), $(date +%Y)."
echo " "

# Task List
echo "Dein Aufgaben sind..."
echo " "
task list
