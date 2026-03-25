import type { SkillGraph, ParsedJobRequirements } from '../graph/schema.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'shall', 'not', 'no', 'nor',
  'so', 'if', 'then', 'than', 'that', 'this', 'these', 'those', 'it',
  'its', 'we', 'you', 'he', 'she', 'they', 'our', 'your', 'their',
  'who', 'which', 'what', 'where', 'when', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'very',
  'also', 'just', 'about', 'up', 'out', 'as', 'into', 'through', 'over',
  'after', 'before', 'between', 'under', 'above', 'while', 'during',
  'experience', 'work', 'working', 'ability', 'strong', 'team', 'role',
  'position', 'company', 'using', 'used', 'use', 'years', 'year',
]);

export interface TermVector {
  terms: Map<number, number>; // term index -> weight
  magnitude: number;
}

export interface Vocabulary {
  termToIndex: Map<string, number>;
  idf: Float32Array;
  size: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.#+\-_/]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

export function buildVocabulary(documents: string[][]): Vocabulary {
  // Count document frequency for each term
  const docFreq = new Map<string, number>();
  const allTerms = new Set<string>();

  for (const doc of documents) {
    const seen = new Set<string>();
    for (const term of doc) {
      allTerms.add(term);
      if (!seen.has(term)) {
        seen.add(term);
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }
  }

  // Filter to top 2000 terms by document frequency, excluding very rare terms
  const sorted = [...allTerms]
    .filter(t => (docFreq.get(t) || 0) >= 2)
    .sort((a, b) => (docFreq.get(b) || 0) - (docFreq.get(a) || 0))
    .slice(0, 2000);

  const termToIndex = new Map<string, number>();
  const idf = new Float32Array(sorted.length);
  const N = documents.length;

  for (let i = 0; i < sorted.length; i++) {
    termToIndex.set(sorted[i], i);
    const df = docFreq.get(sorted[i]) || 1;
    idf[i] = Math.log(N / df) + 1; // smoothed IDF
  }

  return { termToIndex, idf, size: sorted.length };
}

function vectorize(tokens: string[], vocab: Vocabulary): TermVector {
  const tf = new Map<number, number>();

  for (const token of tokens) {
    const idx = vocab.termToIndex.get(token);
    if (idx !== undefined) {
      tf.set(idx, (tf.get(idx) || 0) + 1);
    }
  }

  // TF-IDF weighting
  const terms = new Map<number, number>();
  let magnitude = 0;

  for (const [idx, count] of tf) {
    const weight = count * vocab.idf[idx];
    terms.set(idx, weight);
    magnitude += weight * weight;
  }

  magnitude = Math.sqrt(magnitude);
  return { terms, magnitude };
}

export function buildSkillVector(graph: SkillGraph, vocab: Vocabulary): TermVector {
  const tokens: string[] = [];

  // Tech stack with proficiency weighting
  for (const [skill, data] of Object.entries(graph.tech_stack)) {
    const name = skill.toLowerCase();
    const repeat = data.proficiency > 0.5 ? 3 : data.proficiency > 0.3 ? 2 : 1;
    for (let i = 0; i < repeat; i++) {
      tokens.push(...tokenize(name));
    }
  }

  // Architecture patterns
  for (const [pattern] of Object.entries(graph.architecture)) {
    tokens.push(...tokenize(pattern));
  }

  // Role signals
  for (const signal of graph.builder_profile.role_signals) {
    tokens.push(...tokenize(signal));
  }

  // Project domains and stacks
  for (const proj of graph.projects) {
    if (proj.domain) tokens.push(...tokenize(proj.domain));
    for (const s of proj.stack) tokens.push(...tokenize(s));
  }

  return vectorize(tokens, vocab);
}

export function buildJobVector(req: ParsedJobRequirements, vocab: Vocabulary): TermVector {
  const tokens: string[] = [];

  // Must-have skills get 2x weight
  for (const skill of req.must_have_skills) {
    const t = tokenize(skill);
    tokens.push(...t, ...t); // 2x
  }

  // Nice-to-have skills 1x
  for (const skill of req.nice_to_have_skills) {
    tokens.push(...tokenize(skill));
  }

  // Tech stack
  for (const tech of req.tech_stack) {
    tokens.push(...tokenize(tech));
  }

  // Domain
  if (req.domain) tokens.push(...tokenize(req.domain));

  return vectorize(tokens, vocab);
}

export function cosineSimilarity(a: TermVector, b: TermVector): number {
  if (a.magnitude === 0 || b.magnitude === 0) return 0;

  let dotProduct = 0;
  // Iterate over the smaller vector
  const [smaller, larger] = a.terms.size <= b.terms.size ? [a, b] : [b, a];

  for (const [idx, weight] of smaller.terms) {
    const otherWeight = larger.terms.get(idx);
    if (otherWeight !== undefined) {
      dotProduct += weight * otherWeight;
    }
  }

  return dotProduct / (a.magnitude * b.magnitude);
}

export function buildJobVectorFromRaw(description: string, title: string, vocab: Vocabulary): TermVector {
  const tokens = [
    ...tokenize(title),
    ...tokenize(title), // title gets 2x weight
    ...tokenize(description.slice(0, 3000)),
  ];
  return vectorize(tokens, vocab);
}

export function buildAllDocuments(
  graph: SkillGraph,
  requirements: Record<string, ParsedJobRequirements>,
): string[][] {
  const docs: string[][] = [];

  const skillTokens: string[] = [];
  for (const skill of Object.keys(graph.tech_stack)) {
    skillTokens.push(...tokenize(skill));
  }
  for (const proj of graph.projects) {
    for (const s of proj.stack) skillTokens.push(...tokenize(s));
    if (proj.domain) skillTokens.push(...tokenize(proj.domain));
  }
  docs.push(skillTokens);

  for (const req of Object.values(requirements)) {
    const tokens: string[] = [];
    for (const s of req.must_have_skills) tokens.push(...tokenize(s));
    for (const s of req.nice_to_have_skills) tokens.push(...tokenize(s));
    for (const s of req.tech_stack) tokens.push(...tokenize(s));
    if (req.domain) tokens.push(...tokenize(req.domain));
    docs.push(tokens);
  }

  return docs;
}

export function buildAllDocumentsFromRaw(
  graph: SkillGraph,
  jobs: Array<{ id: string; title: string; description_raw: string }>,
): string[][] {
  const docs: string[][] = [];

  const skillTokens: string[] = [];
  for (const skill of Object.keys(graph.tech_stack)) {
    skillTokens.push(...tokenize(skill));
  }
  for (const proj of graph.projects) {
    for (const s of proj.stack) skillTokens.push(...tokenize(s));
    if (proj.domain) skillTokens.push(...tokenize(proj.domain));
  }
  docs.push(skillTokens);

  for (const job of jobs) {
    const tokens = [...tokenize(job.title), ...tokenize(job.description_raw.slice(0, 3000))];
    docs.push(tokens);
  }

  return docs;
}
