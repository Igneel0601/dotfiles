#!/home/archVaibhav/.dotfiles/scripts/.venv/bin/python
"""Switch waybar layout via rofi picker."""

import subprocess
import sys
from pathlib import Path

DOTFILES_LAYOUTS = Path.home() / ".dotfiles/desktop/.config/waybar/layouts"
ACTIVE_DIR = Path.home() / ".config/waybar/layouts"
ACTIVE = ACTIVE_DIR / "active.jsonc"
STATE = ACTIVE_DIR / ".active"


def get_layouts() -> list[str]:
    return sorted(
        p.stem for p in DOTFILES_LAYOUTS.glob("*.jsonc")
    )


def get_current() -> str:
    return STATE.read_text().strip() if STATE.exists() else "none"


def rofi_pick(layouts: list[str], current: str) -> str | None:
    entries = "\n".join(layouts)
    result = subprocess.run(
        ["rofi", "-dmenu", "-p", "Waybar Layout",
         "-mesg", f"current: {current}",
         "-theme-str", "window {width: 300px;}"],
        input=entries,
        capture_output=True,
        text=True,
    )
    chosen = result.stdout.strip()
    return chosen if chosen else None


def apply(chosen: str) -> None:
    layout_file = DOTFILES_LAYOUTS / f"{chosen}.jsonc"
    if not layout_file.exists():
        print(f"Layout not found: {layout_file}", file=sys.stderr)
        sys.exit(1)

    # Update symlink
    if ACTIVE.exists() or ACTIVE.is_symlink():
        ACTIVE.unlink()
    ACTIVE.symlink_to(layout_file)

    # Save state
    STATE.write_text(chosen)

    # Restart waybar
    subprocess.run(["systemctl", "--user", "restart", "waybar.service"])
    print(f"Switched to: {chosen}")


def main() -> None:
    ACTIVE_DIR.mkdir(parents=True, exist_ok=True)

    layouts = get_layouts()
    if not layouts:
        print("No layouts found in", DOTFILES_LAYOUTS, file=sys.stderr)
        sys.exit(1)

    current = get_current()
    chosen = rofi_pick(layouts, current)
    if chosen:
        apply(chosen)


if __name__ == "__main__":
    main()
