import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { checkRepoStatus } from '../../server/src/services/repoService.js';
import { getChangeDag } from '../../server/src/services/dagService.js';
import { exec } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const program = new Command();

program
  .name('openspec-cli')
  .description('Headless OpenSpec Agent Integration CLI')
  .version('0.1.0');

// Helper to run shell command synchronously/promisified
function execCommand(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || stdout.trim() || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Helper to prompt user in CLI
function promptQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// 1. STATUS command
program
  .command('status')
  .description('Check repository readiness and template status')
  .option('-p, --path <path>', 'Repository path', '.')
  .option('-c, --change <change-name>', 'Specific change name to check')
  .action(async (options) => {
    const repoPath = path.resolve(options.path);
    try {
      const status = await checkRepoStatus(repoPath);
      
      console.log('=== OpenSpec Repository Status ===');
      console.log(`Repository Root: ${status.repoRoot || repoPath}`);
      console.log(`Git Initialized: ${status.isGit ? 'Yes' : 'No'}`);
      console.log(`OpenSpec Initialized: ${status.isOpenSpec ? 'Yes' : 'No'}`);
      console.log(`Traceability Ready: ${status.isTraceReady ? 'Yes' : 'No'}`);
      
      if (status.worktrees && status.worktrees.length > 0) {
        console.log('\nActive Git Worktrees:');
        status.worktrees.forEach(w => {
          console.log(`- Path: ${w.path} (Branch: ${w.branch || 'None'})${w.isMain ? ' [MAIN]' : ''}`);
        });
      }

      if (options.change) {
        console.log(`\n=== Change: ${options.change} ===`);
        const changeDir = path.join(repoPath, 'openspec', 'changes', options.change);
        if (!fs.existsSync(changeDir)) {
          console.log(`Error: Change "${options.change}" not found.`);
          return;
        }

        // Run openspec status using CLI
        try {
          const cliStatus = await execCommand(`openspec status --change "${options.change}"`, repoPath);
          console.log(cliStatus);
        } catch (err: any) {
          console.log(`Could not get template status: ${err.message}`);
        }

        // Print persisted dashboard info if available
        const compPath = path.join(changeDir, 'complexity.json');
        if (fs.existsSync(compPath)) {
          const compData = JSON.parse(fs.readFileSync(compPath, 'utf8'));
          console.log(`\nPersisted Complexity rating: ${compData.rating} (Components: ${compData.componentScore}, Coordinative: ${compData.coordinativeScore.toFixed(2)})`);
        }

        const linterPath = path.join(changeDir, 'linter-warnings.json');
        if (fs.existsSync(linterPath)) {
          const lintData = JSON.parse(fs.readFileSync(linterPath, 'utf8'));
          console.log(`Persisted Linter warnings: ${lintData.warnings?.length || 0}`);
        }

        const answersPath = path.join(changeDir, 'review-answers.json');
        if (fs.existsSync(answersPath)) {
          const answersData = JSON.parse(fs.readFileSync(answersPath, 'utf8'));
          console.log(`Interrogation status: ${answersData.completed ? 'COMPLETED' : 'PENDING'}`);
        }
      }
    } catch (err: any) {
      console.error(`Status check failed: ${err.message}`);
      process.exit(1);
    }
  });

// 2. LINT command
program
  .command('lint')
  .description('Run the task complexity linter and print warnings')
  .requiredOption('-c, --change <change-name>', 'Change name')
  .option('-p, --path <path>', 'Repository path', '.')
  .action(async (options) => {
    const repoPath = path.resolve(options.path);
    try {
      // getChangeDag automatically parses tasks and linkages, enrich task nodes with alerts, and writes to linter-warnings.json
      const dag = await getChangeDag(repoPath, options.change);
      const warnings = dag.nodes
        .filter((n: any) => n.type === 'task' && (n.complexityAlert || n.couplingAlert));

      console.log(`=== Task Complexity Audit for "${options.change}" ===`);
      if (warnings.length === 0) {
        console.log('✔ Success: No task complexity or coupling warnings found.');
      } else {
        console.log(`Found ${warnings.length} warning(s):\n`);
        warnings.forEach((w: any, idx: number) => {
          console.log(`${idx + 1}. Task: "${w.label}"`);
          if (w.complexityAlert) {
            console.log(`   - Complexity Warning: ${w.complexityAlert}`);
          }
          if (w.couplingAlert) {
            console.log(`   - Coupling Warning: ${w.couplingAlert}`);
          }
          console.log();
        });
      }
    } catch (err: any) {
      console.error(`Lint command failed: ${err.message}`);
      process.exit(1);
    }
  });

// 3. COMPLEXITY command
program
  .command('complexity')
  .description('Print the early complexity index and scores')
  .requiredOption('-c, --change <change-name>', 'Change name')
  .option('-p, --path <path>', 'Repository path', '.')
  .action(async (options) => {
    const repoPath = path.resolve(options.path);
    try {
      // getChangeDag automatically computes complexity and saves it to complexity.json
      const dag = await getChangeDag(repoPath, options.change);
      const comp = dag.complexity || { rating: 'Unknown', component: 0, coordinative: 0 };
      
      console.log(`=== Early Complexity Index for "${options.change}" ===`);
      console.log(`Complexity Rating: ${comp.rating}`);
      console.log(`Component Score:   ${comp.component}`);
      console.log(`Coordinative Score: ${comp.coordinative.toFixed(2)}`);
    } catch (err: any) {
      console.error(`Complexity command failed: ${err.message}`);
      process.exit(1);
    }
  });

// Helper function to call Gemini API
async function queryGemini(apiKey: string, systemInstruction: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${errText}`);
  }

  const data = await response.json() as any;
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) {
    throw new Error('Empty response from Gemini API');
  }
  return reply;
}

// 4. INTERROGATE command
program
  .command('interrogate')
  .description('Retrieve active interrogation questions or submit answers')
  .requiredOption('-c, --change <change-name>', 'Change name')
  .option('-p, --path <path>', 'Repository path', '.')
  .option('--submit', 'Submit answers')
  .option('--answers <json>', 'JSON string of answers (or "interactive")')
  .action(async (options) => {
    const repoPath = path.resolve(options.path);
    const changeDir = path.join(repoPath, 'openspec', 'changes', options.change);
    if (!fs.existsSync(changeDir)) {
      console.error(`Error: Change "${options.change}" directory not found`);
      process.exit(1);
    }

    const answersPath = path.join(changeDir, 'review-answers.json');
    let questions: string[] = [];
    let savedAnswers: Record<string, string> = {};
    let completed = false;

    // Load existing file if present
    if (fs.existsSync(answersPath)) {
      try {
        const fileContent = fs.readFileSync(answersPath, 'utf8');
        const parsed = JSON.parse(fileContent);
        questions = parsed.questions || [];
        savedAnswers = parsed.answers || {};
        completed = !!parsed.completed;
      } catch (e) {
        console.warn('Failed to parse existing review-answers.json, regenerating questions.');
      }
    }

    // Generate questions if not present
    if (questions.length === 0) {
      const dag = await getChangeDag(repoPath, options.change);
      const specs = dag.nodes.filter((n: any) => n.type === 'spec-requirement' || n.type === 'spec-scenario');
      const designs = dag.nodes.filter((n: any) => n.type === 'design-decision');
      
      const fallbackQuestions = [
        specs.length > 0 
          ? `How will you verify and test requirement "${specs[0].label}"?`
          : "How will you verify and test the main requirements of this change?",
        designs.length > 0
          ? `What edge cases or error conditions are associated with design decision "${designs[0].label}", and how will they be handled?`
          : "Are there any edge cases or error conditions in the proposed design, and how does the system handle them?",
        "Are there any potential side-effects or coupling risks with other capabilities in the codebase?"
      ];

      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          const systemInstruction = `You are an expert software architect auditing an OpenSpec change.
Based on the provided requirements and design decisions, generate exactly 3 critical, open-ended comprehension questions that the implementing developer must answer.
Focus on edge cases, validation, testing strategies, or potential design trade-offs.

You MUST return a JSON array containing exactly 3 strings (questions). Example:
[
  "Question 1?",
  "Question 2?",
  "Question 3?"
]
Do not return any markdown wraps or commentary outside the JSON array.`;

          const prompt = `Generate 3 comprehension questions for this change.
Requirements:
${specs.slice(0, 5).map((s: any) => `- ${s.label}`).join('\n')}

Design Decisions:
${designs.slice(0, 5).map((d: any) => `- ${d.label}`).join('\n')}`;

          const reply = await queryGemini(apiKey, systemInstruction, prompt);
          let cleanReply = reply.trim();
          if (cleanReply.startsWith('```')) {
            cleanReply = cleanReply.replace(/^```(?:json)?\n?|```$/g, '').trim();
          }
          const parsed = JSON.parse(cleanReply);
          if (Array.isArray(parsed) && parsed.length === 3) {
            questions = parsed.map(q => String(q));
          } else {
            questions = fallbackQuestions;
          }
        } catch (err) {
          console.warn('Failed to generate questions using Gemini API, using fallbacks:', err);
          questions = fallbackQuestions;
        }
      } else {
        questions = fallbackQuestions;
      }

      // Persist the generated questions
      fs.writeFileSync(answersPath, JSON.stringify({
        questions,
        answers: {},
        completed: false,
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf8');
    }

    if (!options.submit) {
      console.log(`=== Active Interrogation Questions for "${options.change}" ===`);
      questions.forEach((q, idx) => {
        console.log(`\nQ${idx + 1}: ${q}`);
        if (savedAnswers[q]) {
          console.log(`A${idx + 1}: ${savedAnswers[q]}`);
        } else {
          console.log(`A${idx + 1}: (Unanswered)`);
        }
      });
      console.log(`\nStatus: ${completed ? 'COMPLETED' : 'PENDING'}`);
      console.log('\nTo submit answers, run with --submit. E.g.:');
      console.log(`openspec-cli interrogate --change "${options.change}" --submit --answers '{"Question text": "Your answer"}'`);
    } else {
      let answersToSubmit: Record<string, string> = {};

      if (options.answers === 'interactive' || !options.answers) {
        console.log(`=== Interactive Interrogation for "${options.change}" ===`);
        for (const q of questions) {
          console.log(`\nQuestion: ${q}`);
          const answer = await promptQuestion('Your Answer: ');
          answersToSubmit[q] = answer;
        }
      } else {
        try {
          answersToSubmit = JSON.parse(options.answers);
        } catch (e: any) {
          console.error(`Invalid JSON in --answers: ${e.message}`);
          process.exit(1);
        }
      }

      // Merge and save
      const finalAnswers = { ...savedAnswers, ...answersToSubmit };
      
      // Check if all questions have answers
      const allAnswered = questions.every(q => finalAnswers[q] && finalAnswers[q].trim().length > 0);

      fs.writeFileSync(answersPath, JSON.stringify({
        questions,
        answers: finalAnswers,
        completed: allAnswered,
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf8');

      console.log('\n✔ Interrogation answers updated successfully!');
      console.log(`Status: ${allAnswered ? 'COMPLETED' : 'PENDING (some answers are missing)'}`);
    }
  });

program.parse(process.argv);
