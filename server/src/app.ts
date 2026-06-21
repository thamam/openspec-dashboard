import express from 'express';
import cors from 'cors';
import { checkRepoStatus, initializeOpenSpec, createGitWorktree, createLocalSchema, createNewChange, getChangeMetadata, updateProposeEngine, getChangeFilesContent, runProposeCommand } from './services/repoService.js';
import { getChanges, getChangeDag } from './services/dagService.js';
import { getMainSpecsContent, commitBrainstormChange } from './services/brainstormService.js';

const app = express();

app.use(cors());
app.use(express.json());

// API route to get repository status
app.get('/api/status', async (req, res) => {
  const repoPath = req.query.path;

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter "path"' });
  }

  try {
    const status = await checkRepoStatus(repoPath);
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// API route to initialize OpenSpec
app.post('/api/init', async (req, res) => {
  const { path, paths } = req.body;

  const targetPaths = paths && Array.isArray(paths) ? paths : (path ? [path] : []);

  if (targetPaths.length === 0 || targetPaths.some(p => typeof p !== 'string')) {
    return res.status(400).json({ error: 'Missing parameter "path"' });
  }

  try {
    for (const p of targetPaths) {
      await initializeOpenSpec(p);
    }
    return res.json({ success: true, message: 'OpenSpec initialized successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to initialize OpenSpec' });
  }
});

// API route to create a git worktree
app.post('/api/worktree', async (req, res) => {
  const { repoPath, branchName, worktreePath } = req.body;

  if (!repoPath || !branchName || !worktreePath) {
    return res.status(400).json({
      error: 'Missing parameters: repoPath, branchName, and worktreePath are all required',
    });
  }

  try {
    await createGitWorktree(repoPath, branchName, worktreePath);
    return res.json({ success: true, message: 'Git worktree created successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create Git worktree' });
  }
});

// API route to list changes
app.get('/api/changes', async (req, res) => {
  const repoPath = req.query.path;

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter "path"' });
  }

  try {
    const changes = await getChanges(repoPath);
    return res.json(changes);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retrieve changes list' });
  }
});

// API route to get change DAG
app.get('/api/changes/:change/dag', async (req, res) => {
  const repoPath = req.query.path;
  const changeName = decodeURIComponent(req.params.change);

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter "path"' });
  }

  try {
    const dag = await getChangeDag(repoPath, changeName);
    return res.json(dag);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to build DAG' });
  }
});

// API route to create local schema
app.post('/api/schema', async (req, res) => {
  const { repoPath, schemaName, artifacts } = req.body;

  if (!repoPath || !schemaName || !artifacts || !Array.isArray(artifacts)) {
    return res.status(400).json({
      error: 'Missing parameters: repoPath, schemaName, and artifacts (array) are all required',
    });
  }

  try {
    await createLocalSchema(repoPath, schemaName, artifacts);
    return res.json({ success: true, message: 'Local schema initialized successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to initialize local schema' });
  }
});

// API route to create new change
app.post('/api/changes', async (req, res) => {
  const { repoPath, changeName, schemaName, description, proposeEngine } = req.body;

  if (!repoPath || !changeName) {
    return res.status(400).json({
      error: 'Missing parameters: repoPath and changeName are required',
    });
  }

  try {
    await createNewChange(repoPath, changeName, schemaName, description, proposeEngine);
    return res.json({ success: true, message: 'Change proposal created successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create change proposal' });
  }
});

// API route to get change metadata
app.get('/api/changes/:change', async (req, res) => {
  const repoPath = req.query.path;
  const changeName = decodeURIComponent(req.params.change);

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter "path"' });
  }

  try {
    const metadata = await getChangeMetadata(repoPath, changeName);
    return res.json(metadata);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retrieve change metadata' });
  }
});

