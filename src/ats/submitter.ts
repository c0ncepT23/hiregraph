import FormData from 'form-data';
import { loadRegistry } from './registry.js';
import type { JobListing, BuilderIdentity, CompanyRegistryEntry } from '../graph/schema.js';

export interface SubmitResult {
  success: boolean;
  message: string;
  status?: number;
}

export async function submitApplication(
  job: JobListing,
  pdfBuffer: Buffer,
  identity: BuilderIdentity,
): Promise<SubmitResult> {
  const registry = await loadRegistry();
  const company = registry.find(c => c.slug === job.company_slug);
  if (!company) {
    return { success: false, message: `Company not found in registry: ${job.company_slug}` };
  }

  const { source, rawId } = extractRawJobId(job.id);

  switch (source) {
    case 'greenhouse':
      return submitToGreenhouse(company.board_token, rawId, pdfBuffer, identity);
    case 'lever':
      return submitToLever(company.board_token, rawId, pdfBuffer, identity);
    case 'ashby':
      return submitToAshby(rawId, pdfBuffer, identity);
    default:
      return { success: false, message: `Unknown ATS source: ${source}` };
  }
}

function extractRawJobId(normalizedId: string): { source: string; rawId: string } {
  if (normalizedId.startsWith('gh_')) return { source: 'greenhouse', rawId: normalizedId.slice(3) };
  if (normalizedId.startsWith('lv_')) return { source: 'lever', rawId: normalizedId.slice(3) };
  if (normalizedId.startsWith('ab_')) return { source: 'ashby', rawId: normalizedId.slice(3) };
  return { source: 'unknown', rawId: normalizedId };
}

async function submitToGreenhouse(
  boardToken: string,
  rawJobId: string,
  pdfBuffer: Buffer,
  identity: BuilderIdentity,
): Promise<SubmitResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${rawJobId}`;

  const nameParts = (identity.name || '').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const form = new FormData();
  form.append('first_name', firstName);
  form.append('last_name', lastName);
  form.append('email', identity.email);
  if (identity.phone) form.append('phone', identity.phone);
  form.append('resume', pdfBuffer, { filename: 'resume.pdf', contentType: 'application/pdf' });

  // Add links as URLs
  if (identity.links?.github) form.append('urls[GitHub]', identity.links.github);
  if (identity.links?.linkedin) form.append('urls[LinkedIn]', identity.links.linkedin);
  if (identity.links?.portfolio) form.append('urls[Portfolio]', identity.links.portfolio);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: form.getHeaders(),
      body: Uint8Array.from(form.getBuffer()),
      signal: AbortSignal.timeout(30000),
    });

    if (response.ok) {
      return { success: true, message: 'Application submitted via Greenhouse', status: response.status };
    }

    const body = await response.text().catch(() => '');
    return { success: false, message: `Greenhouse HTTP ${response.status}: ${body.slice(0, 200)}`, status: response.status };
  } catch (err: any) {
    return { success: false, message: `Greenhouse error: ${err.message}` };
  }
}

async function submitToLever(
  boardToken: string,
  rawPostingId: string,
  pdfBuffer: Buffer,
  identity: BuilderIdentity,
): Promise<SubmitResult> {
  const url = `https://api.lever.co/v0/postings/${boardToken}/${rawPostingId}`;

  const form = new FormData();
  form.append('name', identity.name || '');
  form.append('email', identity.email);
  if (identity.phone) form.append('phone', identity.phone);
  form.append('resume', pdfBuffer, { filename: 'resume.pdf', contentType: 'application/pdf' });

  if (identity.links?.github) form.append('urls[GitHub]', identity.links.github);
  if (identity.links?.linkedin) form.append('urls[LinkedIn]', identity.links.linkedin);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: form.getHeaders(),
      body: Uint8Array.from(form.getBuffer()),
      signal: AbortSignal.timeout(30000),
    });

    if (response.ok) {
      return { success: true, message: 'Application submitted via Lever', status: response.status };
    }

    const body = await response.text().catch(() => '');
    return { success: false, message: `Lever HTTP ${response.status}: ${body.slice(0, 200)}`, status: response.status };
  } catch (err: any) {
    return { success: false, message: `Lever error: ${err.message}` };
  }
}

async function submitToAshby(
  rawJobId: string,
  pdfBuffer: Buffer,
  identity: BuilderIdentity,
): Promise<SubmitResult> {
  const url = 'https://api.ashbyhq.com/posting-api/applicationForm.submit';

  const nameParts = (identity.name || '').split(' ');

  const body = {
    jobPostingId: rawJobId,
    applicationForm: {
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: identity.email,
      phone: identity.phone || '',
      resume: {
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
        data: pdfBuffer.toString('base64'),
      },
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (response.ok) {
      return { success: true, message: 'Application submitted via Ashby', status: response.status };
    }

    const respBody = await response.text().catch(() => '');
    return { success: false, message: `Ashby HTTP ${response.status}: ${respBody.slice(0, 200)}`, status: response.status };
  } catch (err: any) {
    return { success: false, message: `Ashby error: ${err.message}` };
  }
}
