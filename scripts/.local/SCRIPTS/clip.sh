#!/bin/bash

SCRIPT_NAME="$(basename "$0")"
FAVORITES_FILE="$HOME/.config/cliphist/favorites.b64"
DAEMON_PID_FILE="/tmp/cliphist-daemon.pid"

# New show_rofi function: accepts placeholder text as first argument
show_rofi() {
    local placeholder="$1"
    shift
    rofi -theme-str "entry { placeholder: \"$placeholder\"; }" \
         -theme ~/.config/rofi/clipboard.rasi -dmenu -i "$@"
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

mkdir -p "$(dirname "$FAVORITES_FILE")"
touch "$FAVORITES_FILE"

log_message() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

error_message() {
    echo -e "${RED}Error:${NC} $1" >&2
}

success_message() {
    echo -e "${GREEN}Success:${NC} $1"
}

process_selections() {
    if [ true != "${del_mode}" ]; then
        # Read the entire input into an array
        mapfile -t lines #! Not POSIX compliant
        # Get the total number of lines
        total_lines=${#lines[@]}

        # handle special commands
        if [[ "${lines[0]}" = ":d:e:l:e:t:e:"* ]]; then
            "${0}" --delete
            return
        elif [[ "${lines[0]}" = ":w:i:p:e:"* ]]; then
            "${0}" --wipe
            return
        elif [[ "${lines[0]}" = ":b:a:r:"* ]] || [[ "${lines[0]}" = *":c:o:p:y:"* ]]; then
            "${0}" --copy
            return
        elif [[ "${lines[0]}" = ":f:a:v:"* ]]; then
            "${0}" --favorites
            return
        elif [[ "${lines[0]}" = ":o:p:t:"* ]]; then
            "${0}"
            return
        fi

        # process regular clipboard items
        local output=""
        # Iterate over each line in the array
        for ((i = 0; i < total_lines; i++)); do
            local line="${lines[$i]}"
            local decoded_line
            decoded_line="$(echo -e "$line\t" | cliphist decode)"
            if [ $i -lt $((total_lines - 1)) ]; then
                printf -v output '%s%s\n' "$output" "$decoded_line"
            else
                printf -v output '%s%s' "$output" "$decoded_line"
            fi
        done
        echo -n "$output"
    else
        # handle delete mode
        while IFS= read -r line; do
            if [[ "${line}" = ":w:i:p:e:"* ]]; then
                "${0}" --wipe
                break
            elif [[ "${line}" = ":b:a:r:"* ]]; then
                "${0}" --delete
                break
            elif [ -n "$line" ]; then
                cliphist delete <<<"${line}"
                notify-send "Deleted" "${line}"
            fi
        done
        exit 0
    fi
}

check_content() {
    local line
    read -r line
    if [[ $line == *"[[ binary data"* ]]; then
        cliphist decode <<<"$line" | wl-copy
        local img_idx
        img_idx=$(awk -F $'\t' '{print $1}' <<<"$line")

        # Use /tmp for preview storage
        local temp_preview="/tmp/cliphist_preview_${img_idx}.png"
        wl-paste > "$temp_preview"

        # Use notify-send with image preview
        notify-send "📋 Clipboard Image" "Preview (ID: $img_idx)" -i "$temp_preview" -t 2000

        return 1
    else
        return 0
    fi
}

# paste_string() {
#     wl-paste
# }

# show_history_menu() {
#     local selected_item
#     selected_item=$( (
#         echo -e ":f:a:v:\t📌 Favorites"
#         echo -e ":o:p:t:\t⚙️ Options"
#         cliphist list
#     ) | show_rofi " 📜 History..." -multi-select -i -display-columns 2 -selected-row 2)

#     [ -n "${selected_item}" ] || exit 0

#     if echo -e "${selected_item}" | check_content; then
#         process_selections <<<"${selected_item}" | wl-copy
#         # paste_string "${@}"
#         echo -e "${selected_item}\t" | cliphist delete
#     else
#         # binary content - handled by check_content
#         # paste_string "${@}"
#         exit 0
#     fi
# }

show_history_menu() {
    local selected_item
    selected_item=$( (
        echo -e ":f:a:v:\t📌 Favorites"
        echo -e ":o:p:t:\t⚙️ Options"
        cliphist list
    ) | show_rofi " 📜 History..." -multi-select -i -display-columns 2 -selected-row 2)

    [ -n "${selected_item}" ] || exit 0

    # Check for special commands
    if [[ "$selected_item" == ":f:a:v:"* ]]; then
        show_favorites
        return
    elif [[ "$selected_item" == ":o:p:t:"* ]]; then
        show_main_menu
        return
    fi

    # Normal text or binary item
    if echo -e "${selected_item}" | check_content; then
        process_selections <<<"${selected_item}" | wl-copy
        echo -e "${selected_item}\t" | cliphist delete
    else
        exit 0
    fi
}


check_dependencies() {
    local missing_deps=()
    command -v cliphist >/dev/null 2>&1 || missing_deps+=("cliphist")
    command -v wl-paste >/dev/null 2>&1 || missing_deps+=("wl-clipboard")
    command -v wl-copy >/dev/null 2>&1 || missing_deps+=("wl-clipboard")
    command -v rofi >/dev/null 2>&1 || missing_deps+=("rofi")

    if [ ${#missing_deps[@]} -ne 0 ]; then
        error_message "Missing dependencies: ${missing_deps[*]}"
        rofi -e "Missing dependencies: ${missing_deps[*]}\nPlease install the missing packages." 2>/dev/null || echo "Please install the missing packages."
        exit 1
    fi
}

confirm_action() {
    echo -e "Yes\nNo" | show_rofi "$1"
}

show_main_menu() {
    local options="📜 History\n🗑️ Delete\n⭐ View Favorites\n🛠️ Manage Favorites\n🧹 Clear History"
    local selected=$(echo -e "$options" | show_rofi "🔎 Choose action")

    case "$selected" in
        "📜 History") show_history_menu;;
        "🗑️ Delete") delete_item;;
        "⭐ View Favorites") show_favorites;;
        "🛠️ Manage Favorites") manage_favorites_menu;;
        "🧹 Clear History")
            local confirm=$(confirm_action "☢️ Clear Clipboard History?")
            if [ "$confirm" = "Yes" ]; then
                cliphist wipe
                success_message "History cleared"
            fi
            ;;
    esac
}