// API route to update propose engine
app.post('/api/changes/:change/engine', async (req, res) => {
  const { repoPath, proposeEngine } = req.body;
  const changeName = decodeURIComponent(req.params.change);

  if (!repoPath || !proposeEngine) {
    return res.status(400).json({
      error: 'Missing parameters: repoPath and proposeEngine are required',
    });
  }

  try {
    await updateProposeEngine(repoPath, changeName, proposeEngine);
    return res.json({ success: true, message: 'Propose engine updated successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update propose engine' });
  }
});

// Helper function to dispatch requests to different LLM providers
async function queryLlm({
  systemInstruction,
  messages,
  provider,
  model,
  customEndpoint,
  customApiKey
}: {
  systemInstruction: string;
  messages: Array<{ role: 'user' | 'model' | 'assistant'; content: string }>;
  provider: string;
  model: string;
  customEndpoint?: string;
  customApiKey?: string;
}): Promise<string> {
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is not configured. Please set the GEMINI_API_KEY environment variable on the server.');
    }

    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${errorText}`);
    }

    const responseData = (await response.json()) as any;
    const reply = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      throw new Error('Invalid response format from Gemini API');
    }
    return reply;
  } else if (provider === 'ollama') {
    const ollamaMessages = [
      { role: 'system', content: systemInstruction },
      ...messages.map((m: any) => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content
      }))
    ];

    try {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${errorText}`);
      }

      const responseData = (await response.json()) as any;
      const reply = responseData.message?.content;
      if (!reply) {
        throw new Error('Invalid response format from Ollama API');
      }
      return reply;
    } catch (ollamaErr: any) {
      throw new Error(`Failed to connect to Ollama. Please ensure Ollama is running locally (e.g. \`ollama run gemma2\`) and listening on http://localhost:11434. Error: ${ollamaErr.message}`);
    }
  } else if (provider === 'custom') {
    if (!customEndpoint) {
      throw new Error('Missing parameter "customEndpoint" for custom provider');
    }

    const cleanEndpoint = customEndpoint.replace(/\/+$/, '');
    const url = `${cleanEndpoint}/chat/completions`;

    const openaiMessages = [
      { role: 'system', content: systemInstruction },
      ...messages.map((m: any) => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content
      }))
    ];

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (customApiKey) {
      headers['Authorization'] = `Bearer ${customApiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: openaiMessages,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Custom API error: ${errorText}`);
      }

      const responseData = (await response.json()) as any;
      const reply = responseData.choices?.[0]?.message?.content;
      if (!reply) {
        throw new Error('Invalid response format from Custom API');
      }
      return reply;
    } catch (customErr: any) {
      throw new Error(`Failed to connect to custom API endpoint: ${url}. Error: ${customErr.message}`);
    }
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

