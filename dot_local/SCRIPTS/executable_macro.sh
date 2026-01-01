#!/bin/bash

THRESHOLD=200 # ms for long press
STATE_FILE="/tmp/m2_press_time"

SHORT_APP="$2" # app for short press
LONG_APP="$3"  # app for long press

if [[ "$1" == "press" ]]; then
    date +%s%3N > "$STATE_FILE"
elif [[ "$1" == "release" ]]; then
    if [[ -f "$STATE_FILE" ]]; then
        press_time=$(cat "$STATE_FILE")
        release_time=$(date +%s%3N)
        duration=$((release_time - press_time))

        if (( duration >= THRESHOLD )); then
            eval "$LONG_APP" & disown
        else
            eval "$SHORT_APP" & disown
        fi
        rm -f "$STATE_FILE"
    fi
fi
