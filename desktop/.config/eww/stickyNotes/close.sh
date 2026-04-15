#!/usr/bin/env bash
set -euo pipefail

base_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ${#} -ne 1 ]]; then
	echo "usage: $0 <id>" >&2
	exit 2
fi

id="$1"
if [[ ! "$id" =~ ^[0-9]+$ ]]; then
	echo "id must be numeric" >&2
	exit 2
fi

window="note_${id}"

note_yuck_rel="temp/${window}.yuck"
note_yuck_abs="${base_dir}/${note_yuck_rel}"
note_text_abs="${base_dir}/notes/note_${id}.txt"
include_file="${base_dir}/temp/generated_notes.yuck"
counter_file="${base_dir}/temp/.next_id"

# Close the window if it's open. Don't fail if it's not open.
eww -c "$base_dir" close "$window" >/dev/null 2>&1 || true

# Remove files (ignore if already missing)
rm -f "$note_yuck_abs" "$note_text_abs"

# Unregister from generated include list
if [[ -f "$include_file" ]]; then
	# Write filtered content to a temp file, then replace atomically
	tmp_file="${include_file}.tmp"
	grep -Fvx "(include \"${note_yuck_rel}\")" "$include_file" > "$tmp_file" || true
	mv "$tmp_file" "$include_file"
fi

# Refresh next id (smallest missing positive integer)
ids=()
shopt -s nullglob
for f in "${base_dir}/temp"/note_*.yuck; do
	filename="$(basename "$f")"
	if [[ "$filename" =~ ^note_([0-9]+)\.yuck$ ]]; then
		ids+=("${BASH_REMATCH[1]}")
	fi
done
shopt -u nullglob

next_id=1
if (( ${#ids[@]} > 0 )); then
	next_id="$(printf '%s\n' "${ids[@]}" | sort -n | awk 'BEGIN{e=1} {if($1==e)e++; else if($1>e) exit} END{print e}')"
fi
echo "$next_id" > "$counter_file"

# Reload config so the removed window definition disappears
eww -c "$base_dir" reload >/dev/null 2>&1 || true
