import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * `@chatlychat/widget-element` by SOURCE, not through its `exports` map.
 *
 * The workspace symlink resolves the package to `dist/index.js`, so this
 * suite tested whatever was last BUILT. On 2026-10-26 that hid four real
 * failures: the wrapper's lazy behaviour changed, this suite was run before
 * anybody rebuilt the sibling, and it reported 82/82 against code that no
 * longer existed. A stale `dist` is the same blindness as a stale turbo cache
 * and reads the same from the outside — green.
 *
 * The published artifact really is `dist`, and that shape is checked by the
 * build plus the mirror repositories' CI. What this suite is for is whether
 * the current source behaves, so it reads the current source.
 */
const widgetElementSrc = fileURLToPath(new URL('../widget-element/src', import.meta.url));

const vitestExecution = { pool: 'threads' as const };

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@chatlychat\/widget-element$/,
        replacement: `${widgetElementSrc}/index.ts`,
      },
      {
        find: /^@chatlychat\/widget-element\/(.*)$/,
        replacement: `${widgetElementSrc}/$1.ts`,
      },
    ],
  },
  test: {
    // Worker THREADS, not forked processes. See @livechat/config/vitest.
    ...vitestExecution,
    // jsdom, deliberately: happy-dom does not implement
    // HTMLScriptElement.nonce, and the CSP-nonce specs here read it. A faster
    // environment that cannot observe a security attribute is the wrong trade.
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
