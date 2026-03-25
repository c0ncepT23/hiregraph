import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function isApiKeyConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient(): Anthropic {
  if (!client) {
    // ANTHROPIC_API_KEY is auto-detected by the SDK from process.env.
    // Claude Code / Cursor users already have this set — zero config needed.
    client = new Anthropic();
  }
  return client;
}

export async function callHaiku(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const block = message.content[0];
  if (block.type === 'text') {
    return block.text;
  }
  throw new Error('Unexpected response format from Haiku');
}

export async function callHaikuJson<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1024,
): Promise<T> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response format from Haiku');

  const cleaned = block.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned) as T;
}
