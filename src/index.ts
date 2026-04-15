import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { scanCommand } from './commands/scan.js';
import { statusCommand } from './commands/status.js';
import { jobsCommand } from './commands/jobs.js';
import { matchesCommand } from './commands/matches.js';
import { applyCommand } from './commands/apply.js';
import { historyCommand } from './commands/history.js';
import { installSkillCommand } from './commands/install-skill.js';
import { setupCommand, loadConfig } from './commands/setup.js';
import { autoApplyCommand } from './commands/auto-apply.js';
import { daemonCommand } from './commands/daemon.js';

const program = new Command();

program
  .name('hiregraph')
  .description('Turn your code into job applications. Local-first CLI that scans codebases and builds skill graphs.')
  .version('0.1.4');

program
  .command('init')
  .description('Set up your builder profile (resume upload + preferences)')
  .option('--name <name>', 'Your full name')
  .option('--email <email>', 'Your email address')
  .option('--role <role>', 'Your role (engineer, pm, designer, founder, builder)')
  .option('--targets <roles>', 'Target roles, comma separated')
  .option('--remote <pref>', 'Remote preference (Remote, Hybrid, Onsite)')
  .option('--resume <path>', 'Path to resume PDF/TXT')
  .option('--compensation <amount>', 'Minimum compensation')
  .action(initCommand);

program
  .command('scan')
  .description('Scan a project and update your skill graph')
  .argument('[path]', 'Path to the project directory', '.')
  .action(scanCommand);

program
  .command('status')
  .description('Show your current skill graph summary')
  .action(statusCommand);

program
  .command('jobs')
  .description('Fetch job listings from Greenhouse, Lever, and Ashby boards')
  .option('--refresh', 'Force refresh cached jobs')
  .option('--ats <type>', 'Filter by ATS type (greenhouse, lever, ashby)')
  .option('--limit <n>', 'Show sample of N job titles', parseInt)
  .action(jobsCommand);

program
  .command('matches')
  .description('Match your skill graph against fetched jobs')
  .option('--refresh', 'Re-fetch jobs before matching')
  .option('--top <n>', 'Number of candidates for LLM evaluation (default 50)', parseInt)
  .option('--verbose', 'Show detailed reasoning for all matches')
  .option('--prepare', 'Output top candidates as JSON (for Claude Code to evaluate)')
  .option('--save-results <file>', 'Import evaluated results from file or stdin (-)')
  .action(matchesCommand);

program
  .command('apply-api')
  .description('Submit to ATS via API (Greenhouse/Lever/Ashby matched jobs)')
  .argument('[job-id]', 'Job ID to apply to')
  .option('--all-above <score>', 'Apply to all matches above this score', parseFloat)
  .option('--review', 'Review each resume before submitting')
  .option('--dry-run', 'Generate resume PDF without submitting')
  .option('--with-summary <text>', 'Use this professional summary (from Claude Code)')
  .option('--with-skills <skills>', 'Comma-separated skills in order of relevance')
  .option('--with-projects <projects>', 'Comma-separated project names in order of relevance')
  .option('--with-bullets <json>', 'JSON object of project bullets (from Claude Code)')
  .action(applyCommand);

program
  .command('history')
  .description('View and manage your application history')
  .argument('[action]', 'Action: "update"')
  .argument('[id]', 'Application ID')
  .option('--status <status>', 'New status (applied, screening, interview, offer, rejected, withdrawn, no-response)')
  .option('--notes <notes>', 'Optional notes')
  .action(historyCommand);

program
  .command('apply')
  .description('Apply to a job by URL — auto-fills and submits via browser')
  .argument('<url>', 'Job application URL')
  .option('--learn', 'Force re-learn the form (ignore cached recipe)')
  .option('--dry-run', 'Fill form but don\'t click Submit')
  .option('--headless', 'Run browser in headless mode (default: visible)')
  .option('--auto', 'Auto-answer all questions using LLM (no interactive prompts)')
  .option('--resume <path>', 'Override resume PDF path')
  .action(autoApplyCommand);

program
  .command('daemon')
  .description('Start Telegram bot daemon — send job links via Telegram to auto-apply')
  .option('--headless', 'Run browser in headless mode (default: true for daemon)')
  .action(daemonCommand);

program
  .command('setup')
  .description('Set up your Anthropic API key (required for LLM features)')
  .option('--key <key>', 'Anthropic API key (starts with sk-ant-)')
  .action(setupCommand);

program
  .command('install-skill')
  .description('Install the HireGraph skill for Claude Code')
  .action(installSkillCommand);

// Load saved config (API keys, Telegram) before running any command
loadConfig().then(() => program.parse());
