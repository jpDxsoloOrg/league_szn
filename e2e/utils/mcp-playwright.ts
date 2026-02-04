/**
 * MCP Playwright Integration Utilities
 *
 * This module provides helper functions and documentation for integrating
 * with MCP Playwright server for AI-assisted browser automation.
 *
 * MCP Playwright allows Claude/AI agents to:
 * - Navigate to URLs
 * - Click elements
 * - Fill forms
 * - Take screenshots
 * - Extract page content
 */

export interface MCPPlaywrightAction {
  action: 'navigate' | 'click' | 'fill' | 'screenshot' | 'get_text' | 'wait';
  selector?: string;
  url?: string;
  value?: string;
  timeout?: number;
}

export interface MCPPlaywrightResult {
  success: boolean;
  data?: unknown;
  error?: string;
  screenshot?: string;
}

/**
 * Instructions for MCP Playwright usage by AI agents
 */
export const mcpPlaywrightInstructions = `
## MCP Playwright Usage Guide

When using MCP Playwright for browser automation, use the following tools:

### Available Tools:
1. **browser_navigate** - Navigate to a URL
   - url: string (required)

2. **browser_click** - Click an element
   - selector: string (CSS selector or text content)

3. **browser_fill** - Fill an input field
   - selector: string (CSS selector)
   - value: string (text to enter)

4. **browser_screenshot** - Take a screenshot
   - Returns base64 encoded image

5. **browser_get_text** - Get text content
   - selector: string (CSS selector)

6. **browser_wait** - Wait for element
   - selector: string (CSS selector)
   - timeout: number (ms, optional)

### Example Workflow for Site Verification:

1. Navigate to the site:
   browser_navigate({ url: "http://dev.leagueszn.jpdxsolo.com" })

2. Take a screenshot of standings:
   browser_screenshot()

3. Navigate to admin:
   browser_navigate({ url: "http://dev.leagueszn.jpdxsolo.com/admin" })

4. Login:
   browser_fill({ selector: "#username", value: "admin" })
   browser_fill({ selector: "#password", value: "FireGreen48!" })
   browser_click({ selector: "button[type='submit']" })

5. Wait for admin panel:
   browser_wait({ selector: ".admin-panel h2" })

6. Navigate through admin tabs and verify functionality...
`;

/**
 * CSS Selectors for common operations with MCP Playwright
 */
export const mcpSelectors = {
  // Navigation
  navStandings: 'nav a[href="/"]',
  navChampionships: 'nav a[href="/championships"]',
  navMatches: 'nav a[href="/matches"]',
  navTournaments: 'nav a[href="/tournaments"]',
  navAdmin: 'nav a[href="/admin"]',

  // Login
  loginUsername: '#username',
  loginPassword: '#password',
  loginSubmit: 'button[type="submit"]',

  // Admin Panel
  adminTitle: '.admin-panel h2',
  adminLogout: '.logout-btn',

  // Admin Tabs
  tabPlayers: '.admin-tabs .tab:first-child',
  tabDivisions: '.admin-tabs .tab:nth-child(2)',
  tabSchedule: '.admin-tabs .tab:nth-child(3)',
  tabResults: '.admin-tabs .tab:nth-child(4)',
  tabChampionships: '.admin-tabs .tab:nth-child(5)',
  tabTournaments: '.admin-tabs .tab:nth-child(6)',
  tabSeasons: '.admin-tabs .tab:nth-child(7)',

  // Content verification
  standingsTable: '.standings-table',
  championshipsGrid: '.championships-grid',
  matchesList: '.matches-list',
  tournamentsList: '.tournaments-list',
};

/**
 * Environment URLs for MCP Playwright
 */
export const mcpEnvironments = {
  local: {
    baseUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:3001/dev',
  },
  dev: {
    baseUrl: 'http://dev.leagueszn.jpdxsolo.com',
    apiUrl: 'https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest',
  },
  prod: {
    baseUrl: 'http://leagueszn.jpdxsolo.com',
    apiUrl: 'https://9pcccl0caj.execute-api.us-east-1.amazonaws.com/dev',
  },
};

/**
 * Admin credentials for testing
 */
export const mcpAdminCredentials = {
  username: 'admin',
  password: 'FireGreen48!',
};
