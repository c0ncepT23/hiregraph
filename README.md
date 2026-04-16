# HireGraph

**Auto-apply to jobs from your terminal. Set up your profile, send a job link, done.**

Open Source | Local-First | Bring Your Own Key

## Install

```bash
npm install -g hiregraph
```

Requires Node.js >= 18 and an Anthropic API key.

## Quick Start

```bash
# 1. Set up your profile (name, resume, preferences)
hiregraph init

# 2. Set your Anthropic API key
hiregraph setup

# 3. Apply to any job
hiregraph apply https://jobs.lever.co/company/position-id
```

That's it. HireGraph opens a browser, reads the application form, fills every field using your profile + AI, uploads your resume, and submits.

### Options

```bash
hiregraph apply <url> --dry-run    # Fill form but don't submit
hiregraph apply <url> --auto       # Auto-answer all questions (no prompts)
hiregraph apply <url> --headless   # Run browser invisibly
hiregraph apply <url> --resume ./my-resume.pdf  # Override resume
```

## Telegram Bot (Auto-Apply from Your Phone)

Send job links from your phone via Telegram and HireGraph auto-applies in the background. Runs as a daemon on any server (Railway, VPS, etc).

### Setup

1. **Create a Telegram bot** -- message [@BotFather](https://t.me/BotFather), send `/newbot`, follow prompts. Save the bot token.

2. **Get your chat ID** -- message [@userinfobot](https://t.me/userinfobot), it replies with your chat ID.

3. **Set environment variables:**
   ```bash
   # Mac/Linux (add to ~/.bashrc or ~/.zshrc)
   export ANTHROPIC_API_KEY="sk-ant-..."
   export TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
   export TELEGRAM_CHAT_ID="your_chat_id"

   # Windows (PowerShell)
   $env:ANTHROPIC_API_KEY="sk-ant-..."
   $env:TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
   $env:TELEGRAM_CHAT_ID="your_chat_id"
   ```

4. **Run the daemon:**

   **Option A: Run locally (simplest)**
   ```bash
   hiregraph daemon
   ```
   Keep this terminal open. Send job URLs to your Telegram bot from your phone -- it auto-applies using the browser on your machine.

   **Option B: Deploy to a server (always-on)**

   Deploy to Railway, a VPS, or any Docker host so the daemon runs 24/7:
   ```bash
   # Copy your profile data for the Docker build
   bash deploy/seed-data.sh

   # Deploy to Railway
   railway up
   ```

5. **Send a job URL** to your Telegram bot. It replies:
   - `Got it -- starting now` when it begins
   - `Applied` or `Failed` when done

### Telegram Commands

| Command | What It Does |
|---------|-------------|
| Send a URL | Queues it for auto-apply |
| `/status` | Check if daemon is running |
| `/queue` | Show pending jobs |
| `/history` | Recent applications |
| `/stop` | Stop daemon |

You can send multiple URLs in one message -- they queue up and process one at a time.

## How It Works

1. **`hiregraph init`** collects your profile: name, email, work history, skills, preferences, resume, social links, compensation, notice period, and more.

2. **`hiregraph apply <url>`** opens a browser and:
   - Navigates to the job application page
   - Detects if login is required (skips if so)
   - Analyzes the form structure using Claude Haiku
   - Fills every field from your profile (direct lookup for known fields, AI for custom questions)
   - Uploads your resume
   - Submits the application
   - Saves a recipe so the same site is faster next time

3. **Custom questions** (like "Why do you want this role?") are answered by AI using your profile context. You can review/edit in CLI mode, or auto-approve in `--auto` mode. Answers are cached so the same question is never asked twice.

## What's On Your Machine

```
~/.hiregraph/
  identity.json       # Your profile
  config.json         # API keys + preferences
  answers.json        # Cached answers to custom questions
  recipes/            # Learned form recipes per domain
  resumes/            # Generated/uploaded PDFs
  history.json        # Application tracking
```

Everything is a JSON file. Inspect, back up, or delete anytime.

## What It Costs

The only cost is LLM API usage on your Anthropic key:

| Action | Cost |
|--------|------|
| Analyze + fill a form | ~$0.01-0.05 per application |
| Answer custom questions | ~$0.003 per question |

Most applications cost under $0.05.

## Works With

Any job application form on the web. Tested with:
- Greenhouse
- Lever
- Ashby
- Workable
- Custom ATS portals

Login-walled sites (LinkedIn Easy Apply, etc.) are detected and skipped.

## License

MIT
