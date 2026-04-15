import PDFDocument from 'pdfkit';
import { writeFile } from 'fs/promises';
import { ensureSubDir } from '../storage/store.js';
import { getPath } from '../storage/store.js';
import { join } from 'path';
import type { SkillGraph, ResumeTailoring, WorkHistory, ProjectEntry, Education } from '../graph/schema.js';

const MARGIN = 54; // 0.75 inch
const PAGE_WIDTH = 612; // Letter
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT_BODY = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const SIZE_NAME = 18;
const SIZE_SECTION = 12;
const SIZE_BODY = 10.5;
const SIZE_SMALL = 9.5;
const COLOR_BLACK = '#000000';
const COLOR_GRAY = '#444444';
const COLOR_ACCENT = '#2B6CB0';

const NON_ENGINEERING_ROLES = ['pm', 'product', 'designer', 'design', 'marketing', 'operations', 'consultant', 'manager'];

const ROLE_DISPLAY_MAP: Record<string, string> = {
  pm: 'Product Manager',
  product: 'Product Manager',
  engineer: 'Software Engineer',
  designer: 'Designer',
  founder: 'Founder',
  builder: 'Builder',
};

const SKILL_CATEGORIES: Record<string, string[]> = {
  Languages: ['TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Java', 'C', 'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Dart', 'Scala', 'Elixir', 'Haskell', 'SQL', 'Shell', 'Lua', 'R', 'Zig'],
  Frameworks: ['React', 'React Native', 'Next.js', 'Vue', 'Nuxt', 'Svelte', 'SvelteKit', 'Angular', 'Express', 'Fastify', 'NestJS', 'Django', 'Flask', 'FastAPI', 'Actix', 'Axum', 'Gin', 'Fiber', 'Expo', 'Hono', 'Remix', 'Astro', 'Gatsby', 'Solid'],
  'Data & AI': ['Prisma', 'Drizzle', 'TypeORM', 'Sequelize', 'Mongoose', 'SQLAlchemy', 'Pandas', 'NumPy', 'TensorFlow', 'PyTorch', 'LangChain', 'Anthropic SDK', 'OpenAI'],
  Infrastructure: ['Supabase', 'Firebase', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Vercel', 'Tokio', 'Serde'],
};

export async function generateResumePdf(
  graph: SkillGraph,
  tailoring: ResumeTailoring,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const identity = graph.builder_identity;
    const isNonEngineering = NON_ENGINEERING_ROLES.some(r =>
      identity.primary_role?.toLowerCase().includes(r),
    );

    // Header — name + role title
    doc.font(FONT_BOLD).fontSize(SIZE_NAME).fillColor(COLOR_BLACK);
    doc.text(identity.name || 'Builder', { align: 'center' });

    // Role title below name
    if (identity.primary_role) {
      const displayRole = ROLE_DISPLAY_MAP[identity.primary_role.toLowerCase()]
        || identity.primary_role.charAt(0).toUpperCase() + identity.primary_role.slice(1);
      doc.font(FONT_BODY).fontSize(SIZE_BODY).fillColor(COLOR_ACCENT);
      doc.text(displayRole, { align: 'center' });
    }
    doc.moveDown(0.2);

    const contactParts: string[] = [];
    if (identity.email) contactParts.push(identity.email);
    if (identity.phone) contactParts.push(identity.phone);
    const linkParts: string[] = [];
    for (const [, url] of Object.entries(identity.links || {})) {
      if (url) linkParts.push(url);
    }

    doc.font(FONT_BODY).fontSize(SIZE_SMALL).fillColor(COLOR_GRAY);
    if (contactParts.length > 0) {
      doc.text(contactParts.join('  |  '), { align: 'center' });
    }
    if (linkParts.length > 0) {
      doc.text(linkParts.join('  |  '), { align: 'center' });
    }
    doc.moveDown(0.8);

    // Professional Summary
    renderSectionHeader(doc, 'PROFESSIONAL SUMMARY');
    doc.font(FONT_BODY).fontSize(SIZE_BODY).fillColor(COLOR_BLACK);
    doc.text(tailoring.professional_summary, { lineGap: 2 });
    doc.moveDown(0.6);

    // Core competencies (non-tech skills from resume)
    const nonTechSkills = getNonTechSkills(identity.resume_skills || []);
    if (nonTechSkills.length > 0) {
      renderSectionHeader(doc, 'CORE COMPETENCIES');
      doc.font(FONT_BODY).fontSize(SIZE_BODY).fillColor(COLOR_BLACK);
      doc.text(nonTechSkills.join('  |  '), { lineGap: 2 });
      doc.moveDown(0.6);
    }

    if (isNonEngineering) {
      // Non-engineering: Work Experience first, then Skills, then Projects
      renderWorkExperience(doc, identity);
      renderTechnicalSkills(doc, tailoring, graph);
      renderProjects(doc, graph, tailoring);
    } else {
      // Engineering: Skills first, then Work Experience, then Projects
      renderTechnicalSkills(doc, tailoring, graph);
      renderWorkExperience(doc, identity);
      renderProjects(doc, graph, tailoring);
    }

    // Education
    if (identity.education && identity.education.length > 0) {
      renderSectionHeader(doc, 'EDUCATION');
      for (const edu of identity.education) {
        renderEducation(doc, edu);
      }
    }

    doc.end();
  });
}

