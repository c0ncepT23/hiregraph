import { loadJson, saveJson } from '../storage/store.js';
import type { ApplicationHistory, ApplicationRecord, ApplicationStatus } from '../graph/schema.js';

const HISTORY_FILE = 'history.json';

export async function loadHistory(): Promise<ApplicationHistory> {
  const data = await loadJson<ApplicationHistory>(HISTORY_FILE);
  return data || { applications: [], last_updated: new Date().toISOString() };
}

export async function saveHistory(history: ApplicationHistory): Promise<void> {
  history.last_updated = new Date().toISOString();
  await saveJson(HISTORY_FILE, history);
}

export async function addApplication(record: ApplicationRecord): Promise<void> {
  const history = await loadHistory();
  history.applications.push(record);
  await saveHistory(history);
}

export async function updateApplicationStatus(
  appId: string,
  status: ApplicationStatus,
  notes?: string,
): Promise<ApplicationRecord | null> {
  const history = await loadHistory();
  const app = history.applications.find(
    a => a.id === appId || a.id.startsWith(appId),
  );
  if (!app) return null;

  app.status = status;
  app.updated_at = new Date().toISOString();
  if (notes) app.notes = notes;

  await saveHistory(history);
  return app;
}

export function findByJobId(
  history: ApplicationHistory,
  jobId: string,
): ApplicationRecord | undefined {
  return history.applications.find(a => a.job_id === jobId);
}

export function generateAppId(): string {
  const ts = Date.now().toString(36).slice(-4);
  const rand = Math.random().toString(36).slice(2, 6);
  return `app_${ts}${rand}`;
}
