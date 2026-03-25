import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { scanCommand } from './commands/scan.js';
import { statusCommand } from './commands/status.js';
import { jobsCommand } from './commands/jobs.js';
import { matchesCommand } from './commands/matches.js';
import { applyCommand } from './commands/apply.js';
import { historyCommand } from './commands/history.js';

const program = new Command();

program
  .name('hiregraph')
  .description('Turn your code into job applications. Local-first CLI that scans codebases and builds skill graphs.')
  .version('0.1.0');

program
  .command('init')
  .description('Set up your builder profile (resume upload + preferences)')
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
  .action(matchesCommand);

program
  .command('apply')
  .description('Generate a tailored resume and submit to ATS')
  .argument('[job-id]', 'Job ID to apply to')
  .option('--all-above <score>', 'Apply to all matches above this score', parseFloat)
  .option('--review', 'Review each resume before submitting')
  .option('--dry-run', 'Generate resume PDF without submitting')
  .action(applyCommand);

program
  .command('history')
  .description('View and manage your application history')
  .argument('[action]', 'Action: "update"')
  .argument('[id]', 'Application ID')
  .option('--status <status>', 'New status (applied, screening, interview, offer, rejected, withdrawn, no-response)')
  .option('--notes <notes>', 'Optional notes')
  .action(historyCommand);

program.parse();
