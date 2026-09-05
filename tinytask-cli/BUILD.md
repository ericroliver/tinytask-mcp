# Building TinyTask CLI

This document describes the build and packaging process for TinyTask CLI.

## Standard Build

The standard build process compiles TypeScript to JavaScript using tsup:

```bash
npm run build
```

This produces:
- `dist/index.js` - Bundled JavaScript with ES modules
- `dist/index.js.map` - Source maps for debugging
- `dist/index.d.ts` - TypeScript type definitions

### Build Configuration

Build settings are defined in [`tsup.config.ts`](tsup.config.ts:1):
- **Entry**: `src/index.ts`
- **Format**: ESM (ES modules)
- **Target**: ES2022
- **Sourcemaps**: Enabled
- **Clean**: Output directory cleaned before each build

## Standalone Executables

TinyTask CLI uses **Node.js Single Executable Applications (SEA)** to create true standalone executables.

### What is Node.js SEA?

Node.js SEA is the official Node.js feature (stable since Node 20+) that packages your application and the Node.js runtime into a single executable file. This creates true native executables that:
- ✅ Run without requiring Node.js installation
- ✅ Work on any compatible platform
- ✅ Include all dependencies bundled
- ✅ Are code-signed and distributable

### Quick Start

```bash
# Create macOS executable (default)
npm run package

# Or create for specific platforms
npm run sea:macos    # macOS executable
npm run sea:linux    # Linux executable  
npm run sea:windows  # Windows executable
```

### Output

Executables are created in `dist/`:
- `dist/tko-macos` - macOS executable (~95 MB)
- `dist/tko-linux` - Linux executable (~95 MB)
- `dist/tko-win.exe` - Windows executable (~95 MB)

### How It Works

The packaging process:

1. **Bundle with esbuild** (`npm run bundle`)
   - Compiles TypeScript to JavaScript
   - Bundles all dependencies into a single CommonJS file
   - Resolves @modelcontextprotocol/sdk wildcard exports
   - Outputs: `dist/bundle.cjs` (~10.5 MB)

2. **Create SEA blob** (`node --experimental-sea-config sea-config.json`)
   - Packages the bundle into Node.js SEA format
   - Outputs: `sea-prep.blob`

3. **Inject into Node binary** (`postject`)
   - Copies the Node.js runtime binary
   - Injects the SEA blob using postject
   - Creates the final executable

4. **Code sign** (macOS only)
   - Signs the executable with ad-hoc signature
   - Required for macOS executables to run

### Configuration Files

#### [`esbuild.config.mjs`](esbuild.config.mjs:1)

Handles bundling with custom plugin for @modelcontextprotocol/sdk resolution:

```javascript
{
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',  // CommonJS required for SEA
  outfile: 'dist/bundle.cjs',
  plugins: [mcpResolverPlugin]  // Resolves wildcard exports
}
```

#### [`sea-config.json`](sea-config.json:1)

Node.js SEA configuration:

```json
{
  "main": "dist/bundle.cjs",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "useCodeCache": true
}
```

### Platform-Specific Commands

#### macOS

```bash
npm run sea:macos
# or
./dist/tko-macos --version
```

Includes code signing with `codesign --sign - --force` for ad-hoc signature.

#### Linux

```bash
npm run sea:linux
# or (on Linux)
./dist/tko-linux --version
```

No code signing required.

#### Windows

```bash
npm run sea:windows
# or (on Windows)
dist\tko-win.exe --version
```

Two ways to produce the Windows executable:

- **Native (recommended, on a Windows machine):** the running `node.exe` is a
  win-x64 Node binary, so it is used directly — no download needed. Or simply
  run `./deploy-windows.sh` (Git Bash) or `.\deploy-windows.ps1` (PowerShell,
  works in Windows PowerShell 5.1 and PowerShell 7+) to build and install to
  `~/.local/bin/tinytask.exe`.
- **Cross-compiled (from Linux/macOS):** `scripts/sea-windows.mjs` downloads
  the official `node-v20.19.2-win-x64.zip` and extracts `node.exe`
  (unzip → python3 → PowerShell fallback), then postject injects the blob.

Note: For distribution, consider proper code signing with a certificate.

### Testing the Executable

```bash
# Test version
./dist/tko-macos --version

# Test help
./dist/tko-macos --help

# Test command (requires server)
./dist/tko-macos config show
```

## Development Workflow

### Watch Mode

For active development with hot reload:

```bash
npm run dev
```

This watches for file changes and rebuilds automatically.

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test -- --coverage
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Clean build artifacts
npm run clean
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build Executables

on:
  push:
    tags:
      - 'v*'

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: ./tinytask-cli
      - run: npm run sea:macos
        working-directory: ./tinytask-cli
      - uses: actions/upload-artifact@v4
        with:
          name: tko-macos
          path: tinytask-cli/dist/tko-macos

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: ./tinytask-cli
      - run: npm run sea:linux
        working-directory: ./tinytask-cli
      - uses: actions/upload-artifact@v4
        with:
          name: tko-linux
          path: tinytask-cli/dist/tko-linux

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: ./tinytask-cli
      - run: npm run sea:windows
        working-directory: ./tinytask-cli
      - uses: actions/upload-artifact@v4
        with:
          name: tinytask-windows
          path: tinytask-cli/dist/tko-win.exe
