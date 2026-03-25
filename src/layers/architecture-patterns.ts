import { existsSync } from 'fs';
import { join } from 'path';
import type { FileDiscoveryResult, AstAnalysisResult, ArchitecturePatternsResult } from '../graph/schema.js';

interface PatternSignals {
  name: string;
  score: number;
  maxSignals: number;
}

export async function analyzeArchitecturePatterns(
  projectPath: string,
  fileDiscovery: FileDiscoveryResult,
  astAnalysis: AstAnalysisResult,
): Promise<ArchitecturePatternsResult> {
  const patterns: PatternSignals[] = [
    detectServiceLayer(projectPath, astAnalysis),
    detectMvc(projectPath),
    detectEventDriven(astAnalysis),
    detectRepositoryPattern(astAnalysis),
    detectMicroservices(projectPath),
    detectMonorepo(projectPath),
    detectApiFirst(projectPath, fileDiscovery),
  ];

  const result: Record<string, number> = {};
  let primaryPattern: string | null = null;
  let highestScore = 0;

  for (const p of patterns) {
    const confidence = p.maxSignals > 0
      ? Math.round((p.score / p.maxSignals) * 100) / 100
      : 0;
    if (confidence >= 0.2) {
      result[p.name] = confidence;
      if (confidence > highestScore) {
        highestScore = confidence;
        primaryPattern = p.name;
      }
    }
  }

  return { patterns: result, primary_pattern: primaryPattern };
}

function detectServiceLayer(projectPath: string, ast: AstAnalysisResult): PatternSignals {
  let score = 0;
  const max = 5;

  if (ast.services > 0) score += 2;
  if (ast.services >= 3) score += 1;
  if (existsSync(join(projectPath, 'src', 'services')) || existsSync(join(projectPath, 'services'))) score += 1;
  if (existsSync(join(projectPath, 'src', 'controllers')) || existsSync(join(projectPath, 'controllers'))) score += 1;

  return { name: 'Service Layer', score, maxSignals: max };
}

function detectMvc(projectPath: string): PatternSignals {
  let score = 0;
  const max = 4;

  const mvcDirs = ['models', 'views', 'controllers', 'routes', 'handlers'];
  for (const dir of mvcDirs) {
    if (existsSync(join(projectPath, 'src', dir)) || existsSync(join(projectPath, dir))) {
      score += 1;
    }
  }

  return { name: 'MVC', score: Math.min(score, max), maxSignals: max };
}

function detectEventDriven(ast: AstAnalysisResult): PatternSignals {
  let score = 0;
  const max = 4;

  const eventPackages = ['events', 'eventemitter', 'amqplib', 'kafkajs', 'bullmq', 'ioredis', 'socket.io'];
  for (const pkg of eventPackages) {
    if (ast.imports_used.some(i => i.includes(pkg))) score += 1;
  }

  if (ast.advanced_features.includes('async-await')) score += 0.5;

  return { name: 'Event-Driven', score: Math.min(score, max), maxSignals: max };
}

function detectRepositoryPattern(ast: AstAnalysisResult): PatternSignals {
  let score = 0;
  const max = 4;

  // Check for repository/store classes
  if (ast.services > 0) score += 1; // Services often indicate repository pattern too
  if (ast.imports_used.some(i => ['prisma', '@prisma/client', 'typeorm', 'sequelize', 'drizzle-orm', 'mongoose'].includes(i))) {
    score += 2;
  }
  if (ast.imports_used.some(i => ['@supabase/supabase-js', 'firebase'].includes(i))) {
    score += 1;
  }

  return { name: 'Repository', score, maxSignals: max };
}

function detectMicroservices(projectPath: string): PatternSignals {
  let score = 0;
  const max = 4;

  if (existsSync(join(projectPath, 'docker-compose.yml')) || existsSync(join(projectPath, 'docker-compose.yaml'))) {
    score += 2;
  }
  if (existsSync(join(projectPath, 'Dockerfile'))) score += 1;
  if (existsSync(join(projectPath, 'k8s')) || existsSync(join(projectPath, 'kubernetes'))) score += 1;

  return { name: 'Microservices', score, maxSignals: max };
}

function detectMonorepo(projectPath: string): PatternSignals {
  let score = 0;
  const max = 4;

  if (existsSync(join(projectPath, 'turbo.json'))) score += 2;
  if (existsSync(join(projectPath, 'lerna.json'))) score += 2;
  if (existsSync(join(projectPath, 'pnpm-workspace.yaml'))) score += 2;
  if (existsSync(join(projectPath, 'packages'))) score += 1;
  if (existsSync(join(projectPath, 'apps'))) score += 1;

  return { name: 'Monorepo', score: Math.min(score, max), maxSignals: max };
}

function detectApiFirst(projectPath: string, fileDiscovery: FileDiscoveryResult): PatternSignals {
  let score = 0;
  const max = 4;

  const apiFiles = ['openapi.yml', 'openapi.yaml', 'openapi.json', 'swagger.yml', 'swagger.yaml', 'swagger.json'];
  for (const file of apiFiles) {
    if (existsSync(join(projectPath, file))) {
      score += 2;
      break;
    }
  }

  if (existsSync(join(projectPath, 'src', 'routes')) || existsSync(join(projectPath, 'routes'))) score += 1;
  if (existsSync(join(projectPath, 'src', 'api')) || existsSync(join(projectPath, 'api'))) score += 1;

  return { name: 'API-First', score, maxSignals: max };
}
