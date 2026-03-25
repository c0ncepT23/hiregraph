import chalk from 'chalk';
import { loadGraph } from '../graph/skill-graph.js';
import { loadJson } from '../storage/store.js';
import type { BuilderIdentity } from '../graph/schema.js';
import * as log from '../utils/logger.js';

export async function statusCommand(): Promise<void> {
  const graph = await loadGraph();

  if (!graph || graph.projects.length === 0) {
    log.warn('No skill graph found.');
    log.info('Run `hiregraph init` to set up your profile.');
    log.info('Run `hiregraph scan <path>` to analyze a project.');
    return;
  }

  const identity = graph.builder_identity;

  log.header('\n  HireGraph Status\n');

  // Builder info
  if (identity.name) {
    console.log(`  ${chalk.bold('Builder:')} ${identity.name} (${identity.primary_role})`);
  }
  console.log(`  ${chalk.bold('Projects scanned:')} ${graph.projects.length}`);
  console.log();

  // Tech Stack
  const skills = Object.entries(graph.tech_stack)
    .sort((a, b) => b[1].proficiency - a[1].proficiency)
    .slice(0, 10);

  if (skills.length > 0) {
    console.log(`  ${chalk.bold('Tech Stack:')}`);
    const maxNameLen = Math.max(...skills.map(([name]) => name.length));

    for (const [name, skill] of skills) {
      const bar = renderBar(skill.proficiency, 20);
      const locStr = skill.loc > 0 ? `${skill.loc.toLocaleString()} LOC` : '';
      const projStr = skill.projects > 0 ? `${skill.projects} projects` : '';
      const details = [locStr, projStr].filter(Boolean).join(', ');
      console.log(`    ${name.padEnd(maxNameLen + 2)} ${bar}  ${skill.proficiency.toFixed(2)}${details ? `  (${details})` : ''}`);
    }
    console.log();
  }

  // Architecture
  const patterns = Object.entries(graph.architecture)
    .sort((a, b) => b[1].confidence - a[1].confidence);
  if (patterns.length > 0) {
    const patternStr = patterns
      .map(([name, { confidence }]) => `${name} (${confidence})`)
      .join(', ');
    console.log(`  ${chalk.bold('Architecture:')} ${patternStr}`);
  }

  // Quality
  console.log(`  ${chalk.bold('Quality:')} test ratio ${graph.quality.test_ratio}, complexity ${graph.quality.complexity_avg}${graph.quality.type_safety ? ', strict types' : ''}`);

  // Builder Profile
  if (graph.builder_profile.role_signals.length > 0) {
    console.log(`  ${chalk.bold('Role Signals:')} ${graph.builder_profile.role_signals.join(', ')}`);
  }
  if (graph.builder_profile.is_end_to_end) {
    console.log(`  ${chalk.bold('Builder Profile:')} End-to-end ownership detected`);
  }

  // Projects
  console.log();
  console.log(`  ${chalk.bold('Projects:')}`);
  for (const project of graph.projects) {
    const age = getTimeAgo(project.scanned_at);
    console.log(`    ${chalk.cyan(project.name)} — ${project.domain || 'unknown domain'} (scanned ${age})`);
    const stackStr = project.stack.slice(0, 5).join(', ');
    if (stackStr) console.log(`      ${chalk.dim(stackStr)}`);
  }

  console.log();
  log.dim(`  Last updated: ${getTimeAgo(graph.last_updated)}`);
  console.log();
}

function renderBar(value: number, width: number): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

function getTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
