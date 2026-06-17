#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetDir = path.resolve(process.argv[2] || '.');
const templateDir = path.resolve(__dirname, '..');

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  console.log(`Initializing OpenSpec in: ${targetDir}`);
  
  if (!fs.existsSync(targetDir)) {
    console.error(`Error: Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  // 1. Run openspec init --tools none
  try {
    console.log('Running base openspec init...');
    execSync('openspec init --tools none', { cwd: targetDir, stdio: 'inherit' });
  } catch (err) {
    console.error('Error running openspec init:', err.message);
    process.exit(1);
  }

  // 2. Copy instruction directories
  const directoriesToCopy = ['.agent', '.claude', '.codex', '.cursor'];
  for (const dir of directoriesToCopy) {
    const srcPath = path.join(templateDir, dir);
    const destPath = path.join(targetDir, dir);
    if (fs.existsSync(srcPath)) {
      console.log(`Copying ${dir} configuration...`);
      copyDirSync(srcPath, destPath);
    } else {
      console.warn(`Warning: Template source ${dir} not found at ${srcPath}`);
    }
  }

  console.log('OpenSpec initialization with multi-engine support complete!');
}

main().catch(err => {
  console.error('Initialization failed:', err);
  process.exit(1);
});
