import inquirer from 'inquirer';
import { loadJson, saveJson } from '../storage/store.js';
import { isApiKeyConfigured } from '../llm/client.js';
import * as log from '../utils/logger.js';

interface HireGraphConfig {
  anthropic_api_key?: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
}

export async function setupCommand(options: { key?: string }): Promise<void> {
  log.header('\n  HireGraph Setup\n');

  const existing = await loadJson<HireGraphConfig>('config.json') || {};

  // API Key
  if (options.key) {
    existing.anthropic_api_key = options.key;
  } else if (!existing.anthropic_api_key && !isApiKeyConfigured()) {
    console.log('  HireGraph needs an Anthropic API key for LLM features.');
    console.log('  Get one at: https://console.anthropic.com/settings/keys\n');

    const { key } = await inquirer.prompt([{
      type: 'password',
      name: 'key',
      message: 'Anthropic API key (sk-ant-...):',
      mask: '*',
    }]);

    if (key && key.startsWith('sk-ant-')) {
      existing.anthropic_api_key = key;
    } else if (key) {
      log.error('  Invalid key. Should start with "sk-ant-"');
      return;
    }
  } else if (existing.anthropic_api_key) {
    log.success('  Anthropic API key: configured');
  } else {
    log.success('  Anthropic API key: set via environment');
  }

  // Telegram (optional)
  if (!existing.telegram_bot_token) {
    console.log();
    console.log('  Telegram enables: auto-apply via phone, question confirmations.');
    console.log('  Create a bot at @BotFather, get your chat ID from @userinfobot.\n');

    const { token } = await inquirer.prompt([{
      type: 'input',
      name: 'token',
      message: 'Telegram bot token (or Enter to skip):',
    }]);

    if (token) {
      existing.telegram_bot_token = token;

      const { chatId } = await inquirer.prompt([{
        type: 'input',
        name: 'chatId',
        message: 'Your Telegram chat ID:',
      }]);

      if (chatId) existing.telegram_chat_id = chatId;
    }
  } else {
    log.success('  Telegram: configured');
  }

  await saveJson('config.json', existing);

  // Also set for current process
  if (existing.anthropic_api_key) process.env.ANTHROPIC_API_KEY = existing.anthropic_api_key;
  if (existing.telegram_bot_token) process.env.TELEGRAM_BOT_TOKEN = existing.telegram_bot_token;
  if (existing.telegram_chat_id) process.env.TELEGRAM_CHAT_ID = existing.telegram_chat_id;

  console.log();
  log.success('  Config saved to ~/.hiregraph/config.json');
  log.info('  You never need to set env vars again.\n');
  log.info('  Next: hiregraph init (if not done already)');
  log.info('  Then: hiregraph auto-apply <url>');
  console.log();
}

/**
 * Load config.json and set env vars if not already set.
 * Call this early in every command.
 */
export async function loadConfig(): Promise<void> {
  const config = await loadJson<HireGraphConfig>('config.json');
  if (!config) return;

  if (config.anthropic_api_key && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = config.anthropic_api_key;
  }
  if (config.telegram_bot_token && !process.env.TELEGRAM_BOT_TOKEN) {
    process.env.TELEGRAM_BOT_TOKEN = config.telegram_bot_token;
  }
  if (config.telegram_chat_id && !process.env.TELEGRAM_CHAT_ID) {
    process.env.TELEGRAM_CHAT_ID = config.telegram_chat_id;
  }
}
