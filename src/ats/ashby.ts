export interface RawAshbyJob {
  id: string;
  title: string;
  location: string;
  department: string;
  publishedAt: string;
  descriptionHtml: string;
  jobUrl: string;
}

export async function fetchAshbyJobs(boardId: string): Promise<RawAshbyJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${boardId}`;

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('Rate limited');
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json() as { jobs: RawAshbyJob[] };
  return data.jobs || [];
}
