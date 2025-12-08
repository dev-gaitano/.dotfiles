#!/usr/bin/env sh

set -eu

raw="$(basename "$PWD")"

session="$(printf '%s' "$raw" |
	sed 's/^[.]*//' |
	sed 's/[^a-zA-Z0-9_-]/_/g')"

[ -z "$session" ] && session="default"

SERVERCMD="${1:-}"

# Create session if missing
if ! tmux has-session -t "${session}:" 2>/dev/null; then
	tmux new-session -ds "$session" -n main
	tmux send-keys -t "$session":1 'clear' C-m 'nvim .' C-m

	tmux new-window -t "$session":2 -n trmnl
	tmux send-keys -t "$session":2 'clear' C-m 'la' C-m 'git status' C-m

	tmux new-window -t "$session":3 -n ai
	tmux send-keys -t "$session":3 'gemini' C-m

	notify-send "Created Session '$session'..."
fi

# Server window logic
if [ -n "$SERVERCMD" ]; then
	cmd=""

	if ! tmux list-windows -t "${session}:" | awk '{print $1}' |
		grep -q '^4:'; then
		tmux new-window -t "$session":4 -n server
	fi

	case "$SERVERCMD" in
	npm)
		cmd='npm run dev'
		;;
	npx)
		cmd='npx serve dist'
		;;
	python)
		cmd='python3 -m http.server'
		;;
	jupyter)
		cmd='jupyter lab'
		;;
	ngrok)
		cmd='ngrok http 8000'
		;;
	*)
		echo "Unknown server command: $SERVERCMD" >&2
		;;
	esac

	if [ -n "$cmd" ]; then
		tmux send-keys -t "${session}":4 C-c
		tmux send-keys -t "${session}":4 'clear' C-m
		tmux send-keys -t "${session}":4 "$cmd" C-m
	fi
fi

# Attach or switch
if [ -n "${TMUX:-}" ]; then
	notify-send "Session '$session' already exists"
	notify-send "Switching to '$session'..."
	tmux switch-client -t "${session}:"
else
	notify-send "Attached to Session '$session'..."
	tmux attach -t "${session}":1
fi
