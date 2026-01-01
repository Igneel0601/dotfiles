#!/bin/bash

# Enhanced Battery Monitor Script
# Monitors battery status and sends notifications for charging/discharging events

set -euo pipefail  # Exit on error, undefined variables, and pipe failures

# Configuration
BATTERY_CAPACITY="/sys/class/power_supply/BAT0/capacity"
BATTERY_STATUS="/sys/class/power_supply/BAT0/status"
CHARGER_ID=1001
BATTERY_ID=1002
SLEEP_INTERVAL=1  # Check every 5 seconds instead of 1
LOW_BATTERY_THRESHOLD=30  # More reasonable threshold
FULL_BATTERY_THRESHOLD=95  # Notify slightly before 100%

# State tracking
last_charger=""
last_battery_notify=""

# Function to check if required files exist
check_battery_files() {
    if [[ ! -f "$BATTERY_CAPACITY" ]]; then
        echo "Error: Battery capacity file not found: $BATTERY_CAPACITY" >&2
        exit 1
    fi
    
    if [[ ! -f "$BATTERY_STATUS" ]]; then
        echo "Error: Battery status file not found: $BATTERY_STATUS" >&2
        exit 1
    fi
}

# Function to check if required commands exist
check_dependencies() {
    if ! command -v dunstify &> /dev/null; then
        echo "Error: dunstify command not found. Please install dunst." >&2
        exit 1
    fi
    
    if ! command -v powerprofilesctl &> /dev/null; then
        echo "Warning: powerprofilesctl not found. Power profile switching disabled." >&2
        return 1
    fi
    return 0
}

# Function to safely read battery info
read_battery_info() {
    local capacity status
    
    if ! capacity=$(cat "$BATTERY_CAPACITY" 2>/dev/null); then
        echo "Error: Failed to read battery capacity" >&2
        return 1
    fi
    
    if ! status=$(cat "$BATTERY_STATUS" 2>/dev/null); then
        echo "Error: Failed to read battery status" >&2
        return 1
    fi
    
    # Validate capacity is a number
    if ! [[ "$capacity" =~ ^[0-9]+$ ]] || [[ "$capacity" -gt 100 ]]; then
        echo "Error: Invalid battery capacity: $capacity" >&2
        return 1
    fi
    
    echo "$capacity $status"
}

# Function to handle charger notifications
handle_charger_notifications() {
    local capacity="$1"
    local status="$2"
    
    # Charger plugged in
    if [[ "$status" == "Charging" && "$last_charger" != "plugged" ]]; then
        dunstify -r $CHARGER_ID -u normal "Charger Connected 🔌" "Battery: ${capacity}% - Now charging"
        last_charger="plugged"
    # Charger unplugged - check for any non-charging status
    elif [[ ("$status" == "Discharging" || "$status" == "Not charging") && "$last_charger" == "plugged" ]]; then
        dunstify -r $CHARGER_ID -u normal "Charger Unplugged 🔋" "Battery: ${capacity}% - Running on battery power"
        last_charger="unplugged"
    # Handle other transitions (like when script starts)
    elif [[ "$status" != "Charging" && "$last_charger" == "" ]]; then
        # Initialize state without notification on first run
        last_charger="unplugged"
    fi
}

# Function to handle battery level notifications
handle_battery_notifications() {
    local capacity="$1"
    local status="$2"
    local power_profiles_available="$3"
    
    # Battery full notification
    if [[ "$capacity" -ge $FULL_BATTERY_THRESHOLD && "$last_battery_notify" != "full" ]]; then
        dunstify -r $BATTERY_ID -u low "Battery Nearly Full ✅" "Battery at ${capacity}%. Consider unplugging charger."
        last_battery_notify="full"
    elif [[ "$capacity" -lt $FULL_BATTERY_THRESHOLD && "$last_battery_notify" == "full" ]]; then
        last_battery_notify="normal"
    fi
    
    # Battery low notification and power-saver activation
    if [[ "$capacity" -le $LOW_BATTERY_THRESHOLD && "$last_battery_notify" != "low" ]]; then
        if [[ "$power_profiles_available" == "true" ]]; then
            dunstify -r $BATTERY_ID -u critical "Low Battery ⚠️" "Battery at ${capacity}%. Activating power-saver mode."
            powerprofilesctl set power-saver 2>/dev/null || echo "Warning: Failed to set power-saver mode" >&2
        else
            dunstify -r $BATTERY_ID -u critical "Low Battery ⚠️" "Battery at ${capacity}%. Consider charging soon."
        fi
        last_battery_notify="low"
    elif [[ "$capacity" -gt $LOW_BATTERY_THRESHOLD && "$last_battery_notify" == "low" ]]; then
        if [[ "$power_profiles_available" == "true" ]]; then
            # Restore balanced mode when battery recovers
            powerprofilesctl set balanced 2>/dev/null || echo "Warning: Failed to restore balanced mode" >&2
        fi
        last_battery_notify="normal"
    fi
}

# Function to handle cleanup on script exit
cleanup() {
    echo "Battery monitor stopped."
    exit 0
}

# Main function
main() {
    echo "Starting battery monitor..."
    
    # Check prerequisites
    check_battery_files
    local power_profiles_available="false"
    if check_dependencies; then
        power_profiles_available="true"
    fi
    
    # Set up signal handlers
    trap cleanup SIGINT SIGTERM
    
    # Main monitoring loop
    while true; do
        # Read battery information
        if ! battery_info=$(read_battery_info); then
            echo "Failed to read battery info, retrying in $SLEEP_INTERVAL seconds..." >&2
            sleep "$SLEEP_INTERVAL"
            continue
        fi
        
        read -r capacity status <<< "$battery_info"
        
        # Handle notifications
        handle_charger_notifications "$capacity" "$status"
        handle_battery_notifications "$capacity" "$status" "$power_profiles_available"
        
        # Wait before next check
        sleep "$SLEEP_INTERVAL"
    done
}

# Run main function
main "$@"