import chalk from 'chalk';
import { existsSync } from 'fs';
import type { Page } from 'playwright';
import { loadJson } from '../storage/store.js';
import { isApiKeyConfigured } from '../llm/client.js';
import { addApplication, generateAppId } from '../history/tracker.js';
import { generateResumePdf, saveResumePdf } from '../resume/pdf-builder.js';
import { loadGraph } from '../graph/skill-graph.js';
import { launchBrowser, navigateTo, closeBrowser } from '../browser/launcher.js';
import { detectLoginWall } from '../browser/login-detector.js';
import { loadRecipe, updateRecipeStats } from '../browser/recipe-store.js';
import { loadSession, hasSession } from '../browser/session-store.js';
import { learnDomain } from '../browser/learner-engine.js';
import { executeStep, clickStepButton, isStepVisible, checkSubmitSuccess, detectCaptcha, waitForCaptchaSolved } from '../browser/form-filler.js';
import { setAutoMode } from '../browser/value-resolver.js';
import { configureTelegram, notifyTelegram } from '../browser/telegram-prompter.js';
import type { IdentityConfig, ResumeTailoring } from '../graph/schema.js';
import type { AutoApplyResult, JobData, ExperienceEntry, EducationEntry } from '../browser/types.js';
import * as log from '../utils/logger.js';
import * as spinner from '../utils/spinner.js';

