import fs from 'fs';
import path from 'path';

export interface TaskItem {
  id: string;
  title: string;
  status: 'todo' | 'wip' | 'done';
  assignee?: string;
  lineNumber: number;
}

export interface MarkdownDocument {
  content: string;
  tasks: TaskItem[];
}

/**
 * Deterministically parses tasks from a markdown file.
 * Expects strict GFM task list formatting: `- [ ] Task title`
 */
export function parseTasks(content: string): TaskItem[] {
  const tasks: TaskItem[] = [];
  const lines = content.split('\n');

  // Regex to match `- [ ] Task Title` or `- [x] Task Title` or `- [/] Task Title`
  // Optionally capturing an assignee like `@Tomer` or `@AntiGravity` at the end
  const taskRegex = /^(\s*)-\s+\[([ x/])\]\s+(.*?)(?:\s+@([a-zA-Z0-9_-]+))?\s*$/i;

  lines.forEach((line, index) => {
    const match = line.match(taskRegex);
    if (match) {
      const mark = match[2].toLowerCase();
      let status: 'todo' | 'wip' | 'done' = 'todo';
      if (mark === 'x') status = 'done';
      if (mark === '/') status = 'wip';

      tasks.push({
        id: `task-${index}`,
        title: match[3].trim(),
        status,
        assignee: match[4] || undefined,
        lineNumber: index,
      });
    }
  });

  return tasks;
}

/**
 * Reads an OpenSpec artifact and parses its tasks.
 */
export function readArtifact(repoPath: string, changeName: string, artifactName: string): MarkdownDocument | null {
  const filePath = path.join(repoPath, 'openspec', 'changes', changeName, artifactName);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return {
    content,
    tasks: parseTasks(content)
  };
}
