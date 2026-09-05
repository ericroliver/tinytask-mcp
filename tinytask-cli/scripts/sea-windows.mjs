/**
 * Produces dist/tko-win.exe — a Windows Node.js SEA executable.
 *
 * On a Windows host: the running node.exe (process.execPath) is a win-x64
 * Node binary, so it is used directly — no download required.
 *
 * On Linux/macOS (cross-build): downloads the official win-x64 node.exe,
 * because Node SEA requires the target platform's node binary — you can't
 * inject a blob into a Linux Node binary and get a Windows .exe.
 *
 * Prerequisites (cross-build only):
 *   - curl (for downloading)
 *   - unzip, python3, or PowerShell (for zip extraction, in that order)
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const NODE_VERSION = 'v20.19.2';
const OUTPUT = 'dist/tko-win.exe';

mkdirSync('dist', { recursive: true });

// ── Native Windows build: use the local node.exe directly ───────────────────
if (platform() === 'win32') {
  copyFileSync(process.execPath, OUTPUT);
  console.log(`✓ Local Windows node.exe copied to ${OUTPUT}`);
  process.exit(0);
}

// ── Cross-build: download win-x64 node.exe ──────────────────────────────────
const URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`;
const TMP_DIR = join(tmpdir(), 'node-win-x64-build');
const ZIP_PATH = join(TMP_DIR, 'node.zip');
const EXTRACT_DIR = join(TMP_DIR, 'extracted');

// Create tmp dir
mkdirSync(TMP_DIR, { recursive: true });

// Download
console.log(`Downloading Windows Node.js ${NODE_VERSION}...`);
execFileSync('curl', ['-sL', URL, '-o', ZIP_PATH], { stdio: 'inherit' });

// Extract
console.log('Extracting...');
if (existsSync(EXTRACT_DIR)) {
  rmSync(EXTRACT_DIR, { recursive: true });
}
mkdirSync(EXTRACT_DIR, { recursive: true });

let extracted = false;
for (const [cmd, args] of [
  ['unzip', ['-q', ZIP_PATH, '-d', EXTRACT_DIR]],
  [
    'python3',
    [
      '-c',
      `import zipfile; zipfile.ZipFile('${ZIP_PATH}').extractall('${EXTRACT_DIR}')`,
    ],
  ],
  // Git Bash on Windows may lack unzip/python3; PowerShell always exists there
  [
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Force '${ZIP_PATH}' '${EXTRACT_DIR}'`,
    ],
  ],
]) {
  try {
    execFileSync(cmd, args, { stdio: 'inherit' });
    extracted = true;
    break;
  } catch {
    // Try the next extractor
  }
}
if (!extracted) {
  throw new Error('Could not extract node zip (tried unzip, python3, PowerShell)');
}

// Find node.exe in the extracted archive
const dirs = readdirSync(EXTRACT_DIR);
const nodeDir = dirs.find((d) => d.startsWith('node'));
if (!nodeDir) {
  throw new Error('Could not find node directory in extracted archive');
}

const nodeExePath = join(EXTRACT_DIR, nodeDir, 'node.exe');
if (!existsSync(nodeExePath)) {
  throw new Error(`node.exe not found at ${nodeExePath}`);
}

// Copy to dist/
copyFileSync(nodeExePath, OUTPUT);
console.log(`✓ Windows node.exe copied to ${OUTPUT}`);
