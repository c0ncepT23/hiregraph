import { loadRegistry, excludeCompanies, filterByAts } from './registry.js';
import { fetchGreenhouseJobs } from './greenhouse.js';
import { fetchLeverPostings } from './lever.js';
import { fetchAshbyJobs } from './ashby.js';
import { normalizeGreenhouseJob, normalizeLeverPosting, normalizeAshbyJob } from './normalizer.js';
import { loadSubJson, saveSubJson } from '../storage/store.js';
import { loadJson } from '../storage/store.js';
import type { CompanyRegistryEntry, JobListing, JobsCache } from '../graph/schema.js';
import * as spinner from '../utils/spinner.js';
import * as log from '../utils/logger.js';

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;

export interface FetchResult {
  jobs: JobListing[];
  errors: Array<{ company: string; error: string }>;
  stats: { greenhouse: number; lever: number; ashby: number; total: number; failed: number };
}

function isCacheStale(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() > CACHE_MAX_AGE_MS;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<JobListing[]>,
  getName: (item: T) => string,
  errors: Array<{ company: string; error: string }>,
): Promise<JobListing[]> {
  const allJobs: JobListing[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(item => fn(item)));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        allJobs.push(...result.value);
      } else {
        errors.push({ company: getName(batch[j]), error: result.reason?.message || 'Unknown error' });
      }
    }

    if (i + BATCH_SIZE < items.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  return allJobs;
}

export async function fetchAllJobs(options?: { refresh?: boolean; ats?: string }): Promise<FetchResult> {
  const config = await loadJson<{ excluded_companies?: string[] }>('config.json');
  let companies = await loadRegistry();
  companies = excludeCompanies(companies, config?.excluded_companies || []);

  if (options?.ats) {
    companies = filterByAts(companies, options.ats);
  }

  const errors: Array<{ company: string; error: string }> = [];
  const allJobs: JobListing[] = [];
  const stats = { greenhouse: 0, lever: 0, ashby: 0, total: 0, failed: 0 };

  // Greenhouse
  const ghCompanies = companies.filter(c => c.ats === 'greenhouse');
  if (ghCompanies.length > 0) {
    const cached = await loadSubJson<JobsCache>('jobs', 'greenhouse.json');
    if (cached && !isCacheStale(cached.fetched_at) && !options?.refresh) {
      allJobs.push(...cached.jobs);
      stats.greenhouse = cached.total_jobs;
    } else {
      spinner.start(`Fetching from Greenhouse (${ghCompanies.length} companies)...`);
      const ghJobs = await fetchInBatches(
        ghCompanies,
        async (c) => {
          const raw = await fetchGreenhouseJobs(c.board_token);
          return raw.map(j => normalizeGreenhouseJob(j, c));
        },
        c => c.name,
        errors,
      );
      allJobs.push(...ghJobs);
      stats.greenhouse = ghJobs.length;
      spinner.succeed(`Greenhouse: ${ghJobs.length} jobs from ${ghCompanies.length} companies`);
      await saveSubJson('jobs', 'greenhouse.json', {
        source: 'greenhouse', fetched_at: new Date().toISOString(),
        companies_fetched: ghCompanies.length, total_jobs: ghJobs.length, jobs: ghJobs,
      } satisfies JobsCache);
    }
  }

  // Lever
  const lvCompanies = companies.filter(c => c.ats === 'lever');
  if (lvCompanies.length > 0) {
    const cached = await loadSubJson<JobsCache>('jobs', 'lever.json');
    if (cached && !isCacheStale(cached.fetched_at) && !options?.refresh) {
      allJobs.push(...cached.jobs);
      stats.lever = cached.total_jobs;
    } else {
      spinner.start(`Fetching from Lever (${lvCompanies.length} companies)...`);
      const lvJobs = await fetchInBatches(
        lvCompanies,
        async (c) => {
          const raw = await fetchLeverPostings(c.board_token);
          return raw.map(j => normalizeLeverPosting(j, c));
        },
        c => c.name,
        errors,
      );
      allJobs.push(...lvJobs);
      stats.lever = lvJobs.length;
      spinner.succeed(`Lever: ${lvJobs.length} jobs from ${lvCompanies.length} companies`);
      await saveSubJson('jobs', 'lever.json', {
        source: 'lever', fetched_at: new Date().toISOString(),
        companies_fetched: lvCompanies.length, total_jobs: lvJobs.length, jobs: lvJobs,
      } satisfies JobsCache);
    }
  }

  // Ashby
  const abCompanies = companies.filter(c => c.ats === 'ashby');
  if (abCompanies.length > 0) {
    const cached = await loadSubJson<JobsCache>('jobs', 'ashby.json');
    if (cached && !isCacheStale(cached.fetched_at) && !options?.refresh) {
      allJobs.push(...cached.jobs);
      stats.ashby = cached.total_jobs;
    } else {
      spinner.start(`Fetching from Ashby (${abCompanies.length} companies)...`);
      const abJobs = await fetchInBatches(
        abCompanies,
        async (c) => {
          const raw = await fetchAshbyJobs(c.board_token);
          return raw.map(j => normalizeAshbyJob(j, c));
        },
        c => c.name,
        errors,
      );
      allJobs.push(...abJobs);
      stats.ashby = abJobs.length;
      spinner.succeed(`Ashby: ${abJobs.length} jobs from ${abCompanies.length} companies`);
      await saveSubJson('jobs', 'ashby.json', {
        source: 'ashby', fetched_at: new Date().toISOString(),
        companies_fetched: abCompanies.length, total_jobs: abJobs.length, jobs: abJobs,
      } satisfies JobsCache);
    }
  }

  stats.total = allJobs.length;
  stats.failed = errors.length;

  return { jobs: allJobs, errors, stats };
}