export async function autoApplyCommand(
  url: string,
  options?: {
    learn?: boolean;
    dryRun?: boolean;
    headless?: boolean;
    auto?: boolean;
    resume?: string;
  },
): Promise<void> {
  log.header('\n  HireGraph Auto-Apply\n');

  // Enable auto mode (LLM answers all questions, no interactive prompts)
  if (options?.auto) {
    setAutoMode(true);

    // Configure Telegram as fallback for questions AI can't answer
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChatId = process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChatId) {
      configureTelegram(tgToken, tgChatId);
      log.dim('  Telegram configured — unknown questions will be sent to your phone');
    }
  }

  // 1. Load and validate identity
  const identity = await loadJson<IdentityConfig>('identity.json');
  if (!identity || !identity.name || !identity.email) {
    log.error('Profile not set up. Run `hiregraph init` first.');
    return;
  }

  if (!isApiKeyConfigured()) {
    log.error('ANTHROPIC_API_KEY required for auto-apply (form analysis uses Claude Haiku).');
    log.info('  Set it with: hiregraph setup');
    return;
  }

  // 2. Extract domain
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    log.error(`Invalid URL: ${url}`);
    return;
  }

  console.log(`  ${chalk.bold('URL:')} ${url}`);
  console.log(`  ${chalk.bold('Domain:')} ${domain}`);

  // 3. Find resume PDF
  let resumePath: string;
  const savedResumePath = (identity as any).resume_path;

  if (options?.resume) {
    resumePath = options.resume;
  } else if (savedResumePath && existsSync(savedResumePath)) {
    resumePath = savedResumePath;
  } else {
    // Fallback: generate one
    spinner.start('Generating resume PDF...');
    try {
      const graph = await loadGraph();
      if (!graph) {
        spinner.fail('No resume found. Set resume_path in identity.json or provide --resume <path>');
        return;
      }
      const defaultTailoring: ResumeTailoring = {
        job_id: 'apply',
        professional_summary: `${identity.name} — ${identity.primary_role}`,
        project_order: graph.projects.map(p => p.name),
        bullet_emphasis: {},
        skills_order: Object.keys(graph.tech_stack),
        generated_at: new Date().toISOString(),
      };
      const pdfBuffer = await generateResumePdf(graph, defaultTailoring);
      resumePath = await saveResumePdf(pdfBuffer, `${identity.name.replace(/\s+/g, '_')}_resume`);
      spinner.succeed(`Generated: ${resumePath}`);
    } catch (err: any) {
      spinner.fail(`Resume preparation failed: ${err.message}`);
      return;
    }
  }
  log.dim(`  Resume: ${resumePath}`);

  // 4. Build job data from identity
  const jobData = buildJobData(identity, resumePath);

  // 5. Check for cached recipe
  let recipe = options?.learn ? null : await loadRecipe(domain);
  if (recipe) {
    log.info(`  Using cached recipe for ${domain} (${recipe.steps.length} steps)`);
  }

  // 6. Launch browser
  spinner.start('Launching browser...');
  const session = await launchBrowser({ headless: options?.headless });
  spinner.succeed('Browser launched');

  const result: AutoApplyResult = {
    success: false,
    url,
    domain,
    login_required: false,
    steps_executed: 0,
    steps_total: 0,
    errors: [],
    recipe_learned: false,
  };

  try {
    // Load saved session cookies if available
    if (await hasSession(domain)) {
      await loadSession(session.context, domain);
      log.dim(`  Loaded saved session for ${domain}`);
    }

    // 7. Navigate to URL
    spinner.start('Navigating to job page...');
    await navigateTo(session.page, url);
    spinner.succeed(`Loaded: ${session.page.url()}`);

    // 8. Login wall detection
    spinner.start('Checking for login requirements...');
    const loginBlocked = await detectLoginWall(session.page);
    if (loginBlocked) {
      spinner.fail('Login required');
      log.warn(`\n  Login wall detected for ${domain}. Auto-apply skipped.`);
      log.info('  This site requires authentication before applying.');
      log.dim('  (Login configuration support coming in a future update)\n');

      result.login_required = true;
      return;
    }
    spinner.succeed('No login required');

    // 8b. Detect job listing page and click through to apply form
    await clickThroughToApplyForm(session.page);

    // 9. Learn or load recipe
    if (!recipe) {
      log.info('  No cached recipe — entering learning mode...\n');
      recipe = await learnDomain(session.page, domain, jobData);
      result.recipe_learned = true;
      result.steps_total = recipe.steps.length;
      result.steps_executed = recipe.steps.length;

      // Learning already filled the form — check for submit
      const lastStep = recipe.steps[recipe.steps.length - 1];
      if (lastStep.is_submit_step && lastStep.next_button_selector) {
        if (options?.dryRun) {
          log.success('\n  [dry-run] Form filled during learning but NOT submitted\n');
          result.success = true;
        } else {
          // Take screenshot before submit
          const preSubmitPath = `${resumePath.replace('.pdf', '')}_pre_submit.png`;
          await session.page.screenshot({ path: preSubmitPath, fullPage: true });
          log.dim(`  Pre-submit screenshot: ${preSubmitPath}`);

          spinner.start('Submitting application...');
          await clickStepButton(session.page, lastStep.next_button_selector);

          // Check for CAPTCHA
          const hasCaptcha = await detectCaptcha(session.page);
          if (hasCaptcha) {
            spinner.fail('CAPTCHA detected!');
            log.warn('  CAPTCHA appeared — please solve it in the browser window');
            await notifyTelegram('🔒 CAPTCHA detected! Open the browser and solve it to complete the application.');

            const solved = await waitForCaptchaSolved(session.page);
            if (solved) {
              log.success('  CAPTCHA solved — continuing...');
            } else {
              log.error('  CAPTCHA not solved within 2 minutes');
              result.errors.push('CAPTCHA timeout');
            }
          }

          // Take screenshot after submit
          const postSubmitPath = `${resumePath.replace('.pdf', '')}_post_submit.png`;
          await session.page.screenshot({ path: postSubmitPath, fullPage: true });
          log.dim(`  Post-submit screenshot: ${postSubmitPath}`);

          const submitted = await checkSubmitSuccess(session.page);
          if (submitted) {
            spinner.succeed('Application submitted!');
            result.success = true;
          } else {
            spinner.fail('Submit may have failed — check browser window');
            result.errors.push('Submit verification failed');
          }
        }
      } else {
        log.info('  Form filled during learning. Recipe saved for next time.');
        result.success = true;
      }
    } else {
      // Existing recipe — re-navigate and execute
      result.steps_total = recipe.steps.length;

    // 10. Execute recipe steps
    console.log();
    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      log.info(`  Step ${i + 1}/${recipe.steps.length}: ${step.description || step.id}`);

      // Wait for step to be visible
      if (!(await isStepVisible(session.page, step))) {
        log.warn(`    Step not visible, skipping`);
        continue;
      }

      // Fill fields
      const { filled, skipped, errors } = await executeStep(
        session.page,
        step,
        jobData,
        recipe.delay_factor ?? 1.0,
      );

      if (filled.length > 0) log.dim(`    Filled ${filled.length} fields`);
      if (skipped.length > 0) log.dim(`    Skipped ${skipped.length} fields`);
      if (errors.length > 0) {
        for (const err of errors) log.warn(`    Error: ${err}`);
        result.errors.push(...errors);
      }

      result.steps_executed++;

      // Handle submit / next
      if (step.is_submit_step) {
        if (options?.dryRun) {
          log.success('\n  [dry-run] Form filled but NOT submitted\n');
          result.success = true;
          return;
        }

        // Click submit
        if (step.next_button_selector) {
          spinner.start('Submitting application...');
          await clickStepButton(session.page, step.next_button_selector);

          const submitted = await checkSubmitSuccess(session.page);
          if (submitted) {
            spinner.succeed('Application submitted!');
            result.success = true;
          } else {
            spinner.fail('Submit may have failed — check browser window');
            result.errors.push('Submit verification failed');
          }
        }
      } else if (step.next_button_selector) {
        // Click next
        await clickStepButton(session.page, step.next_button_selector);
      }
    }
    } // end else (existing recipe execution)

    // 11. Record in history
    if (result.success) {
      const appId = generateAppId();
      await addApplication({
        id: appId,
        job_id: `browser_${domain}_${Date.now()}`,
        job_title: 'Auto-Apply',
        company: domain,
        company_slug: domain,
        url,
        ats_source: 'browser',
        match_score: 0,
        resume_path: resumePath,
        status: 'applied',
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await updateRecipeStats(domain, true);
      log.success(`\n  Recorded in history (${appId})\n`);
    } else if (!result.login_required) {
      await updateRecipeStats(domain, false);
    }
  } catch (err: any) {
    log.error(`\n  Auto-apply failed: ${err.message}`);
    result.errors.push(err.message);
  } finally {
    // Give user a moment to see the browser state
    if (!options?.headless) {
      log.dim('  Closing browser in 5 seconds...');
      await session.page.waitForTimeout(5000);
    }
    await closeBrowser(session);
  }

  // Summary
  console.log(`  ${chalk.bold('Result:')}`);
  if (result.login_required) {
    console.log(`    Status: ${chalk.yellow('Login Required — Skipped')}`);
  } else if (result.success) {
    console.log(`    Status: ${chalk.green('Applied')}`);
  } else {
    console.log(`    Status: ${chalk.red('Failed')}`);
  }
  console.log(`    Steps: ${result.steps_executed}/${result.steps_total}`);
  if (result.recipe_learned) console.log(`    Recipe: ${chalk.cyan('Newly learned')}`);
  if (result.errors.length > 0) console.log(`    Errors: ${result.errors.length}`);
  console.log();
}

