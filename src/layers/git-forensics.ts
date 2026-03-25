import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import type { GitForensicsResult } from '../graph/schema.js';

const execFileAsync = promisify(execFile);

const EMPTY_RESULT: GitForensicsResult = {
  is_git_repo: false,
  commits: 0,
  active_days: 0,
  contributors: 0,
  commits_per_active_day: 0,
  active_days_per_week: 0,
  first_commit: '',
  last_commit: '',
  conventional_commit_ratio: 0,
  branches: 0,
  primary_author: '',
};

const CONVENTIONAL_PREFIXES = [
  'feat:', 'fix:', 'refactor:', 'docs:', 'test:', 'chore:',
  'style:', 'perf:', 'ci:', 'build:', 'revert:',
  'feat(', 'fix(', 'refactor(', 'docs(', 'test(', 'chore(',
];

export async function analyzeGitForensics(projectPath: string): Promise<GitForensicsResult> {
  if (!existsSync(join(projectPath, '.git'))) {
    return { ...EMPTY_RESULT };
  }

  try {
    const opts = { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 };

    const [logResult, branchResult] = await Promise.all([
      execFileAsync('git', ['log', '--format=%an|%aI|%s', '--all'], opts),
      execFileAsync('git', ['branch', '-a', '--format=%(refname:short)'], opts),
    ]);

    const lines = logResult.stdout.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return { ...EMPTY_RESULT, is_git_repo: true };

    const authors: Record<string, number> = {};
    const dates = new Set<string>();
    let conventionalCount = 0;
    let firstDate = '';
    let lastDate = '';

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 3) continue;

      const author = parts[0];
      const date = parts[1];
      const subject = parts.slice(2).join('|');

      authors[author] = (authors[author] || 0) + 1;

      const day = date.slice(0, 10);
      dates.add(day);

      if (!lastDate) lastDate = date;
      firstDate = date;

      const lowerSubject = subject.toLowerCase().trim();
      if (CONVENTIONAL_PREFIXES.some(p => lowerSubject.startsWith(p))) {
        conventionalCount++;
      }
    }

    const activeDays = dates.size;
    const commits = lines.length;
    const firstDateObj = new Date(firstDate);
    const lastDateObj = new Date(lastDate);
    const weeksSpan = Math.max(1, (lastDateObj.getTime() - firstDateObj.getTime()) / (7 * 24 * 60 * 60 * 1000));

    let primaryAuthor = '';
    let maxCommits = 0;
    for (const [author, count] of Object.entries(authors)) {
      if (count > maxCommits) {
        maxCommits = count;
        primaryAuthor = author;
      }
    }

    const branches = branchResult.stdout.trim().split('\n').filter(Boolean).length;

    return {
      is_git_repo: true,
      commits,
      active_days: activeDays,
      contributors: Object.keys(authors).length,
      commits_per_active_day: Math.round((commits / activeDays) * 100) / 100,
      active_days_per_week: Math.round((activeDays / weeksSpan) * 100) / 100,
      first_commit: firstDate,
      last_commit: lastDate,
      conventional_commit_ratio: Math.round((conventionalCount / commits) * 100) / 100,
      branches,
      primary_author: primaryAuthor,
    };
  } catch {
    return { ...EMPTY_RESULT, is_git_repo: true };
  }
}
