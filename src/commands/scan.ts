import { resolve, basename } from 'path';
import { existsSync } from 'fs';
import { analyzeFileDiscovery } from '../layers/file-discovery.js';
import { analyzeDependencies } from '../layers/dependency-extraction.js';
import { analyzeAst } from '../layers/ast-analysis.js';
import { analyzeGitForensics } from '../layers/git-forensics.js';
import { analyzeQualitySignals } from '../layers/quality-signals.js';
import { analyzeArchitecturePatterns } from '../layers/architecture-patterns.js';
import { classifyWithLlm } from '../layers/llm-classification.js';
import { loadGraph, saveGraph, buildProjectEntry, mergeIntoGraph } from '../graph/skill-graph.js';
import { isApiKeyConfigured } from '../llm/client.js';
import { createEmptySkillGraph } from '../graph/schema.js';
import type { ScanResult } from '../graph/schema.js';
import * as log from '../utils/logger.js';
import * as spinner from '../utils/spinner.js';

export async function scanCommand(path: string): Promise<void> {
  const projectPath = resolve(path);
  const projectName = basename(projectPath);

  if (!existsSync(projectPath)) {
    log.error(`Directory not found: ${projectPath}`);
    process.exit(1);
  }

  log.header(`\n  Scanning ${projectName}...\n`);

  // Layer 1: File Discovery
  spinner.start('Layer 1: File discovery...');
  const fileDiscovery = await analyzeFileDiscovery(projectPath);
  spinner.succeed('Layer 1: File discovery');
  log.layerOutput('Layer 1: File discovery',
    `${fileDiscovery.total_files} files, ${fileDiscovery.total_loc.toLocaleString()} LOC`);

  // Layer 2: Dependencies
  spinner.start('Layer 2: Dependencies...');
  const dependencies = await analyzeDependencies(projectPath);
  spinner.succeed('Layer 2: Dependencies');
  log.layerOutput('Layer 2: Dependencies',
    dependencies.frameworks.length > 0
      ? dependencies.frameworks.join(', ')
      : dependencies.dependencies.slice(0, 5).join(', ') || 'none detected');

  // Layer 3: AST Analysis
  spinner.start('Layer 3: AST analysis...');
  const astAnalysis = await analyzeAst(projectPath, fileDiscovery.languages);
  spinner.succeed('Layer 3: AST analysis');
  log.layerOutput('Layer 3: AST analysis',
    `${astAnalysis.functions} functions, ${astAnalysis.classes} classes, ${astAnalysis.components} components, ${astAnalysis.hooks} hooks`);

  // Layer 4: Git Forensics
  spinner.start('Layer 4: Git forensics...');
  const gitForensics = await analyzeGitForensics(projectPath);
  spinner.succeed('Layer 4: Git forensics');
  if (gitForensics.is_git_repo) {
    log.layerOutput('Layer 4: Git forensics',
      `${gitForensics.commits} commits, ${gitForensics.active_days} active days, ${gitForensics.contributors} contributors`);
  } else {
    log.layerOutput('Layer 4: Git forensics', 'Not a git repo');
  }

  // Layer 5: Quality Signals
  spinner.start('Layer 5: Quality signals...');
  const qualitySignals = await analyzeQualitySignals(projectPath, fileDiscovery);
  spinner.succeed('Layer 5: Quality signals');
  log.layerOutput('Layer 5: Quality signals',
    `test ratio ${qualitySignals.test_ratio}, complexity ${qualitySignals.complexity_avg}, ${qualitySignals.type_safety ? 'strict TS' : 'no strict types'}`);

  // Layer 6: Architecture Patterns
  spinner.start('Layer 6: Architecture patterns...');
  const architecturePatterns = await analyzeArchitecturePatterns(projectPath, fileDiscovery, astAnalysis);
  spinner.succeed('Layer 6: Architecture patterns');
  const patternStr = Object.entries(architecturePatterns.patterns)
    .map(([name, conf]) => `${name} (${conf})`)
    .join(', ') || 'none detected';
  log.layerOutput('Layer 6: Architecture patterns', patternStr);

  // Layer 7: LLM Classification
  let llmClassification = null;
  if (isApiKeyConfigured()) {
    spinner.start('Layer 7: LLM classification (API call)...');
    llmClassification = await classifyWithLlm(
      fileDiscovery, dependencies, astAnalysis, gitForensics, qualitySignals, architecturePatterns,
    );
    if (llmClassification) {
      spinner.succeed('Layer 7: LLM classification');
      log.layerOutput('Layer 7: LLM classification',
        `${llmClassification.domain}, ${llmClassification.builder_profile}`);
    } else {
      spinner.fail('Layer 7: LLM classification failed');
    }
  } else {
    log.dim('  Layer 7: Skipped (no API key — run inside Claude Code for full analysis)');
  }

  // Build scan result
  const scanResult: ScanResult = {
    project_name: projectName,
    project_path: projectPath,
    file_discovery: fileDiscovery,
    dependencies,
    ast_analysis: astAnalysis,
    git_forensics: gitForensics,
    quality_signals: qualitySignals,
    architecture_patterns: architecturePatterns,
    llm_classification: llmClassification,
  };

  // Merge into skill graph
  spinner.start('Updating skill graph...');
  let graph = await loadGraph();
  if (!graph) {
    graph = createEmptySkillGraph({
      name: '', email: '', primary_role: 'engineer', target_roles: [],
      previous_companies: [], education: [], links: {}, source: 'manual',
    });
  }

  const projectEntry = buildProjectEntry(scanResult);
  graph = mergeIntoGraph(graph, projectEntry, llmClassification);
  await saveGraph(graph);
  spinner.succeed('Skill graph updated');

  log.success(`\nScan complete. ${graph.projects.length} project(s) in skill graph.`);
  log.info('Run `hiregraph status` to see your full profile.');
}
