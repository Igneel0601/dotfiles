#!/usr/bin/env bash
set -euo pipefail

base_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
temp_dir="$base_dir/temp"
notes_dir="$base_dir/notes"

mkdir -p "$temp_dir"
mkdir -p "$notes_dir"

counter_file="$temp_dir/.next_id"
include_file="$temp_dir/generated_notes.yuck"

if [[ ! -f "$include_file" ]]; then
	: > "$include_file"
fi

next_id=1
if [[ -f "$counter_file" ]]; then
	if [[ "$(cat "$counter_file" 2>/dev/null || true)" =~ ^[0-9]+$ ]]; then
		next_id="$(cat "$counter_file")"
	fi
fi

id="$next_id"
echo "$((next_id + 1))" > "$counter_file"

note_window="note_${id}"
note_file_rel="temp/${note_window}.yuck"
note_file_abs="$base_dir/$note_file_rel"

note_text_var="note_${id}_text"
note_text_file_abs="$notes_dir/note_${id}.txt"

if [[ ! -f "$note_text_file_abs" ]]; then
	: > "$note_text_file_abs"
fi

cat > "$note_file_abs" <<EOF
(defpoll ${note_text_var} :interval "0.5s" "cat '${note_text_file_abs}' 2>/dev/null || true")

(defwindow ${note_window}
	:monitor 0
	:geometry (geometry
						:x "10px"
						:y "2%"
						:width "300px"
                        :height "300px"
						:anchor "top right")
	:stacking "bg"
	:exclusive false
	:focusable false
	:windowtype "normal"
	(box
		:class "black-box"
		:orientation "vertical"
		:space-evenly false
		(box
			:class "note-strip"
			(button
				:class "del-btn"
				:onclick "${base_dir}/close.sh ${id}"
				"×")
			(box :hexpand true)
			(button
				:class "plus-btn"
				:onclick "${base_dir}/plus.sh"
				"+"))
		(box 
			:class "note-body"
			:hexpand true
			:vexpand true
			(label
				:text ${note_text_var}
				:wrap true
				:width 40
				:wrap-mode "word"
				:hexpand true
				:xalign 0
				:justify "left"))))
EOF

# Register the new note file so the config can include it.
if ! grep -Fqx "(include \"$note_file_rel\")" "$include_file"; then
	echo "(include \"$note_file_rel\")" >> "$include_file"
fi

# Reload and open the new window. (No-op if eww isn't running yet.)
eww -c "$base_dir" reload >/dev/null 2>&1 || true
eww -c "$base_dir" open "$note_window" >/dev/null 2>&1 || true

echo "$id"
