---
name: hiregraph
description: "Use when the user wants to scan projects for skills, find jobs, match against job listings, generate resumes, apply to jobs, or track applications. Triggered by: job search, resume, skill graph, apply to jobs, find matches, hiregraph, scan project skills."
---

# HireGraph — CLI Job Application Tool

HireGraph is a globally installed CLI tool. You MUST use the `hiregraph` CLI commands to interact with it.

## CRITICAL RULES

1. **ONLY use `hiregraph` CLI commands.** NEVER manually read, write, or edit files in `~/.hiregraph/`. The CLI manages all data.
2. **NEVER use interactive mode.** Always pass `--name`, `--email`, `--role` flags to `hiregraph init`. Interactive prompts do not work in the Bash tool.
3. **Ask the user** for their name, email, and role BEFORE running `hiregraph init`. Do not guess or make up values.
4. **Check installation first.** If `hiregraph` is not found, run `npm install -g hiregraph`.

## API KEY — IMPORTANT

HireGraph needs an `ANTHROPIC_API_KEY` environment variable for LLM features (matching, resume tailoring, classification). This is **separate from the Claude Code subscription** — it's an Anthropic API key from console.anthropic.com.

**Before running any LLM-dependent command** (matches, apply, init with --resume), check if the key is set:
```bash
echo $ANTHROPIC_API_KEY
```

If empty, tell the user:
- "HireGraph needs an Anthropic API key (separate from Claude Code subscription). Get one free at https://console.anthropic.com/settings/keys"
- Then run: `hiregraph setup --key "sk-ant-..."` to save it permanently
- Or they can run `hiregraph setup` in a regular terminal for interactive setup

**Commands that DON'T need the API key** (safe to run anytime):
- `hiregraph scan` (layers 1-6 are local, only layer 7 needs it)
- `hiregraph jobs` (just HTTP calls to public ATS APIs)
- `hiregraph status`
- `hiregraph history`

**Commands that NEED the API key:**
- `hiregraph matches` (LLM evaluates match quality)
- `hiregraph apply` (LLM tailors resume)
- `hiregraph init --resume` (LLM parses resume)

## Commands

### 0. Setup API key (first time only)
```bash
hiregraph setup --key "sk-ant-your-key-here"
```

### 1. Initialize profile (MUST use flags)
```bash
hiregraph init --name "Full Name" --email "user@email.com" --role builder --targets "Founding Engineer, Full-Stack" --remote Remote
```

With resume:
```bash
hiregraph init --name "Full Name" --email "user@email.com" --role engineer --resume /path/to/resume.pdf
```

Valid roles: `engineer`, `pm`, `designer`, `founder`, `builder`

### 2. Scan projects
```bash
hiregraph scan /absolute/path/to/project
hiregraph scan .
```

### 3. View skill graph
```bash
hiregraph status
```

### 4. Fetch jobs
```bash
hiregraph jobs
hiregraph jobs --refresh
hiregraph jobs --limit 10
```

### 5. Match against jobs
```bash
hiregraph matches
hiregraph matches --verbose
```

### 6. Apply to jobs
```bash
hiregraph apply <job-id> --dry-run
hiregraph apply <job-id>
hiregraph apply --all-above 8
```

### 7. Track applications
```bash
hiregraph history
hiregraph history update <app-id> --status interview
```

## Workflow

When the user wants to use hiregraph, follow this exact sequence:

1. Check if installed: `which hiregraph || npm list -g hiregraph`
2. If not installed: `npm install -g hiregraph`
3. Check API key: `echo $ANTHROPIC_API_KEY`
4. If no key: tell user to get one from console.anthropic.com, then `hiregraph setup --key "sk-ant-..."`
5. Ask user for: name, email, role
6. Run: `hiregraph init --name "..." --email "..." --role ...`
7. Ask which projects to scan, then: `hiregraph scan <path>` for each
8. Show results: `hiregraph status`
9. If user wants jobs: `hiregraph jobs` then `hiregraph matches`
10. If user wants to apply: `hiregraph apply <job-id> --dry-run` first

## Remember

- NEVER write to ~/.hiregraph/ directly. Always use CLI commands.
- NEVER run `hiregraph init` without --name and --email flags.
- NEVER skip asking the user for their details before init.
- Claude Code subscription != Anthropic API key. Users need both.
- Cost: ~$0.003 per scan, ~$0.15 per match run, ~$1.50 first-time job parsing.
