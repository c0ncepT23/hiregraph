import type { TermVector } from './vectorizer.js';
import { cosineSimilarity } from './vectorizer.js';

export interface CandidateMatch {
  jobId: string;
  similarity: number;
}

export function findTopCandidates(
  skillVector: TermVector,
  jobVectors: Map<string, TermVector>,
  k: number,
): CandidateMatch[] {
  // Brute-force cosine similarity — fast enough for <10K jobs
  const scored: CandidateMatch[] = [];

  for (const [jobId, jobVector] of jobVectors) {
    const sim = cosineSimilarity(skillVector, jobVector);
    if (sim > 0) {
      scored.push({ jobId, similarity: sim });
    }
  }

  // Sort descending by similarity, return top K
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}
