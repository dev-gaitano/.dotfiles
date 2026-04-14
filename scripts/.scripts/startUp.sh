#!/usr/bin/env sh

SESSION=1914

createSession1914() {
	echo "Creating a new tmux session \"$SESSION\"..."
	echo " "
	sleep 2

	tmux new-session -d -s "$SESSION" -n main
	tmux send-keys -t "$SESSION:1" "clear" C-m
	tmux send-keys -t "$SESSION:1" "~/.scripts/intro.sh" C-m
	tmux new-window -t "$SESSION:2" -n ranger
	tmux send-keys -t "$SESSION:2" "ranger" C-m
	tmux new-window -t "$SESSION:3" -n ai
	tmux send-keys -t "$SESSION:3" "gemini" C-m
	#tmux send-keys -t "$SESSION:3" "openclaude" C-m
	tmux new-window -t "$SESSION:4" -n obsidian
	tmux send-keys -t "$SESSION:4" "obsdn" C-m
	tmux send-keys -t "$SESSION:4" "nvim ." C-m
	tmux new-window -t "$SESSION:5" -n stats
	tmux send-keys -t "$SESSION:5" "btop" C-m

	notify-send -u low "Attached to the tmux session $SESSION."
	tmux a -t "$SESSION":1
}

attachToExistingSession() {
	notify-send -u low "Attached to the tmux session $SESSION."
	tmux a -t "$SESSION"
	exit 0
}

createNewSession() {
	read -p "Directory (absolute) path: " SESSIONDIR # TODO: Modify so that it doesn't depend on Absolute
	read -p "Session Name: " SESSION
	echo " "

	echo "Changing Directory..."
	cd "$SESSIONDIR"
	echo "Creating a new tmux session \"$SESSION\"..."
	echo " "
	sleep 2
	~/.scripts/tmuxCreate.sh "$SESSION" dev

	exit 0
}

if tmux has-session -t "$SESSION" 2>/dev/null; then
	echo "Session \"$SESSION\" already exists"
	echo " "
	echo "Do you want to:"
	echo " 1. Attach to session"
	echo " 2. Create New Session"
	echo " 3. Don't Attach nor Create"
	read -p "(1) (2) (3) - default is (1): " answer
	echo " "

	if [ "$answer" -eq 1 ]; then
		attachToExistingSession
	elif [ "$answer" -eq 2 ]; then
		createNewSession
	else
		exit 0
	fi
else
	createSession1914
fi
