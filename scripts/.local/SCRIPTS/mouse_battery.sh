#!/bin/bash

output=$(razer-cli -l)

# Target the Basilisk specifically and get both charge and firmware version
battery=$(echo "$output" | awk '/Basilisk V3 Pro/,/serial:/' | awk '/charge:/ {print $2; exit}')
firmware=$(echo "$output" | awk '/Basilisk V3 Pro/,/serial:/' | awk '/firmware version:/ {print $3; exit}')
charging=$(echo "$output" | awk '/Basilisk V3 Pro/,/serial:/' | awk '/charging:/ {print $2; exit}')

# DISCONNECTED CHECK: 
# If battery is empty, OR battery is 0, OR firmware is v0.0
if [ -z "$battery" ] || [ "$battery" -eq 0 ] || [ "$firmware" = "v0.0" ]; then
  echo '{"text": "󰍽 Off", "class": "disconnected", "percentage": 0}'
  exit
fi

# ... rest of your icon logic ...
if [ "$charging" = "True" ]; then
  icon="󰚥"
  state="charging"
else
  icon="󰍽"
  state="discharging"
fi

echo "{\"text\": \"$icon $battery%\", \"class\": \"$state\", \"percentage\": $battery}"