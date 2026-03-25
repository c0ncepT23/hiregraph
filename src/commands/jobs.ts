import chalk from 'chalk';
import { fetchAllJobs } from '../ats/fetcher.js';
import { loadRegistry } from '../ats/registry.js';
import * as log from '../utils/logger.js';

export async function jobsCommand(options: { refresh?: boolean; ats?: string; limit?: number }): Promise<void> {
  log.header('\n  HireGraph Jobs\n');

  const companies = await loadRegistry();
  const ghCount = companies.filter(c => c.ats === 'greenhouse').length;
  const lvCount = companies.filter(c => c.ats === 'lever').length;
  const abCount = companies.filter(c => c.ats === 'ashby').length;
  log.info(`  Registry: ${companies.length} companies (${ghCount} Greenhouse, ${lvCount} Lever, ${abCount} Ashby)\n`);

  const result = await fetchAllJobs({ refresh: options.refresh, ats: options.ats });

  console.log();
  console.log(`  ${chalk.bold('Jobs Fetched:')}`);
  if (result.stats.greenhouse > 0) {
    console.log(`    Greenhouse    ${result.stats.greenhouse.toLocaleString().padStart(6)} jobs`);
  }
  if (result.stats.lever > 0) {
    console.log(`    Lever         ${result.stats.lever.toLocaleString().padStart(6)} jobs`);
  }
  if (result.stats.ashby > 0) {
    console.log(`    Ashby         ${result.stats.ashby.toLocaleString().padStart(6)} jobs`);
  }
  console.log(`    ${chalk.bold('Total')}         ${chalk.bold(result.stats.total.toLocaleString().padStart(6))} jobs`);

  if (result.stats.failed > 0) {
    console.log();
    log.warn(`  ${result.stats.failed} companies unreachable:`);
    for (const err of result.errors.slice(0, 10)) {
      log.dim(`    ${err.company}: ${err.error}`);
    }
    if (result.errors.length > 10) {
      log.dim(`    ... and ${result.errors.length - 10} more`);
    }
  }

  if (options.limit && options.limit > 0) {
    console.log();
    console.log(`  ${chalk.bold('Sample jobs:')}`);
    const sample = result.jobs.slice(0, options.limit);
    for (const job of sample) {
      console.log(`    ${chalk.cyan(job.title)} @ ${job.company} (${job.location})`);
    }
  }

  console.log();
  log.info('  Cached to ~/.hiregraph/jobs/');
  log.info('  Run `hiregraph matches` to find your best matches.');
  console.log();
}
