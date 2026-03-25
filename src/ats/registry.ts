import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { loadJson } from '../storage/store.js';
import type { CompanyRegistryEntry } from '../graph/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadRegistry(): Promise<CompanyRegistryEntry[]> {
  // Load bundled seed data — try multiple paths (dev vs built)
  const candidates = [
    join(__dirname, '..', 'data', 'companies.json'),
    join(__dirname, '..', '..', 'src', 'data', 'companies.json'),
    join(__dirname, 'data', 'companies.json'),
  ];

  let companies: CompanyRegistryEntry[] = [];
  for (const seedPath of candidates) {
    if (existsSync(seedPath)) {
      const raw = await readFile(seedPath, 'utf-8');
      companies = JSON.parse(raw);
      break;
    }
  }

  // Merge user overrides from ~/.hiregraph/companies.json
  const userCompanies = await loadJson<CompanyRegistryEntry[]>('companies.json');
  if (userCompanies) {
    const bySlug = new Map(companies.map(c => [c.slug, c]));
    for (const uc of userCompanies) {
      bySlug.set(uc.slug, uc);
    }
    companies = [...bySlug.values()];
  }

  return companies;
}

export function filterByAts(companies: CompanyRegistryEntry[], ats: string): CompanyRegistryEntry[] {
  return companies.filter(c => c.ats === ats);
}

export function excludeCompanies(companies: CompanyRegistryEntry[], slugs: string[]): CompanyRegistryEntry[] {
  const excluded = new Set(slugs);
  return companies.filter(c => !excluded.has(c.slug));
}
