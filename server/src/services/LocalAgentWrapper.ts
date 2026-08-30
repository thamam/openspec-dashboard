import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolveProvider } from '../agents/ProviderResolver.js';

export class LocalAgentWrapper {
  /**
   * Invokes the local agent (agy) to analyze a file.
   * @param repoPath The root repository path
   * @param filePath The absolute path to the file to analyze
   * @param onChunk Callback when the agent streams stdout
   * @returns A promise that resolves to the final structured JSON output (or null if it failed)
   */
  public async analyzeFile(repoPath: string, filePath: string, onChunk: (chunk: string) => void): Promise<any> {
    if (process.env.TEST_MODE === 'true') {
      onChunk('> Mocking analysis stream for testing...\n');
      onChunk('> Found a violation of Progressive Disclosure.\n');
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ status: 'warning', message: 'Test Mode Warning' });
        }, 500);
      });
    }

    return new Promise((resolve) => {
      const fileName = path.basename(filePath);
      
      // Prompt the agent to analyze the file and output JSON
      const prompt = `Review the latest changes in ${fileName}. Analyze it against the principles defined in AGENTS.md in this repository. Think step-by-step. At the very end, output a STRICT JSON block starting with \`\`\`json and ending with \`\`\` containing the results with the schema: { "status": "success" | "warning", "message": "short summary" }. DO NOT output anything after the JSON block.`;

      // Use `agy run` to run the task
      const args = ['run', '--cwd', repoPath, '--prompt', prompt];
      
      const child = spawn('agy', args, {
        cwd: repoPath
      });

      let fullOutput = '';

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        fullOutput += chunk;
        onChunk(chunk);
      });

      child.stderr.on('data', (data) => {
        console.error(`[LocalAgentWrapper] stderr: ${data.toString()}`);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          console.error(`[LocalAgentWrapper] agy process exited with code ${code}`);
          // Resolve with null instead of rejecting so we don't crash the server
          resolve(null);
          return;
        }

        // Extract JSON from output with resilient fallbacks
        try {
          let jsonString = '';
          const jsonBlockMatch = fullOutput.match(/```json\s*([\s\S]*?)\s*```/i);
          const genericBlockMatch = fullOutput.match(/```\s*([\s\S]*?)\s*```/);
          const rawObjectMatch = fullOutput.match(/\{[\s\S]*?"status"[\s\S]*?\}/);

          if (jsonBlockMatch && jsonBlockMatch[1]) {
            jsonString = jsonBlockMatch[1].trim();
          } else if (genericBlockMatch && genericBlockMatch[1] && genericBlockMatch[1].trim().startsWith('{')) {
            jsonString = genericBlockMatch[1].trim();
          } else if (rawObjectMatch) {
            jsonString = rawObjectMatch[0].trim();
          }

          if (jsonString) {
            const parsed = JSON.parse(jsonString);
            resolve(parsed);
          } else {
            console.warn('[LocalAgentWrapper] No valid JSON status block found in output');
            resolve({ status: 'warning', message: 'Analysis completed with unformatted output.' });
          }
        } catch (e) {
          console.error('[LocalAgentWrapper] Failed to parse agent JSON output', e);
          resolve({ status: 'warning', message: 'Analysis completed with non-JSON output.' });
        }
      });
    });
  }

  /**
   * Invokes the local agent (agy) for a chat conversation with context injection.
   * @param repoPath The root repository path
   * @param message The user's chat message
   * @param context Dashboard context (active change, etc.)
   * @param onChunk Callback when the agent streams stdout
   */
  public async chat(repoPath: string, message: string, context: any, onChunk: (chunk: string) => void): Promise<void> {
    if (process.env.TEST_MODE === 'true') {
      return new Promise((resolve) => {
        onChunk(`Mocked reply to: "${message}"`);
        setTimeout(() => resolve(), 500);
      });
    }

    return new Promise((resolve) => {
      // Build change artifacts context
      let artifactSummary = 'No active change selected.';
      if (context?.activeChange && repoPath) {
        const changeDir = path.join(repoPath, 'openspec', 'changes', context.activeChange);
        if (fs.existsSync(changeDir)) {
          const files = fs.readdirSync(changeDir);
          artifactSummary = `Artifacts present in #${context.activeChange}: [${files.join(', ')}]`;
        }
      }

      const providerInfo = context?.agentProvider ? `\n- Active Provider: ${context.agentProvider}` : '';
      const prompt = `You are the embedded native Agent Harness for the OpenSpec Dashboard. 
Dashboard Context:
- Active Change: ${context?.activeChange || 'None'}${providerInfo}
- ${artifactSummary}

User Request: "${message}"

Respond helpfully and concisely. Available OpenSpec workflows include: /opsx-propose, /opsx-continue, /opsx-sync, /opsx-verify, /opsx-archive. Suggest exact workflows or actions when relevant.`;

      const args = ['run', '--cwd', repoPath, '--prompt', prompt];
      
      const child = spawn('agy', args, {
        cwd: repoPath
      });

      child.stdout.on('data', (data) => {
        onChunk(data.toString());
      });

      child.on('close', () => resolve());
    });
  }

  /**
   * Invokes the local agent to automatically rewrite a file to fix a violation.
   */
  public async autofix(filePath: string, warningMessage: string): Promise<void> {
    if (process.env.TEST_MODE === 'true') {
      return new Promise((resolve) => {
        fs.writeFileSync(filePath, `# Fixed in Test Mode\nOriginal warning: ${warningMessage}`);
        console.log(`[LocalAgentWrapper] Autofixed ${filePath} (Test Mode)`);
        setTimeout(() => resolve(), 500);
      });
    }

    return new Promise((resolve) => {
      const fileName = path.basename(filePath);
      const repoPath = path.dirname(filePath); // Approximate, but sufficient for cwd
      
      const prompt = `The file ${fileName} has a policy violation: "${warningMessage}".
Rewrite the ENTIRE file to fix this violation. 
Output the complete, corrected file contents inside a STRICT code block starting with \`\`\`markdown and ending with \`\`\`. Do not include any other text.`;

      const args = ['run', '--cwd', repoPath, '--prompt', prompt];
      
      const child = spawn('agy', args, {
        cwd: repoPath
      });

      let fullOutput = '';
      child.stdout.on('data', (data) => {
        fullOutput += data.toString();
      });

      child.on('close', () => {
        try {
          const match = fullOutput.match(/```(?:markdown)?\s*([\s\S]*?)\s*```/);
          if (match && match[1]) {
            fs.writeFileSync(filePath, match[1].trim());
            console.log(`[LocalAgentWrapper] Autofixed ${filePath}`);
          } else {
             console.warn(`[LocalAgentWrapper] No markdown block found for autofix fallback`);
          }
        } catch (e) {
          console.error('[LocalAgentWrapper] Failed to apply autofix', e);
        }
        resolve();
      });
    });
  }

  /**
   * Executes an OpenSpec workflow via the configured AgentProvider for the workspace.
   */
  public async executeWorkflow(
    repoPath: string, 
    workflow: string, 
    changeName: string, 
    args: string[] = [], 
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (process.env.TEST_MODE === 'true') {
      onChunk(`[Mock Workflow] Execution started for /${workflow} on change "${changeName}"...\n`);
      return new Promise((resolve) => {
        setTimeout(() => {
          onChunk(`[Mock Workflow] Finished /${workflow} for ${changeName}.\n`);
          resolve();
        }, 500);
      });
    }

    const provider = resolveProvider(repoPath, changeName);
    const stream = await provider.executeLifecycle(workflow, [changeName, ...args], repoPath);

    return new Promise((resolve) => {
      stream.onData((data) => onChunk(data));
      stream.onError((err) => onChunk(`⚠️ [Provider Error]: ${err}`));
      stream.onExit((code) => {
        onChunk(`\n[Workflow /${workflow} session completed with exit code ${code}]\n`);
        resolve();
      });
    });
  }
}
