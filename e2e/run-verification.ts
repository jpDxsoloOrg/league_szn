#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import { getEnvironment } from './config/environments';

interface VerificationResult {
  suite: string;
  passed: boolean;
  duration: number;
  error?: string;
}

async function runVerification(): Promise<void> {
  const env = getEnvironment();
  console.log(`\n========================================`);
  console.log(`  Site Verification: ${env.name.toUpperCase()}`);
  console.log(`  URL: ${env.baseUrl}`);
  console.log(`========================================\n`);

  const results: VerificationResult[] = [];
  const suites = [
    { name: 'Navigation', path: 'tests/public/navigation.spec.ts' },
    { name: 'Standings Page', path: 'tests/public/standings.spec.ts' },
    { name: 'Championships Page', path: 'tests/public/championships.spec.ts' },
    { name: 'Matches Page', path: 'tests/public/matches.spec.ts' },
    { name: 'Tournaments Page', path: 'tests/public/tournaments.spec.ts' },
    { name: 'Admin Authentication', path: 'tests/admin/auth.spec.ts' },
    { name: 'Player Management', path: 'tests/admin/players.crud.spec.ts' },
    { name: 'Championship Management', path: 'tests/admin/championships.crud.spec.ts' },
    { name: 'Division Management', path: 'tests/admin/divisions.crud.spec.ts' },
    { name: 'Season Management', path: 'tests/admin/seasons.spec.ts' },
    { name: 'Full Workflow', path: 'tests/integration/full-workflow.spec.ts' },
  ];

  for (const suite of suites) {
    console.log(`\n[Running] ${suite.name}...`);
    const start = Date.now();

    try {
      execSync(`npx playwright test ${suite.path} --reporter=list --project=chromium`, {
        stdio: 'inherit',
        env: { ...process.env, TEST_ENV: env.name },
        cwd: __dirname,
      });

      results.push({
        suite: suite.name,
        passed: true,
        duration: Date.now() - start,
      });
      console.log(`[PASSED] ${suite.name}`);
    } catch (error) {
      results.push({
        suite: suite.name,
        passed: false,
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      console.log(`[FAILED] ${suite.name}`);
    }
  }

  // Summary
  console.log(`\n========================================`);
  console.log(`  VERIFICATION SUMMARY`);
  console.log(`========================================`);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  for (const result of results) {
    const status = result.passed ? '[PASS]' : '[FAIL]';
    console.log(`${status} ${result.suite} (${result.duration}ms)`);
  }

  console.log(`\n----------------------------------------`);
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log(`Duration: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`----------------------------------------\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(console.error);
