#!/home/archVaibhav/.dotfiles/scripts/.venv/bin/python
"""Switch waybar layout via rofi picker."""

import subprocess
import sys
from pathlib import Path

DOTFILES_WAYBAR = Path.home() / ".dotfiles/desktop/.config/waybar"
DOTFILES_LAYOUTS = DOTFILES_WAYBAR / "layouts"
WAYBAR_DIR = Path.home() / ".config/waybar"
STATE = WAYBAR_DIR / ".active-layout"


def get_layouts() -> list[str]:
    return sorted(
        p.name for p in DOTFILES_LAYOUTS.iterdir()
        if p.is_dir() and (p / "config.jsonc").exists()
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
    layout_dir = DOTFILES_LAYOUTS / chosen
    if not layout_dir.exists():
        print(f"Layout not found: {layout_dir}", file=sys.stderr)
        sys.exit(1)

    # Repoint config.jsonc symlink
    config_link = WAYBAR_DIR / "config.jsonc"
    if config_link.exists() or config_link.is_symlink():
        config_link.unlink()
    config_link.symlink_to(layout_dir / "config.jsonc")

    # Repoint style.css symlink
    style_link = WAYBAR_DIR / "style.css"
    if style_link.exists() or style_link.is_symlink():
        style_link.unlink()
    style_link.symlink_to(layout_dir / "style.css")

    # Save state
    STATE.write_text(chosen)

    # Restart waybar
    subprocess.run(["systemctl", "--user", "restart", "waybar.service"])
    print(f"Switched to: {chosen}")


def main() -> None:
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
