#!/usr/bin/zsh

# Adjust brightness
case "$1" in
  up)
    brightnessctl set +5%
    ;;
  down)
    brightnessctl set 5%-
    ;;
esac

# Fetch current brightness level
level=$(brightnessctl | grep -oP '\(\K[0-9]+(?=%\))')

# Select an appropriate icon based on level
if [ "$level" -le 25 ]; then
  icon=""
elif [ "$level" -le 50 ]; then
  icon=""
elif [ "$level" -le 75 ]; then
  icon=""
else
  icon=""
fi

# Send notification via Dunst
dunstify -a "Brightness" -r 91191 "$icon  Brightness: $level%"

