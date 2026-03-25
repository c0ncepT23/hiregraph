import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadGraph } from '../graph/skill-graph.js';
import { loadSubJson } from '../storage/store.js';
import { loadHistory, addApplication, findByJobId, generateAppId } from '../history/tracker.js';
import { tailorResume } from '../resume/tailorer.js';
import { generateResumePdf, saveResumePdf } from '../resume/pdf-builder.js';
import { submitApplication } from '../ats/submitter.js';
import { isApiKeyConfigured } from '../llm/client.js';
import type { MatchRun, MatchResult, JobListing, ParsedJobRequirements, JobsCache, ParsedJobsCache, ResumeTailoring } from '../graph/schema.js';
import * as log from '../utils/logger.js';
import * as spinner from '../utils/spinner.js';

export async function applyCommand(
  jobId?: string,
  options?: {
    allAbove?: number;
    review?: boolean;
    dryRun?: boolean;
    withSummary?: string;
    withSkills?: string;
    withProjects?: string;
  },
): Promise<void> {
  log.header('\n  HireGraph Apply\n');

  const graph = await loadGraph();
  if (!graph || graph.projects.length === 0) {
    log.error('No skill graph found. Run `hiregraph scan <path>` first.');
    return;
  }

  if (!graph.builder_identity.name || !graph.builder_identity.email) {
    log.error('Name and email required. Run `hiregraph init` first.');
    return;
  }

  // Check if we can do LLM tailoring or need external summary
  const hasApiKey = isApiKeyConfigured();
  const hasExternalSummary = !!options?.withSummary;

  if (!hasApiKey && !hasExternalSummary) {
    log.warn('No API key and no --with-summary provided.');
    log.info('  Use --with-summary "Your tailored summary text" (Claude Code provides this)');
    log.info('  Or set ANTHROPIC_API_KEY for automatic tailoring.');
    return;
  }

  const matchRun = await loadLatestMatches();
  if (!matchRun) {
    log.error('No match results found. Run `hiregraph matches` first.');
    return;
  }

  const jobsMap = await loadJobsMap();
  const requirementsMap = await loadRequirementsMap();
  const history = await loadHistory();

  // Determine which matches to apply to
  let targets: MatchResult[];

  if (options?.allAbove !== undefined) {
    const threshold = options.allAbove;
    const allMatches = [...matchRun.strong_matches, ...matchRun.suggested_matches];
    targets = allMatches.filter(m => m.score >= threshold);
    log.info(`  Found ${targets.length} matches with score >= ${threshold}\n`);
  } else if (jobId) {
    const allMatches = [...matchRun.strong_matches, ...matchRun.suggested_matches];
    const match = allMatches.find(m => m.job_id === jobId);
    if (!match) {
      log.error(`Match not found for job ID: ${jobId}`);
      log.info('Available matches:');
      for (const m of allMatches.slice(0, 10)) {
        console.log(`  ${chalk.dim(m.job_id)} ${m.job_title} @ ${m.company} (${m.score})`);
      }
      return;
    }
    targets = [match];
  } else {
    log.error('Provide a job-id or use --all-above <score>');
    return;
  }

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const match of targets) {
    if (findByJobId(history, match.job_id)) {
      log.dim(`  Skipped (already applied): ${match.job_title} @ ${match.company}`);
      skipped++;
      continue;
    }

    const job = jobsMap.get(match.job_id);
    if (!job) {
      log.warn(`  Skipped (missing job data): ${match.job_title} @ ${match.company}`);
      failed++;
      continue;
    }

    console.log(`\n  ${chalk.bold(match.job_title)} @ ${match.company} (score: ${chalk.green(String(match.score))})`);

    // Build tailoring — either from Haiku or from external summary
    let tailoring: ResumeTailoring;

    if (hasExternalSummary) {
      // Claude Code provided the summary
      tailoring = {
        job_id: match.job_id,
        professional_summary: options!.withSummary!,
        project_order: options?.withProjects
          ? options.withProjects.split(',').map(s => s.trim())
          : graph.projects.map(p => p.name),
        bullet_emphasis: {},
        skills_order: options?.withSkills
          ? options.withSkills.split(',').map(s => s.trim())
          : Object.keys(graph.tech_stack),
        generated_at: new Date().toISOString(),
      };
    } else {
      // Use Haiku for tailoring
      spinner.start('Tailoring resume...');
      const requirements = requirementsMap[match.job_id];
      try {
        tailoring = await tailorResume(graph, job, requirements || {
          job_id: match.job_id, must_have_skills: [], nice_to_have_skills: [],
          seniority_level: 'mid', tech_stack: [], domain: 'unknown',
          remote_policy: 'unknown', parsed_at: new Date().toISOString(),
        }, match);
        spinner.succeed('Resume tailored');
      } catch (err: any) {
        spinner.fail(`Tailoring failed: ${err.message}`);
        failed++;
        continue;
      }
    }

    // Review mode
    if (options?.review) {
      console.log();
      console.log(`  ${chalk.bold('Summary:')} ${tailoring.professional_summary}`);
      console.log(`  ${chalk.bold('Projects:')} ${tailoring.project_order.join(' > ')}`);
      console.log(`  ${chalk.bold('Skills:')} ${tailoring.skills_order.slice(0, 8).join(', ')}`);
      console.log();

      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Apply to this job?',
        default: true,
      }]);

      if (!proceed) {
        log.dim('  Skipped by user');
        skipped++;
        continue;
      }
    }

    // Generate PDF
    spinner.start('Generating resume PDF...');
    let pdfBuffer: Buffer;
    let resumePath: string;
    try {
      pdfBuffer = await generateResumePdf(graph, tailoring);
      resumePath = await saveResumePdf(pdfBuffer, match.job_id);
      spinner.succeed(`Resume saved: ${resumePath}`);
    } catch (err: any) {
      spinner.fail(`PDF generation failed: ${err.message}`);
      failed++;
      continue;
    }

    // Dry run
    if (options?.dryRun) {
      log.success(`  [dry-run] Resume generated but not submitted`);
      applied++;
      continue;
    }

    // Submit
    spinner.start('Submitting application...');
    const result = await submitApplication(job, pdfBuffer, graph.builder_identity);
    if (result.success) {
      spinner.succeed(result.message);

      const appId = generateAppId();
      await addApplication({
        id: appId,
        job_id: match.job_id,
        job_title: match.job_title,
        company: match.company,
        company_slug: match.company_slug,
        url: match.url,
        ats_source: job.source,
        match_score: match.score,
        resume_path: resumePath,
        status: 'applied',
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      log.success(`  Applied! (${appId})`);
      applied++;
    } else {
      spinner.fail(result.message);
      failed++;
    }

    if (targets.length > 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log();
  console.log(`  ${chalk.bold('Summary:')}`);
  console.log(`    Applied:  ${chalk.green(String(applied))}`);
  if (skipped > 0) console.log(`    Skipped:  ${chalk.yellow(String(skipped))}`);
  if (failed > 0) console.log(`    Failed:   ${chalk.red(String(failed))}`);
  console.log();
}

async function loadLatestMatches(): Promise<MatchRun | null> {
  const today = new Date().toISOString().slice(0, 10);
  let run = await loadSubJson<MatchRun>('matches', `${today}.json`);
  if (run) return run;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  run = await loadSubJson<MatchRun>('matches', `${yesterday}.json`);
  return run;
}

async function loadJobsMap(): Promise<Map<string, JobListing>> {
  const map = new Map<string, JobListing>();
  for (const source of ['greenhouse', 'lever', 'ashby'] as const) {
    const cache = await loadSubJson<JobsCache>('jobs', `${source}.json`);
    if (cache) {
      for (const job of cache.jobs) map.set(job.id, job);
    }
  }
  return map;
}

async function loadRequirementsMap(): Promise<Record<string, ParsedJobRequirements>> {
  const cache = await loadSubJson<ParsedJobsCache>('jobs', 'parsed.json');
  return cache?.requirements || {};
}
