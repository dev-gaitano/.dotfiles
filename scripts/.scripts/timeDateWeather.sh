#!/usr/bin/env sh

# --- Time & Date ---
time=$(date "+%H:%M")
date=$(date "+%a %d %b")

# --- Weather ---
API_KEY="e254783ee3bf51753189ae8e9b95e74f"

geo=$(curl -s https://ipapi.co/json)
lat=$(printf "%s" "$geo" | jq -r '.latitude')
lon=$(printf "%s" "$geo" | jq -r '.longitude')

#printf "%s\n" "$lat"
#printf "%s\n" "$lon"

weather=$(curl -s "https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric")
#printf "%s\n" "$weather"

temp=$(printf "%s" "$weather" | jq -r '.main.temp')
#printf "| %s C" "$temp"
echo " $time | $date | ${temp}°C"
