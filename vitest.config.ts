import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
/**
 * ── The alias applies ONLY in the monorepo, and that is not a nicety ─────
 *
 * This file is copied verbatim into the public mirror
 * (`scripts/sync-sdk-repos.mjs`), where `../widget-element/src` does not exist — the mirror is
 * one package, not a workspace. An unconditional alias therefore redirected
 * `@chatlychat/widget-element` to a path that was not there, and the mirror's
 * suite died with `Failed to resolve import "@chatlychat/widget-element"`.
 *
 * That is exactly the class of bug the repo already has a note about: a path
 * that works in one checkout. It was caught in four minutes by the mirror's
 * own CI, and by nothing local — the sync script builds each mirror but does
 * not run its tests, and the publish workflow runs `npm test` BEFORE
 * `npm publish`, so the broken version never reached npm.
 *
 * In the mirror the package genuinely consumes the published dist, which is
 * the right thing to test there. In the monorepo it must read source, for the
 * reason `scripts/check-sibling-source-resolution.mjs` sets out. So: present
 * when the sibling source is, absent when it is not.
 */
const widgetElementRoot = fileURLToPath(new URL('../widget-element/src', import.meta.url));
const inMonorepo = existsSync(join(widgetElementRoot, 'index.ts'));

const vitestExecution = { pool: 'threads' as const };

export default defineConfig({
  resolve: {
    alias: !inMonorepo
      ? []
      : [
          {
            find: /^@chatlychat\/widget-element$/,
            replacement: `${widgetElementRoot}/index.ts`,
          },
          {
            find: /^@chatlychat\/widget-element\/(.*)$/,
            replacement: `${widgetElementRoot}/$1.ts`,
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
