#!/usr/bin/env sh
BATTERY_PATH="/sys/class/power_supply/BAT0"
THRESHOLD=90
NOTIFIED=0

# Check if battery exists
if [ ! -d "$BATTERY_PATH" ]; then
	printf "Battery not found at %s\n" "$BATTERY_PATH"
	# Try BAT1 for some systems
	BATTERY_PATH="/sys/class/power_supply/BAT1"
	if [ ! -d "$BATTERY_PATH" ]; then
		printf "No battery detected. Exiting.\n"
		exit 1
	fi
fi

while true; do
	# Read battery level
	CAPACITY=$(cat "$BATTERY_PATH/capacity")
	STATUS=$(cat "$BATTERY_PATH/status")

	# Check if battery is low and discharging
	if [ "$CAPACITY" -le "$THRESHOLD" ] && [ "$STATUS" = "Discharging" ] && [ "$NOTIFIED" -eq 0 ]; then

		# Send notification
		notify-send -u critical -i battery-caution -t 10000 \
			"LOW BATTERY" \
			"Battery at ${CAPACITY}%! Plug in your charger"

		# Play alert sound
		paplay /usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga 2>/dev/null &

		NOTIFIED=1
	fi

	# Reset notification flag when charging or above threshold
	if [ "$STATUS" = "Charging" ] || [ "$CAPACITY" -gt "$THRESHOLD" ]; then
		NOTIFIED=0
	fi

	sleep 30
done
