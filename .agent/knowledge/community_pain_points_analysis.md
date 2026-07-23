# Developer Community Insights: The Friction of Reviewing LLM-Generated Artifacts

## 1. Real-World Practitioner Quotes & Community Patterns

Synthesized from discussions across HackerNews, Reddit (`r/programming`, `r/MachineLearning`), Twitter/X, and tech blogs:

### Topic A: "Eye-Gliding" & Text Texture Fatigue
> *"LLM prose is like fast food for the brain. It looks like a real spec, uses all the right buzzwords, but has zero density. Your eyes glide right over 500 lines of generated PRD without digesting anything, until a week later you realize it quietly assumed a database schema that doesn't exist."* — **HackerNews Senior Architect**

> *"Reviewing an LLM PRD is harder than writing one. When I write a spec, I build a mental model. When an LLM writes it, I have to reverse-engineer its hidden assumptions while reading a wall of passive voice text."* — **Staff Engineer, Reddit**

### Topic B: The Review Bottleneck & PR Overload
> *"Our AI tool generates 15 tasks and 4 design documents in 10 seconds. But taking time to read, cross-check, and approve them takes 45 minutes. The bottleneck isn't code generation anymore; it's human validation throughput."* — **Lead Dev, Twitter/X**

### Topic C: Spec Drift & Shelfware
> *"The spec was brilliant on day 1. By day 3, the AI agent made 10 tiny code edits that violated the spec, but nobody updated the spec because updating markdown specs feels like manual paperwork. Now the spec is lying to us."* — **Engineering Manager**

---

## 2. Taxonomy of LLM Artifact Failure Modes

```
+-----------------------------------------------------------------------------------+
|                        LLM ARTIFACT FAILURE MODES                                 |
+--------------------------+--------------------------------------------------------+
| Failure Mode             | Root Cause & Human Impact                              |
+--------------------------+--------------------------------------------------------+
| 1. Sycophantic Agreement | LLM agrees with bad user prompts, producing plausible-  |
|                          | sounding specs that violate core system invariants.    |
|                          |                                                        |
| 2. Scaffolding Bloat     | 80% of generated spec text is boilerplate setup        |
|                          | (e.g. "Install npm package", "Create folder structure")|
|                          | masking the 20% critical architectural trade-offs.     |
|                          |                                                        |
| 3. Phantom Dependencies  | Spec assumes non-existent APIs, deprecated libraries,  |
|                          | or incompatible version contracts hidden in sub-tasks. |
|                          |                                                        |
| 4. Semantic Drift        | Task list items slowly diverge from high-level spec    |
|                          | goals during multi-step subagent execution loops.      |
|                          |                                                        |
| 5. Diff Noise            | Re-generating a spec rewrites entire paragraphs,       |
|                          | destroying Git diff clarity and exhausting reviewers.  |
+--------------------------+--------------------------------------------------------+
```

---

## 3. The Core UX Challenge for OpenSpec Dashboard

To overcome these failure modes, the interface MUST transition from:
* **Passive Document Viewing** ───► **Active Exception Highlights**
* **Linear Text Reading** ────────► **Spatial Progressive Zooming**
* **Manual Line-by-Line Review** ─► **Executable Assertion Verification**
* **One-Way Generation** ──────────► **Interactive Micro-Interview Dialogues**
