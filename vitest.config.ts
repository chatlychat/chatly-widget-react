import { defineConfig } from 'vitest/config';

const vitestExecution = { pool: 'threads' as const };

export default defineConfig({
  test: {
    // Worker THREADS, not forked processes. See @livechat/config/vitest.
    ...vitestExecution,
    environment: 'jsdom',
    // A real URL rather than jsdom's `about:blank`, whose opaque origin makes
    // `localStorage` unavailable — the widget bundle these tests stand in for
    // reads it, and a test environment that could not should not be the
    // default here either.
    environmentOptions: { jsdom: { url: 'https://embedder.test/' } },
    include: ['src/**/*.spec.{ts,tsx}'],
    exclude: ['**/node_modules/**'],
  },
});
