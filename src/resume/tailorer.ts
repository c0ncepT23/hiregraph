import { callHaikuJson } from '../llm/client.js';
import type { SkillGraph, JobListing, ParsedJobRequirements, MatchResult, ResumeTailoring } from '../graph/schema.js';

const SYSTEM_PROMPT = `You tailor a resume for a specific job. Given the candidate's skill data and target job, produce a tailored resume configuration.

Rules:
- professional_summary: Write 3-4 sentences as if the candidate wrote them. No mention of scores, tools, analysis systems, or automation. Sound natural and specific to this role.
- project_order: Rank the candidate's projects by relevance to this job. Most relevant first. Use exact project names.
- bullet_emphasis: For each project, write 2-4 resume bullet points that best align with the job. Start with action verbs, include metrics where possible (commits, LOC, active days).
- skills_order: List the candidate's tech skills reordered by relevance to this job. Most relevant first. Use exact skill names from the profile.

Return JSON only, no markdown fences. Schema:
{
  "professional_summary": "string",
  "project_order": ["project names"],
  "bullet_emphasis": { "ProjectName": ["bullet1", "bullet2"] },
  "skills_order": ["skill names"]
}`;

export async function tailorResume(
  graph: SkillGraph,
  job: JobListing,
  requirements: ParsedJobRequirements,
  match: MatchResult,
): Promise<ResumeTailoring> {
  const identity = graph.builder_identity;

  const profileLines = [
    `Name: ${identity.name}`,
    `Role: ${identity.primary_role}`,
  ];

  // Tech stack
  const skills = Object.entries(graph.tech_stack)
    .sort((a, b) => b[1].proficiency - a[1].proficiency)
    .slice(0, 15);
  if (skills.length > 0) {
    profileLines.push('Skills (code-verified):');
    for (const [name, data] of skills) {
      profileLines.push(`  ${name}: ${data.loc.toLocaleString()} LOC, ${data.projects} projects`);
    }
  }

  // Projects
  if (graph.projects.length > 0) {
    profileLines.push('Projects:');
    for (const proj of graph.projects) {
      profileLines.push(`  ${proj.name}: ${proj.domain} — ${proj.stack.slice(0, 5).join(', ')} — ${proj.commits} commits, ${proj.active_days} active days`);
      if (proj.description) profileLines.push(`    ${proj.description}`);
    }
  }

  // Work history
  if (identity.previous_companies.length > 0) {
    profileLines.push('Work History:');
    for (const w of identity.previous_companies) {
      profileLines.push(`  ${w.role} @ ${w.company} (${w.start_year}-${w.end_year || 'present'})`);
    }
  }

  const jobLines = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Must have: ${requirements.must_have_skills.join(', ')}`,
    `Nice to have: ${requirements.nice_to_have_skills.join(', ')}`,
    `Tech stack: ${requirements.tech_stack.join(', ')}`,
    `Domain: ${requirements.domain}`,
    `Match strengths: ${match.strengths.join(', ')}`,
  ];

  const prompt = `CANDIDATE PROFILE:\n${profileLines.join('\n')}\n\nTARGET JOB:\n${jobLines.join('\n')}`;

  const result = await callHaikuJson<{
    professional_summary: string;
    project_order: string[];
    bullet_emphasis: Record<string, string[]>;
    skills_order: string[];
  }>(SYSTEM_PROMPT, prompt, 2048);

  return {
    job_id: job.id,
    professional_summary: result.professional_summary || '',
    project_order: result.project_order || graph.projects.map(p => p.name),
    bullet_emphasis: result.bullet_emphasis || {},
    skills_order: result.skills_order || Object.keys(graph.tech_stack),
    generated_at: new Date().toISOString(),
  };
}
