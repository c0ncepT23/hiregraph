import { loadJson, saveJson } from '../storage/store.js';
import type {
  SkillGraph, BuilderIdentity, TechSkill, ProjectEntry, ScanResult,
  LlmClassificationResult, QualityMetrics,
} from './schema.js';
import { createEmptySkillGraph } from './schema.js';

const GRAPH_FILE = 'skill-graph.json';

export async function loadGraph(): Promise<SkillGraph | null> {
  return loadJson<SkillGraph>(GRAPH_FILE);
}

export async function saveGraph(graph: SkillGraph): Promise<void> {
  graph.last_updated = new Date().toISOString();
  await saveJson(GRAPH_FILE, graph);
}

export function buildProjectEntry(scan: ScanResult): ProjectEntry {
  return {
    name: scan.project_name,
    path: scan.project_path,
    domain: scan.llm_classification?.domain || 'unknown',
    stack: [
      ...scan.dependencies.frameworks,
      ...Object.keys(scan.file_discovery.languages),
    ],
    languages: scan.file_discovery.languages,
    commits: scan.git_forensics.commits,
    active_days: scan.git_forensics.active_days,
    contributors: scan.git_forensics.contributors,
    test_ratio: scan.quality_signals.test_ratio,
    complexity_avg: scan.quality_signals.complexity_avg,
    patterns: scan.architecture_patterns.patterns,
    description: scan.llm_classification?.description || '',
    scanned_at: new Date().toISOString(),
  };
}

export function mergeIntoGraph(
  graph: SkillGraph,
  project: ProjectEntry,
  classification: LlmClassificationResult | null,
): SkillGraph {
  // Update or add project
  const existingIdx = graph.projects.findIndex(p => p.path === project.path);
  if (existingIdx >= 0) {
    graph.projects[existingIdx] = project;
  } else {
    graph.projects.push(project);
  }

  // Merge tech stack from all projects
  graph.tech_stack = {};
  for (const proj of graph.projects) {
    for (const [lang, stats] of Object.entries(proj.languages)) {
      if (!graph.tech_stack[lang]) {
        graph.tech_stack[lang] = {
          proficiency: 0,
          source: 'code-verified',
          loc: 0,
          projects: 0,
          advanced_features: [],
          last_seen: proj.scanned_at,
        };
      }
      const skill = graph.tech_stack[lang];
      skill.loc += stats.loc;
      skill.projects += 1;
      if (proj.scanned_at > skill.last_seen) {
        skill.last_seen = proj.scanned_at;
      }
    }

    // Add frameworks to tech stack
    for (const fw of proj.stack) {
      if (!graph.tech_stack[fw]) {
        graph.tech_stack[fw] = {
          proficiency: 0,
          source: 'code-verified',
          loc: 0,
          projects: 0,
          advanced_features: [],
          last_seen: proj.scanned_at,
        };
      }
      // Only increment projects count for frameworks (not languages already counted)
      if (!proj.languages[fw]) {
        graph.tech_stack[fw].projects += 1;
      }
    }
  }

  // Calculate proficiency scores
  for (const skill of Object.values(graph.tech_stack)) {
    skill.proficiency = calculateProficiency(skill);
  }

  // Merge architecture patterns (take max confidence across projects)
  graph.architecture = {};
  for (const proj of graph.projects) {
    for (const [pattern, confidence] of Object.entries(proj.patterns)) {
      if (!graph.architecture[pattern] || confidence > graph.architecture[pattern].confidence) {
        graph.architecture[pattern] = { confidence };
      }
    }
  }

  // Average quality metrics across projects
  graph.quality = averageQuality(graph.projects);

  // Update builder profile from classification
  if (classification) {
    graph.builder_profile = {
      is_end_to_end: classification.is_end_to_end || graph.builder_profile.is_end_to_end,
      role_signals: [...new Set([
        ...graph.builder_profile.role_signals,
        ...classification.role_signals,
      ])],
    };
  }

  return graph;
}

function calculateProficiency(skill: TechSkill): number {
  const locScore = Math.min(1, skill.loc / 50000) * 0.4;
  const projectScore = Math.min(1, skill.projects / 10) * 0.3;
  const featureScore = Math.min(1, skill.advanced_features.length / 5) * 0.3;
  return Math.round(Math.min(1, locScore + projectScore + featureScore) * 100) / 100;
}

function averageQuality(projects: ProjectEntry[]): QualityMetrics {
  if (projects.length === 0) {
    return { test_ratio: 0, complexity_avg: 0, type_safety: false, secrets_clean: true };
  }

  const testRatio = projects.reduce((sum, p) => sum + p.test_ratio, 0) / projects.length;
  const complexity = projects.reduce((sum, p) => sum + p.complexity_avg, 0) / projects.length;

  return {
    test_ratio: Math.round(testRatio * 100) / 100,
    complexity_avg: Math.round(complexity * 10) / 10,
    type_safety: false, // Will be updated per-project
    secrets_clean: true,
  };
}
