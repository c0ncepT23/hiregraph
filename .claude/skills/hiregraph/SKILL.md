---
name: hiregraph
description: "Use when the user wants to scan projects for skills, find jobs, match against job listings, generate resumes, apply to jobs, or track applications. Triggered by: job search, resume, skill graph, apply to jobs, find matches, hiregraph, scan project skills."
---

# HireGraph — CLI Job Application Tool

HireGraph is a globally installed CLI tool. You MUST use the `hiregraph` CLI commands to interact with it.

## CRITICAL RULES

1. **ONLY use `hiregraph` CLI commands.** NEVER manually read, write, or edit files in `~/.hiregraph/`. The CLI manages all data.
2. **NEVER use interactive mode.** Always pass `--name`, `--email`, `--role` flags to `hiregraph init`. Interactive prompts (inquirer) do not work in the Bash tool.
3. **Ask the user** for their name, email, and role BEFORE running `hiregraph init`. Do not guess or make up values.
4. **Check installation first.** If `hiregraph` is not found, run `npm install -g hiregraph`.

## Commands

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
hiregraph jobs --refresh          # force refresh cache
hiregraph jobs --limit 10         # show sample
```

### 5. Match against jobs
```bash
hiregraph matches
hiregraph matches --verbose
```

### 6. Apply to jobs
```bash
hiregraph apply <job-id> --dry-run    # safe: generates PDF only
hiregraph apply <job-id>              # submits to ATS
hiregraph apply --all-above 8         # batch apply
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
3. Ask user for: name, email, role (engineer/pm/designer/founder/builder)
4. Run: `hiregraph init --name "..." --email "..." --role ...`
5. Ask which projects to scan, then run: `hiregraph scan <path>` for each
6. Show results: `hiregraph status`
7. If user wants jobs: `hiregraph jobs` then `hiregraph matches`
8. If user wants to apply: `hiregraph apply <job-id> --dry-run` first, then without --dry-run

## Remember

- NEVER write to ~/.hiregraph/ directly. Always use CLI commands.
- NEVER run `hiregraph init` without --name and --email flags.
- NEVER skip asking the user for their details before init.
- All hiregraph commands are non-interactive and safe to run via the Bash tool.
- Cost: ~$0.003 per scan, ~$0.15 per match run, ~$1.50 first-time job parsing.
