import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { mkdir, readFile, writeFile } from 'fs/promises';
import type { BrowserContext } from 'playwright';

const SESSIONS_DIR = join(homedir(), '.hiregraph', 'sessions');

/**
 * Check if saved session cookies exist for a domain.
 */
export async function hasSession(domain: string): Promise<boolean> {
  const path = getSessionPath(domain);
  return existsSync(path);
}

/**
 * Load saved cookies into a browser context.
 * Returns true if session was loaded, false if no saved session.
 */
export async function loadSession(context: BrowserContext, domain: string): Promise<boolean> {
  const path = getSessionPath(domain);
  if (!existsSync(path)) return false;

  try {
    const raw = await readFile(path, 'utf-8');
    const cookies = JSON.parse(raw);
    await context.addCookies(cookies);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save current browser context cookies for a domain.
 */
export async function saveSession(context: BrowserContext, domain: string): Promise<void> {
  await ensureSessionsDir();
  const cookies = await context.cookies();
  const domainCookies = cookies.filter(c => c.domain.includes(domain));
  const path = getSessionPath(domain);
  await writeFile(path, JSON.stringify(domainCookies, null, 2), 'utf-8');
}

/**
 * Clear saved session for a domain.
 */
export async function clearSession(domain: string): Promise<void> {
  const { unlink } = await import('fs/promises');
  const path = getSessionPath(domain);
  if (existsSync(path)) {
    await unlink(path);
  }
}

function getSessionPath(domain: string): string {
  return join(SESSIONS_DIR, `${domain}.json`);
}

async function ensureSessionsDir(): Promise<void> {
  if (!existsSync(SESSIONS_DIR)) {
    await mkdir(SESSIONS_DIR, { recursive: true });
  }
}
