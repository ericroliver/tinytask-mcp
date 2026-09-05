#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# TinyTask CLI Deploy Script
#
# Builds and deploys the tinytask CLI binary to all machines on the home network.
#
# Usage:
#   ./deploy.sh              # Build + deploy to all reachable machines
#   ./deploy.sh --build      # Build only, don't deploy
#   ./deploy.sh --check      # Check current versions on all machines
#   ./deploy.sh --build-only # Alias for --build
#
# Architecture note:
#   This script runs inside the m1x-remote Docker container (Linux ARM64).
#   - Linux ARM64 binary:  Built locally using a downloaded Node.js runtime
#   - Linux x86_64 binary: Built on blue-remote using Docker (node:20-slim)
#   - macOS ARM64 binary:  Built on m3x-remote using nvm-installed Node 20
#
# Machines:
#   Linux x86_64:  blue-remote, angstrom, spectre-remote
#   Linux ARM64:   localhost (m1x-remote Docker container)
#   macOS arm64:   m3x-remote, m1x-remote (host), lisao-remote
# ─────────────────────────────────────────────────────────────────────────────

# ── Config ────────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/ericroliver/tinytask-mcp.git"
BRANCH="${BRANCH:-main}"
CLI_DIR="tinytask-cli"
NODE_TARBALL="https://nodejs.org/dist/v20.19.2/node-v20.19.2-linux-arm64.tar.xz"

# Machine lists
LINUX_X86_MACHINES=("blue-remote.tail79f797.ts.net" "angstrom.tail79f797.ts.net" "spectre-remote.tail79f797.ts.net")
LINUX_ARM64_LOCAL="/enigma-home/bin/tinytask"  # This container (m1x-remote Docker)
MACOS_MACHINES=("m3x-remote.tail79f797.ts.net" "m1x-remote.tail79f797.ts.net" "lisao-remote.tail79f797.ts.net")

# Build hosts
LINUX_X86_BUILD_HOST="blue-remote.tail79f797.ts.net"
MACOS_BUILD_HOST="m3x-remote.tail79f797.ts.net"

SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "\033[0;34m▶\033[0m $*"; }
ok()   { echo -e "\033[0;32m✓\033[0m $*"; }
warn() { echo -e "\033[0;33m⚠\033[0m $*"; }
err()  { echo -e "\033[0;31m✗\033[0m $*" >&2; }

remote() {
  local host="$1"; shift
  ssh $SSH_OPTS "eo@${host}" "$@"
}

remote_scp() {
  local src="$1"; local host="$2"; local dest="$3"
  scp $SSH_OPTS "$src" "eo@${host}:${dest}"
}

# ── Check mode ───────────────────────────────────────────────────────────────
check_versions() {
  log "Checking tinytask versions on all machines..."
  echo ""

  local version=""

  # Local (m1x-remote Docker container)
  version=$(tinytask --version 2>/dev/null) || version="—"
  printf "%-42s %-8s %-10s\n" "MACHINE" "VERSION" "STATUS"
  printf "%-42s %-8s %-10s\n" "───────" "───────" "──────"
  printf "%-42s %-8s %-10s\n" "localhost (m1x-remote Docker)" "$version" "online"

  # Remote machines
  local all_machines=("${LINUX_X86_MACHINES[@]}" "${MACOS_MACHINES[@]}")

  for host in "${all_machines[@]}"; do
    local status=""
    version=$(remote "$host" 'export PATH="$HOME/.local/bin:$PATH"; tinytask --version 2>/dev/null' 2>/dev/null) && status="online" || status="offline"

    if [[ "$status" == "offline" ]]; then
      version="—"
    fi

    printf "%-42s %-8s %-10s\n" "$host" "$version" "$status"
  done
}

# ── Build: Linux ARM64 (local, this container) ──────────────────────────────
build_linux_arm64() {
  log "Building Linux ARM64 binary locally..."

  # Ensure Node.js is available
  local node_dir="/tmp/node-v20.19.2-linux-arm64"
  if [ ! -x "$node_dir/bin/node" ]; then
    log "Downloading Node.js 20 for linux-arm64..."
    # Ensure xz-utils is installed for tar extraction
    if ! command -v xz &>/dev/null; then
      apt-get update -qq && apt-get install -y -qq xz-utils 2>&1 | tail -1
    fi
    curl -fsSL "$NODE_TARBALL" -o /tmp/node.tar.xz
    tar -xf /tmp/node.tar.xz -C /tmp/
  fi

  export PATH="$node_dir/bin:$PATH"

  cd /enigma-home/repos/tinytask/tinytask-cli
  npm ci 2>&1 | tail -1
  npm run sea:linux 2>&1 | tail -3
  chmod +x dist/tko-linux

  # Verify
  ./dist/tko-linux --version

  ok "Linux ARM64 binary built locally"
}

# ── Build: Linux x86_64 (on blue-remote via Docker) ─────────────────────────
build_linux_x86() {
  local host="$LINUX_X86_BUILD_HOST"
  local repo_path="\$HOME/config/tinytask/tinytask-mcp"

  log "Building Linux x86_64 binary on $host..."

  remote "$host" "
    if [ ! -d '$repo_path' ]; then
      mkdir -p ~/config/tinytask && git clone '$REPO_URL' '$repo_path'
    fi
    cd '$repo_path'
    git fetch origin && git checkout '$BRANCH' && git pull origin '$BRANCH'
    cd '$CLI_DIR'
    docker run --rm --platform linux/amd64 -v \$(pwd):/app -w /app node:20-slim sh -c 'npm ci && npm run sea:linux && chmod +x dist/tko-linux'
    ./dist/tko-linux --version
  " 2>&1 | grep -v "^From " | grep -v "^Already on " | grep -v "^Your branch"

  ok "Linux x86_64 binary built on $host"
}

