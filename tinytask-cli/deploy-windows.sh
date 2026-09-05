#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# TinyTask CLI — Windows build + install
#
# Run this from Git Bash on a Windows machine (or use deploy-windows.ps1 from
# PowerShell). It builds the standalone
# Windows executable (Node.js SEA) using the locally installed Node.js
# (no download needed — on win32 the running node.exe is used directly),
# then installs it as tinytask.exe in ~/.local/bin.
#
# Usage:   ./deploy-windows.sh
# Result:  dist/tko-win.exe        (build artifact)
#          ~/.local/bin/tinytask.exe  (installed)
# ─────────────────────────────────────────────────────────────────────────────

echo "▶ Building TinyTask CLI (Windows)..."

npm run build
npm run package-windows

mkdir -p "$HOME/.local/bin"
cp dist/tko-win.exe "$HOME/.local/bin/tinytask.exe"

echo ""
"$HOME/.local/bin/tinytask.exe" --version

echo ""
echo "✓ Installed to $HOME/.local/bin/tinytask.exe"
echo "  (make sure $HOME\\.local\\bin is on your Windows PATH)"
