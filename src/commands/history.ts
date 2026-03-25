import chalk from 'chalk';
import { loadHistory, updateApplicationStatus } from '../history/tracker.js';
import type { ApplicationStatus } from '../graph/schema.js';
import * as log from '../utils/logger.js';

const VALID_STATUSES: ApplicationStatus[] = [
  'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'no-response',
];

const STATUS_COLORS: Record<string, (s: string) => string> = {
  applied: chalk.cyan,
  screening: chalk.blue,
  interview: chalk.green,
  offer: chalk.bold.green,
  rejected: chalk.red,
  withdrawn: chalk.dim,
  'no-response': chalk.yellow,
};

export async function historyCommand(
  action?: string,
  id?: string,
  options?: { status?: string; notes?: string },
): Promise<void> {
  if (action === 'update' && id) {
    await handleUpdate(id, options?.status, options?.notes);
    return;
  }

  await handleList();
}

async function handleList(): Promise<void> {
  const history = await loadHistory();

  if (history.applications.length === 0) {
    log.info('\n  No applications yet. Run `hiregraph apply <job-id>` to apply.\n');
    return;
  }

  log.header(`\n  HireGraph Application History (${history.applications.length})\n`);

  const sorted = [...history.applications].sort(
    (a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime(),
  );

  for (const app of sorted) {
    const colorFn = STATUS_COLORS[app.status] || chalk.white;
    const age = getTimeAgo(app.applied_at);
    console.log(
      `  ${chalk.dim(app.id.padEnd(14))} ${app.job_title.padEnd(35)} @ ${app.company.padEnd(18)} ${colorFn(app.status.padEnd(12))} ${chalk.dim(age)}`,
    );
    if (app.notes) {
      console.log(`  ${' '.repeat(14)} ${chalk.dim(`Notes: ${app.notes}`)}`);
    }
  }

  console.log();
}

async function handleUpdate(id: string, status?: string, notes?: string): Promise<void> {
  if (!status) {
    log.error(`Status required. Valid: ${VALID_STATUSES.join(', ')}`);
    return;
  }

  if (!VALID_STATUSES.includes(status as ApplicationStatus)) {
    log.error(`Invalid status "${status}". Valid: ${VALID_STATUSES.join(', ')}`);
    return;
  }

  const updated = await updateApplicationStatus(id, status as ApplicationStatus, notes);
  if (!updated) {
    log.error(`Application not found: ${id}`);
    return;
  }

  const colorFn = STATUS_COLORS[updated.status] || chalk.white;
  log.success(`Updated ${updated.id}: ${updated.job_title} @ ${updated.company} -> ${colorFn(updated.status)}`);
}

function getTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
