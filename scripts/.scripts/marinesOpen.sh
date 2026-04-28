#!/usr/bin/env sh
# Open marines folder
echo "Entering Moringa marines directory..."
notify-send "Entering Moringa marines directory..."

cd ~/01-studio/01-src/moringa-marines/ || {
	echo "Directory not found!"
	exit 1
}

echo "Directory changed to $(pwd)" || notify-send "Directory changed to $(pwd)"

session=moringa-marines

# Start tmux session and windows
tmux new-session -d -s "$session" -n main
tmux send-keys -t "$session":1 'clear' C-m 'nvim .' C-m

# Choose module
MODULECMD="${1:-}"

if [ -n "$MODULECMD" ]; then
	cmd=""

	case "$MODULECMD" in
	1)
		cmd="cd module-1"
		;;
	2)
		cmd="cd module-2"
		;;
	*)
		echo "Unknown server command: $MODULECMD" >&2
		;;
	esac
fi

# Open module in tmux session
# Close moringa-marines session

echo "Starting moringa marines (<module-number>)..." || notify-send "Starting moringa marines (<module-number>)..."

tmux new-window -t "$session":2 -n trmnl
tmux send-keys -t "$session":2 'clear' C-m 'ls -a' C-m 'git status' C-m

tmux new-window -t "$session":3 -n ai
tmux send-keys -t "$session":3 'gemini' C-m

tmux new-window -t "$session":4 -n server
tmux send-keys -t "$session":4 'clear' C-m 'doppler run -- npm run dev' C-m

tmux attach -t "$session":1
notify-send "Created and attached to session '$session'..."
