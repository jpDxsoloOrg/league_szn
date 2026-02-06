#!/usr/bin/env ts-node

import { spawn, ChildProcess } from 'child_process';
import { chromium, Browser, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEV_SERVER_PORT = 5199;
const BASE_URL = `http://localhost:${DEV_SERVER_PORT}`;
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');
const VIEWPORT = { width: 1280, height: 900 };
const RENDER_DELAY_MS = 500;
const SERVER_STARTUP_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Route definitions organised by feature folder
// ---------------------------------------------------------------------------

interface RouteEntry {
  route: string;
  name: string;
}

const ROUTE_GROUPS: Record<string, RouteEntry[]> = {
  main: [
    { route: '/', name: 'standings' },
    { route: '/championships', name: 'championships' },
    { route: '/matches', name: 'matches' },
    { route: '/tournaments', name: 'tournaments' },
    { route: '/guide', name: 'guide' },
    { route: '/admin', name: 'admin' },
  ],
  fantasy: [
    { route: '/fantasy', name: 'fantasy-landing' },
    { route: '/fantasy/login', name: 'fantasy-login' },
    { route: '/fantasy/signup', name: 'fantasy-signup' },
    { route: '/fantasy/dashboard', name: 'fantasy-dashboard' },
    { route: '/fantasy/leaderboard', name: 'fantasy-leaderboard' },
    { route: '/fantasy/costs', name: 'fantasy-costs' },
  ],
  contenders: [
    { route: '/contenders', name: 'contender-rankings' },
    { route: '/contenders/my-status', name: 'my-contender-status' },
  ],
  events: [
    { route: '/events', name: 'events-calendar' },
    { route: '/events/event-001', name: 'event-detail' },
    { route: '/events/event-001/results', name: 'event-results' },
  ],
  challenges: [
    { route: '/challenges', name: 'challenge-board' },
    { route: '/challenges/challenge-001', name: 'challenge-detail' },
    { route: '/challenges/issue', name: 'issue-challenge' },
    { route: '/challenges/my', name: 'my-challenges' },
  ],
  promos: [
    { route: '/promos', name: 'promo-feed' },
    { route: '/promos/promo-001', name: 'promo-thread' },
    { route: '/promos/new', name: 'promo-editor' },
  ],
  statistics: [
    { route: '/stats', name: 'player-stats' },
    { route: '/stats/head-to-head', name: 'head-to-head' },
    { route: '/stats/leaderboards', name: 'leaderboards' },
    { route: '/stats/records', name: 'record-book' },
    { route: '/stats/tale-of-tape', name: 'tale-of-tape' },
    { route: '/stats/achievements', name: 'achievements' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Start the Vite dev server and wait until it is accepting requests. */
function startDevServer(): ChildProcess {
  console.log(`\n  Starting Vite dev server on port ${DEV_SERVER_PORT}...`);

  const child = spawn('npx', ['vite', '--port', String(DEV_SERVER_PORT)], {
    cwd: FRONTEND_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  // Forward server output so the operator can see progress / errors.
  child.stdout?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      console.log(`  [vite] ${line}`);
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      console.error(`  [vite:err] ${line}`);
    }
  });

  return child;
}

/** Poll the dev server URL until it responds or the timeout expires. */
async function waitForServer(timeoutMs: number): Promise<void> {
  const start = Date.now();
  const url = BASE_URL;

  while (Date.now() - start < timeoutMs) {
    try {
      // Use a raw HTTP request via fetch (Node 18+) or a lightweight approach.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || res.status === 304) {
        console.log('  Vite dev server is ready.\n');
        return;
      }
    } catch {
      // Server not ready yet -- retry.
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Dev server did not start within ${timeoutMs / 1000}s`);
}

/** Gracefully kill the dev server process tree. */
function stopDevServer(child: ChildProcess): void {
  if (child && !child.killed) {
    console.log('\n  Stopping Vite dev server...');
    // Negative PID kills the entire process group on Linux.
    try {
      process.kill(-child.pid!, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('========================================');
  console.log('  League Szn - Screenshot Capture');
  console.log('========================================');

  // Ensure the root screenshots directory exists.
  ensureDir(SCREENSHOTS_DIR);

  // Start the Vite dev server.
  const serverProcess = startDevServer();

  // Make sure the server process is in its own process group so we can kill it
  // cleanly.  spawn with `detached: true` would give us that, but on Linux the
  // shell: true option already creates a group.  We register a cleanup handler
  // so we stop the server even if the script crashes.
  const cleanup = () => stopDevServer(serverProcess);
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    await waitForServer(SERVER_STARTUP_TIMEOUT_MS);

    // Launch the browser.
    const browser: Browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: VIEWPORT,
    });
    const page: Page = await context.newPage();

    let totalCount = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const [group, routes] of Object.entries(ROUTE_GROUPS)) {
      const groupDir = path.join(SCREENSHOTS_DIR, group);
      ensureDir(groupDir);

      console.log(`  [${group}]`);

      for (const entry of routes) {
        totalCount++;
        const url = `${BASE_URL}${entry.route}`;
        const screenshotPath = path.join(groupDir, `${entry.name}.png`);

        try {
          await page.goto(url, { waitUntil: 'load', timeout: 15000 });

          // Wait for network activity to settle (React data fetching, etc.)
          try {
            await page.waitForLoadState('networkidle', { timeout: 10000 });
          } catch {
            // networkidle can time out on pages with long-polling or
            // websockets -- proceed anyway.
          }

          // Give React an extra moment to finish rendering.
          await page.waitForTimeout(RENDER_DELAY_MS);

          // Take a viewport-sized screenshot (not full page).
          await page.screenshot({
            path: screenshotPath,
            fullPage: false,
          });

          console.log(`    OK  ${entry.route} -> ${path.relative(SCREENSHOTS_DIR, screenshotPath)}`);
          successCount++;
        } catch (err) {
          // Page might 404 or throw -- take a screenshot of whatever is
          // visible and continue.
          errorCount++;
          console.error(`    ERR ${entry.route} - ${(err as Error).message}`);

          try {
            await page.screenshot({
              path: screenshotPath,
              fullPage: false,
            });
            console.log(`    (screenshot saved despite error)`);
          } catch {
            console.error(`    (could not save fallback screenshot)`);
          }
        }
      }
    }

    await browser.close();

    // Summary
    console.log('\n========================================');
    console.log('  Screenshot Summary');
    console.log('========================================');
    console.log(`  Total routes : ${totalCount}`);
    console.log(`  Success      : ${successCount}`);
    console.log(`  Errors       : ${errorCount}`);
    console.log(`  Output dir   : ${SCREENSHOTS_DIR}`);
    console.log('========================================\n');

    if (errorCount > 0) {
      console.log('  Some routes encountered errors. Screenshots were still captured where possible.');
    }
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
