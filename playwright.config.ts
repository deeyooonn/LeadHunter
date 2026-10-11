import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3210', headless: true, channel: 'msedge', screenshot: 'only-on-failure' },
  outputDir: 'artifacts/browser-results',
  webServer: { command: 'npm run dev -- --hostname 127.0.0.1 --port 3210', url: 'http://127.0.0.1:3210', reuseExistingServer: false, timeout: 90000 },
});
