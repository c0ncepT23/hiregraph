import { callHaikuJson, isApiKeyConfigured } from '../llm/client.js';
import type { SkillGraph, MatchResult, JobListing, ParsedJobRequirements } from '../graph/schema.js';
import * as spinner from '../utils/spinner.js';

const SYSTEM_PROMPT = `You evaluate job-candidate match quality. Given a candidate's verified skill profile and a job's requirements, score the match.

Rules:
- code-verified skills are confirmed facts. Weight heavily.
- self-reported skills are unverified claims. Weight lower.
- Proficiency scores: 0.8+ is strong, 0.5+ is moderate, below 0.3 is beginner.
- For 'builder' profiles, value end-to-end ownership over single-area depth.
- Be strict. 7/10 = genuinely strong match. 8+ = exceptional fit.

Return JSON only, no markdown fences. Schema:
{
  "score": number (1-10),
  "confidence": number (0.0-1.0),
  "reasoning": "2-3 sentences explaining the match",
  "strengths": ["key matching strengths"],
  "gaps": ["notable gaps or missing skills"]
}`;

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1500;

interface EvalInput {
  job: JobListing;
  requirements: ParsedJobRequirements;
}

export async function evaluateMatchesBatch(
  candidates: EvalInput[],
  graph: SkillGraph,
): Promise<MatchResult[]> {
  if (!isApiKeyConfigured()) {
    throw new Error('No API key detected. Run hiregraph inside Claude Code or Cursor.');
  }

  const skillSummary = buildSkillSummary(graph);
  const results: MatchResult[] = [];

  spinner.start(`Evaluating ${candidates.length} matches with LLM...`);

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(({ job, requirements }) => evaluateOne(skillSummary, job, requirements)),
    );

    for (let j = 0; j < batchResults.length; j++) {
      if (batchResults[j].status === 'fulfilled') {
        results.push((batchResults[j] as PromiseFulfilledResult<MatchResult>).value);
      }
    }

    if (i + BATCH_SIZE < candidates.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  spinner.succeed(`Evaluated ${results.length} matches`);
  return results;
}

async function evaluateOne(
  skillSummary: string,
  job: JobListing,
  requirements: ParsedJobRequirements,
): Promise<MatchResult> {
  const jobSummary = buildJobSummary(job, requirements);

  const prompt = `CANDIDATE PROFILE:\n${skillSummary}\n\nJOB:\n${jobSummary}`;

  const result = await callHaikuJson<{
    score: number;
    confidence: number;
    reasoning: string;
    strengths: string[];
    gaps: string[];
  }>(SYSTEM_PROMPT, prompt, 2048);

  const score = Math.min(10, Math.max(1, result.score || 1));
  const tier = score >= 8 ? 'strong' : score >= 6 ? 'suggested' : 'filtered';

  return {
    job_id: job.id,
    job_title: job.title,
    company: job.company,
    company_slug: job.company_slug,
    url: job.url,
    score,
    confidence: result.confidence || 0.5,
    tier,
    reasoning: result.reasoning || '',
    strengths: result.strengths || [],
    gaps: result.gaps || [],
    matched_at: new Date().toISOString(),
  };
}

function buildSkillSummary(graph: SkillGraph): string {
  const lines: string[] = [];

  if (graph.builder_identity.name) {
    lines.push(`Name: ${graph.builder_identity.name} (${graph.builder_identity.primary_role})`);
  }

  // Tech stack
  const skills = Object.entries(graph.tech_stack)
    .sort((a, b) => b[1].proficiency - a[1].proficiency)
    .slice(0, 15);

  if (skills.length > 0) {
    lines.push('Tech Stack (code-verified):');
    for (const [name, data] of skills) {
      lines.push(`  ${name}: proficiency ${data.proficiency}, ${data.loc.toLocaleString()} LOC, ${data.projects} projects`);
    }
  }

  // Architecture
  const patterns = Object.entries(graph.architecture)
    .sort((a, b) => b[1].confidence - a[1].confidence);
  if (patterns.length > 0) {
    lines.push(`Architecture: ${patterns.map(([n, { confidence }]) => `${n} (${confidence})`).join(', ')}`);
  }

  // Quality
  lines.push(`Quality: test ratio ${graph.quality.test_ratio}, complexity ${graph.quality.complexity_avg}`);

  // Projects
  if (graph.projects.length > 0) {
    lines.push(`Projects (${graph.projects.length}):`);
    for (const proj of graph.projects.slice(0, 5)) {
      lines.push(`  ${proj.name}: ${proj.domain || 'unknown'} — ${proj.stack.slice(0, 5).join(', ')}`);
    }
  }

  // Builder profile
  if (graph.builder_profile.role_signals.length > 0) {
    lines.push(`Role signals: ${graph.builder_profile.role_signals.join(', ')}`);
  }
  if (graph.builder_profile.is_end_to_end) {
    lines.push('End-to-end builder: yes');
  }

  // Work history
  if (graph.builder_identity.previous_companies.length > 0) {
    lines.push('Work history:');
    for (const w of graph.builder_identity.previous_companies) {
      lines.push(`  ${w.role} @ ${w.company} (${w.start_year}-${w.end_year || 'present'})`);
    }
  }

  return lines.join('\n');
}

function buildJobSummary(job: JobListing, req: ParsedJobRequirements): string {
  const lines = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location}`,
    `Seniority: ${req.seniority_level}`,
    `Domain: ${req.domain}`,
    `Remote: ${req.remote_policy}`,
  ];

  if (req.must_have_skills.length > 0) {
    lines.push(`Must have: ${req.must_have_skills.join(', ')}`);
  }
  if (req.nice_to_have_skills.length > 0) {
    lines.push(`Nice to have: ${req.nice_to_have_skills.join(', ')}`);
  }
  if (req.tech_stack.length > 0) {
    lines.push(`Tech stack: ${req.tech_stack.join(', ')}`);
  }

  return lines.join('\n');
}
