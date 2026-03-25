import chalk from 'chalk';
import { runMatchPipeline } from '../matching/matcher.js';
import { isApiKeyConfigured } from '../llm/client.js';
import type { MatchResult } from '../graph/schema.js';
import * as log from '../utils/logger.js';

export async function matchesCommand(options: { refresh?: boolean; top?: number; verbose?: boolean }): Promise<void> {
  log.header('\n  HireGraph Matches\n');

  if (!isApiKeyConfigured()) {
    log.error('ANTHROPIC_API_KEY required for matching. Set it in your environment.');
    process.exit(1);
  }

  try {
    const result = await runMatchPipeline({
      topK: options.top || 50,
      refresh: options.refresh,
    });

    console.log();

    // Strong matches
    if (result.strong_matches.length > 0) {
      console.log(`  ${chalk.bold.green('Strong Matches (score 8-10):')}`);
      for (let i = 0; i < result.strong_matches.length; i++) {
        printMatch(result.strong_matches[i], i + 1, true);
      }
      console.log();
    }

    // Suggested matches
    if (result.suggested_matches.length > 0) {
      console.log(`  ${chalk.bold.yellow('Suggested Matches (score 6-7):')}`);
      for (let i = 0; i < result.suggested_matches.length; i++) {
        const idx = result.strong_matches.length + i + 1;
        printMatch(result.suggested_matches[i], idx, !!options.verbose);
      }
      console.log();
    }

    if (result.strong_matches.length === 0 && result.suggested_matches.length === 0) {
      log.warn('  No matches above threshold. Try scanning more projects or adjusting preferences.');
      console.log();
    }

    // Summary
    console.log(`  ${chalk.bold('Summary:')}`);
    console.log(`    Jobs analyzed:     ${result.total_jobs_fetched.toLocaleString()}`);
    console.log(`    Jobs parsed:       ${result.total_jobs_parsed.toLocaleString()}`);
    console.log(`    LLM evaluated:     ${result.total_candidates_evaluated}`);
    console.log(`    Strong matches:    ${chalk.green(String(result.strong_matches.length))}`);
    console.log(`    Suggested:         ${chalk.yellow(String(result.suggested_matches.length))}`);
    console.log(`    Cost estimate:     ~$${result.cost_estimate.estimated_usd.toFixed(2)}`);
    console.log();
    log.info(`  Results saved to ~/.hiregraph/matches/${result.date}.json`);
    console.log();
  } catch (err: any) {
    log.error(err.message);
    process.exit(1);
  }
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