# show_history_menu() {
#     local formatted_history
#     formatted_history="$(cliphist list)"

#     local menu=$(echo -e "📌 Favorites\n⬅️ Back\n$formatted_history")
#     local selection
#     IFS=$'\n' read -d '' -r -a selection < <(echo -e "$menu" | show_rofi "📜 History..." 2 -multi-select ; printf '\0')

#     for item in "${selection[@]}"; do
#         case "$item" in
#             "📌 Favorites") show_favorites ;;
#             "⬅️ Back") show_main_menu ;;
#             *)
#                 echo "$item" | cliphist decode | wl-copy
#                 success_message "Copied: $item"
#                 ;;
#         esac
#     done
    
# }


# #main
# show_history_menu() {
#     declare -A history_map
#     local formatted_history=""

#     while IFS= read -r line; do
#         [ -n "$line" ] || continue
#         # local display=$(echo "$line" | awk '{ match($0, /^[0-9]+[^[:alnum:]]*/); print substr($0, RLENGTH + 1) }')
#         local display=$(echo "$line" | awk '{ sub(/[0-9]+[[:space:]]/, "", $0); print }')
#         display=${display:-$line}
#         history_map["$display"]="$line"
#         formatted_history+="$display\n"
#     done <<< "$(cliphist list)"

#     local menu=$(echo -e "📌 Favorites\n⬅️ Back\n$formatted_history")
#     local selection
#     IFS=$'\n' read -d '' -r -a selection < <(echo -e "$menu" | show_rofi "📜 History..." 2 -multi-select ; printf '\0')

