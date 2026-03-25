import { readFile } from 'fs/promises';
import { extname } from 'path';
import { callHaiku, isApiKeyConfigured } from '../llm/client.js';
import type { BuilderIdentity, WorkHistory, Education } from '../graph/schema.js';

const SYSTEM_PROMPT = `You extract structured data from resume text.
Return JSON only, no markdown fences. Schema:
{
  "name": "string",
  "email": "string",
  "phone": "string or null",
  "links": { "github": "url", "linkedin": "url", "portfolio": "url" },
  "work_history": [{ "company": "string", "role": "string", "start_year": number, "end_year": number|null }],
  "skills": ["string array"],
  "education": [{ "institution": "string", "degree": "string", "field": "string", "year": number }]
}`;

export interface ParsedResume {
  name: string;
  email: string;
  phone?: string;
  links: Record<string, string>;
  work_history: WorkHistory[];
  skills: string[];
  education: Education[];
}

export async function parseResume(filePath: string): Promise<ParsedResume> {
  const ext = extname(filePath).toLowerCase();
  let text: string;

  if (ext === '.pdf') {
    // Dynamic import for pdf-parse
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = await readFile(filePath);
    const data = await pdfParse(buffer);
    text = data.text;
  } else if (ext === '.txt' || ext === '.md') {
    text = await readFile(filePath, 'utf-8');
  } else {
    throw new Error(`Unsupported resume format: ${ext}. Supported: .pdf, .txt, .md`);
  }

  if (!isApiKeyConfigured()) {
    throw new Error('ANTHROPIC_API_KEY not set. Set it in your environment variables.');
  }

  const response = await callHaiku(SYSTEM_PROMPT, `Extract structured data from this resume:\n\n${text}`);
  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  return {
    name: parsed.name || '',
    email: parsed.email || '',
    phone: parsed.phone || undefined,
    links: parsed.links || {},
    work_history: (parsed.work_history || []).map((w: any) => ({
      company: w.company || '',
      role: w.role || '',
      start_year: w.start_year || 0,
      end_year: w.end_year || undefined,
    })),
    skills: parsed.skills || [],
    education: (parsed.education || []).map((e: any) => ({
      institution: e.institution || '',
      degree: e.degree || '',
      field: e.field || '',
      year: e.year || 0,
    })),
  };
}

export function resumeToIdentity(parsed: ParsedResume, role: string, targetRoles: string[], remotePref: string, minComp: string): BuilderIdentity {
  return {
    name: parsed.name,
    email: parsed.email,
    phone: parsed.phone,
    primary_role: role,
    target_roles: targetRoles,
    remote_preference: remotePref,
    min_compensation: minComp,
    previous_companies: parsed.work_history,
    education: parsed.education,
    links: parsed.links,
    source: 'resume-upload',
  };
}
