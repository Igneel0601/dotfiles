#!/usr/bin/env bash

logo_dir="$HOME/.config/fastfetch/logo"

# Get a random logo
random_logo=$(find "$logo_dir" -maxdepth 1 -type f \( -iname "*.png" -o -iname "*.icon" \) 2>/dev/null | shuf -n 1)

# If 'logo' command is passed, just output the logo path
if [[ "$1" == "logo" ]]; then
  if [[ -n "$random_logo" ]]; then
    echo "$random_logo"
  else
    echo "No logo found in $logo_dir"
    exit 1
  fi
  exit 0
fi

# Run fastfetch with the logo (if available)
if [[ -n "$random_logo" ]]; then
  exec fastfetch --logo "$random_logo" "$@"
else
  exec fastfetch "$@"
fi