#     for item in "${selection[@]}"; do
#         case "$item" in
#             "📌 Favorites") show_favorites ;;
#             "⬅️ Back") show_main_menu ;;
#             *) 
#                 local original="${history_map[$item]}"
#                 [ -n "$original" ] && echo "$original" | cliphist decode | wl-copy || echo "$item" | cliphist decode | wl-copy
#                 success_message "Copied: $item"
#                 ;;
#         esac
#     done
# }

delete_item() {
    cliphist list | show_rofi "🗑️Delete" -display-columns 2 -multi-select | cliphist delete
}

manage_favorites_menu() {
    local menu=$(echo -e "➕ Add to Favorites\n➖ Remove Favorite\n❌ Clear All Favorites\n⬅️ Back")
    local selected
    IFS=$'\n' read -d '' -r -a selected < <(echo -e "$menu" | show_rofi "📓 Manage Favorites" -columns 1 -multi-select -selected-row 0; printf '\0')

    for choice in "${selected[@]}"; do
        case "$choice" in
            "➕ Add to Favorites") add_favorite ;;
            "➖ Remove Favorite") remove_favorite ;;
            "❌ Clear All Favorites")
                if [ "$(confirm_action '☢️ Clear All Favorites?')" = "Yes" ]; then
                    > "$FAVORITES_FILE"
                    success_message "Favorites cleared"
                fi
                ;;
            "⬅️ Back") show_main_menu ;;
        esac
    done
}

add_favorite() {
    # Get clipboard history without the numeric IDs, just the content
    local selection
    selection=$(cliphist list | awk '{sub(/^[0-9]+[[:space:]]+/, ""); print}' | show_rofi "➕ Add Favorite..." -multi-select)
    
    [ -z "$selection" ] && {
        error_message "No selection made."
        return
    }
    
    local label="$selection"
    local content
    
    # Check if this selection exists in cliphist history
    local matching_entry
    matching_entry=$(cliphist list | head -50 | grep -F "$selection" | head -1)
    
    if [ -n "$matching_entry" ]; then
        # Found in history - extract the ID and load that specific content
        local clipboard_id=$(echo "$matching_entry" | awk '{print $1}')
        
        # Save current clipboard
        local original_clipboard=$(mktemp)
        wl-paste --no-newline > "$original_clipboard" 2>/dev/null || true
        
        # Load the selected item into clipboard using its ID
        cliphist decode "$clipboard_id" | wl-copy
        
        # Read the content that was just loaded
        local tmpfile=$(mktemp)
        if wl-paste --no-newline --type image/png > "$tmpfile" 2>/dev/null; then
            content=$(base64 -w0 "$tmpfile")
        elif wl-paste --no-newline > "$tmpfile" 2>/dev/null; then
            content=$(base64 -w0 "$tmpfile")
        else
            error_message "Failed to read clipboard content."
            rm "$tmpfile" "$original_clipboard"
            return
        fi
        rm "$tmpfile"
        
        # Restore original clipboard
        if [ -s "$original_clipboard" ]; then
            wl-copy < "$original_clipboard"
        fi
        rm "$original_clipboard"
        
    else
        # User typed a new label - use current clipboard
        local tmpfile=$(mktemp)
        
        if wl-paste --no-newline --type image/png > "$tmpfile" 2>/dev/null; then
            content=$(base64 -w0 "$tmpfile")
        elif wl-paste --no-newline > "$tmpfile" 2>/dev/null; then
            content=$(base64 -w0 "$tmpfile")
        else
            error_message "Clipboard empty or unsupported."
            rm "$tmpfile"
            return
        fi
        rm "$tmpfile"
    fi
    
    # Store the favorite
    echo "${label}:::${content}" >> "$FAVORITES_FILE"
    success_message "Added favorite: $label"
}

# show_favorites() {
#     local lines
#     mapfile -t lines < "$FAVORITES_FILE"

#     if [ ${#lines[@]} -eq 0 ]; then
#         show_rofi "📌 Favorites" -multi-select 2>/dev/null
#         show_main_menu
#         return
#     fi

#     local menu_items=()
#     declare -A label_map
#     declare -A seen_hashes

#     for line in "${lines[@]}"; do
#         local label="${line%%:::*}"
#         local b64="${line#*:::}"