// API route for Review Mode Chat
app.post('/api/changes/:change/chat', async (req, res) => {
  const { repoPath, messages, provider, model, customEndpoint, customApiKey, stage, selectedNodeId } = req.body;
  const changeName = decodeURIComponent(req.params.change);

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing parameter "repoPath"' });
  }
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing or invalid parameter "messages"' });
  }
  if (!provider || typeof provider !== 'string') {
    return res.status(400).json({ error: 'Missing parameter "provider"' });
  }
  if (!model || typeof model !== 'string') {
    return res.status(400).json({ error: 'Missing parameter "model"' });
  }

  try {
    // 1. Load change context (artifacts and DAG)
    const changeFilesContent = getChangeFilesContent(repoPath, changeName);
    const changeDag = await getChangeDag(repoPath, changeName);

    // 2. Build system instruction
    let systemInstruction = `You are the OpenSpec Traceability Auditor. You help the user review their change proposal. You have access to the project's DAG structure and the full text of all change artifacts. Your job is to answer questions, analyze traceability (identify specs without design, design decisions without tasks, etc.), summarize decisions, and list incomplete tasks. Keep your responses concise, helpful, and formatted in markdown.

Here is the current state of the change artifacts:
${changeFilesContent}

Here is the current DAG linkage structure:
${JSON.stringify(changeDag, null, 2)}`;

    if (stage) {
      systemInstruction += `\n\nThe user is currently in the stage: "${stage}".`;
    }
    if (selectedNodeId) {
      systemInstruction += `\nThe user has selected/highlighted this item in the DAG: "${selectedNodeId}". Please reference this item in your response if appropriate.`;
    }

    const reply = await queryLlm({
      systemInstruction,
      messages,
      provider,
      model,
      customEndpoint,
      customApiKey
    });

    return res.json({ reply });
  } catch (err: any) {
    if (err.message && err.message.includes('Gemini API key is not configured')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// API route to start brainstorm grilling session
app.post('/api/brainstorm/start', async (req, res) => {
  const { repoPath, changeName, initialIdea, provider, model, customEndpoint, customApiKey, stage } = req.body;

  if (!repoPath || !changeName || !initialIdea || !provider || !model) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    let systemInstruction = '';
    
    if (stage === 'review') {
      const changeFilesContent = getChangeFilesContent(repoPath, changeName);
      systemInstruction = `You are the OpenSpec Brainstorming Auditor. Your goal is to run a "Grill me with Docs" session to stress-test the generated specs and design decisions for change name "${changeName}".

You must:
1. Read the current change files content to understand the generated proposal, specs, design decisions, and tasks:
${changeFilesContent}

2. Challenge implementation choices, identify unhandled edge cases in the specs, and interrogate if the task breakdown is realistic and complete.
3. Challenge fuzzy specifications, propose precise details, and highlight missing traceability links.
4. IMPORTANT: Ask exactly ONE question at a time. Do not present multiple questions.
5. Track progress using a decision list/tree. Always output the current decision tree state at the top of your response in this exact format:
[DECISIONS]
- [OPEN] <First unresolved item / question topic>
- [OPEN] <Second unresolved item / question topic>
...
[END_DECISIONS]

6. For each question, propose a "Recommended" option that the developer can accept. Use the format:
Recommended: <recommended answer content>

Keep your responses concise, structured, and helpful.`;
    } else {
      const mainSpecsContent = getMainSpecsContent(repoPath);
      systemInstruction = `You are the OpenSpec Brainstorming Auditor. Your goal is to run a "Grill me with Docs" session to stress-test a proposed change name "${changeName}" and feature idea: "${initialIdea}".

You must:
1. Read the project's existing main specs context (the domain model / glossary) to ensure terminology and concepts align:
${mainSpecsContent}

2. Interview the developer relentlessly about their feature design, walking down the design tree to resolve dependencies one by one.
3. Challenge fuzzy language, propose precise domain terms, and test edge cases.
4. IMPORTANT: Ask exactly ONE question at a time. Do not present multiple questions.
5. Track progress using a decision list/tree. Always output the current decision tree state at the top of your response in this exact format:
[DECISIONS]
- [OPEN] <First unresolved item / question topic>
- [OPEN] <Second unresolved item / question topic>
...
[END_DECISIONS]

6. For each question, propose a "Recommended" option that the developer can accept. Use the format:
Recommended: <recommended answer content>

Keep your responses concise, structured, and helpful.`;
    }

    const initialMessages = [
      { role: 'user' as const, content: `Help me design this feature: ${initialIdea}` }
    ];

    const reply = await queryLlm({
      systemInstruction,
      messages: initialMessages,
      provider,
      model,
      customEndpoint,
      customApiKey
    });

    return res.json({ reply });
  } catch (err: any) {
    if (err.message && err.message.includes('Gemini API key is not configured')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// API route for brainstorm chat step
app.post('/api/brainstorm/chat', async (req, res) => {
  const { repoPath, changeName, initialIdea, messages, provider, model, customEndpoint, customApiKey, stage } = req.body;

  if (!repoPath || !changeName || !initialIdea || !messages || !Array.isArray(messages) || !provider || !model) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }

  try {
    let systemInstruction = '';

    if (stage === 'review') {
      const changeFilesContent = getChangeFilesContent(repoPath, changeName);
      systemInstruction = `You are the OpenSpec Brainstorming Auditor. Your goal is to run a "Grill me with Docs" session to stress-test the generated specs and design decisions for change name "${changeName}".

You must:
1. Read the current change files content to understand the generated proposal, specs, design decisions, and tasks:
${changeFilesContent}

2. Challenge implementation choices, identify unhandled edge cases in the specs, and interrogate if the task breakdown is realistic and complete.
3. Challenge fuzzy specifications, propose precise details, and highlight missing traceability links.
4. IMPORTANT: Ask exactly ONE question at a time. Do not present multiple questions.
5. Track progress using a decision list/tree. Always output the current decision tree state at the top of your response in this exact format:
[DECISIONS]
- [OPEN] <First unresolved item / question topic>
- [OPEN] <Second unresolved item / question topic>
...
[END_DECISIONS]

6. For each question, propose a "Recommended" option that the developer can accept. Use the format:
Recommended: <recommended answer content>

Keep your responses concise, structured, and helpful.`;
    } else {
      const mainSpecsContent = getMainSpecsContent(repoPath);
      systemInstruction = `You are the OpenSpec Brainstorming Auditor. Your goal is to run a "Grill me with Docs" session to stress-test a proposed change name "${changeName}" and feature idea: "${initialIdea}".

You must:
1. Read the project's existing main specs context (the domain model / glossary) to ensure terminology and concepts align:
${mainSpecsContent}

2. Interview the developer relentlessly about their feature design, walking down the design tree to resolve dependencies one by one.
3. Challenge fuzzy language, propose precise domain terms, and test edge cases.
4. IMPORTANT: Ask exactly ONE question at a time. Do not present multiple questions.
5. Track progress using a decision list/tree. Always output the current decision tree state at the top of your response in this exact format:
[DECISIONS]
- [OPEN] <First unresolved item / question topic>
- [OPEN] <Second unresolved item / question topic>
...
[END_DECISIONS]

6. For each question, propose a "Recommended" option that the developer can accept. Use the format:
Recommended: <recommended answer content>

Keep your responses concise, structured, and helpful.`;
    }

    const reply = await queryLlm({
      systemInstruction,
      messages,
      provider,
      model,
      customEndpoint,
      customApiKey
    });

    return res.json({ reply });
  } catch (err: any) {
    if (err.message && err.message.includes('Gemini API key is not configured')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// API route to commit brainstorm decisions and write files to disk
app.post('/api/brainstorm/commit', async (req, res) => {
  const { repoPath, changeName, initialIdea, messages, provider, model, customEndpoint, customApiKey } = req.body;

  if (!repoPath || !changeName || !initialIdea || !messages || !Array.isArray(messages) || !provider || !model) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }

  try {
    const mainSpecsContent = getMainSpecsContent(repoPath);

    const systemInstruction = `You are the OpenSpec Brainstorming Auditor. Your goal is to run a "Grill me with Docs" session to stress-test a proposed change name "${changeName}" and feature idea: "${initialIdea}".

You must:
1. Read the project's existing main specs context (the domain model / glossary) to ensure terminology and concepts align:
${mainSpecsContent}

2. Interview the developer relentlessly about their feature design, walking down the design tree to resolve dependencies one by one.
3. Challenge fuzzy language, propose precise domain terms, and test edge cases.`;

    const commitMessage = {
      role: 'user' as const,
      content: `We have completed the brainstorming session. Please format the resolved decisions and requirements into a JSON object containing the OpenSpec change files.
The JSON must follow this exact format:
{
  "proposal": "<Markdown content for proposal.md, outlining capabilities and description>",
  "design": "<Markdown content for design.md, listing design decisions>",
  "tasks": "<Markdown content for tasks.md, listing tasks with [ ] checkboxes>",
  "specs": {
    "specs/my-spec.md": "<Markdown content for specs/my-spec.md, listing requirements and scenarios>"
  }
}
Do not return any markdown wraps (like \`\`\`json) outside the JSON. Return only raw JSON string.`
    };

    const reply = await queryLlm({
      systemInstruction,
      messages: [...messages, commitMessage],
      provider,
      model,
      customEndpoint,
      customApiKey
    });

    // Clean up markdown codeblocks if LLM returned them
    let cleanReply = reply.trim();
    if (cleanReply.startsWith('```')) {
      cleanReply = cleanReply.replace(/^```(?:json)?\n?|```$/g, '').trim();
    }

    let parsedFiles;
    try {
      parsedFiles = JSON.parse(cleanReply);
    } catch (parseErr: any) {
      return res.status(502).json({
        error: `LLM returned invalid JSON format for committed files: ${parseErr.message}. Output was: ${cleanReply}`
      });
    }

    await commitBrainstormChange(repoPath, changeName, parsedFiles);

    return res.json({ success: true, message: `Change "${changeName}" initialized and files written successfully.` });
  } catch (err: any) {
    if (err.message && err.message.includes('Gemini API key is not configured')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Failed to commit brainstorm change' });
  }
});

// API route to trigger openspec propose execution
app.post('/api/changes/:change/propose', async (req, res) => {
  const { repoPath, engine } = req.body;
  const changeName = decodeURIComponent(req.params.change);

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing parameter "repoPath"' });
  }
  if (!engine || typeof engine !== 'string') {
    return res.status(400).json({ error: 'Missing parameter "engine"' });
  }

  try {
    const output = await runProposeCommand(repoPath, changeName, engine);
    return res.json({ success: true, message: 'Propose run completed successfully', output });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to run propose' });
  }
});

interface AuditResult {
  ok: boolean;
  text: string;
}

// API route to run traceability audit dynamically
app.get('/api/changes/:change/audit', async (req, res) => {
  const repoPath = req.query.path;
  const changeName = decodeURIComponent(req.params.change);

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter "path"' });
  }

  try {
    const dag = await getChangeDag(repoPath, changeName);
    const results: AuditResult[] = [];

    if (dag.nodes.length === 0) {
      return res.json([]);
    }

    const proposals = dag.nodes.filter(n => n.type === 'proposal');
    const specs = dag.nodes.filter(n => n.type === 'spec-requirement');
    const designs = dag.nodes.filter(n => n.type === 'design-decision');
    const tasks = dag.nodes.filter(n => n.type === 'task');

    // 1. Check if all specs (spec-requirement) trace back to proposal
    if (specs.length > 0) {
      const unlinkedSpecs = specs.filter(s => !dag.edges.some(e => e.target === s.id && e.source.startsWith('proposal')));
      if (unlinkedSpecs.length === 0) {
        results.push({ ok: true, text: `All ${specs.length} specs trace back to the proposal capability` });
      } else {
        results.push({ ok: false, text: `${unlinkedSpecs.length} specs do not trace back to any proposal capability` });
      }
    }

    // 2. Check if design decisions cover every linked spec
    if (specs.length > 0 && designs.length > 0) {
      const unlinkedSpecs = specs.filter(s => !dag.edges.some(e => e.source === s.id && e.target.startsWith('design-decision')));
      if (unlinkedSpecs.length === 0) {
        results.push({ ok: true, text: 'Design decisions cover every spec requirement' });
      } else {
        results.push({ ok: false, text: `${unlinkedSpecs.length} specs are not linked to any design decision` });
      }
    }

    // 3. Check if tasks are linked to design decisions
    if (designs.length > 0 && tasks.length > 0) {
      const unlinkedTasks = tasks.filter(t => !dag.edges.some(e => e.target === t.id && e.source.startsWith('design-decision')));
      if (unlinkedTasks.length === 0) {
        results.push({ ok: true, text: 'All tasks are linked to design decisions' });
      } else {
        results.push({ ok: false, text: `${unlinkedTasks.length} tasks are not linked to any design decision` });
      }
    }

    // 4. Progress check
    if (tasks.length > 0) {
      const completed = tasks.filter(t => t.status === 'completed').length;
      results.push({ ok: completed === tasks.length, text: `${completed} / ${tasks.length} tasks complete` });
    }

    return res.json(results);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to run traceability audit' });
  }
});

export { app };



