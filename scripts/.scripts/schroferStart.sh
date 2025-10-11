#!/usr/bin/env sh
# Load Jasmijn Schrofer's project
echo "Entering Jasmijn Schrofer's project directory..."
notify-send "Entering Jasmijn Schrofer's project directory..."

cd ~/01-studio/01-src/jasmijn-schrofer/ || { echo "Directory not found!"; exit 1; }

echo "Directory changed to $(pwd)" || notify-send "Directory changed to $(pwd)"

echo "Starting Jasmijn Schrofer's project..." || notify-send "Starting Jasmijn Schrofer's project..."
#~/.scripts/tmuxCreate jasmijn dev -s npm || { echo "Failed to start the project!"; exit 1; } || notify-send "Jasmijn Schrofer's project started successfully!"

session=jasmijn-schrofer

# Start tmux session and windows
tmux new-session -d -s "$session" -n main
tmux send-keys -t "$session":1 'clear' C-m 'nvim .' C-m

tmux new-window -t "$session":2 -n trmnl
tmux send-keys -t "$session":2 'clear' C-m 'ls -a' C-m 'git status' C-m

tmux new-window -t "$session":3 -n ai
tmux send-keys -t "$session":3 'gemini' C-m

tmux new-window -t "$session":4 -n server
tmux send-keys -t "$session":4 'clear' C-m 'doppler run -- npm run dev' C-m

tmux attach -t "$session":1
notify-send "Created and attached to session '$session'..."
