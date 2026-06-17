const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

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

// 1. Sync skills (copy recursively)
console.log('Syncing skills...');
const agentSkills = path.join(root, '.agent', 'skills');
copyDirSync(agentSkills, path.join(root, '.claude', 'skills'));
copyDirSync(agentSkills, path.join(root, '.cursor', 'skills'));
copyDirSync(agentSkills, path.join(root, '.codex', 'skills'));

// 2. Sync commands/workflows preserving frontmatter
console.log('Syncing commands/workflows...');
const agentWorkflows = path.join(root, '.agent', 'workflows');
const workflowFiles = fs.readdirSync(agentWorkflows);

for (const file of workflowFiles) {
  if (!file.endsWith('.md')) continue;

  const agentFilePath = path.join(agentWorkflows, file);
  const agentContent = fs.readFileSync(agentFilePath, 'utf8');

  // Split frontmatter and body
  const agentParts = agentContent.split('---');
  if (agentParts.length < 3) continue;
  const agentBody = agentParts.slice(2).join('---');

  // Sync to Cursor
  const cursorFilePath = path.join(root, '.cursor', 'commands', file);
  if (fs.existsSync(cursorFilePath)) {
    const cursorContent = fs.readFileSync(cursorFilePath, 'utf8');
    const cursorParts = cursorContent.split('---');
    if (cursorParts.length >= 3) {
      const cursorFrontmatter = cursorParts.slice(0, 2).join('---') + '---';
      fs.writeFileSync(cursorFilePath, cursorFrontmatter + agentBody);
    }
  }

  // Sync to Claude (filename mapping: opsx-foo.md -> foo.md)
  const claudeName = file.replace(/^opsx-/, '');
  const claudeFilePath = path.join(root, '.claude', 'commands', 'opsx', claudeName);
  if (fs.existsSync(claudeFilePath)) {
    const claudeContent = fs.readFileSync(claudeFilePath, 'utf8');
    const claudeParts = claudeContent.split('---');
    if (claudeParts.length >= 3) {
      const claudeFrontmatter = claudeParts.slice(0, 2).join('---') + '---';
      fs.writeFileSync(claudeFilePath, claudeFrontmatter + agentBody);
    }
  }
}

console.log('Sync completed successfully.');
