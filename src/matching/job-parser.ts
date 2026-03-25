import { callHaikuJson, isApiKeyConfigured } from '../llm/client.js';
import { loadSubJson, saveSubJson } from '../storage/store.js';
import type { JobListing, ParsedJobRequirements, ParsedJobsCache } from '../graph/schema.js';
import * as spinner from '../utils/spinner.js';

const SYSTEM_PROMPT = `You extract structured job requirements from job descriptions.
Return JSON only, no markdown fences. Schema:
{
  "must_have_skills": ["string array"],
  "nice_to_have_skills": ["string array"],
  "seniority_level": "junior|mid|senior|staff|principal|lead|manager",
  "tech_stack": ["specific technologies mentioned"],
  "domain": "string (e.g., fintech, dev-tools, e-commerce)",
  "remote_policy": "remote|hybrid|onsite|unknown",
  "compensation_range": { "min": number|null, "max": number|null, "currency": "USD" } | null
}`;

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

export async function parseJobsBatch(
  jobs: JobListing[],
): Promise<Record<string, ParsedJobRequirements>> {
  if (!isApiKeyConfigured()) {
    throw new Error('No API key detected. Run hiregraph inside Claude Code or Cursor.');
  }

  // Load existing cache
  const cached = await loadSubJson<ParsedJobsCache>('jobs', 'parsed.json');
  const requirements: Record<string, ParsedJobRequirements> = cached?.requirements || {};

  // Find unparsed jobs
  const unparsed = jobs.filter(j => !requirements[j.id]);
  if (unparsed.length === 0) return requirements;

  spinner.start(`Parsing ${unparsed.length} new job descriptions...`);
  let parsed = 0;

  for (let i = 0; i < unparsed.length; i += BATCH_SIZE) {
    const batch = unparsed.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(job => parseOneJob(job)),
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        const req = (results[j] as PromiseFulfilledResult<ParsedJobRequirements>).value;
        requirements[batch[j].id] = req;
        parsed++;
      }
    }

    if (i + BATCH_SIZE < unparsed.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  spinner.succeed(`Parsed ${parsed} job descriptions (${Object.keys(requirements).length} total cached)`);

  // Save updated cache
  await saveSubJson('jobs', 'parsed.json', {
    parsed_at: new Date().toISOString(),
    requirements,
  } satisfies ParsedJobsCache);

  return requirements;
}

async function parseOneJob(job: JobListing): Promise<ParsedJobRequirements> {
  const description = job.description_raw.slice(0, 4000); // Limit to ~4K chars

  const result = await callHaikuJson<Omit<ParsedJobRequirements, 'job_id' | 'parsed_at'>>(
    SYSTEM_PROMPT,
    `Job: ${job.title} at ${job.company}\nLocation: ${job.location}\n\n${description}`,
  );

  return {
    job_id: job.id,
    must_have_skills: result.must_have_skills || [],
    nice_to_have_skills: result.nice_to_have_skills || [],
    seniority_level: result.seniority_level || 'mid',
    tech_stack: result.tech_stack || [],
    domain: result.domain || 'unknown',
    remote_policy: result.remote_policy || 'unknown',
    compensation_range: result.compensation_range || undefined,
    parsed_at: new Date().toISOString(),
  };
}
