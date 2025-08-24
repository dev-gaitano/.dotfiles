#!/usr/bin/env sh
# Load Jasmijn Schrofer's project
echo "Entering Jasmijn Schrofer's project directory..."
notify-send "Entering Jasmijn Schrofer's project directory..."
cd ~/Desktop/src/jasmijn-schrofer-frontend || { echo "Directory not found!"; exit 1; }
echo "Directory changed to $(pwd)"
notify-send "Directory changed to $(pwd)"

echo "Starting Jasmijn Schrofer's project..."
notify-send "Starting Jasmijn Schrofer's project..."
~/.scripts/tmuxCreate jasmijn dev -s npm || { echo "Failed to start the project!"; exit 1; }
notify-send "Jasmijn Schrofer's project started successfully!"