# ── Build: macOS ARM64 (on m3x-remote via nvm) ──────────────────────────────
build_macos() {
  local host="$MACOS_BUILD_HOST"
  local repo_path="\$HOME/config/tinytask/tinytask-mcp"

  log "Building macOS ARM64 binary on $host..."

  remote "$host" "
    export NVM_DIR=\"\$HOME/.nvm\"
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    if [ ! -d '$repo_path' ]; then
      mkdir -p ~/config/tinytask && git clone '$REPO_URL' '$repo_path'
    fi
    cd '$repo_path'
    git fetch origin && git checkout '$BRANCH' && git pull origin '$BRANCH'
    cd '$CLI_DIR'
    npm ci
    npm run sea:macos
    chmod +x dist/tko-macos
    ./dist/tko-macos --version
  " 2>&1 | grep -v "^From " | grep -v "^Already on " | grep -v "^Your branch"

  ok "macOS ARM64 binary built on $host"
}

# ── Deploy: Linux ARM64 (local) ─────────────────────────────────────────────
deploy_local() {
  log "Deploying to localhost (m1x-remote Docker)..."
  cp /enigma-home/repos/tinytask/tinytask-cli/dist/tko-linux "$LINUX_ARM64_LOCAL"
  chmod +x "$LINUX_ARM64_LOCAL"
  local version
  version=$(tinytask --version 2>/dev/null)
  ok "localhost → v$version"
}

# ── Deploy: Linux x86_64 machines ───────────────────────────────────────────
deploy_linux_x86() {
  local build_host="$LINUX_X86_BUILD_HOST"
  local repo_path="\$HOME/config/tinytask/tinytask-mcp"

  # Pull the binary from blue-remote to local temp
  local tmpfile="/tmp/tko-linux-x86-$$"
  remote "$build_host" "cat '$repo_path/$CLI_DIR/dist/tko-linux'" > "$tmpfile" 2>/dev/null

  for host in "${LINUX_X86_MACHINES[@]}"; do
    log "Deploying to $host..."

    if ! remote "$host" 'echo ok' >/dev/null 2>&1; then
      warn "$host is offline — skipping"
      continue
    fi

    if [[ "$host" == "$build_host" ]]; then
      # Same machine — copy locally on the remote
      remote "$host" "cp '$repo_path/$CLI_DIR/dist/tko-linux' ~/.local/bin/tinytask && chmod +x ~/.local/bin/tinytask"
    else
      # Upload from local temp to target
      remote_scp "$tmpfile" "$host" "~/.local/bin/tinytask"
    fi

    local version
    version=$(remote "$host" 'export PATH="$HOME/.local/bin:$PATH"; tinytask --version' 2>/dev/null)
    ok "$host → v$version"
  done

  rm -f "$tmpfile"
}

# ── Deploy: macOS machines ──────────────────────────────────────────────────
deploy_macos() {
  local build_host="$MACOS_BUILD_HOST"
  local repo_path="\$HOME/config/tinytask/tinytask-mcp"

  for host in "${MACOS_MACHINES[@]}"; do
    log "Deploying to $host..."

    if ! remote "$host" 'echo ok' >/dev/null 2>&1; then
      warn "$host is offline — skipping"
      continue
    fi

    if [[ "$host" == "$build_host" ]]; then
      # Same machine — copy locally on the remote
      remote "$host" "cp '$repo_path/$CLI_DIR/dist/tko-macos' ~/.local/bin/tinytask && chmod +x ~/.local/bin/tinytask"
    else
      # SCP from build host to target host (both on Tailscale)
      remote "$build_host" "scp -o StrictHostKeyChecking=accept-new '$repo_path/$CLI_DIR/dist/tko-macos' 'eo@$host:~/.local/bin/tinytask'"
    fi

    local version
    version=$(remote "$host" 'export PATH="$HOME/.local/bin:$PATH"; tinytask --version' 2>/dev/null)
    ok "$host → v$version"
  done
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  local mode="${1:-deploy}"

  case "$mode" in
    --check)
      check_versions
      ;;
    --build|--build-only)
      build_linux_arm64
      build_linux_x86
      build_macos
      ok "All builds complete"
      ;;
    deploy|"")
      echo ""
      echo "╔══════════════════════════════════════════════════════════════╗"
      echo "║          TinyTask CLI Deploy Script                          ║"
      echo "╚══════════════════════════════════════════════════════════════╝"
      echo ""

      # Build all three architectures
      build_linux_arm64
      build_linux_x86
      build_macos
      echo ""

      # Deploy
      log "Deploying to localhost (Linux ARM64)..."
      deploy_local
      echo ""

      log "Deploying to Linux x86_64 machines..."
      deploy_linux_x86
      echo ""

      log "Deploying to macOS machines..."
      deploy_macos
      echo ""

      # Summary
      log "Final status:"
      check_versions
      echo ""
      ok "Deploy complete!"
      ;;
    *)
      err "Unknown mode: $mode"
      err "Usage: $0 [--build|--build-only|--check]"
      exit 1
      ;;
  esac
}

main "$@"
