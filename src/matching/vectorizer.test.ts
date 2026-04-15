import { describe, it, expect } from 'vitest';
import { buildVocabulary, cosineSimilarity, buildSkillVector, buildJobVector } from './vectorizer.js';
import { createEmptySkillGraph } from '../graph/schema.js';
import type { BuilderIdentity, ParsedJobRequirements } from '../graph/schema.js';

describe('cosineSimilarity', () => {
  it('returns 0 for empty vectors', () => {
    const a = { terms: new Map(), magnitude: 0 };
    const b = { terms: new Map(), magnitude: 0 };
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 1 for identical vectors', () => {
    const terms = new Map([[0, 1], [1, 2]]);
    const mag = Math.sqrt(1 + 4);
    const a = { terms, magnitude: mag };
    const b = { terms: new Map(terms), magnitude: mag };
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = { terms: new Map([[0, 1]]), magnitude: 1 };
    const b = { terms: new Map([[1, 1]]), magnitude: 1 };
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe('buildVocabulary', () => {
  it('builds vocabulary from document tokens', () => {
    const docs = [
      ['typescript', 'react', 'node'],
      ['typescript', 'python', 'react'],
      ['typescript', 'go', 'react'],
    ];
    const vocab = buildVocabulary(docs);
    expect(vocab.termToIndex.has('typescript')).toBe(true);
    expect(vocab.termToIndex.has('react')).toBe(true);
    expect(vocab.size).toBeGreaterThan(0);
  });

  it('filters terms that appear in fewer than 2 docs', () => {
    const docs = [
      ['typescript', 'react'],
      ['typescript', 'python'],
      ['typescript', 'go'],
    ];
    const vocab = buildVocabulary(docs);
    // 'react', 'python', 'go' each appear in only 1 doc -> filtered
    expect(vocab.termToIndex.has('react')).toBe(false);
    expect(vocab.termToIndex.has('typescript')).toBe(true);
  });
});

describe('buildSkillVector + buildJobVector', () => {
  it('produces vectors that can be compared', () => {
    const identity: BuilderIdentity = {
      name: 'Test', email: 'test@test.com', primary_role: 'engineer',
      target_roles: ['backend engineer'], previous_companies: [],
      education: [], links: {}, source: 'manual',
      resume_skills: ['typescript', 'node.js', 'api design'],
    };
    const graph = createEmptySkillGraph(identity);
    graph.tech_stack = {
      TypeScript: { proficiency: 0.7, source: 'code-verified', loc: 5000, projects: 3, advanced_features: [], last_seen: '' },
      'Node.js': { proficiency: 0.5, source: 'code-verified', loc: 3000, projects: 2, advanced_features: [], last_seen: '' },
    };

    const reqs: ParsedJobRequirements = {
      job_id: 'test', must_have_skills: ['TypeScript', 'Node.js'],
      nice_to_have_skills: ['React'], seniority_level: 'senior',
      tech_stack: ['TypeScript', 'Node.js'], domain: 'backend',
      remote_policy: 'remote', role_category: 'engineering', parsed_at: '',
    };

    // Need at least 2 docs for vocabulary building
    const docs = [
      ['typescript', 'node.js', 'api', 'design', 'backend', 'engineer'],
      ['typescript', 'node.js', 'react', 'backend', 'senior'],
    ];
    const vocab = buildVocabulary(docs);
    const skillVec = buildSkillVector(graph, vocab);
    const jobVec = buildJobVector(reqs, vocab);

    const sim = cosineSimilarity(skillVec, jobVec);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThanOrEqual(1);
  });
});