export async function saveResumePdf(pdfBuffer: Buffer, jobId: string): Promise<string> {
  await ensureSubDir('resumes');
  const filename = `${jobId.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const filepath = join(getPath('resumes'), filename);
  await writeFile(filepath, pdfBuffer);
  return filepath;
}

function renderSectionHeader(doc: PDFKit.PDFDocument, title: string): void {
  doc.font(FONT_BOLD).fontSize(SIZE_SECTION).fillColor(COLOR_ACCENT);
  doc.text(title);
  doc.moveTo(MARGIN, doc.y + 2).lineTo(PAGE_WIDTH - MARGIN, doc.y + 2).strokeColor(COLOR_ACCENT).lineWidth(0.75).stroke();
  doc.moveDown(0.4);
}

function renderWorkExperience(doc: PDFKit.PDFDocument, identity: SkillGraph['builder_identity']): void {
  if (identity.previous_companies && identity.previous_companies.length > 0) {
    renderSectionHeader(doc, 'WORK EXPERIENCE');
    for (const work of identity.previous_companies) {
      renderWorkEntry(doc, work);
    }
    doc.moveDown(0.3);
  }
}

function renderTechnicalSkills(doc: PDFKit.PDFDocument, tailoring: ResumeTailoring, graph: SkillGraph): void {
  renderSectionHeader(doc, 'TECHNICAL SKILLS');
  const categorized = categorizeSkills(tailoring.skills_order, graph);
  doc.font(FONT_BODY).fontSize(SIZE_BODY).fillColor(COLOR_BLACK);
  for (const [category, skills] of Object.entries(categorized)) {
    if (skills.length > 0) {
      doc.font(FONT_BOLD).text(`${category}: `, { continued: true });
      doc.font(FONT_BODY).text(skills.join(', '));
    }
  }
  doc.moveDown(0.6);
}

function renderProjects(doc: PDFKit.PDFDocument, graph: SkillGraph, tailoring: ResumeTailoring): void {
  if (graph.projects.length > 0) {
    renderSectionHeader(doc, 'PROJECTS');
    const orderedProjects = orderProjects(graph.projects, tailoring.project_order);
    for (const proj of orderedProjects.slice(0, 4)) {
      renderProject(doc, proj, tailoring.bullet_emphasis[proj.name] || []);
    }
    doc.moveDown(0.3);
  }
}

function getNonTechSkills(resumeSkills: string[]): string[] {
  const allTechLower = new Set(
    Object.values(SKILL_CATEGORIES).flat().map(s => s.toLowerCase()),
  );
  return resumeSkills.filter(s => !allTechLower.has(s.toLowerCase()));
}

function renderWorkEntry(doc: PDFKit.PDFDocument, work: WorkHistory): void {
  const dateRange = `${work.start_year} - ${work.end_year || 'Present'}`;
  doc.font(FONT_BOLD).fontSize(SIZE_BODY).fillColor(COLOR_BLACK);
  doc.text(`${work.role}`, { continued: true });
  doc.font(FONT_BODY).text(` | ${work.company}`);
  doc.font(FONT_BODY).fontSize(SIZE_SMALL).fillColor(COLOR_GRAY);
  doc.text(dateRange);
  doc.fillColor(COLOR_BLACK).fontSize(SIZE_BODY);

  if (work.bullets && work.bullets.length > 0) {
    for (const bullet of work.bullets) {
      doc.text(`  •  ${bullet}`, { indent: 10, lineGap: 1 });
    }
  }
  doc.moveDown(0.4);
}

function renderProject(doc: PDFKit.PDFDocument, proj: ProjectEntry, bullets: string[]): void {
  const stackStr = proj.stack.slice(0, 5).join(', ');
  doc.font(FONT_BOLD).fontSize(SIZE_BODY).fillColor(COLOR_BLACK);
  doc.text(proj.name, { continued: true });
  doc.font(FONT_BODY).fillColor(COLOR_GRAY).text(` | ${proj.domain || 'project'} | ${stackStr}`);
  doc.fillColor(COLOR_BLACK);

  if (proj.description) {
    doc.font(FONT_BODY).fontSize(SIZE_BODY).text(proj.description, { lineGap: 1 });
  }

  const displayBullets = bullets.length > 0 ? bullets : generateDefaultBullets(proj);
  for (const bullet of displayBullets.slice(0, 3)) {
    doc.text(`  •  ${bullet}`, { indent: 10, lineGap: 1 });
  }
  doc.moveDown(0.4);
}

function renderEducation(doc: PDFKit.PDFDocument, edu: Education): void {
  doc.font(FONT_BOLD).fontSize(SIZE_BODY).fillColor(COLOR_BLACK);
  doc.text(`${edu.degree} in ${edu.field}`, { continued: true });
  doc.font(FONT_BODY).text(` | ${edu.institution} | ${edu.year}`);
}

function orderProjects(projects: ProjectEntry[], order: string[]): ProjectEntry[] {
  const byName = new Map(projects.map(p => [p.name, p]));
  const ordered: ProjectEntry[] = [];
  for (const name of order) {
    const proj = byName.get(name);
    if (proj) {
      ordered.push(proj);
      byName.delete(name);
    }
  }
  // Append any not mentioned in order
  for (const proj of byName.values()) {
    ordered.push(proj);
  }
  return ordered;
}

function categorizeSkills(
  skillsOrder: string[],
  graph: SkillGraph,
): Record<string, string[]> {
  const allSkills = skillsOrder.length > 0 ? skillsOrder : Object.keys(graph.tech_stack);
  const result: Record<string, string[]> = {};
  const used = new Set<string>();

  for (const [category, known] of Object.entries(SKILL_CATEGORIES)) {
    const knownLower = new Set(known.map(k => k.toLowerCase()));
    const matched = allSkills.filter(s => knownLower.has(s.toLowerCase()) && !used.has(s.toLowerCase()));
    if (matched.length > 0) {
      result[category] = matched;
      matched.forEach(s => used.add(s.toLowerCase()));
    }
  }

  const remaining = allSkills.filter(s => !used.has(s.toLowerCase()));
  if (remaining.length > 0) {
    result['Other'] = remaining;
  }

  return result;
}

function generateDefaultBullets(proj: ProjectEntry): string[] {
  const bullets: string[] = [];
  if (proj.description) {
    bullets.push(proj.description);
  }
  const stackStr = proj.stack.slice(0, 5).join(', ');
  if (stackStr) {
    bullets.push(`Built using ${stackStr}`);
  }
  return bullets;
}
