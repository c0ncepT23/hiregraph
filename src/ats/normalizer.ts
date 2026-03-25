import type { CompanyRegistryEntry, JobListing } from '../graph/schema.js';
import type { RawGreenhouseJob } from './greenhouse.js';
import type { RawLeverPosting } from './lever.js';
import type { RawAshbyJob } from './ashby.js';

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeGreenhouseJob(raw: RawGreenhouseJob, company: CompanyRegistryEntry): JobListing {
  return {
    id: `gh_${raw.id}`,
    source: 'greenhouse',
    company: company.name,
    company_slug: company.slug,
    title: raw.title,
    url: raw.absolute_url,
    location: raw.location?.name || 'Unknown',
    department: raw.departments?.[0]?.name,
    description_raw: stripHtml(raw.content || ''),
    updated_at: raw.updated_at,
    fetched_at: new Date().toISOString(),
  };
}

export function normalizeLeverPosting(raw: RawLeverPosting, company: CompanyRegistryEntry): JobListing {
  const descParts = [raw.descriptionPlain || stripHtml(raw.description || '')];
  if (raw.lists) {
    for (const list of raw.lists) {
      descParts.push(`${list.text}\n${stripHtml(list.content)}`);
    }
  }

  return {
    id: `lv_${raw.id}`,
    source: 'lever',
    company: company.name,
    company_slug: company.slug,
    title: raw.text,
    url: raw.hostedUrl,
    location: raw.categories?.location || 'Unknown',
    department: raw.categories?.department || raw.categories?.team,
    description_raw: descParts.join('\n\n'),
    posted_at: raw.createdAt ? new Date(raw.createdAt).toISOString() : undefined,
    fetched_at: new Date().toISOString(),
  };
}

export function normalizeAshbyJob(raw: RawAshbyJob, company: CompanyRegistryEntry): JobListing {
  return {
    id: `ab_${raw.id}`,
    source: 'ashby',
    company: company.name,
    company_slug: company.slug,
    title: raw.title,
    url: raw.jobUrl || `https://jobs.ashbyhq.com/${company.board_token}/${raw.id}`,
    location: raw.location || 'Unknown',
    department: raw.department,
    description_raw: stripHtml(raw.descriptionHtml || ''),
    posted_at: raw.publishedAt,
    fetched_at: new Date().toISOString(),
  };
}
