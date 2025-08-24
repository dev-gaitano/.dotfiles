#!/usr/bin/env sh

# Parse args
session=$1
subcommand=$2
shift 2

# Defaults
server_cmd=""

# Parse flags
while getopts "s:" opt; do
  case $opt in
    s)
      server_cmd=$OPTARG
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      exit 1
      ;;
  esac
done

# Check required args
if [ -z "$session" ] || [ -z "$subcommand" ]; then
  echo "Usage: $0 <session> <subcommand> [-s npm|npx]"
  exit 1
fi

# Start tmux session and windows
tmux new-session -d -s "$session" -n main
tmux send-keys -t "$session":1 'clear' C-m 'nvim .' C-m

tmux new-window -t "$session":2 -n trmnl
tmux send-keys -t "$session":2 'clear' C-m 'ls -a' C-m 'git status' C-m

tmux new-window -t "$session":3 -n ai
tmux send-keys -t "$session":3 'gemini' C-m

tmux new-window -t "$session":4 -n server
case "$server_cmd" in
  npm)
    tmux send-keys -t "$session":4 'clear' C-m 'npm run dev' C-m
    ;;
  npx)
    tmux send-keys -t "$session":4 'clear' C-m 'npx serve dist' C-m
    ;;
esac

tmux attach -t "$session":1
notify-send "Created and attached to session '$session'..."