#         # Calculate hash of the content to detect duplicates
#         local content_hash=$(echo "$b64" | base64 -d 2>/dev/null | sha256sum | awk '{print $1}')
        
#         # Skip if we've already seen this content
#         if [ -n "${seen_hashes[$content_hash]}" ]; then
#             continue
#         fi
#         seen_hashes["$content_hash"]=1

#         # Get info about the decoded data length and type:
#         local size_bytes=$(echo "$b64" | base64 -d 2>/dev/null | wc -c)
#         local size_kb=$(( (size_bytes + 1023) / 1024 ))

#         # Try to detect mime type from decoded data:
#         local mime_type=$(echo "$b64" | base64 -d 2>/dev/null | file --mime-type -b -)

#         # Fallback label suffix:
#         local suffix="[[ $size_kb KiB $mime_type ]]"

#         local display="$label $suffix"
#         menu_items+=("$display")
#         label_map["$display"]="$line"
#     done

#     # Check if we have any items left after deduplication
#     if [ ${#menu_items[@]} -eq 0 ]; then
#         show_rofi "📌 Favorites" -multi-select 2>/dev/null || echo "No unique favorites found."
#         show_main_menu
#         return
#     fi

#     local selected=$(printf '%s\n' "${menu_items[@]}" | show_rofi "📌 Favorites" -multi-select)

#     if [ -z "$selected" ]; then
#         show_main_menu
#         return
#     fi

#     # Decode and copy the selected favorite's data to clipboard:
#     local chosen_line="${label_map[$selected]}"
#     local b64_data="${chosen_line#*:::}"

#     # Detect type to choose wl-copy mimetype (optional)
#     local mime_type=$(echo "$b64_data" | base64 -d 2>/dev/null | file --mime-type -b -)

#     echo "$b64_data" | base64 -d | wl-copy --type="$mime_type"
#     success_message "Copied favorite: ${selected%% *}"
# }

