---
name: hiregraph
description: "Use when the user wants to scan projects for skills, find jobs, match against job listings, generate resumes, apply to jobs, or track applications. Triggered by: job search, resume, skill graph, apply to jobs, find matches, hiregraph, scan project skills."
---

# HireGraph — CLI Job Application Tool

HireGraph is a globally installed CLI. All LLM work is done by YOU (Claude Code) — no separate API key needed.

## CRITICAL RULES

1. **ONLY use `hiregraph` CLI commands.** NEVER manually read, write, or edit files in `~/.hiregraph/`.
2. **NEVER use interactive mode.** Always pass flags (--name, --email, etc.) to commands.
3. **Ask the user** for their name, email, and role BEFORE running init.
4. **No API key needed.** You (Claude Code) handle all LLM work directly. Hiregraph handles local data.

## Setup

```bash
# Check if installed
which hiregraph || npm list -g hiregraph
# Install if missing
npm install -g hiregraph
```

## Workflow

### Step 1: Initialize profile
Ask the user for: name, email, role (engineer/pm/designer/founder/builder).
```bash
hiregraph init --name "Full Name" --email "user@email.com" --role builder --targets "Founding Engineer, Full-Stack" --remote Remote
```

### Step 2: Scan projects
Ask which projects to scan.
```bash
hiregraph scan /path/to/project
```
Layer 7 (LLM classification) will be skipped — that's fine. You can classify the project yourself by reading the scan output.

### Step 3: Check skill graph
```bash
hiregraph status
```

### Step 4: Fetch jobs
```bash
hiregraph jobs
```
This fetches from Greenhouse, Lever, and Ashby. No API key needed — just HTTP calls.

### Step 5: Find matches (YOU do the LLM work)
This is the key step. Instead of `hiregraph matches` (which needs an API key), use `--prepare`:

```bash
hiregraph matches --prepare --top 30
```

This outputs JSON with:
- `skill_summary`: the user's skill profile
- `candidates`: top 30 jobs ranked by vector similarity, each with job_id, title, company, description_snippet

**YOU then evaluate the candidates.** For each candidate, assess:
- Score (1-10): how well does this person match this job?
- Strengths: what makes them a good fit?
- Gaps: what's missing?
- Reasoning: 2-3 sentence explanation

Then save results by writing a JSON file and importing it:

```bash
cat > /tmp/hiregraph-results.json << 'RESULTS'
[
  {
    "job_id": "gh_12345",
    "job_title": "Senior Engineer",
    "company": "Stripe",
    "company_slug": "stripe",
    "url": "https://...",
    "score": 8.5,
    "confidence": 0.8,
    "tier": "strong",
    "reasoning": "Strong TypeScript skills match requirements...",
    "strengths": ["TypeScript proficiency", "Full-stack experience"],
    "gaps": ["No fintech domain experience"],
    "matched_at": "2026-03-25T00:00:00.000Z"
  }
]
RESULTS
hiregraph matches --save-results /tmp/hiregraph-results.json
```

Set `tier` to "strong" for score 8-10, "suggested" for 6-7, "filtered" for below 6.

### Step 6: Apply (YOU write the resume summary)
Instead of hiregraph calling an LLM for tailoring, you provide the summary:

```bash
hiregraph apply gh_12345 --dry-run \
  --with-summary "Experienced full-stack engineer with 5+ years building scalable TypeScript applications..." \
  --with-skills "TypeScript, React, Node.js, PostgreSQL" \
  --with-projects "ProjectA, ProjectB"
```

- `--with-summary`: Write a 3-4 sentence professional summary tailored to the job. Sound natural, no HireGraph metadata.
- `--with-skills`: Reorder the user's skills by relevance to this job.
- `--with-projects`: Reorder projects by relevance.
- `--dry-run`: Generate PDF without submitting (let user review first).

Remove `--dry-run` to actually submit.

### Step 7: Track applications
```bash
hiregraph history
hiregraph history update app_abc --status interview
```

## Commands Quick Reference

| Command | Needs API Key? | What it does |
|---------|---------------|-------------|
| `hiregraph init --name ... --email ...` | No | Set up profile |
| `hiregraph scan <path>` | No | Analyze code (layers 1-6) |
| `hiregraph status` | No | Show skill graph |
| `hiregraph jobs` | No | Fetch job listings |
| `hiregraph matches --prepare` | No | Pre-filter top candidates (YOU evaluate) |
| `hiregraph matches --save-results <f>` | No | Save YOUR evaluations |
| `hiregraph apply <id> --with-summary ...` | No | Generate PDF + submit (YOU write summary) |
| `hiregraph history` | No | View applications |

**Every command works without an API key.** You (Claude Code) are the LLM.

## Remember

- NEVER write to ~/.hiregraph/ directly.
- NEVER run hiregraph init without --name and --email flags.
- NEVER tell the user they need an API key. They don't — you handle the LLM work.
- Use --prepare and --with-summary modes to keep hiregraph API-key-free.
