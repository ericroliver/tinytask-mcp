# Changelog

All notable changes to the TinyTask CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-09-07

### Fixed
- **`task history` no longer hard-aborts against older servers** (#898): an
  "Unknown tool: get_task_history" error (server image older than 2.2.0) now
  prints actionable guidance (rebuild/redeploy tinytask-mcp, then retry)
  and exits 1 cleanly. Previously the CLI surfaced the raw error and the
  process could die with a libuv abort (exit -1073740791) on Windows SEA
  builds because `process.exit()` raced the still-open MCP transport.
- **Graceful shutdown everywhere** (#898, #900): the CLI now disconnects
  the MCP client before exiting on error paths (history, signup, task
  delete), and installs global `unhandledRejection`/`uncaughtException`
  handlers that print a clean message and exit 1 — no more bare libuv
  aborts.
- **`signup` no longer fails on a bare "nothing to do" answer** (#899):
  the client tolerates all known server response shapes — pure JSON task
  object or `null` (server >= 2.2.2), legacy "No idle tasks..." text, and
  legacy "Task #N claimed..." text wrapping the task JSON. Empty-queue
  signups now print "No idle tasks available in your queue" and exit 0.

### Added
- Regression tests: `task delete` / `queue clear` expose `-y/--yes`
  ("Skip confirmation") so non-interactive agents never need to pipe `y`
  (#900). Live verification: `--yes` skips the prompt at HEAD; if your
  build still prompts, rebuild via `deploy-windows.ps1` from latest main.

## [0.5.1] - 2026-09-05

### Added
- Windows build + install support: `deploy-windows.sh` (Git Bash) and `deploy-windows.ps1` (PowerShell, works in Windows PowerShell 5.1 and PowerShell 7+) — both build `dist/tko-win.exe` and install to `~/.local/bin/tinytask.exe`
- `sea:windows` now builds natively on Windows (uses the local `node.exe` — no download) and gained a PowerShell extraction fallback for cross-builds from Linux/macOS

### Changed
- **SEA build outputs renamed**: `dist/tinytask-macos` → `dist/tko-macos`, `dist/tinytask-linux` → `dist/tko-linux`, `dist/tinytask.exe` → `dist/tko-win.exe` (installed command name `tinytask` is unchanged)
- Fixed `deploy-macos.sh` calling non-existent `npm run package` → now `npm run package-mac`
- Docs: BUILD.md/README.md packaging sections rewritten for SEA flow and `tko-*` artifact names

## [0.3.1] - 2026-08-13

### Added
- `TINYTASK_CONFIG_PATH` environment variable — override the config file location (default: `~/.tinytaskrc.json`)

### Changed
- `getConfigPath()` checks `TINYTASK_CONFIG_PATH` env var first, falls back to `~/.tinytaskrc.json`

## [0.3.0] - 2026-08-05

### Breaking Changes
- **Removed `defaultAgent` config field** — replaced by `agent`. Update your config: `tinytask config set agent <name>`.
- **`assigned_to` no longer defaults to agent identity** — tasks are unassigned unless explicitly specified with `-a <agent>`.
- **`created_by` is now required for task creation** — set `TKO_AGENT` env var or pass `--created-by <agent>`.
- **`--default-agent` flag removed from profile add** — use `--agent` instead.
- **`TINYTASK_AGENT` env var deprecated** — use `TKO_AGENT`. Both work, `TKO_AGENT` takes precedence.

### Changed
- Agent identity resolution: `--created-by` flag > `TKO_AGENT` env var > `TINYTASK_AGENT` env var > config `agent` field
- Error messages updated to reference `TKO_AGENT` instead of `defaultAgent`
- Config schema: `defaultAgent` → `agent` in both `ConfigSchema` and `ProfileSchema`

### Migration
1. Set `TKO_AGENT` in your agent process environment
2. Update config: `tinytask config set agent <your-agent-name>` (old `defaultAgent` is ignored)
3. Update profiles: `tinytask config profile add --name <n> -u <url> --agent <name>`
4. Scripts relying on `assigned_to` defaulting to agent identity must now pass `-a <agent>` explicitly

## [0.2.2] - 2026-01-20

### Fixed
- Improved error handling in config loader for malformed JSON files
- Config loader now properly falls back to searching current directory when home config contains invalid JSON

## [0.2.0] - 2026-01-20

### Added
- Support for subtasks and queues
- New commands for subtask management
- Queue management and statistics commands
- Profile-based configuration management
- Multiple output formatters (table, JSON, CSV, compact, tree)
- Environment variable support for configuration
- Home directory config file support (~/.tinytaskrc.json)

### Changed
- **BREAKING**: Profile add command syntax changed from positional to option-based
  - **Old**: `tinytask config profile add <name> --url <url>`
  - **New**: `tinytask config profile add --name <name> --server-url <url>`
- Improved table formatting with better column alignment
- Enhanced error messages and user feedback

### Migration Guide

#### Profile Command Changes

If you have scripts or aliases using the old profile add syntax:

```bash
# Old syntax (no longer works)
tinytask config profile add myprofile --url http://localhost:3000/mcp

# New syntax (use this instead)
tinytask config profile add --name myprofile --server-url http://localhost:3000/mcp
```

## [0.1.0] - 2026-01-15

### Added
- Initial release of TinyTask CLI
- Basic task management commands (create, list, get, update, delete, archive)
- Comment and link management
- Configuration management
- MCP client integration for both stdio and HTTP transports
- JSON and table output formats
