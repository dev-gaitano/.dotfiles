#!/usr/bin/zsh

# Kill any existing bars
killall -q polybar

# Wait until bars have shut down
while pgrep -u $UID -x polybar >/dev/null; do sleep 0.2; done

# Launch main bar
polybar main &
