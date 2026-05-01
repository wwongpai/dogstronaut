// @ts-check
const { defineConfig, devices } = require('@playwright/test')

/**
 * Playwright configuration for Dogstronaut Tours synthetic browser tests.
 *
 * Designed to run inside a Kubernetes CronJob pod:
 * - Single worker (no parallel runs) to avoid hammering the cluster
 * - Chromium only (headless) — Playwright container ships all browsers but we
 *   only need one for consistent RUM user-agent fingerprinting
 * - List reporter so k8s log scraping captures pass/fail lines cleanly
 * - Generous timeouts because the pod may share a node with other workloads
 */
module.exports = defineConfig({
  testDir: '.',

  // No parallelism — sequential tests to avoid thundering-herd on the booking service
  workers: 1,
  fullyParallel: false,

  // Retry twice for transient failures; booking tests will fail during chaos runs
  // (this is expected — chaos breaking the booking flow is the intended signal)
  retries: 2,

  // Per-test timeout: 45 seconds (booking flow needs time for API calls)
  timeout: 45_000,

  // Navigation / expect timeout
  expect: {
    timeout: 10_000,
  },

  // List reporter is best for k8s log output (no HTML file needed in a pod)
  reporter: 'list',

  use: {
    // Frontend target — override with BASE_URL env var (see k8s manifest).
    baseURL: process.env.BASE_URL || 'http://localhost',

    // Custom user-agent so Datadog RUM can segment synthetic traffic
    userAgent: 'PlaywrightSynthetic/1.0 CosmoCab-LoadTest',

    // Headless Chromium only
    headless: true,

    // Viewport — standard laptop size for realistic Core Web Vitals
    viewport: { width: 1280, height: 720 },

    // Capture screenshot on failure for debugging (stored in /tmp in the pod)
    screenshot: 'only-on-failure',

    // Capture traces on first retry (helps diagnose flaky tests in k8s logs)
    trace: 'on-first-retry',

    // Don't slow down actions (no interactive demo mode in k8s)
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
