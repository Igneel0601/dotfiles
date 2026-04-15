#!/bin/bash

CON_NAME="Hotspot"

# Function to wait for hotspot to be active
wait_for_connection() {
    local name=$1
    for i in {1..10}; do  # wait up to ~10 seconds
        if nmcli -t -f NAME,DEVICE connection show --active | grep -q "^${name}:"; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# Get SSID of the hotspot from profile
get_ssid() {
    nmcli -g 802-11-wireless.ssid connection show "$1"
}

SSID=$(get_ssid "$CON_NAME")

if nmcli -t -f NAME,DEVICE connection show --active | grep -q "^${CON_NAME}:"; then
    # Try to deactivate hotspot
    if nmcli connection down "$CON_NAME" >/dev/null 2>&1; then
        dunstify -i dialog-error "Hotspot" "🔴 $SSID stopped" -u normal -r 91190
    else
        dunstify -i dialog-error "Hotspot" "❌ Failed to stop $SSID" -u critical -r 91190
    fi
else
    # Try to activate hotspot
    nmcli connection up "$CON_NAME" >/dev/null 2>&1 &
    if wait_for_connection "$CON_NAME"; then
        dunstify -i network-wireless-hotspot "Hotspot" "🟢 $SSID started" -u normal -r 91190
    else
        dunstify -i dialog-error "Hotspot" "❌ Failed to start $SSID" -u critical -r 91190
    fi
fi