```

## Troubleshooting

### Common Issues

#### "Cannot find module" during bundling

**Cause**: Import path doesn't match actual file structure

**Solution**: Ensure @modelcontextprotocol/sdk imports use correct paths:
```typescript
// Correct - matches actual file: dist/esm/client/streamableHttp.js
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
```

#### "Dynamic require not supported" error

**Cause**: ESM format with dynamic imports

**Solution**: Use CommonJS format (`format: 'cjs'`) in esbuild config.

#### "require is not defined in ES module scope"

**Cause**: CommonJS bundle has `.js` extension with `"type": "module"` in package.json

**Solution**: Use `.cjs` extension for CommonJS bundles.

#### Executable won't run on macOS

**Cause**: Not code-signed

**Solution**: 
```bash
codesign --sign - --force dist/tko-macos
# Or use npm run sea:macos which includes signing
```

#### Permission denied on Linux/macOS

**Cause**: Executable bit not set

**Solution**:
```bash
chmod +x dist/tko-linux
chmod +x dist/tko-macos
```

### Verification

After building, verify the executable:

```bash
# Check it exists and is executable
ls -lh dist/tko-macos

# Test basic commands
./dist/tko-macos --version
./dist/tko-macos --help

# Test actual functionality (requires server)
./dist/tko-macos config show
```

## Technical Details

### Why CommonJS for Bundling?

While the source code uses ESM, Node.js SEA currently works best with CommonJS:
- More stable for single-file executables
- Better compatibility with older dependencies
- Fewer dynamic import issues

The conversion happens during bundling:
- Source: TypeScript + ESM
- Bundle: CommonJS (dist/bundle.cjs)
- Executable: Native binary with embedded bundle

### The @modelcontextprotocol/sdk Challenge

This package uses wildcard exports which requires special handling:

```json
"exports": {
  "./client/*": { "import": "./dist/esm/*" }
}
```

Our esbuild plugin resolves these dynamically:
```javascript
'@modelcontextprotocol/sdk/client/streamableHttp.js'
// → node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js
```

### File Sizes

- **Source bundle** (dist/bundle.cjs): ~10.5 MB
  - Application code + all dependencies bundled
  
- **SEA blob** (sea-prep.blob): ~10.5 MB
  - Compressed/prepared bundle

- **Final executable**: ~95 MB
  - Includes complete Node.js runtime (~85 MB)
  - Plus application bundle (~10 MB)

This is normal for Node.js SEA - you're packaging the entire runtime.

### Compression

The executables can be compressed for distribution:

```bash
# gzip (reduces to ~30-35 MB)
gzip -9 dist/tko-macos

# Users decompress:
gunzip tko-macos.gz
chmod +x tko-macos
```

## Distribution

### GitHub Releases

```bash
# Create release with executables
gh release create v0.1.0 \
  dist/tko-macos \
  dist/tko-linux \
  dist/tko-win.exe
```

### Installation Instructions

Users can download and run directly:

**macOS:**
```bash
curl -L https://github.com/user/repo/releases/download/v0.1.0/tko-macos -o tinytask
chmod +x tinytask
./tinytask --version
```

**Linux:**
```bash
curl -L https://github.com/user/repo/releases/download/v0.1.0/tko-linux -o tinytask
chmod +x tinytask
./tinytask --version
```

**Windows:**
```powershell
Invoke-WebRequest -Uri https://github.com/user/repo/releases/download/v0.1.0/tko-win.exe -OutFile tko-win.exe
.\tko-win.exe --version
```

### Code Signing for Distribution

For production distribution, consider proper code signing:

**macOS:**
```bash
# With Apple Developer ID
codesign --sign "Developer ID Application: Your Name" dist/tko-macos
```

**Windows:**
```powershell
# With code signing certificate
signtool sign /f cert.pfx /p password /t http://timestamp.digicert.com dist/tko-win.exe
```

## One-Command Platform Builds (deploy scripts)

The tinytask-cli directory ships per-platform "build + install locally" scripts:

| Script                | Where to run it            | What it does                                              |
| --------------------- | -------------------------- | --------------------------------------------------------- |
| `deploy-linux.sh`     | Linux                      | Build `dist/tko-linux` → install to `~/.local/bin/tinytask` |
| `deploy-macos.sh`     | macOS                      | Build `dist/tko-macos` → install to `~/.local/bin/tinytask` |
| `deploy-windows.sh`   | Windows (Git Bash)         | Build `dist/tko-win.exe` → install to `~/.local/bin/tinytask.exe` |
| `deploy-windows.ps1`  | Windows (PowerShell)       | PowerShell counterpart of `deploy-windows.sh` — same build + install |
| `deploy.sh`           | m1x-remote (Linux ARM64)   | Build all architectures on build hosts + deploy across the network |

## Distribution Checklist

Before releasing executables:

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Version bumped in `package.json`
- [ ] Bundle builds: `npm run bundle`
- [ ] macOS executable works: `npm run sea:macos && ./dist/tko-macos --version`
- [ ] Linux executable works (if on Linux): `npm run sea:linux && ./dist/tko-linux --version`
- [ ] Windows executable works (if on Windows): `npm run sea:windows && dist/tko-win.exe --version`
- [ ] Executables are code-signed (for distribution)
- [ ] Checksums generated for verification
- [ ] Release notes prepared
- [ ] CHANGELOG.md updated

## Resources

- [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html)
- [postject - Node SEA Injection Tool](https://github.com/nodejs/postject)
- [esbuild Documentation](https://esbuild.github.io/)
- [Code Signing Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
