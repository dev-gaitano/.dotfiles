#!/usr/bin/zsh

# Change volume
case "$1" in
  up)
    pamixer -i 1
    ;;
  down)
    pamixer -d 1
    ;;
  mute)
    pamixer -t
    ;;
esac

# Get volume info
vol=$(pamixer --get-volume)
mute=$(pamixer --get-mute)

if [ "$mute" = "true" ]; then
  icon=""  # muted
  msg="Muted"
else
  if [ "$vol" -eq 0 ]; then
    icon=""
  elif [ "$vol" -lt 40 ]; then
    icon=""
  else
    icon=""
  fi
  msg="${vol}%"
fi

# Show notification
dunstify -a "Volume" -r 91190 "$icon  Volume: $msg"