show_favorites() {
    local lines
    mapfile -t lines < "$FAVORITES_FILE"
    if [ ${#lines[@]} -eq 0 ]; then
        # Show empty rofi menu when no favorites
        show_rofi "⭐ Favorites" -multi-select < /dev/null >/dev/null 2>&1
        show_main_menu
        return
    fi
    local menu_items=()
    declare -A label_map
    declare -A seen_hashes
    for line in "${lines[@]}"; do
        local label="${line%%:::*}"
        local b64="${line#*:::}"
        # Calculate hash of the content to detect duplicates
        local content_hash=$(echo "$b64" | base64 -d 2>/dev/null | sha256sum | awk '{print $1}')
        
        # Skip if we've already seen this content
        if [ -n "${seen_hashes[$content_hash]}" ]; then
            continue
        fi
        seen_hashes["$content_hash"]=1
        # Get info about the decoded data length and type:
        local size_bytes=$(echo "$b64" | base64 -d 2>/dev/null | wc -c)
        local size_kb=$(( (size_bytes + 1023) / 1024 ))
        # Try to detect mime type from decoded data:
        local mime_type=$(echo "$b64" | base64 -d 2>/dev/null | file --mime-type -b -)
        # Fallback label suffix:
        local suffix="[[ $size_kb KiB $mime_type ]]"
        local display="$label $suffix"
        menu_items+=("$display")
        label_map["$display"]="$line"
    done
    # Check if we have any items left after deduplication
    if [ ${#menu_items[@]} -eq 0 ]; then
        # Show empty rofi menu when no unique favorites found
        show_rofi "📌 Favorites (no unique items)" -multi-select < /dev/null >/dev/null 2>&1
        show_main_menu
        return
    fi
    local selected=$(printf '%s\n' "${menu_items[@]}" | show_rofi "📌 Favorites" -multi-select)
    if [ -z "$selected" ]; then
        show_history_menu
        return
    fi
    # Decode and copy the selected favorite's data to clipboard:
    local chosen_line="${label_map[$selected]}"
    local b64_data="${chosen_line#*:::}"
    # Detect type to choose wl-copy mimetype (optional)
    local mime_type=$(echo "$b64_data" | base64 -d 2>/dev/null | file --mime-type -b -)
    echo "$b64_data" | base64 -d | wl-copy --type="$mime_type"
    success_message "Copied favorite: ${selected%% *}"
}


remove_favorite() {
    if [ ! -s "$FAVORITES_FILE" ]; then
        show_rofi "➖ Remove from Favorites..." 2>/dev/null || echo "No favorites to remove."
        return
    fi

    mapfile -t lines < "$FAVORITES_FILE"
    local menu_items=()
    declare -A label_map

    for line in "${lines[@]}"; do
        local label="${line%%:::*}"
        local b64="${line#*:::}"

        local size_bytes=$(echo "$b64" | base64 -d 2>/dev/null | wc -c)
        local size_kb=$(( (size_bytes + 1023) / 1024 ))
        local mime_type=$(echo "$b64" | base64 -d 2>/dev/null | file --mime-type -b -)
        local suffix="[[ $size_kb KiB $mime_type ]]"
        # Your labels already have the brackets, so keep label as-is:
        local display="$label"
        menu_items+=("$display")
        label_map["$display"]="$label"
    done

    IFS=$'\n' read -d '' -r -a selected < <(printf '%s\n' "${menu_items[@]}" | show_rofi "➖ Remove Favorite" -multi-select; printf '\0')

    [ ${#selected[@]} -eq 0 ] && return

    # Backup before changes
    cp "$FAVORITES_FILE" "$FAVORITES_FILE.bak"

    for sel in "${selected[@]}"; do
        local label_to_remove="${label_map[$sel]}"

        # Escape regex special chars in label
        local esc_label
        esc_label=$(printf '%s\n' "$label_to_remove" | sed -e 's/[]\/$*.^|[]/\\&/g')

        # Delete line matching exactly that label and ::: after it
        sed -i "/^${esc_label}:::/d" "$FAVORITES_FILE"

        success_message "Removed favorite: $label_to_remove"
    done
}

start_cliphist_daemon() {
    if [ -f "$DAEMON_PID_FILE" ]; then
        local pid
        pid=$(cat "$DAEMON_PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            success_message "cliphist daemon is already running (PID: $pid)."
            return
        fi
    fi

    if ! command -v wl-paste >/dev/null || ! command -v cliphist >/dev/null; then
        echo "Error: 'wl-paste' or 'cliphist' not found in PATH." >&2
        return 1
    fi

    wl-paste --type image --watch sh -c '
    # Check if clipboard has image data
    if wl-paste --list-types | grep -q "image/"; then
        cliphist store
    fi
    ' &

    wl-paste --type text --watch sh -c '
        # Only store text if there is NO image data
        if ! wl-paste --list-types | grep -q "image/"; then
            cliphist store
        fi
    ' &

    local new_pid=$!
    echo "$new_pid" > "$DAEMON_PID_FILE"
    success_message "cliphist daemon started (PID: $new_pid)."
}

stop_cliphist_daemon() {
    if [ -f "$DAEMON_PID_FILE" ]; then
        local pid
        pid=$(cat "$DAEMON_PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid"
            rm -f "$DAEMON_PID_FILE"
            success_message "cliphist daemon stopped."
        else
            echo "No running cliphist daemon found."
        fi
    else
        echo "Daemon PID file not found."
    fi
}

print_usage() {
    echo "Usage: $SCRIPT_NAME [command]"
    echo "Commands:"
    echo "  menu       Show clipboard manager menu"
    echo "  start      Start cliphist daemon"
    echo "  stop       Stop cliphist daemon"
    echo "  clear      Clear clipboard history"
    echo "  help       Show this help message"
}

main() {
    check_dependencies

    case "$1" in
        menu|"")
            show_history_menu
            ;;
        start)
            start_cliphist_daemon
            ;;
        stop)
            stop_cliphist_daemon
            ;;
        clear)
            if [ "$(confirm_action 'Clear clipboard history?')" = "Yes" ]; then
                cliphist wipe
                success_message "History cleared"
            fi
            ;;
        help|--help|-h)
            print_usage
            ;;
        *)
            error_message "Unknown command: $1"
            print_usage
            exit 1
            ;;
    esac
}

main "$@"