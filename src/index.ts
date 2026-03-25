import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { scanCommand } from './commands/scan.js';
import { statusCommand } from './commands/status.js';

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

program.parse();
