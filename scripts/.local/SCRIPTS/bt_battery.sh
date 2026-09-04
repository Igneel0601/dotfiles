#!/bin/bash

devices=()

# We use 'read' to capture the MAC and the Name
# Note: 'bluetoothctl devices' output is: Device MAC Name
while read -r _ mac name; do
    # Get the device info once to save on processing
    info=$(bluetoothctl info "$mac")

    # Extract Battery
    battery=$(echo "$info" | grep "Battery Percentage" | sed -E 's/.*\(([0-9]+)\).*/\1/')
    
    # Extract Icon (e.g., phone, audio-card, computer)
    icon_type=$(echo "$info" | grep "Icon:" | awk '{print $2}')
    
    # Only add if battery information exists
    if [[ "$battery" =~ ^[0-9]+$ ]]; then
        # If no icon is found, default to 'bluetooth'
        icon_type=${icon_type:-bluetooth}
        
        devices+=("{\"name\":\"$name\",\"battery\":$battery,\"icon\":\"$icon_type\"}")
    fi
done < <(bluetoothctl devices)

printf "[%s]\n" "$(IFS=,; echo "${devices[*]}")"