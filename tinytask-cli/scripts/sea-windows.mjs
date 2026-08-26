/**
 * Downloads a Windows Node.js binary and copies node.exe to dist/tinytask.exe.
 * This is needed because Node SEA requires the target platform's node binary —
 * you can't inject a blob into a Linux Node binary and get a Windows .exe.
 *
 * Prerequisites:
 *   - python3 (used for zip extraction, since unzip may not be available)
 *   - curl (for downloading)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const NODE_VERSION = 'v20.19.2';
const URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`;
const TMP_DIR = join(tmpdir(), 'node-win-x64-build');
const ZIP_PATH = join(TMP_DIR, 'node.zip');
const EXTRACT_DIR = join(TMP_DIR, 'extracted');
const OUTPUT = 'dist/tinytask.exe';

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

try {
  // Try unzip first
  execFileSync('unzip', ['-q', ZIP_PATH, '-d', EXTRACT_DIR]);
} catch {
  // Fallback to python3
  execFileSync('python3', [
    '-c',
    `import zipfile; zipfile.ZipFile('${ZIP_PATH}').extractall('${EXTRACT_DIR}')`,
  ]);
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
mkdirSync('dist', { recursive: true });
copyFileSync(nodeExePath, OUTPUT);
console.log(`✓ Windows node.exe copied to ${OUTPUT}`);
