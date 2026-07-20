import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { checkRepoStatus } from '../../server/src/services/repoService.js';
import { getChangeDag } from '../../server/src/services/dagService.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const server = new Server(
  {
    name: "openspec-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_repo_status",
        description: "Check readiness status, OpenSpec configuration, and git worktrees of a repository.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Optional absolute path to the repository directory (defaults to current directory).",
            },
            changeName: {
              type: "string",
              description: "Optional change name to inspect within the repository.",
            }
          },
        },
      },
      {
        name: "run_linter",
        description: "Run task complexity linter on a specific change and return warnings.",
        inputSchema: {
          type: "object",
          properties: {
            changeName: {
              type: "string",
              description: "The name of the change to lint.",
            },
            path: {
              type: "string",
              description: "Optional repository path (defaults to current directory).",
            }
          },
          required: ["changeName"],
        },
      },
      {
        name: "get_complexity",
        description: "Retrieve early complexity index, component scores, and ratings for a change.",
        inputSchema: {
          type: "object",
          properties: {
            changeName: {
              type: "string",
              description: "The name of the change to retrieve complexity for.",
            },
            path: {
              type: "string",
              description: "Optional repository path (defaults to current directory).",
            }
          },
          required: ["changeName"],
        },
      },
      {
        name: "get_interrogation_questions",
        description: "Get or generate the 3 active interrogation questions for a change.",
        inputSchema: {
          type: "object",
          properties: {
            changeName: {
              type: "string",
              description: "The name of the change.",
            },
            path: {
              type: "string",
              description: "Optional repository path (defaults to current directory).",
            }
          },
          required: ["changeName"],
        },
      },
      {
        name: "submit_interrogation_answers",
        description: "Submit answers to the active interrogation questions for a change.",
        inputSchema: {
          type: "object",
          properties: {
            changeName: {
              type: "string",
              description: "The name of the change.",
            },
            answers: {
              type: "object",
              description: "A map from question strings to answer strings.",
              additionalProperties: { type: "string" }
            },
            path: {
              type: "string",
              description: "Optional repository path (defaults to current directory).",
            }
          },
          required: ["changeName", "answers"],
        },
      }
    ],
  };
});

