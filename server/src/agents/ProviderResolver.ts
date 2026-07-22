import fs from 'fs';
import path from 'path';
import { IAgentProvider } from './AgentProvider.js';
import { AntiGravityProvider } from './providers/AntiGravityProvider.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { CodexProvider } from './providers/CodexProvider.js';

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
  // Precedence: change config (.openspec.yaml) -> AGENT_PROVIDER env -> default (codex).
  let providerType: string | undefined;

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
  if (!providerType && process.env.AGENT_PROVIDER) {
    providerType = process.env.AGENT_PROVIDER;
  }

  // 3. Default to Codex when nothing is configured
  if (!providerType) {
    providerType = 'codex';
  }

  // 4. Instantiate resolved provider (Anti-Gravity and Claude remain explicitly selectable)
  switch (providerType.toLowerCase()) {
    case 'claude':
      return new ClaudeProvider();
    case 'antigravity':
      return new AntiGravityProvider();
    case 'codex':
    default:
      return new CodexProvider();
  }
}
