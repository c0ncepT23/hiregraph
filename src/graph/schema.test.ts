import { describe, it, expect } from 'vitest';
import { createEmptySkillGraph } from './schema.js';
import type { BuilderIdentity } from './schema.js';

const mockIdentity: BuilderIdentity = {
  name: 'Test User',
  email: 'test@example.com',
  primary_role: 'engineer',
  target_roles: ['Full-Stack Engineer'],
  previous_companies: [],
  education: [],
  links: {},
  source: 'manual',
};

describe('createEmptySkillGraph', () => {
  it('creates a graph with the given identity', () => {
    const graph = createEmptySkillGraph(mockIdentity);
    expect(graph.builder_identity.name).toBe('Test User');
    expect(graph.builder_identity.email).toBe('test@example.com');
  });

  it('initializes empty collections', () => {
    const graph = createEmptySkillGraph(mockIdentity);
    expect(graph.projects).toEqual([]);
    expect(graph.tech_stack).toEqual({});
    expect(graph.architecture).toEqual({});
  });

  it('sets default quality metrics', () => {
    const graph = createEmptySkillGraph(mockIdentity);
    expect(graph.quality.test_ratio).toBe(0);
    expect(graph.quality.secrets_clean).toBe(true);
  });

  it('sets a valid ISO timestamp', () => {
    const graph = createEmptySkillGraph(mockIdentity);
    expect(() => new Date(graph.last_updated)).not.toThrow();
    expect(new Date(graph.last_updated).getFullYear()).toBeGreaterThanOrEqual(2026);
  });
});
