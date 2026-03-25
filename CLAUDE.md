# HireGraph -- Project Guidelines

## Project Overview
HireGraph is an open-source, local-first CLI tool that turns your code into job applications. It scans projects locally, builds a structured skill graph, matches against jobs from public ATS APIs, generates tailored resumes, and submits applications -- all from the terminal using the user's own LLM API key.

**Spec:** `HireGraph_Local_First_Final_Spec.docx`

## Core Principles
- **Local-first:** Everything runs on the user's machine. No cloud, no server, no account.
- **Open source:** MIT license. Full transparency.
- **BYOK (Bring Your Own Key):** Reads `ANTHROPIC_API_KEY` from env (fallback: `OPENAI_API_KEY`).
- **Builders never pay:** CLI is free. Only cost is LLM API usage on user's own key.

## Workflow Rules

### Plan First, Build Second
- ALWAYS enter plan mode before starting any non-trivial implementation
- Use the brainstorming skill before any creative/feature work
- Read the spec section relevant to whatever you're building before writing code
- Explore existing code thoroughly before proposing changes

### No Over-Engineering
- Do NOT add features, abstractions, or "improvements" beyond what's requested
- Three similar lines > a premature abstraction
- No speculative generality -- build for current requirements, not hypothetical futures
- No unnecessary error handling for impossible scenarios
- If the user asks for X, deliver X -- not X + Y + Z

### Code Quality
- Keep functions small and focused (single responsibility)
- Prefer composition over inheritance
- Write self-documenting code; only add comments for non-obvious "why" decisions
- Don't add docstrings/comments/type annotations to code you didn't change

## Tech Stack
- **CLI Framework:** TypeScript + Commander.js (ships as npm package: `hiregraph`)
- **Code Analysis (Layers 1-6):** tree-sitter bindings + native file/git parsing (all local, no LLM)
- **LLM Calls (Layer 7, matching, resume):** Anthropic SDK (reads `ANTHROPIC_API_KEY` from env)
- **Vector Similarity:** hnswlib-node (local vector index, no Postgres/pgvector)
- **Resume PDF Generation:** Typst (local binary)
- **Local Storage:** JSON files in `~/.hiregraph/`
- **Job Fetching:** Direct HTTP to public ATS APIs (Greenhouse, Lever, Ashby)
- **Distribution:** npm (`npm install -g hiregraph`)
- **No database.** No Supabase. No cloud. Everything is JSON files on disk.

## Architecture: 7 Analysis Layers
1. **File Discovery** -- walk file tree, count files/LOC by language
2. **Dependency Extraction** -- parse package.json, requirements.txt, Cargo.toml, go.mod
3. **AST Analysis** -- tree-sitter for deep code structure (components, hooks, patterns)
4. **Git Forensics** -- commit history, active days, contributors, velocity
5. **Quality Signals** -- test ratio, complexity, type safety, secrets scan
6. **Architecture Patterns** -- Service Layer, MVC, Repository, etc. via naming heuristics
7. **LLM Classification** -- single Haiku call on structured summary (only network call in scan)

Layers 1-6 are completely local. Layer 7 is one cheap Haiku call.

## CLI Commands
- `hiregraph init` -- profile setup (resume upload + preferences)
- `hiregraph scan <path>` -- scan a project, update skill graph
- `hiregraph status` -- show current skill graph summary
- `hiregraph jobs` -- fetch + match jobs from ATS APIs
- `hiregraph matches` -- show ranked matches with reasoning
- `hiregraph apply <job>` -- generate tailored resume + submit via ATS API
- `hiregraph history` -- track application outcomes

## Local Storage Structure
```
~/.hiregraph/
  identity.json          # Builder profile
  skill-graph.json       # Accumulated skill graph
  config.json            # Preferences
  jobs/                  # Cached job listings (greenhouse.json, lever.json, ashby.json)
  matches/               # Match results with scores
  resumes/               # Generated PDFs
  history.json           # Application tracking
```

## Development Conventions

### File Naming
- TypeScript: `kebab-case.ts` for files, `PascalCase` for components/classes
- React components: `ComponentName.tsx` in `components/` directory

### Git
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Branch naming: `feat/short-description`, `fix/short-description`
- Never force push to main

### Environment
- Use `.env.local` for secrets (never commit)
- `.env.example` with placeholder values

### Testing
- Unit tests alongside source files (`*.test.ts`)
- Integration tests in `tests/` directory
- Test before marking any task complete

## Implementation Phases
- **Phase 1A (Weeks 1-4):** CLI + Local Analysis (init, scan, status)
- **Phase 1B (Weeks 5-8):** Job Fetching + Matching (jobs, matches)
- **Phase 1C (Weeks 9-12):** Resume Generation + Auto-Apply (apply, history)

## Skill Usage
- `/brainstorming` -- Before any new feature or creative decision
- `/ui-ux-pro-max` -- Not applicable (CLI tool, no UI)
- `/vercel-react-best-practices` -- Not applicable (not React)
- `/native-data-fetching` -- For ATS API integration patterns

## Key Decisions Log
| Date | Decision | Context |
|------|----------|---------|
| 2026-03-25 | Project initialized | Local-first CLI, TypeScript + Commander.js |
| 2026-03-25 | No Supabase | Local-first means JSON files on disk, no cloud DB |
| 2026-03-25 | TypeScript over Rust | Target audience has Node.js, tree-sitter has Node bindings, I/O-bound not CPU-bound |
