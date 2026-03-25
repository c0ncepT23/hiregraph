export interface RawLeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  categories: { location?: string; department?: string; team?: string };
  description: string;
  descriptionPlain: string;
  lists: Array<{ text: string; content: string }>;
  createdAt: number;
}

export async function fetchLeverPostings(company: string): Promise<RawLeverPosting[]> {
  const url = `https://api.lever.co/v0/postings/${company}`;

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('Rate limited');
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json() as RawLeverPosting[];
  return Array.isArray(data) ? data : [];
}
