import { describe, it, expect } from 'vitest';
import { applyHardFilters } from './filters.js';
import type { FilterConfig, FilterableJob } from './filters.js';
import type { JobListing, ParsedJobRequirements } from '../graph/schema.js';

function makeJob(overrides: Partial<JobListing> = {}): JobListing {
  return {
    id: 'gh_123',
    source: 'greenhouse',
    company: 'Acme Corp',
    company_slug: 'acme',
    title: 'Senior Engineer',
    url: 'https://example.com/jobs/123',
    location: 'Remote',
    description_raw: 'Build stuff',
    fetched_at: '2026-01-01',
    ...overrides,
  };
}

function makeReqs(overrides: Partial<ParsedJobRequirements> = {}): ParsedJobRequirements {
  return {
    job_id: 'gh_123',
    must_have_skills: ['TypeScript'],
    nice_to_have_skills: ['React'],
    seniority_level: 'senior',
    tech_stack: ['TypeScript', 'Node.js'],
    domain: 'web',
    remote_policy: 'remote',
    role_category: 'engineering',
    parsed_at: '2026-01-01',
    ...overrides,
  };
}

function makeFilterable(jobOv?: Partial<JobListing>, reqOv?: Partial<ParsedJobRequirements>): FilterableJob {
  return { job: makeJob(jobOv), requirements: makeReqs(reqOv) };
}

describe('applyHardFilters', () => {
  it('passes jobs that match all criteria', () => {
    const jobs = [makeFilterable()];
    const config: FilterConfig = { excluded_companies: [] };
    const result = applyHardFilters(jobs, config);
    expect(result).toHaveLength(1);
  });

  it('filters out excluded companies', () => {
    const jobs = [makeFilterable()];
    const config: FilterConfig = { excluded_companies: ['acme'] };
    const result = applyHardFilters(jobs, config);
    expect(result).toHaveLength(0);
  });

  it('excludes companies case-insensitively', () => {
    const jobs = [makeFilterable()];
    const config: FilterConfig = { excluded_companies: ['ACME'] };
    const result = applyHardFilters(jobs, config);
    expect(result).toHaveLength(0);
  });

  it('filters onsite jobs when user prefers remote', () => {
    const jobs = [makeFilterable({}, { remote_policy: 'onsite' })];
    const config: FilterConfig = { excluded_companies: [], remote_preference: 'Remote' };
    const result = applyHardFilters(jobs, config);
    expect(result).toHaveLength(0);
  });

  it('keeps hybrid jobs when user prefers remote', () => {
    const jobs = [makeFilterable({}, { remote_policy: 'hybrid' })];
    const config: FilterConfig = { excluded_companies: [], remote_preference: 'Remote' };
    const result = applyHardFilters(jobs, config);
    expect(result).toHaveLength(1);
  });

  it('filters by role category', () => {
    const jobs = [makeFilterable({}, { role_category: 'design' })];
    const config: FilterConfig = { excluded_companies: [], primary_role: 'engineer' };
    const result = applyHardFilters(jobs, config);
    expect(result).toHaveLength(0);
  });

  it('keeps "other" role_category regardless of user role', () => {
    const jobs = [makeFilterable({}, { role_category: 'other' })];
    const config: FilterConfig = { excluded_companies: [], primary_role: 'pm' };
    const result = applyHardFilters(jobs, config);
    expect(result).toHaveLength(1);
  });

  it('filters by min compensation', () => {
    const jobs = [makeFilterable({}, { compensation_range: { max: 80000, currency: 'USD' } })];
    const config: FilterConfig = { excluded_companies: [], min_compensation: '100000' };
    const result = applyHardFilters(jobs, config);
    expect(result).toHaveLength(0);
  });
});
