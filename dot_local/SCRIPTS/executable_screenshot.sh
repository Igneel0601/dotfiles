#!/usr/bin/env bash

# Requirements: grimblast, slurp, satty (optional), wl-copy, tesseract (optional), imagemagick (optional)

USAGE() {
  echo "Usage: $(basename "$0") [option]"
  echo "Options:"
  echo "  p   Full screen screenshot"
  echo "  s   Select area or window to screenshot"
  echo "  sf  Frozen screen selection"
  echo "  m   Screenshot focused monitor"
  echo "  sc  OCR (text scan from image) with tesseract"
  exit 1
}

# Setup temp image and save paths
temp_screenshot=$(mktemp -t screenshot_XXXXXX.png)
XDG_PICTURES_DIR="${XDG_PICTURES_DIR:-$HOME/Pictures}"
save_dir="${2:-$XDG_PICTURES_DIR}/Screenshots"
mkdir -p "$save_dir"
save_file="$(date +'%y%m%d_%Hh%Mm%Ss_screenshot.png')"

# Config directory
confDir="${XDG_CONFIG_HOME:-$HOME/.config}"

# Annotation tool setup - default to satty
annotation_tool="${SCREENSHOT_ANNOTATION_TOOL:-satty}"
annotation_args=("-o" "${save_dir}/${save_file}" "-f" "${temp_screenshot}")

# Special config for satty
if [[ "$annotation_tool" == "satty" ]]; then
  annotation_args+=("--copy-command" "wl-copy")
fi

# Use grimblast to take screenshot and annotate
take_screenshot() {
  local mode="$1"
  shift
  local extra_args=("$@")

  # grimblast usage: extra args, then copysave, then mode, then output file
  if grimblast "${extra_args[@]}" copysave "$mode" "$temp_screenshot"; then
    if ! "$annotation_tool" "${annotation_args[@]}"; then
      notify-send "Screenshot Error" "Failed to open annotation tool"
      return 1
    fi
  else
    notify-send "Screenshot Error" "Failed to take screenshot"
    return 1
  fi
}

# Main control
case "$1" in
  p) take_screenshot screen ;;
  s) take_screenshot area ;;
  sf)take_screenshot area --freeze;;
  m) take_screenshot output ;;
  sc)
  command -v tesseract >/dev/null || { echo "tesseract not installed"; exit 1; }
  command -v slurp >/dev/null || { echo "slurp not installed"; exit 1; }
  command -v wl-copy >/dev/null || { echo "wl-copy not installed"; exit 1; }

  geom=$(slurp) || { echo "No geometry selected"; exit 1; }

  # Take screenshot with grim + geometry
  grim -g "$geom" "$temp_screenshot"

  # Enhance contrast if magick is available
  if command -v magick >/dev/null; then
    magick "$temp_screenshot" -sigmoidal-contrast 10,50% "$temp_screenshot"
  fi

  # OCR and copy to clipboard
  tesseract "$temp_screenshot" - | wl-copy

  notify-send "OCR Complete" -i "$temp_screenshot"

  rm -f "$temp_screenshot"
  exit 0
  ;;


  *) USAGE ;;
esac

# Cleanup
rm -f "$temp_screenshot"

# Notify if saved
if [[ -f "${save_dir}/${save_file}" ]]; then
  notify-send -i "${save_dir}/${save_file}" "Screenshot saved to ${save_dir}"
fi
