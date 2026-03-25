import { loadGraph } from '../graph/skill-graph.js';
import { loadJson } from '../storage/store.js';
import { fetchAllJobs } from '../ats/fetcher.js';
import { parseJobsBatch } from './job-parser.js';
import { buildVocabulary, buildSkillVector, buildJobVector, buildAllDocuments } from './vectorizer.js';
import { findTopCandidates } from './similarity.js';
import { applyHardFilters, type FilterConfig, type FilterableJob } from './filters.js';
import { evaluateMatchesBatch } from './evaluator.js';
import { saveSubJson } from '../storage/store.js';
import type { SkillGraph, JobListing, ParsedJobRequirements, MatchResult, MatchRun } from '../graph/schema.js';
import * as spinner from '../utils/spinner.js';
import * as log from '../utils/logger.js';

export interface MatchPipelineOptions {
  topK?: number;
  refresh?: boolean;
  maxEval?: number;
}

export async function runMatchPipeline(options?: MatchPipelineOptions): Promise<MatchRun> {
  const topK = options?.topK || 50;
  const maxEval = options?.maxEval || 50;

  // 1. Load skill graph
  const graph = await loadGraph();
  if (!graph || graph.projects.length === 0) {
    throw new Error('No skill graph found. Run `hiregraph scan <path>` first.');
  }

  // 2. Load identity and config for filters
  const identity = graph.builder_identity;
  const config = await loadJson<{ excluded_companies?: string[] }>('config.json');
  const filterConfig: FilterConfig = {
    excluded_companies: config?.excluded_companies || [],
    remote_preference: identity.remote_preference,
    min_compensation: identity.min_compensation,
  };

  // 3. Fetch jobs (from cache or fresh)
  const fetchResult = await fetchAllJobs({ refresh: options?.refresh });
  const allJobs = fetchResult.jobs;

  if (allJobs.length === 0) {
    throw new Error('No jobs found. Run `hiregraph jobs` first.');
  }

  // 4. Parse job descriptions (incremental, cached)
  const requirements = await parseJobsBatch(allJobs);

  // 5. Build filterable job pairs
  const jobMap = new Map<string, JobListing>();
  for (const job of allJobs) jobMap.set(job.id, job);

  const filterableJobs: FilterableJob[] = [];
  for (const [jobId, req] of Object.entries(requirements)) {
    const job = jobMap.get(jobId);
    if (job) filterableJobs.push({ job, requirements: req });
  }

  // 6. Apply hard filters
  spinner.start('Applying filters...');
  const filtered = applyHardFilters(filterableJobs, filterConfig);
  spinner.succeed(`After filtering: ${filtered.length} jobs (from ${filterableJobs.length})`);

  if (filtered.length === 0) {
    throw new Error('All jobs filtered out. Try adjusting your preferences.');
  }

  // 7. Build TF-IDF vocabulary and vectors
  spinner.start('Building vectors for matching...');
  const filteredReqs: Record<string, ParsedJobRequirements> = {};
  for (const f of filtered) filteredReqs[f.job.id] = f.requirements;

  const documents = buildAllDocuments(graph, filteredReqs);
  const vocab = buildVocabulary(documents);

  const skillVector = buildSkillVector(graph, vocab);
  const jobVectors = new Map<string, ReturnType<typeof buildJobVector>>();
  for (const f of filtered) {
    jobVectors.set(f.job.id, buildJobVector(f.requirements, vocab));
  }
  spinner.succeed(`Vectorized ${filtered.length} jobs`);

  // 8. Pre-filter: find top K by vector similarity
  spinner.start(`Pre-filtering top ${topK} candidates...`);
  const candidates = findTopCandidates(skillVector, jobVectors, topK);
  spinner.succeed(`Top ${candidates.length} candidates selected`);

  // 9. LLM evaluation
  const evalInputs = candidates.slice(0, maxEval).map(c => {
    const job = jobMap.get(c.jobId)!;
    const req = requirements[c.jobId];
    return { job, requirements: req };
  });

  const matchResults = await evaluateMatchesBatch(evalInputs, graph);

  // 10. Categorize
  matchResults.sort((a, b) => b.score - a.score);
  const strong = matchResults.filter(m => m.tier === 'strong');
  const suggested = matchResults.filter(m => m.tier === 'suggested');

  // 11. Save match run
  const today = new Date().toISOString().slice(0, 10);
  const matchRun: MatchRun = {
    date: today,
    total_jobs_fetched: allJobs.length,
    total_jobs_parsed: Object.keys(requirements).length,
    total_candidates_evaluated: matchResults.length,
    strong_matches: strong,
    suggested_matches: suggested,
    run_at: new Date().toISOString(),
    cost_estimate: {
      jobs_parsed: Object.keys(requirements).length,
      pairs_evaluated: matchResults.length,
      estimated_usd: Math.round((Object.keys(requirements).length * 0.0003 + matchResults.length * 0.003) * 100) / 100,
    },
  };

  await saveSubJson('matches', `${today}.json`, matchRun);

  return matchRun;
}
