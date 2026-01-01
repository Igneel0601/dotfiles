#!/bin/bash

APP_FILE="$HOME/.local/SCRIPTS/apps.txt"

# Check if the command list exists
[[ -f "$APP_FILE" ]] || {
    echo "Command file not found: $APP_FILE"
    exit 1
}

# Read each pattern from the file
mapfile -t patterns < "$APP_FILE"

# Loop forever
while true; do
      for pid in $(ps -eo pid=); do
      cmdfile="/proc/$pid/cmdline"
      [[ -r "$cmdfile" ]] || continue

      cmdline=$(tr '\0' ' ' < "$cmdfile")

      for pattern in "${patterns[@]}"; do
          if [[ "$cmdline" == *"$pattern"* ]]; then
              echo "Killing PID $pid: $cmdline"
              kill "$pid"
              break
          fi
      done
  done

  sleep 3
done
