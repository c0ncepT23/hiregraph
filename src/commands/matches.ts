import chalk from 'chalk';
import { readFileSync } from 'fs';
import { runMatchPipeline } from '../matching/matcher.js';
import { prepareCandidates, saveMatchResults } from '../matching/prepare.js';
import { isApiKeyConfigured } from '../llm/client.js';
import type { MatchResult, MatchRun } from '../graph/schema.js';
import * as log from '../utils/logger.js';

export async function matchesCommand(options: {
  refresh?: boolean;
  top?: number;
  verbose?: boolean;
  prepare?: boolean;
  saveResults?: string;
}): Promise<void> {
  // Mode 1: --prepare → output candidates for Claude Code to evaluate
  if (options.prepare) {
    await handlePrepare(options.top || 50, !!options.refresh);
    return;
  }

  // Mode 2: --save-results <file> → import Claude Code's evaluations
  if (options.saveResults) {
    await handleSaveResults(options.saveResults);
    return;
  }

  // Mode 3: Full pipeline (needs API key)
  log.header('\n  HireGraph Matches\n');

  if (!isApiKeyConfigured()) {
    log.warn('ANTHROPIC_API_KEY not set. Use --prepare mode for Claude Code integration:');
    log.info('  hiregraph matches --prepare          (outputs candidates as JSON)');
    log.info('  hiregraph matches --save-results <f>  (imports evaluated results)');
    return;
  }

  try {
    const result = await runMatchPipeline({
      topK: options.top || 50,
      refresh: options.refresh,
    });
    printResults(result, !!options.verbose);
  } catch (err: any) {
    log.error(err.message);
  }
}

async function handlePrepare(topK: number, refresh: boolean): Promise<void> {
  log.header('\n  HireGraph — Prepare Candidates\n');

  try {
    const result = await prepareCandidates(topK, refresh);
    console.log();
    // Output JSON to stdout for Claude Code to read
    const output = JSON.stringify(result, null, 2);
    console.log(output);
  } catch (err: any) {
    log.error(err.message);
  }
}

async function handleSaveResults(filePath: string): Promise<void> {
  log.header('\n  HireGraph — Save Match Results\n');

  try {
    let data: string;
    if (filePath === '-') {
      // Read from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      data = Buffer.concat(chunks).toString('utf-8');
    } else {
      data = readFileSync(filePath, 'utf-8');
    }

    const parsed = JSON.parse(data);

    // Accept either an array of MatchResults or {results: MatchResult[]}
    const results: MatchResult[] = Array.isArray(parsed) ? parsed : parsed.results || parsed.strong_matches?.concat(parsed.suggested_matches) || [];

    if (results.length === 0) {
      log.error('No match results found in input.');
      return;
    }

    const matchRun = await saveMatchResults(results, parsed.total_jobs || 0);
    printResults(matchRun, true);
  } catch (err: any) {
    log.error(`Failed to save results: ${err.message}`);
  }
}

function printResults(result: MatchRun, verbose: boolean): void {
  console.log();

  if (result.strong_matches.length > 0) {
    console.log(`  ${chalk.bold.green('Strong Matches (score 8-10):')}`);
    for (let i = 0; i < result.strong_matches.length; i++) {
      printMatch(result.strong_matches[i], i + 1, true);
    }
    console.log();
  }

  if (result.suggested_matches.length > 0) {
    console.log(`  ${chalk.bold.yellow('Suggested Matches (score 6-7):')}`);
    for (let i = 0; i < result.suggested_matches.length; i++) {
      const idx = result.strong_matches.length + i + 1;
      printMatch(result.suggested_matches[i], idx, verbose);
    }
    console.log();
  }

  if (result.strong_matches.length === 0 && result.suggested_matches.length === 0) {
    log.warn('  No matches above threshold.');
    console.log();
  }

  console.log(`  ${chalk.bold('Summary:')}`);
  console.log(`    Evaluated:       ${result.total_candidates_evaluated}`);
  console.log(`    Strong matches:  ${chalk.green(String(result.strong_matches.length))}`);
  console.log(`    Suggested:       ${chalk.yellow(String(result.suggested_matches.length))}`);
  console.log();
  log.info(`  Results saved to ~/.hiregraph/matches/${result.date}.json`);
  console.log();
}

function printMatch(match: MatchResult, rank: number, showDetails: boolean): void {
  const scoreColor = match.score >= 8 ? chalk.green : chalk.yellow;
  console.log(`    ${chalk.dim(`#${rank}`)}  ${scoreColor(match.score.toFixed(1))}  ${chalk.bold(match.job_title)} @ ${match.company}`);

  if (showDetails) {
    if (match.strengths.length > 0) {
      console.log(`          ${chalk.green('+')} ${match.strengths.join(', ')}`);
    }
    if (match.gaps.length > 0) {
      console.log(`          ${chalk.red('-')} ${match.gaps.join(', ')}`);
    }
    console.log(`          ${chalk.dim(match.url)}`);
  }
}
