import { describe, it, expect } from 'vitest';
import { mergeIntoGraph, buildProjectEntry } from './skill-graph.js';
import { createEmptySkillGraph } from './schema.js';
import type { BuilderIdentity, ScanResult } from './schema.js';

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

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    project_name: 'test-project',
    project_path: '/tmp/test-project',
    file_discovery: {
      total_files: 10,
      total_loc: 1000,
      languages: { TypeScript: { files: 8, loc: 800 }, JSON: { files: 2, loc: 200 } },
      config_files: ['tsconfig.json'],
      primary_language: 'TypeScript',
    },
    dependencies: {
      ecosystem: 'node',
      dependencies: ['express'],
      dev_dependencies: ['vitest'],
      frameworks: ['Express'],
      has_lockfile: true,
    },
    ast_analysis: {
      functions: 20, classes: 2, interfaces: 5, components: 0,
      hooks: 0, services: 1, max_nesting_depth: 3, avg_params_per_function: 1.5,
      imports_used: [], advanced_features: [],
    },
    git_forensics: {
      is_git_repo: true, commits: 50, active_days: 30, contributors: 1,
      commits_per_active_day: 1.7, active_days_per_week: 4,
      first_commit: '2025-01-01', last_commit: '2025-03-01',
      conventional_commit_ratio: 0.8, branches: 3, primary_author: 'test',
    },
    quality_signals: {
      test_ratio: 0.15, complexity_avg: 2.5, type_safety: true,
      type_safety_details: 'TypeScript strict', secrets_clean: true,
      secrets_found: 0, lint_tools: ['eslint'],
    },
    architecture_patterns: {
      patterns: { 'Service Layer': 0.8 },
      primary_pattern: 'Service Layer',
    },
    llm_classification: {
      domain: 'web-api',
      builder_profile: 'backend',
      role_signals: ['api-design'],
      is_end_to_end: false,
      description: 'A backend API project',
    },
    ...overrides,
  };
}

describe('buildProjectEntry', () => {
  it('creates a project entry from scan result', () => {
    const scan = makeScanResult();
    const entry = buildProjectEntry(scan);
    expect(entry.name).toBe('test-project');
    expect(entry.path).toBe('/tmp/test-project');
    expect(entry.domain).toBe('web-api');
    expect(entry.stack).toContain('Express');
    expect(entry.commits).toBe(50);
  });
});

describe('mergeIntoGraph', () => {
  it('adds a new project to the graph', () => {
    const graph = createEmptySkillGraph(mockIdentity);
    const scan = makeScanResult();
    const project = buildProjectEntry(scan);

    const updated = mergeIntoGraph(graph, project, scan.llm_classification);
    expect(updated.projects).toHaveLength(1);
    expect(updated.projects[0].name).toBe('test-project');
  });

  it('merges tech stack from project languages', () => {
    const graph = createEmptySkillGraph(mockIdentity);
    const project = buildProjectEntry(makeScanResult());

    const updated = mergeIntoGraph(graph, project, null);
    expect(updated.tech_stack).toHaveProperty('TypeScript');
    expect(updated.tech_stack['TypeScript'].loc).toBe(800);
    expect(updated.tech_stack['TypeScript'].source).toBe('code-verified');
  });

  it('updates existing project instead of duplicating', () => {
    const graph = createEmptySkillGraph(mockIdentity);
    const project1 = buildProjectEntry(makeScanResult());
    mergeIntoGraph(graph, project1, null);

    const project2 = buildProjectEntry(makeScanResult({ project_name: 'updated-name' }));
    const updated = mergeIntoGraph(graph, project2, null);
    expect(updated.projects).toHaveLength(1);
    expect(updated.projects[0].name).toBe('updated-name');
  });

  it('merges architecture patterns', () => {
    const graph = createEmptySkillGraph(mockIdentity);
    const scan = makeScanResult();
    const project = buildProjectEntry(scan);

    const updated = mergeIntoGraph(graph, project, scan.llm_classification);
    expect(updated.architecture).toHaveProperty('Service Layer');
  });

  it('updates builder profile from classification', () => {
    const graph = createEmptySkillGraph(mockIdentity);
    const scan = makeScanResult();
    const project = buildProjectEntry(scan);

    const updated = mergeIntoGraph(graph, project, scan.llm_classification);
    expect(updated.builder_profile.role_signals).toContain('api-design');
  });
});