/**
 * Detect if we're on a job listing page (not the apply form) and click through.
 * Common patterns: Lever has "Apply for this job", Greenhouse has "Apply", etc.
 */
async function clickThroughToApplyForm(page: Page): Promise<void> {
  // Check if there's a form already visible (inputs, file upload)
  const formSelectors = [
    'input[name*="name"]',
    'input[name*="email"]',
    'input[type="file"]',
    'button[aria-label*="Upload" i]',
  ];
  for (const sel of formSelectors) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: 500 })) return;
    } catch { /* continue */ }
  }

  // Try appending /apply/ to the URL FIRST (most reliable in headless mode)
  const currentUrl = page.url();
  const urlPath = new URL(currentUrl).pathname;
  if (!urlPath.endsWith('/apply') && !urlPath.endsWith('/apply/')) {
    const applyUrl = currentUrl.replace(/\/?$/, '/apply/');
    log.info(`  Trying direct apply URL: ${applyUrl}`);
    try {
      await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(5000);
      log.dim(`  Landed on: ${page.url()}`);

      // Check if form fields appeared (broader check)
      const formCheck = [
        ...formSelectors,
        'input[type="text"]',
        'input[type="email"]',
        'input[type="tel"]',
        'textarea',
      ];
      for (const sel of formCheck) {
        try {
          if (await page.locator(sel).first().isVisible({ timeout: 1000 })) {
            log.info('  Form detected on /apply/ page');
            return;
          }
        } catch { /* continue */ }
      }
    } catch (err: any) {
      log.dim(`  /apply/ URL failed: ${err.message}`);
    }
  }

  // Fallback: look for Apply/Interest buttons on the page
  const applySelectors = [
    'a:has-text("Apply for this job")',
    'a:has-text("Apply now")',
    'a:has-text("I\'m interested")',
    'a:has-text("Apply")',
    'button:has-text("Apply for this job")',
    'button:has-text("Apply now")',
    'button:has-text("I\'m interested")',
    'button:has-text("Apply")',
    '.posting-btn-submit',
    '[data-qa="btn-apply"]',
    'a[title="I\'m interested"]',
  ];

  for (const sel of applySelectors) {
    try {
      const loc = page.locator(sel);
      if (await loc.first().isVisible({ timeout: 1000 })) {
        log.info('  Found Apply button on listing page — clicking through...');
        await loc.first().click({ timeout: 3000 });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        return;
      }
    } catch { /* try next */ }
  }
}

