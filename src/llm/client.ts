import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function isApiKeyConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY not set. Set it in your environment or run inside Claude Code.'
      );
    }
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
