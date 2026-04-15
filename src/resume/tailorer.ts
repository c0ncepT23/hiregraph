import { callHaikuJson } from '../llm/client.js';
import type { SkillGraph, JobListing, ParsedJobRequirements, MatchResult, ResumeTailoring } from '../graph/schema.js';

const SYSTEM_PROMPT = `You tailor a resume for a specific job. Given the candidate's full professional profile and target job, produce a tailored resume configuration.

Rules:
- professional_summary: Write 3-4 sentences as if the candidate wrote them. Reflect their career narrative and professional identity — NOT just their code. No mention of scores, LOC, commits, or analysis tools. Reference their relevant work experience, domain expertise, and what they bring to this specific role. Sound natural and confident.
- project_order: Rank the candidate's projects by relevance to this job. Most relevant first. Use exact project names.
- bullet_emphasis: For each project, write 2-4 resume bullet points highlighting impact, outcomes, and relevance to the job. Use action verbs and include real achievements. Do NOT use raw code metrics like commits, LOC, or active days as bullet points.
- skills_order: List the candidate's tech skills reordered by relevance to this job. Most relevant first. Use exact skill names from the profile.
- work_bullet_emphasis: For each work history entry, select the 2-4 most relevant bullets from their resume that best align with this job. Use exact company names as keys.
- For candidates with professional work history, the work experience IS the core of the resume. The summary should reflect their career, not just side projects.

Return JSON only, no markdown fences. Schema:
{
  "professional_summary": "string",
  "project_order": ["project names"],
  "bullet_emphasis": { "ProjectName": ["bullet1", "bullet2"] },
  "skills_order": ["skill names"],
  "work_bullet_emphasis": { "CompanyName": ["most relevant bullet1", "most relevant bullet2"] }
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

  // Target roles
  if (identity.target_roles?.length > 0) {
    profileLines.push(`Target roles: ${identity.target_roles.join(', ')}`);
  }

  // Professional skills from resume
  if (identity.resume_skills && identity.resume_skills.length > 0) {
    profileLines.push(`Professional skills: ${identity.resume_skills.join(', ')}`);
  }

  // Tech stack
  const skills = Object.entries(graph.tech_stack)
    .sort((a, b) => b[1].proficiency - a[1].proficiency)
    .slice(0, 15);
  if (skills.length > 0) {
    profileLines.push('Tech skills (code-verified):');
    for (const [name, data] of skills) {
      profileLines.push(`  ${name}: ${data.projects} projects`);
    }
  }

  // Work history with bullets — this is the core of the professional identity
  if (identity.previous_companies.length > 0) {
    profileLines.push('Work History:');
    for (const w of identity.previous_companies) {
      profileLines.push(`  ${w.role} @ ${w.company} (${w.start_year}-${w.end_year || 'present'})`);
      if (w.bullets?.length) {
        for (const b of w.bullets) {
          profileLines.push(`    - ${b}`);
        }
      }
    }
  }

  // Projects
  if (graph.projects.length > 0) {
    profileLines.push('Projects:');
    for (const proj of graph.projects) {
      profileLines.push(`  ${proj.name}: ${proj.domain} — ${proj.stack.slice(0, 5).join(', ')}`);
      if (proj.description) profileLines.push(`    ${proj.description}`);
    }
  }

  // Education
  if (identity.education?.length > 0) {
    profileLines.push('Education:');
    for (const e of identity.education) {
      profileLines.push(`  ${e.degree} in ${e.field}, ${e.institution} (${e.year})`);
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
    work_bullet_emphasis?: Record<string, string[]>;
  }>(SYSTEM_PROMPT, prompt, 4096);

  // If LLM selected work bullets, apply them back to identity for PDF rendering
  if (result.work_bullet_emphasis) {
    for (const w of identity.previous_companies) {
      const selected = result.work_bullet_emphasis[w.company];
      if (selected?.length) {
        w.bullets = selected;
      }
    }
  }

  return {
    job_id: job.id,
    professional_summary: result.professional_summary || '',
    project_order: result.project_order || graph.projects.map(p => p.name),
    bullet_emphasis: result.bullet_emphasis || {},
    skills_order: result.skills_order || Object.keys(graph.tech_stack),
    generated_at: new Date().toISOString(),
  };
}
