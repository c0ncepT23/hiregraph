import inquirer from 'inquirer';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { saveJson, loadJson } from '../storage/store.js';
import { parseResume, resumeToIdentity } from '../resume/parser.js';
import { createEmptySkillGraph } from '../graph/schema.js';
import { saveGraph } from '../graph/skill-graph.js';
import { isApiKeyConfigured } from '../llm/client.js';
import * as log from '../utils/logger.js';
import * as spinner from '../utils/spinner.js';
import type { BuilderIdentity, IdentityConfig } from '../graph/schema.js';

const ROLE_CHOICES = [
  { name: 'Engineer', value: 'engineer' },
  { name: 'PM', value: 'pm' },
  { name: 'Designer', value: 'designer' },
  { name: 'Founder', value: 'founder' },
  { name: 'Builder', value: 'builder' },
];

const VALID_ROLES = ROLE_CHOICES.map(c => c.value);

interface InitOptions {
  name?: string;
  email?: string;
  role?: string;
  targets?: string;
  remote?: string;
  resume?: string;
  compensation?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  log.header('\n  HireGraph Init\n');

  const isNonInteractive = !!(options.name && options.email);

  // Check if already initialized
  const existing = await loadJson<IdentityConfig>('identity.json');
  if (existing && !isNonInteractive) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Profile already exists. Overwrite?',
      default: false,
    }]);
    if (!overwrite) {
      log.info('Keeping existing profile.');
      return;
    }
  }

  // Gather inputs (from flags or interactive prompts)
  let name: string;
  let email: string;
  let role: string;
  let targetRoles: string;
  let remotePref: string;
  let minComp: string;

  if (isNonInteractive) {
    name = options.name!;
    email = options.email!;
    role = VALID_ROLES.includes(options.role || '') ? options.role! : 'engineer';
    targetRoles = options.targets || 'Founding Engineer, Full-Stack Engineer';
    remotePref = options.remote || 'Remote';
    minComp = options.compensation || '';
  } else {
    ({ name, email } = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Name:' },
      { type: 'input', name: 'email', message: 'Email:' },
    ]));
    ({ role } = await inquirer.prompt([{
      type: 'list', name: 'role', message: 'What describes you best?', choices: ROLE_CHOICES,
    }]));
    ({ targetRoles } = await inquirer.prompt([{
      type: 'input', name: 'targetRoles', message: 'Target roles (comma separated):',
      default: 'Founding Engineer, Full-Stack Engineer',
    }]));
    ({ remotePref } = await inquirer.prompt([{
      type: 'list', name: 'remotePref', message: 'Remote preference?',
      choices: ['Remote', 'Hybrid', 'Onsite', 'No preference'],
    }]));
    ({ minComp } = await inquirer.prompt([{
      type: 'input', name: 'minComp', message: 'Min compensation (optional):', default: '',
    }]));
  }

  // Resume parsing
  let resumeData: Awaited<ReturnType<typeof parseResume>> | null = null;
  const resumePath = options.resume;

  if (resumePath && isApiKeyConfigured()) {
    const resolved = resolve(resumePath.trim().replace(/^["']|["']$/g, ''));
    if (existsSync(resolved)) {
      spinner.start('Parsing resume...');
      try {
        resumeData = await parseResume(resolved);
        spinner.succeed('Resume parsed');
        log.info(`  Name: ${resumeData.name}`);
        log.info(`  Email: ${resumeData.email}`);
        if (resumeData.work_history.length > 0) {
          log.info('  Work History:');
          for (const w of resumeData.work_history) {
            log.info(`    ${w.role} @ ${w.company} (${w.start_year}-${w.end_year || 'present'})`);
          }
        }
      } catch (err: any) {
        spinner.fail('Failed to parse resume');
        log.error(err.message);
        resumeData = null;
      }
    } else {
      log.warn(`Resume file not found: ${resolved}`);
    }
  } else if (!isNonInteractive && !resumePath) {
    const { hasResume } = await inquirer.prompt([{
      type: 'confirm', name: 'hasResume', message: 'Do you have an existing resume? (PDF/TXT)', default: true,
    }]);
    if (hasResume) {
      if (!isApiKeyConfigured()) {
        log.warn('ANTHROPIC_API_KEY not set — skipping resume parsing. Set it in your environment for full features.');
      } else {
        const { rPath } = await inquirer.prompt([{
          type: 'input', name: 'rPath', message: 'Path to resume:',
        }]);
        const resolved = resolve(rPath.trim().replace(/^["']|["']$/g, ''));
        if (existsSync(resolved)) {
          spinner.start('Parsing resume...');
          try {
            resumeData = await parseResume(resolved);
            spinner.succeed('Resume parsed');
            const { looksRight } = await inquirer.prompt([{
              type: 'confirm', name: 'looksRight', message: 'Look right?', default: true,
            }]);
            if (!looksRight) resumeData = null;
          } catch (err: any) {
            spinner.fail('Failed to parse resume');
            log.error(err.message);
          }
        }
      }
    }
  }

  // Build identity
  const targets = targetRoles.split(',').map((r: string) => r.trim()).filter(Boolean);

  const identity: BuilderIdentity = resumeData
    ? resumeToIdentity(resumeData, role, targets, remotePref, minComp)
    : {
        name,
        email,
        primary_role: role,
        target_roles: targets,
        remote_preference: remotePref,
        min_compensation: minComp,
        previous_companies: [],
        education: [],
        links: {},
        source: 'manual',
      };

  if (name) identity.name = name;
  if (email) identity.email = email;

  await saveJson('identity.json', identity);
  await saveJson('config.json', { excluded_companies: [], auto_apply_threshold: 8 });

  const graph = createEmptySkillGraph(identity);
  await saveGraph(graph);

  log.success('\nProfile saved to ~/.hiregraph/identity.json');
  log.info('Run `hiregraph scan <path>` to analyze your first project.');
}
