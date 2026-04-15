import type { Page } from 'playwright';
import { capturePageState } from './observer.js';
import type { FormField } from './observer.js';
import { analyzeFormStep } from './analyst.js';
import { executeStep, clickStepButton, isStepVisible } from './form-filler.js';
import { saveRecipe } from './recipe-store.js';
import type { Recipe, RecipeStep, JobData } from './types.js';
import * as log from '../utils/logger.js';

const MAX_STEPS = 10;

/**
 * OODA loop: Learn a job application form by observing, analyzing, and filling it step by step.
 * Generates a Recipe and saves it for future reuse.
 */
export async function learnDomain(
  page: Page,
  domain: string,
  jobData: JobData,
): Promise<Recipe> {
  const steps: RecipeStep[] = [];
  let stepCount = 0;

  log.info(`  Learning form for ${domain}...`);

  while (stepCount < MAX_STEPS) {
    stepCount++;
    log.dim(`    Step ${stepCount}: Observing page...`);

    // Wait for real form fields to appear (not just buttons)
    const { html, screenshot, formFields } = await waitForFormFields(page, stepCount);

    const inputCount = formFields.filter(f => ['input', 'textarea', 'select'].includes(f.tag) && f.type !== 'submit').length;
    log.dim(`    Step ${stepCount}: Found ${inputCount} input fields in DOM`);

    // If no real form fields, we might be on a landing page — stop
    if (inputCount === 0 && stepCount > 2) {
      log.warn(`    Step ${stepCount}: No form fields found, stopping`);
      break;
    }

    // ORIENT + DECIDE — send to Claude Haiku for analysis
    log.dim(`    Step ${stepCount}: Analyzing form...`);
    let stepConfig: RecipeStep;
    try {
      stepConfig = await analyzeFormStep(html, screenshot, steps.map(s => s.id), formFields);
    } catch (err: any) {
      log.warn(`    Analysis failed at step ${stepCount}: ${err.message}`);
      break;
    }

    // Skip steps with only click actions (cookie banners, apply buttons)
    const hasFillActions = stepConfig.actions.some(a =>
      a.action_type !== 'click' || a.value_expression === 'resume.file'
    );
    if (!hasFillActions && stepConfig.next_button_selector) {
      log.dim(`    Step ${stepCount}: Only buttons — clicking through...`);
      try {
        await clickStepButton(page, stepConfig.next_button_selector);
      } catch {
        // Try clicking generic Apply/Submit buttons
        await tryClickApply(page);
      }
      continue; // Don't save this step — it's navigation, not a form
    }

    // Validate the step is actually visible
    if (!(await isStepVisible(page, stepConfig))) {
      log.warn(`    Step ${stepCount}: Form fields not visible, stopping`);
      break;
    }

    steps.push(stepConfig);
    log.info(`    Step ${stepCount}: Found ${stepConfig.actions.length} fields (${stepConfig.id})`);

    // ACT — fill the form fields
    const { filled, skipped, errors } = await executeStep(page, stepConfig, jobData);
    if (filled.length > 0) log.dim(`      Filled: ${filled.join(', ')}`);
    if (skipped.length > 0) log.dim(`      Skipped: ${skipped.join(', ')}`);
    if (errors.length > 0) log.warn(`      Errors: ${errors.join('; ')}`);

    // If this is the submit step, don't click submit during learning — just stop
    if (stepConfig.is_submit_step) {
      log.info(`    Step ${stepCount}: Submit step reached — recipe complete`);
      break;
    }

    // Click next button to advance
    if (stepConfig.next_button_selector) {
      log.dim(`    Step ${stepCount}: Clicking next...`);
      try {
        await clickStepButton(page, stepConfig.next_button_selector);
      } catch (err: any) {
        log.warn(`    Failed to click next button: ${err.message}`);
        break;
      }
    } else {
      log.info(`    Step ${stepCount}: No next button — recipe complete`);
      break;
    }
  }

  if (steps.length === 0) {
    throw new Error(`Failed to learn any form steps for ${domain}`);
  }

  // Build and save recipe
  const recipe: Recipe = {
    metadata: {
      version: '1.0',
      created_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      domain,
      success_count: 0,
      failure_count: 0,
    },
    login: null,
    steps,
    delay_factor: 1.0,
    user_agent_pattern: null,
  };

  await saveRecipe(domain, recipe);
  log.success(`  Recipe saved for ${domain} (${steps.length} step${steps.length > 1 ? 's' : ''})`);

  return recipe;
}

/**
 * Wait for real form fields (inputs, textareas) to appear on the page.
 * Retries a few times with increasing delays — handles modals/overlays that load slowly.
 */
async function waitForFormFields(page: Page, stepCount: number) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const capture = await capturePageState(page);
    const inputCount = capture.formFields.filter(f =>
      ['input', 'textarea', 'select'].includes(f.tag) && f.type !== 'hidden' && f.type !== 'submit'
    ).length;

    if (inputCount >= 2 || attempt === MAX_RETRIES - 1) {
      return capture;
    }

    // Not enough inputs — wait for form to load (modal/overlay/iframe)
    log.dim(`    Step ${stepCount}: Waiting for form to load (attempt ${attempt + 2})...`);
    await page.waitForTimeout(3000);

    // Try clicking any visible Apply buttons that might reveal the form
    await tryClickApply(page);
    await page.waitForTimeout(2000);
  }

  // Shouldn't reach here but TypeScript needs it
  return capturePageState(page);
}

/**
 * Try clicking common Apply/Continue buttons to reveal the actual form.
 */
async function tryClickApply(page: Page): Promise<void> {
  const selectors = [
    'button:has-text("Apply")',
    'a:has-text("Apply")',
    'button:has-text("Continue")',
    'button:has-text("Start application")',
    'button[data-ui="apply-button"]',
    '.posting-btn-submit',
  ];

  for (const sel of selectors) {
    try {
      const loc = page.locator(sel);
      if (await loc.first().isVisible({ timeout: 500 })) {
        await loc.first().click({ timeout: 2000 });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        return;
      }
    } catch { /* continue */ }
  }
}
