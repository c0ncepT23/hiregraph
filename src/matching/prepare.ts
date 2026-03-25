import { loadGraph } from '../graph/skill-graph.js';
import { loadJson, loadSubJson, saveSubJson } from '../storage/store.js';
import { fetchAllJobs } from '../ats/fetcher.js';
import { buildVocabulary, buildSkillVector, buildJobVectorFromRaw, buildAllDocumentsFromRaw } from './vectorizer.js';
import { findTopCandidates } from './similarity.js';
import { applyHardFilters, type FilterConfig, type FilterableJob } from './filters.js';
import type { SkillGraph, JobListing, JobsCache, MatchResult, MatchRun } from '../graph/schema.js';
import * as spinner from '../utils/spinner.js';

export interface PreparedCandidate {
  job_id: string;
  job_title: string;
  company: string;
  company_slug: string;
  url: string;
  location: string;
  source: 'greenhouse' | 'lever' | 'ashby';
  description_snippet: string;
  similarity: number;
}

export interface PrepareResult {
  candidates: PreparedCandidate[];
  skill_summary: string;
  total_jobs: number;
  after_filter: number;
}

export async function prepareCandidates(topK = 50, refresh = false): Promise<PrepareResult> {
  const graph = await loadGraph();
  if (!graph || graph.projects.length === 0) {
    throw new Error('No skill graph found. Run `hiregraph scan <path>` first.');
  }

  const identity = graph.builder_identity;
  const config = await loadJson<{ excluded_companies?: string[] }>('config.json');
  const filterConfig: FilterConfig = {
    excluded_companies: config?.excluded_companies || [],
    remote_preference: identity.remote_preference,
    min_compensation: identity.min_compensation,
  };

  // Fetch jobs
  const fetchResult = await fetchAllJobs({ refresh });
  if (fetchResult.jobs.length === 0) {
    throw new Error('No jobs found. Run `hiregraph jobs` first.');
  }

  // Build a simple filter (without parsed requirements, use dummy requirements for filter)
  // Only filter by excluded companies since we don't have parsed remote_policy
  const excluded = new Set((filterConfig.excluded_companies || []).map(s => s.toLowerCase()));
  const filtered = fetchResult.jobs.filter(j => !excluded.has(j.company_slug.toLowerCase()));

  // TF-IDF on raw descriptions
  spinner.start(`Vectorizing ${filtered.length} jobs...`);
  const docs = buildAllDocumentsFromRaw(graph, filtered);
  const vocab = buildVocabulary(docs);

  const skillVector = buildSkillVector(graph, vocab);
  const jobVectors = new Map<string, ReturnType<typeof buildJobVectorFromRaw>>();
  for (const job of filtered) {
    jobVectors.set(job.id, buildJobVectorFromRaw(job.description_raw, job.title, vocab));
  }
  spinner.succeed(`Vectorized ${filtered.length} jobs`);

  // Pre-filter top K
  spinner.start(`Finding top ${topK} candidates...`);
  const candidates = findTopCandidates(skillVector, jobVectors, topK);
  spinner.succeed(`Top ${candidates.length} candidates selected`);

  // Build output
  const jobMap = new Map(fetchResult.jobs.map(j => [j.id, j]));
  const prepared: PreparedCandidate[] = candidates.map(c => {
    const job = jobMap.get(c.jobId)!;
    return {
      job_id: job.id,
      job_title: job.title,
      company: job.company,
      company_slug: job.company_slug,
      url: job.url,
      location: job.location,
      source: job.source,
      description_snippet: job.description_raw.slice(0, 500),
      similarity: Math.round(c.similarity * 1000) / 1000,
    };
  });

  // Build skill summary for Claude Code to use
  const skillSummary = buildSkillSummary(graph);

  return {
    candidates: prepared,
    skill_summary: skillSummary,
    total_jobs: fetchResult.jobs.length,
    after_filter: filtered.length,
  };
}

export async function saveMatchResults(
  results: MatchResult[],
  totalJobs: number,
): Promise<MatchRun> {
  results.sort((a, b) => b.score - a.score);
  const strong = results.filter(m => m.score >= 8);
  const suggested = results.filter(m => m.score >= 6 && m.score < 8);

  const today = new Date().toISOString().slice(0, 10);
  const matchRun: MatchRun = {
    date: today,
    total_jobs_fetched: totalJobs,
    total_jobs_parsed: 0,
    total_candidates_evaluated: results.length,
    strong_matches: strong,
    suggested_matches: suggested,
    run_at: new Date().toISOString(),
    cost_estimate: { jobs_parsed: 0, pairs_evaluated: 0, estimated_usd: 0 },
  };

  await saveSubJson('matches', `${today}.json`, matchRun);
  return matchRun;
}

function buildSkillSummary(graph: SkillGraph): string {
  const lines: string[] = [];

  if (graph.builder_identity.name) {
    lines.push(`Name: ${graph.builder_identity.name} (${graph.builder_identity.primary_role})`);
  }

  const skills = Object.entries(graph.tech_stack)
    .sort((a, b) => b[1].proficiency - a[1].proficiency)
    .slice(0, 15);
  if (skills.length > 0) {
    lines.push('Tech Stack:');
    for (const [name, data] of skills) {
      lines.push(`  ${name}: ${data.loc.toLocaleString()} LOC, ${data.projects} projects`);
    }
  }

  if (graph.projects.length > 0) {
    lines.push('Projects:');
    for (const proj of graph.projects) {
      lines.push(`  ${proj.name}: ${proj.domain || 'unknown'} — ${proj.stack.slice(0, 5).join(', ')}`);
    }
  }

  const patterns = Object.entries(graph.architecture);
  if (patterns.length > 0) {
    lines.push(`Architecture: ${patterns.map(([n, { confidence }]) => `${n} (${confidence})`).join(', ')}`);
  }

  if (graph.builder_identity.previous_companies.length > 0) {
    lines.push('Work History:');
    for (const w of graph.builder_identity.previous_companies) {
      lines.push(`  ${w.role} @ ${w.company} (${w.start_year}-${w.end_year || 'present'})`);
    }
  }

  return lines.join('\n');
}
