import inquirer from 'inquirer';
import { homedir } from 'os';
import { join } from 'path';
import { readFile, writeFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { isApiKeyConfigured } from '../llm/client.js';
import * as log from '../utils/logger.js';

export async function setupCommand(options: { key?: string }): Promise<void> {
  log.header('\n  HireGraph Setup\n');

  // Check if already configured
  if (isApiKeyConfigured()) {
    log.success('  ANTHROPIC_API_KEY is already set. You\'re good to go!');
    log.info('  Run `hiregraph init` to set up your profile.');
    return;
  }

  console.log('  HireGraph needs an Anthropic API key to power LLM features');
  console.log('  (job matching, resume tailoring, project classification).\n');
  console.log('  This is separate from your Claude Code subscription.');
  console.log('  Get a key at: https://console.anthropic.com/settings/keys\n');
  console.log('  Anthropic offers free credits for new accounts.');
  console.log('  HireGraph costs ~$2 for first setup, ~$0.15/day after.\n');

  let apiKey = options.key;

  if (!apiKey) {
    const answer = await inquirer.prompt([{
      type: 'password',
      name: 'key',
      message: 'Paste your ANTHROPIC_API_KEY:',
      mask: '*',
    }]);
    apiKey = answer.key;
  }

  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    log.error('  Invalid key. It should start with "sk-ant-"');
    return;
  }

  // Set for current process
  process.env.ANTHROPIC_API_KEY = apiKey;

  // Persist to shell profile
  const platform = process.platform;
  if (platform === 'win32') {
    // Windows: set via setx (persists across sessions)
    const { execSync } = await import('child_process');
    try {
      execSync(`setx ANTHROPIC_API_KEY "${apiKey}"`, { stdio: 'pipe' });
      log.success('  API key saved to Windows environment variables.');
      log.warn('  Restart your terminal for it to take effect everywhere.');
    } catch {
      log.warn('  Could not save to system env. Set it manually:');
      console.log(`  $env:ANTHROPIC_API_KEY = "${apiKey}"`);
    }
  } else {
    // Mac/Linux: append to shell profile
    const shell = process.env.SHELL || '/bin/bash';
    const rcFile = shell.includes('zsh')
      ? join(homedir(), '.zshrc')
      : join(homedir(), '.bashrc');

    const exportLine = `\nexport ANTHROPIC_API_KEY="${apiKey}"\n`;

    try {
      if (existsSync(rcFile)) {
        const content = await readFile(rcFile, 'utf-8');
        if (content.includes('ANTHROPIC_API_KEY')) {
          log.info(`  Key already in ${rcFile}. Updating...`);
          const updated = content.replace(
            /export ANTHROPIC_API_KEY="[^"]*"/,
            `export ANTHROPIC_API_KEY="${apiKey}"`,
          );
          await writeFile(rcFile, updated, 'utf-8');
        } else {
          await appendFile(rcFile, exportLine);
        }
      } else {
        await writeFile(rcFile, exportLine);
      }
      log.success(`  API key saved to ${rcFile}`);
      log.warn('  Run `source ' + rcFile + '` or restart your terminal.');
    } catch {
      log.warn('  Could not save to shell profile. Set it manually:');
      console.log(`  export ANTHROPIC_API_KEY="${apiKey}"`);
    }
  }

  console.log();
  log.success('  Setup complete! Now run:');
  log.info('  hiregraph init --name "Your Name" --email "you@email.com" --role builder');
  console.log();
}