// Helper for Gemini questions generation (reused/customized)
async function getOrGenerateQuestions(repoPath: string, changeName: string): Promise<{ questions: string[], answers: Record<string, string>, completed: boolean }> {
  const changeDir = path.join(repoPath, 'openspec', 'changes', changeName);
  if (!fs.existsSync(changeDir)) {
    throw new Error(`Change directory "${changeName}" not found`);
  }

  const answersPath = path.join(changeDir, 'review-answers.json');
  if (fs.existsSync(answersPath)) {
    try {
      const fileContent = fs.readFileSync(answersPath, 'utf8');
      const parsed = JSON.parse(fileContent);
      return {
        questions: parsed.questions || [],
        answers: parsed.answers || {},
        completed: !!parsed.completed
      };
    } catch (e) {
      // Proceed to generate
    }
  }

  // Generate fallback/Gemini questions
  const dag = await getChangeDag(repoPath, changeName);
  const specs = dag.nodes.filter(n => n.type === 'spec-requirement' || n.type === 'spec-scenario');
  const designs = dag.nodes.filter(n => n.type === 'design-decision');
  
  const fallbackQuestions = [
    specs.length > 0 
      ? `How will you verify and test requirement "${specs[0].label}"?`
      : "How will you verify and test the main requirements of this change?",
    designs.length > 0
      ? `What edge cases or error conditions are associated with design decision "${designs[0].label}", and how will they be handled?`
      : "Are there any edge cases or error conditions in the proposed design, and how does the system handle them?",
    "Are there any potential side-effects or coupling risks with other capabilities in the codebase?"
  ];

  let questions = fallbackQuestions;
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
      const systemInstruction = `You are an expert software architect auditing an OpenSpec change.
Based on the provided requirements and design decisions, generate exactly 3 critical, open-ended comprehension questions that the implementing developer must answer.
Focus on edge cases, validation, testing strategies, or potential design trade-offs.

You MUST return a JSON array containing exactly 3 strings (questions).
Do not return any markdown wraps or commentary outside the JSON array.`;

      const prompt = `Generate 3 comprehension questions for this change.
Requirements:
${specs.slice(0, 5).map(s => `- ${s.label}`).join('\n')}

Design Decisions:
${designs.slice(0, 5).map(d => `- ${d.label}`).join('\n')}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] }
        })
      });

      if (response.ok) {
        const data = await response.json() as any;
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
          let cleanReply = reply.trim();
          if (cleanReply.startsWith('```')) {
            cleanReply = cleanReply.replace(/^```(?:json)?\n?|```$/g, '').trim();
          }
          const parsed = JSON.parse(cleanReply);
          if (Array.isArray(parsed) && parsed.length === 3) {
            questions = parsed.map(q => String(q));
          }
        }
      }
    } catch (err) {
      // Ignored, use fallbackQuestions
    }
  }

  // Save them
  fs.writeFileSync(answersPath, JSON.stringify({
    questions,
    answers: {},
    completed: false,
    updatedAt: new Date().toISOString()
  }, null, 2), 'utf8');

  return { questions, answers: {}, completed: false };
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const targetPath = path.resolve((args as any)?.path || ".");

  try {
    switch (name) {
      case "get_repo_status": {
        const status = await checkRepoStatus(targetPath);
        const changeName = (args as any)?.changeName;
        let changeInfo = "";

        if (changeName) {
          const changeDir = path.join(targetPath, 'openspec', 'changes', changeName);
          if (fs.existsSync(changeDir)) {
            const compPath = path.join(changeDir, 'complexity.json');
            const linterPath = path.join(changeDir, 'linter-warnings.json');
            const answersPath = path.join(changeDir, 'review-answers.json');

            changeInfo = `\nChange Name: ${changeName}\n` +
              `Complexity Persisted: ${fs.existsSync(compPath) ? 'Yes' : 'No'}\n` +
              `Linter Warnings Persisted: ${fs.existsSync(linterPath) ? 'Yes' : 'No'}\n` +
              `Interrogation Persisted: ${fs.existsSync(answersPath) ? 'Yes' : 'No'}`;
          } else {
            changeInfo = `\nChange Name "${changeName}" directory not found.`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Repository Root: ${status.repoRoot || targetPath}\n` +
                `Git Initialized: ${status.isGit ? 'Yes' : 'No'}\n` +
                `OpenSpec Initialized: ${status.isOpenSpec ? 'Yes' : 'No'}\n` +
                `Traceability Ready: ${status.isTraceReady ? 'Yes' : 'No'}\n` +
                `Worktrees: ${JSON.stringify(status.worktrees || [])}${changeInfo}`,
            },
          ],
        };
      }

      case "run_linter": {
        const changeName = (args as any).changeName;
        const dag = await getChangeDag(targetPath, changeName);
        const warnings = dag.nodes
          .filter(n => n.type === 'task' && (n.complexityAlert || n.couplingAlert))
          .map(w => ({
            taskId: w.id,
            label: w.label,
            complexityAlert: w.complexityAlert,
            couplingAlert: w.couplingAlert
          }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ changeName, warnings }, null, 2),
            },
          ],
        };
      }

      case "get_complexity": {
        const changeName = (args as any).changeName;
        const dag = await getChangeDag(targetPath, changeName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(dag.complexity || { rating: 'Unknown', component: 0, coordinative: 0 }, null, 2),
            },
          ],
        };
      }

      case "get_interrogation_questions": {
        const changeName = (args as any).changeName;
        const data = await getOrGenerateQuestions(targetPath, changeName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "submit_interrogation_answers": {
        const changeName = (args as any).changeName;
        const submittedAnswers = (args as any).answers;
        const changeDir = path.join(targetPath, 'openspec', 'changes', changeName);
        if (!fs.existsSync(changeDir)) {
          throw new Error(`Change directory "${changeName}" not found`);
        }

        const data = await getOrGenerateQuestions(targetPath, changeName);
        const mergedAnswers = { ...data.answers, ...submittedAnswers };
        const allAnswered = data.questions.every(q => mergedAnswers[q] && mergedAnswers[q].trim().length > 0);

        const answersPath = path.join(changeDir, 'review-answers.json');
        fs.writeFileSync(answersPath, JSON.stringify({
          questions: data.questions,
          answers: mergedAnswers,
          completed: allAnswered,
          updatedAt: new Date().toISOString()
        }, null, 2), 'utf8');

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, completed: allAnswered, answers: mergedAnswers }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error calling tool ${name}: ${err.message}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OpenSpec MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