function buildJobData(identity: IdentityConfig, resumePath: string): JobData {
  const nameParts = identity.name.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');

  const experiences: ExperienceEntry[] = (identity.previous_companies || []).map(wh => ({
    company_name: wh.company,
    title: wh.role,
    is_current: !wh.end_year,
    start_year: String(wh.start_year),
    end_year: wh.end_year ? String(wh.end_year) : undefined,
    description: wh.bullets?.join('. '),
  }));

  const educations: EducationEntry[] = (identity.education || []).map(ed => ({
    school_name: ed.institution,
    degree: ed.degree,
    major: ed.field,
    is_current: false,
    end_year: String(ed.year),
  }));

  return {
    resume_path: resumePath,
    first_name: firstName,
    last_name: lastName,
    full_name: identity.name,
    email: identity.email,
    phone_number: stripCountryCode(identity.phone),
    phone_country_code: identity.phone_country_code,
    city: identity.city,
    state: identity.state,
    country: identity.country,
    linkedin_url: identity.links?.linkedin,
    github_url: identity.links?.github,
    portfolio_url: identity.links?.portfolio,
    current_employer: (identity as any).current_employer,
    current_title: (identity as any).current_title,
    current_ctc: (identity as any).current_ctc,
    current_ctc_monthly: (identity as any).current_ctc_monthly,
    expected_ctc: (identity as any).expected_ctc,
    salary_currency: (identity as any).salary_currency,
    notice_period: (identity as any).notice_period,
    visa_sponsorship: (identity as any).visa_sponsorship,
    work_authorization: (identity as any).work_authorization,
    experiences,
    educations,
  };
}

/**
 * Strip country code prefix from phone number.
 * "+91-7034099540" → "7034099540"
 * "+1 555-1234" → "5551234"
 */
function stripCountryCode(phone?: string): string | undefined {
  if (!phone) return undefined;
  // Remove +XX prefix and any separator
  return phone.replace(/^\+\d{1,3}[-\s]?/, '').replace(/[-\s]/g, '');
}
