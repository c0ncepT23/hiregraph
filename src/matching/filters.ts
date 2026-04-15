import type { JobListing, ParsedJobRequirements } from '../graph/schema.js';

export interface FilterConfig {
  excluded_companies: string[];
  remote_preference?: string;
  min_compensation?: string;
  primary_role?: string;
  target_roles?: string[];
}

const ROLE_CATEGORY_MAP: Record<string, string[]> = {
  product: ['pm', 'product manager', 'product'],
  engineering: ['engineer', 'engineering', 'developer', 'builder', 'founder'],
  design: ['designer', 'design'],
  data: ['data', 'analyst', 'data science'],
  marketing: ['marketing', 'growth'],
  operations: ['operations', 'ops'],
};

function detectUserRoleCategory(primaryRole: string): string {
  const lower = primaryRole.toLowerCase();
  for (const [category, keywords] of Object.entries(ROLE_CATEGORY_MAP)) {
    if (keywords.some(k => lower.includes(k))) return category;
  }
  return 'engineering';
}

export interface FilterableJob {
  job: JobListing;
  requirements: ParsedJobRequirements;
}

export function applyHardFilters(
  jobs: FilterableJob[],
  config: FilterConfig,
): FilterableJob[] {
  const excluded = new Set(config.excluded_companies.map(s => s.toLowerCase()));

  return jobs.filter(({ job, requirements }) => {
    // Excluded companies
    if (excluded.has(job.company_slug.toLowerCase())) return false;

    // Remote preference
    if (config.remote_preference === 'Remote' && requirements.remote_policy === 'onsite') {
      return false;
    }

    // Min compensation
    if (config.min_compensation && requirements.compensation_range?.max) {
      const min = parseCompensation(config.min_compensation);
      if (min > 0 && requirements.compensation_range.max < min) {
        return false;
      }
    }

    // Role category filter
    if (config.primary_role) {
      const userCategory = detectUserRoleCategory(config.primary_role);
      const jobCategory = requirements.role_category || 'engineering';
      if (jobCategory !== 'other' && jobCategory !== userCategory) {
        return false;
      }
    }

    return true;
  });
}

function parseCompensation(value: string): number {
  // Handle various formats: "150000", "150,000", "150k", "$150,000", "35,00,000" (Indian)
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (cleaned.toLowerCase().endsWith('k')) {
    return parseFloat(cleaned) * 1000;
  }
  return parseFloat(cleaned) || 0;
}
