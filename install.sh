#!/bin/bash
# ~/.dotfiles/install.sh
# Stow all core modules on a fresh install
set -e

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DOTFILES_DIR"

MODULES=(core desktop terminal theming scripts)

for m in "${MODULES[@]}"; do
    echo "Stowing $m..."
    stow "$m"
done

echo ""
echo "Done. To also install optional modules:"
echo "  stow apps"
echo "  stow peripherals"
