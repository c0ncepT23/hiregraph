/**
 * Send questions to the user via Telegram and wait for their reply.
 * Used in --auto mode when the LLM can't answer confidently and
 * there's no stdin available (e.g., running from Claude Code).
 */

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 120000; // 2 minutes to answer

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

let config: TelegramConfig | null = null;

export function configureTelegram(botToken: string, chatId: string): void {
  config = { botToken, chatId };
}

export function isTelegramConfigured(): boolean {
  return config !== null;
}

/**
 * Send a question to the user via Telegram and wait for their reply.
 * Returns the user's response text, or null if timeout/error.
 */
export async function askViaTelegram(question: string, context?: string): Promise<string | null> {
  if (!config) return null;

  // Get the latest update_id so we only read new messages
  const lastUpdateId = await getLatestUpdateId();

  // Format and send the question
  const message = context
    ? `📋 *Job Application Question*\n\n*Q:* ${escapeMarkdown(question)}\n\n_Context: ${escapeMarkdown(context)}_\n\n_Reply with your answer (or "skip" to leave blank):_`
    : `📋 *Job Application Question*\n\n*Q:* ${escapeMarkdown(question)}\n\n_Reply with your answer (or "skip" to leave blank):_`;

  const sent = await sendMessage(message);
  if (!sent) return null;

  // Poll for reply
  const startTime = Date.now();
  while (Date.now() - startTime < TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const reply = await getReplyAfter(lastUpdateId);
    if (reply) {
      if (reply.toLowerCase().trim() === 'skip') return '';
      return reply.trim();
    }
  }

  // Timeout — notify user
  await sendMessage('⏰ _No reply received. Skipping this question._');
  return null;
}

/**
 * Send a notification (no reply expected).
 */
export async function notifyTelegram(message: string): Promise<void> {
  if (!config) return;
  await sendMessage(message);
}

// === Telegram Bot API helpers ===

async function sendMessage(text: string): Promise<boolean> {
  if (!config) return false;

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getLatestUpdateId(): Promise<number> {
  if (!config) return 0;

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?offset=-1&limit=1`;
    const res = await fetch(url);
    const data = await res.json() as { ok: boolean; result: Array<{ update_id: number }> };
    if (data.ok && data.result.length > 0) {
      return data.result[data.result.length - 1].update_id;
    }
  } catch { /* ignore */ }
  return 0;
}

async function getReplyAfter(afterUpdateId: number): Promise<string | null> {
  if (!config) return null;

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?offset=${afterUpdateId + 1}&limit=10`;
    const res = await fetch(url);
    const data = await res.json() as {
      ok: boolean;
      result: Array<{
        update_id: number;
        message?: { chat: { id: number }; text?: string };
      }>;
    };

    if (!data.ok) return null;

    // Find the first text message from our chat
    for (const update of data.result) {
      if (
        update.message &&
        String(update.message.chat.id) === config!.chatId &&
        update.message.text
      ) {
        return update.message.text;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
