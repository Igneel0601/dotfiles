#!/bin/bash

# rotate.sh - Rotate external monitor HDMI-A-1 in Hyprland and adjust eDP-1 position

# Configuration
MONITOR_NAME="HDMI-A-1"
LAPTOP_MONITOR="eDP-1"
CONFIG_FILE="$HOME/.config/hypr/monitors.conf"
BACKUP_FILE="${CONFIG_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_error() {
    echo -e "${RED}Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}Warning: $1${NC}"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 <rotation>"
    echo "  rotation: normal, 90, 180, or 270"
    echo ""
    echo "Examples:"
    echo "  $0 normal    # Set to 0° (normal orientation)"
    echo "  $0 90        # Set to 90° clockwise"
    echo "  $0 180       # Set to 180° (upside down)"
    echo "  $0 270       # Set to 270° clockwise (90° counter-clockwise)"
    echo ""
    echo "Note: When rotating to 90° or 270°, eDP-1 position will be adjusted from 1920x0 to 1080x0"
    echo "      When rotating to normal or 180°, eDP-1 position will be set to 1920x0"
}

# Function to send notification
send_notification() {
    local message="$1"
    if command -v dunstify > /dev/null 2>&1; then
        dunstify -i display "Monitor Rotation" "$message" -t 3000
    else
        echo "$message"
    fi
}

# Check if argument is provided
if [ $# -eq 0 ]; then
    print_error "No rotation argument provided."
    show_usage
    exit 1
fi

# Map rotation argument to transform number and determine laptop position
case "$1" in
    "normal"|"0")
        TRANSFORM=0
        ROTATION_DESC="normal (0°)"
        LAPTOP_POSITION="1920x0"
        ;;
    "90"|"1")
        TRANSFORM=1
        ROTATION_DESC="90° clockwise"
        LAPTOP_POSITION="1080x0"
        ;;
    "180"|"2")
        TRANSFORM=2
        ROTATION_DESC="180° (upside down)"
        LAPTOP_POSITION="1920x0"
        ;;
    "270"|"3")
        TRANSFORM=3
        ROTATION_DESC="270° clockwise"
        LAPTOP_POSITION="1080x0"
        ;;
    *)
        print_error "Invalid rotation argument: '$1'"
        show_usage
        exit 1
        ;;
esac

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Check if both monitors exist in the config
if ! grep -q "monitor = $MONITOR_NAME" "$CONFIG_FILE"; then
    print_error "Monitor $MONITOR_NAME not found in $CONFIG_FILE"
    exit 1
fi

if ! grep -q "monitor = $LAPTOP_MONITOR" "$CONFIG_FILE"; then
    print_error "Monitor $LAPTOP_MONITOR not found in $CONFIG_FILE"
    exit 1
fi

# Create backup
echo "Creating backup: $BACKUP_FILE"
if ! cp "$CONFIG_FILE" "$BACKUP_FILE"; then
    print_error "Failed to create backup of configuration file"
    exit 1
fi

# Update HDMI-A-1 monitor configuration
echo "Updating $MONITOR_NAME rotation..."
if grep -q "monitor = $MONITOR_NAME.*transform" "$CONFIG_FILE"; then
    # Monitor line has transform parameter, update it
    if ! sed -i "s/\(monitor = $MONITOR_NAME,.*transform, *\)[0-3]/\1$TRANSFORM/" "$CONFIG_FILE"; then
        print_error "Failed to update existing transform parameter"
        cp "$BACKUP_FILE" "$CONFIG_FILE"
        exit 1
    fi
else
    # Monitor line doesn't have transform parameter, add it
    if ! sed -i "s/\(monitor = $MONITOR_NAME,.*\), \([0-9.]*\)$/\1, \2, transform, $TRANSFORM/" "$CONFIG_FILE"; then
        print_error "Failed to add transform parameter"
        cp "$BACKUP_FILE" "$CONFIG_FILE"
        exit 1
    fi
fi

# Update eDP-1 position
echo "Updating $LAPTOP_MONITOR position to $LAPTOP_POSITION..."
if ! sed -i "s/\(monitor = $LAPTOP_MONITOR,.*,\)[0-9]*x[0-9]*\(,.*\)$/\1$LAPTOP_POSITION\2/" "$CONFIG_FILE"; then
    print_error "Failed to update laptop monitor position"
    cp "$BACKUP_FILE" "$CONFIG_FILE"
    exit 1
fi

# Verify both changes were made
if grep -q "monitor = $MONITOR_NAME.*transform, *$TRANSFORM" "$CONFIG_FILE" && \
   grep -q "monitor = $LAPTOP_MONITOR.*$LAPTOP_POSITION" "$CONFIG_FILE"; then
    print_success "Successfully updated monitor rotation to $ROTATION_DESC"
    print_success "Successfully updated $LAPTOP_MONITOR position to $LAPTOP_POSITION"
    
    # Reload Hyprland configuration
    echo "Reloading Hyprland configuration..."
    if hyprctl reload; then
        print_success "Hyprland configuration reloaded successfully"
        send_notification "Monitor $MONITOR_NAME rotated to $ROTATION_DESC, $LAPTOP_MONITOR repositioned"
    else
        print_warning "Failed to reload Hyprland configuration. You may need to restart Hyprland manually."
        send_notification "Monitor rotation updated but Hyprland reload failed"
    fi
else
    print_error "Failed to verify configuration update"
    # Restore backup
    echo "Restoring backup..."
    cp "$BACKUP_FILE" "$CONFIG_FILE"
    exit 1
fi

# Show current configuration for verification
echo ""
echo "Current monitor configurations:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep "monitor = $MONITOR_NAME" "$CONFIG_FILE" || print_warning "Could not display $MONITOR_NAME configuration"
grep "monitor = $LAPTOP_MONITOR" "$CONFIG_FILE" || print_warning "Could not display $LAPTOP_MONITOR configuration"

print_success "Monitor rotation and positioning completed successfully!"
