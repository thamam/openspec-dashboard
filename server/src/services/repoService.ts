import fs from 'fs';
import path from 'path';

export interface RepoStatus {
  exists: boolean;
  isGit: boolean;
  isOpenSpec: boolean;
}

export async function checkRepoStatus(dirPath: string): Promise<RepoStatus> {
  const resolvedPath = path.resolve(dirPath);

  // 1. Check if path exists and is a directory
  if (!fs.existsSync(resolvedPath)) {
    return { exists: false, isGit: false, isOpenSpec: false };
  }

  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return { exists: false, isGit: false, isOpenSpec: false };
    }
  } catch {
    return { exists: false, isGit: false, isOpenSpec: false };
  }

  // 2. Check if it is a Git repository
  const gitPath = path.join(resolvedPath, '.git');
  let isGit = false;
  if (fs.existsSync(gitPath)) {
    try {
      const gitStat = fs.statSync(gitPath);
      isGit = gitStat.isDirectory();
    } catch {
      isGit = false;
    }
  }

  // 3. Check if OpenSpec is initialized
  let isOpenSpec = false;
  if (isGit) {
    const openspecYaml = path.join(resolvedPath, 'openspec', 'config.yaml');
    const openspecYml = path.join(resolvedPath, 'openspec', 'config.yml');
    isOpenSpec = fs.existsSync(openspecYaml) || fs.existsSync(openspecYml);
  }

  return {
    exists: true,
    isGit,
    isOpenSpec,
  };
}
