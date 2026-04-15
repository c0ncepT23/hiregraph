import chalk from 'chalk';
import * as log from '../utils/logger.js';

const POLL_INTERVAL_MS = 2000;

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    message_id: number;
  };
}

interface DaemonOptions {
  headless?: boolean;
}

interface QueueItem {
  url: string;
  domain: string;
  addedAt: number;
}

export async function daemonCommand(options?: DaemonOptions): Promise<void> {
  log.header('\n  HireGraph Daemon\n');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    log.error('Telegram not configured. Set these env vars:');
    log.info('  TELEGRAM_BOT_TOKEN=your_bot_token');
    log.info('  TELEGRAM_CHAT_ID=your_chat_id');
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    log.error('ANTHROPIC_API_KEY required. Set it with: hiregraph setup');
    return;
  }

  log.success('  Telegram bot connected');
  log.info('  Listening for job links...\n');
  log.dim('  Send a job URL to your Telegram bot to auto-apply');
  log.dim('  Commands: /status, /history, /queue, /stop\n');

  await sendTg(botToken, chatId,
    '🟢 *HireGraph Daemon Started*\n\nSend me a job application URL and I\'ll auto\\-apply\\.\n\nCommands:\n/status \\- Check if daemon is running\n/queue \\- Show pending jobs\n/history \\- Recent applications\n/stop \\- Stop daemon',
    'MarkdownV2',
  );

  let lastUpdateId = await getLastUpdateId(botToken);
  let running = true;

  // Job queue
  const queue: QueueItem[] = [];
  let processing = false;
  let currentJob: string | null = null;

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    running = false;
    log.dim('\n  Shutting down daemon...');
  });

  // Queue processor — runs in background, picks one job at a time
  async function processQueue(): Promise<void> {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0 && running) {
      const item = queue.shift()!;
      currentJob = item.url;

      log.info(`  Processing: ${item.domain} (${queue.length} remaining in queue)`);
      await sendTg(botToken!, chatId!, `⏳ Processing (${queue.length} in queue): ${item.domain}\n${item.url}`);

      try {
        const { autoApplyCommand } = await import('./auto-apply.js');
        await autoApplyCommand(item.url, {
          headless: options?.headless ?? true,
          auto: true,
          dryRun: false,
        });
        await sendTg(botToken!, chatId!, `✅ Applied: ${item.domain}\n${item.url}`);
      } catch (err: any) {
        log.error(`  Failed: ${err.message}`);
        await sendTg(botToken!, chatId!, `❌ Failed: ${item.domain}\n${err.message}`);
      }

      currentJob = null;

      // Brief pause between applications
      if (queue.length > 0) {
        await sleep(3000);
      }
    }

    processing = false;
  }

  while (running) {
    try {
      const updates = await pollUpdates(botToken, lastUpdateId);

      for (const update of updates) {
        lastUpdateId = update.update_id;

        if (!update.message?.text) continue;
        if (String(update.message.chat.id) !== chatId) continue;

        const text = update.message.text.trim();

        // Commands
        if (text === '/status') {
          const status = processing
            ? `🟢 Running — processing: ${currentJob}\n📋 ${queue.length} job(s) in queue`
            : `🟢 Idle — waiting for job links\n📋 Queue empty`;
          await sendTg(botToken, chatId, status);
          continue;
        }

        if (text === '/queue') {
          if (queue.length === 0 && !processing) {
            await sendTg(botToken, chatId, '📋 Queue is empty. Send a job URL to get started.');
          } else {
            const lines: string[] = [];
            if (currentJob) lines.push(`▶️ Processing: ${currentJob}`);
            queue.forEach((item, i) => {
              lines.push(`${i + 1}. ${item.domain} — ${item.url}`);
            });
            await sendTg(botToken, chatId, `📋 *Job Queue:*\n\n${lines.join('\n')}`);
          }
          continue;
        }

        if (text === '/stop') {
          if (queue.length > 0) {
            await sendTg(botToken, chatId, `🔴 Stopping after current job. Dropping ${queue.length} queued job(s).`);
          } else {
            await sendTg(botToken, chatId, '🔴 Daemon stopping. Goodbye!');
          }
          running = false;
          break;
        }

        if (text === '/history') {
          await handleHistory(botToken, chatId);
          continue;
        }

        if (text.startsWith('/')) continue;

        // Extract URLs — could be multiple in one message
        const urls = text.match(/https?:\/\/[^\s]+/g);
        if (urls && urls.length > 0) {
          for (const url of urls) {
            let domain: string;
            try {
              domain = new URL(url).hostname;
            } catch {
              continue;
            }

            queue.push({ url, domain, addedAt: Date.now() });
          }

          if (urls.length === 1) {
            const pos = queue.length;
            if (processing) {
              await sendTg(botToken, chatId, `📥 Queued (${pos} in line): ${urls[0]}`);
            } else {
              await sendTg(botToken, chatId, `📥 Got it — starting now: ${urls[0]}`);
            }
          } else {
            await sendTg(botToken, chatId, `📥 Queued ${urls.length} jobs. ${queue.length} total in queue.`);
          }

          // Kick off processing if not already running
          processQueue().catch(err => {
            log.error(`  Queue processor error: ${err.message}`);
          });
        }
      }
    } catch (err: any) {
      if (!err.message?.includes('SIGINT')) {
        log.dim(`  Poll error: ${err.message}`);
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  log.info('\n  Daemon stopped.\n');
}

async function handleHistory(botToken: string, chatId: string): Promise<void> {
  try {
    const { loadHistory } = await import('../history/tracker.js');
    const history = await loadHistory();
    const recent = history.applications.slice(-5).reverse();

    if (recent.length === 0) {
      await sendTg(botToken, chatId, '📋 No applications yet.');
      return;
    }

    const lines = recent.map(app =>
      `• ${app.company} — ${app.job_title} (${app.status}) ${app.applied_at.slice(0, 10)}`
    );
    await sendTg(botToken, chatId, `📋 *Recent Applications:*\n\n${lines.join('\n')}`);
  } catch {
    await sendTg(botToken, chatId, '📋 No history found.');
  }
}

// === Telegram helpers ===

async function sendTg(botToken: string, chatId: string, text: string, parseMode = 'Markdown'): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    });
  } catch { /* ignore send failures */ }
}

async function getLastUpdateId(botToken: string): Promise<number> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=-1&limit=1`);
    const data = await res.json() as { ok: boolean; result: TelegramUpdate[] };
    if (data.ok && data.result.length > 0) {
      return data.result[data.result.length - 1].update_id;
    }
  } catch { /* ignore */ }
  return 0;
}

async function pollUpdates(botToken: string, lastUpdateId: number): Promise<TelegramUpdate[]> {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastUpdateId + 1}&limit=10&timeout=1`,
  );
  const data = await res.json() as { ok: boolean; result: TelegramUpdate[] };
  return data.ok ? data.result : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
