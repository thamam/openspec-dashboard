import fs from 'fs';
import path from 'path';
import { IAgentProvider } from './AgentProvider.js';
import { AntiGravityProvider } from './providers/AntiGravityProvider.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';

function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const colonIndex = clean.indexOf(':');
    if (colonIndex !== -1) {
      const key = clean.substring(0, colonIndex).trim();
      let value = clean.substring(colonIndex + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      result[key] = value;
    }
  }
  return result;
}

export function resolveProvider(workspacePath: string, changeName?: string): IAgentProvider {
  let providerType = 'antigravity';

  // 1. Resolve from change config (.openspec.yaml)
  if (changeName) {
    const configPath = path.join(workspacePath, 'openspec', 'changes', changeName, '.openspec.yaml');
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        const config = parseSimpleYaml(content);
        if (config.agentProvider) {
          providerType = config.agentProvider;
        }
      } catch (err) {
        console.error(`Failed to read config at ${configPath}:`, err);
      }
    }
  }

  // 2. Resolve from environment if not specified in change config
  if (providerType === 'antigravity' && process.env.AGENT_PROVIDER) {
    providerType = process.env.AGENT_PROVIDER;
  }

  // 3. Instantiate resolved provider
  if (providerType.toLowerCase() === 'claude') {
    return new ClaudeProvider();
  }

  return new AntiGravityProvider();
}
