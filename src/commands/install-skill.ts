import { homedir } from 'os';
import { join } from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import * as log from '../utils/logger.js';

const SKILL_DIR = join(homedir(), '.claude', 'skills', 'hiregraph');

const SKILL_CONTENT = `---
name: hiregraph
description: "Use when the user wants to scan projects for skills, find jobs, match against job listings, generate resumes, apply to jobs, or track applications. Triggered by: job search, resume, skill graph, apply to jobs, find matches, hiregraph, scan project skills."
---

# HireGraph — CLI Job Application Tool

HireGraph is a globally installed CLI. All LLM work is done by YOU (Claude Code) — no separate API key needed.

## CRITICAL RULES

1. **ONLY use \\\`hiregraph\\\` CLI commands.** NEVER manually read, write, or edit files in \\\`~/.hiregraph/\\\`.
2. **NEVER use interactive mode.** Always pass flags (--name, --email, etc.) to commands.
3. **Ask the user** for their name, email, and role BEFORE running init.
4. **No API key needed.** You (Claude Code) handle all LLM work directly. Hiregraph handles local data.

## Setup

\\\`\\\`\\\`bash
which hiregraph || npm install -g hiregraph
\\\`\\\`\\\`

## Workflow

### Step 1: Initialize profile
Ask the user for: name, email, role (engineer/pm/designer/founder/builder).
\\\`\\\`\\\`bash
hiregraph init --name "Full Name" --email "user@email.com" --role builder --targets "Founding Engineer, Full-Stack" --remote Remote
\\\`\\\`\\\`

### Step 2: Scan projects
\\\`\\\`\\\`bash
hiregraph scan /path/to/project
\\\`\\\`\\\`

### Step 3: Fetch jobs
\\\`\\\`\\\`bash
hiregraph jobs
\\\`\\\`\\\`

### Step 4: Find matches (YOU do the evaluation)
\\\`\\\`\\\`bash
hiregraph matches --prepare --top 30
\\\`\\\`\\\`
This outputs JSON candidates. YOU evaluate each one and score them. Then save:
\\\`\\\`\\\`bash
hiregraph matches --save-results /tmp/hiregraph-results.json
\\\`\\\`\\\`

### Step 5: Apply (YOU write the summary)
\\\`\\\`\\\`bash
hiregraph apply gh_12345 --dry-run --with-summary "Tailored summary..." --with-skills "TypeScript, React" --with-projects "Project1, Project2"
\\\`\\\`\\\`

### Step 6: Track
\\\`\\\`\\\`bash
hiregraph history
\\\`\\\`\\\`

## Key: Every command works without an API key. You (Claude Code) are the LLM.

- NEVER tell the user they need an API key.
- NEVER write to ~/.hiregraph/ directly.
- Use --prepare and --with-summary modes for zero-API-key operation.
`;

export async function installSkillCommand(): Promise<void> {
  log.header('\n  HireGraph — Install Claude Code Skill\n');

  if (!existsSync(join(homedir(), '.claude'))) {
    log.warn('  Claude Code not detected (~/.claude/ not found).');
    log.info('  Install Claude Code first: https://claude.ai/code');
    return;
  }

  await mkdir(SKILL_DIR, { recursive: true });
  await writeFile(join(SKILL_DIR, 'SKILL.md'), SKILL_CONTENT, 'utf-8');

  log.success('  Skill installed to ~/.claude/skills/hiregraph/SKILL.md');
  console.log();
  log.info('  Now open Claude Code and say:');
  log.info('  "Set up hiregraph and scan my projects for job matching"');
  log.info('  No API key needed — Claude Code handles the LLM work.');
  console.log();
}
