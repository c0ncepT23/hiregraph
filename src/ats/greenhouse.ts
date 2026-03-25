export interface RawGreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  departments: Array<{ name: string }>;
  content: string;
  updated_at: string;
}

export async function fetchGreenhouseJobs(boardToken: string): Promise<RawGreenhouseJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('Rate limited');
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json() as { jobs: RawGreenhouseJob[] };
  return data.jobs || [];
}
