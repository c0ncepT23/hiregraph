# HireGraph

**Your code is your resume. Everything runs on your machine.**

HireGraph is a local-first CLI that turns your code into job applications. It scans your projects, builds a skill graph, matches you against jobs from public ATS APIs, generates tailored resumes, and submits applications — all from your terminal.

Open Source | Local-First | Bring Your Own Key

## Install

```bash
npm install -g hiregraph
```

### For Claude Code users (recommended)

```bash
npm install -g hiregraph
hiregraph install-skill
```

Then open Claude Code and say: *"Set up hiregraph and scan my projects"*. Claude Code handles everything — no manual commands needed.

### Or install the skill directly

```bash
npx skills add https://github.com/c0ncepT23/hiregraph --skill hiregraph --yes --global
```

### API Key

HireGraph reads `ANTHROPIC_API_KEY` from your environment. Set it once:

- **Mac/Linux:** `export ANTHROPIC_API_KEY="sk-ant-..."` (add to `~/.bashrc` or `~/.zshrc`)
- **Windows:** Add `ANTHROPIC_API_KEY` to System Environment Variables
- **Claude Code:** Already set automatically

## Quick Start

```bash
# 1. Set up your profile
hiregraph init

# 2. Scan your projects
hiregraph scan ~/projects/my-app
hiregraph scan ~/projects/another-app

# 3. Check your skill graph
hiregraph status

# 4. Fetch jobs from Greenhouse, Lever, and Ashby
hiregraph jobs

# 5. Find your best matches
hiregraph matches

# 6. Apply with a tailored resume
hiregraph apply gh_12345 --review

# 7. Track your applications
hiregraph history
```

## How It Works

### Scan: 7 Layers of Code Analysis

When you run `hiregraph scan`, seven layers extract structured data from your codebase:

| Layer | What It Does | LLM? |
|-------|-------------|------|
| 1. File Discovery | Walk file tree, count LOC, detect languages | No |
| 2. Dependencies | Parse package.json, requirements.txt, Cargo.toml, go.mod | No |
| 3. AST Analysis | Analyze code structure — functions, classes, components, hooks | No |
| 4. Git Forensics | Commits, active days, contributors, velocity | No |
| 5. Quality Signals | Test ratio, complexity, type safety, secrets scan | No |
| 6. Architecture | Detect patterns — Service Layer, MVC, Repository, Monorepo | No |
| 7. Classification | One Haiku call on a structured summary (not your code) | Yes |

Layers 1-6 are completely local. No network calls. No code leaves your machine.

### Match: Two-Tier Matching

1. **Pre-filter** — TF-IDF vector similarity finds the top 50 candidates from thousands of jobs. Runs locally in milliseconds.
2. **LLM evaluation** — Haiku scores each candidate with reasoning, strengths, and gaps. ~$0.15 for 50 evaluations.

### Apply: Tailored Resume + Auto-Submit

- One Haiku call tailors your summary and selects relevant project bullets per job
- pdfkit generates an ATS-compatible PDF locally
- Submits through official ATS APIs (same ones Indeed/LinkedIn use)
- The company sees a normal application — they have no idea HireGraph exists

## Commands

| Command | What It Does |
|---------|-------------|
| `hiregraph init` | Set up your profile (resume upload + preferences) |
| `hiregraph scan <path>` | Scan a project and update your skill graph |
| `hiregraph status` | Show your skill graph summary |
| `hiregraph jobs` | Fetch jobs from Greenhouse, Lever, and Ashby |
| `hiregraph matches` | Match your skill graph against fetched jobs |
| `hiregraph apply <job-id>` | Generate tailored resume and submit |
| `hiregraph history` | View and manage application history |

### Apply Options

```bash
hiregraph apply gh_12345              # Apply to a specific job
hiregraph apply gh_12345 --review     # Preview resume before submitting
hiregraph apply gh_12345 --dry-run    # Generate PDF without submitting
hiregraph apply --all-above 8         # Batch apply to all 8+ matches
```

### History Options

```bash
hiregraph history                              # List all applications
hiregraph history update app_x9y8 --status interview
hiregraph history update app_x9y8 --status offer --notes "Start date March"
```

## What's On Your Machine

```
~/.hiregraph/
  identity.json          # Your profile
  skill-graph.json       # Accumulated skill graph from scans
  config.json            # Preferences
  jobs/                  # Cached job listings
  matches/               # Match results with scores
  resumes/               # Generated PDFs
  history.json           # Application tracking
```

Everything is a file. You can inspect it, back it up, version control it, or delete it.

## What It Costs

The only cost is LLM API usage on your existing Anthropic key:

| Action | Cost |
|--------|------|
| Scan a project | ~$0.003 (1 Haiku call) |
| Parse ~5,000 job descriptions (first run) | ~$1.50 (cached after) |
| Match (50 evaluations) | ~$0.15 |
| Tailor + apply per job | ~$0.003 |
| **Total first run** | **~$1.70** |
| **Daily refresh + match** | **~$0.15** |

## Supported ATS

| ATS | Fetch Jobs | Auto-Submit |
|-----|-----------|-------------|
| Greenhouse | Yes | Yes |
| Lever | Yes | Yes |
| Ashby | Yes | Yes |

63 companies included in the seed registry. Add your own to `~/.hiregraph/companies.json`.

## Requirements

- Node.js >= 18
- `ANTHROPIC_API_KEY` in your environment (auto-set by Claude Code / Cursor)

## License

MIT
