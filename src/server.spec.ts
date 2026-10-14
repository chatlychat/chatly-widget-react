// @vitest-environment node
/**
 * `chatlyUserHash`, and the two things that can be wrong with it.
 *
 * ── 1. The digest ──────────────────────────────────────────────────────
 *
 * A hash that is subtly different from the server's — base64 instead of hex,
 * uppercase, the email instead of the id, the secret hex-decoded first, a
 * separator between fields — fails CLOSED: the API answers 403 and the
 * message says only that verification failed. It never says "your hash is
 * base64". So this file does not test the function against its own docs. It
 * tests it against:
 *
 *   - the API's actual construction, lifted from `verifyIdentityHash` in
 *     `apps/api/src/modules/widget/security.ts`, including the constant-time
 *     comparison the API performs on it;
 *   - the literal digest `packages/sdk-node/src/index.spec.ts` pins for the
 *     same inputs, so the three implementations are nailed to one value
 *     rather than to each other.
 *
 * ── 2. Where it runs ──────────────────────────────────────────────────
 *
 * The identity-verification secret is a server secret. A helper that computes
 * this hash in a browser hands every visitor the ability to impersonate every
 * user — while the dashboard still reports identity verification as ON, which
 * is worse than having it off. The refusal is tested by faking the globals
 * that say "a visitor can read this".
 *
 * The environment is `node` for the same reason the SSR spec's is: in jsdom
 * `window` exists, so the guard would reject every call and the useful half
 * of this file could not run at all.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { chatlyUserHash as browserStub } from './server-browser.js';
import { chatlyUserHash } from './server.js';

/**
 * `verifyIdentityHash` from `apps/api/src/modules/widget/security.ts`,
 * copied verbatim rather than imported.
 *
 * This package cannot depend on the API — it ships to a customer's bundler —
 * and the point of the copy is that it is the VERIFIER's logic, not the
 * minter's. If the two ever disagree, identity verification rejects every
 * legitimate visitor and the failure looks like a widget bug.
 */
function serverWouldVerify(secret: string, externalId: string, providedHash: string): boolean {
  if (secret.length === 0 || externalId.length === 0 || providedHash.length === 0) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(externalId).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(providedHash.replace(/^sha256[:=]/, ''), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

describe('the digest the server verifies', () => {
  it('passes the API own verification', () => {
    const secret = 'sek_test_secret';
    const externalId = 'user_42';
    expect(serverWouldVerify(secret, externalId, chatlyUserHash(secret, externalId))).toBe(true);
  });

  it('matches the vector @chatlychat/sdk-node pins against the API', () => {
    // Three implementations, one literal. Pinning them against each other
    // would let all three drift together.
    expect(chatlyUserHash('sek_test_secret', 'user_42')).toBe(
      '5e26772dce97d5ba995796e621f83f2e97e6f8c3f9386dbf153a98ab24c10271',
    );
  });

  it('is 64 lowercase hex characters, not base64', () => {
    // `digest('base64')` is a one-character edit away and produces a
    // perfectly plausible-looking string that 403s every request.
    expect(chatlyUserHash('shh', 'user-1')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses the secret as the raw string it was copied as', () => {
    // The generated secret is 64 hex characters, so hex-DECODING it first is
    // the natural mistake. The API does not.
    const secret = 'a'.repeat(64);
    expect(chatlyUserHash(secret, 'user-1')).toBe(
      createHmac('sha256', secret).update('user-1').digest('hex'),
    );
    expect(chatlyUserHash(secret, 'user-1')).not.toBe(
      createHmac('sha256', Buffer.from(secret, 'hex')).update('user-1').digest('hex'),
    );
  });

  it('hashes the externalId alone — no email, no separator, no padding', () => {
    expect(chatlyUserHash('shh', 'user-1')).not.toBe(chatlyUserHash('shh', 'user-1:'));
    expect(chatlyUserHash('shh', 'user-1')).not.toBe(chatlyUserHash('shh', 'a@b.test'));
  });

  it('differs per user and per secret, which is the entire point', () => {
    expect(chatlyUserHash('shh', 'user-1')).not.toBe(chatlyUserHash('shh', 'user-2'));
    expect(chatlyUserHash('a', 'user-1')).not.toBe(chatlyUserHash('b', 'user-1'));
  });

  it.each([
    ['an empty secret', '', 'user-1'],
    ['an empty externalId', 'shh', ''],
  ])('refuses %s rather than returning a hash of nothing', (_label, secret, externalId) => {
    // An empty secret produces a valid-looking digest any attacker can also
    // compute, and the usual cause is an unset env var.
    expect(() => chatlyUserHash(secret, externalId)).toThrow();
  });
});

describe('refusing to run where a visitor could read the secret', () => {
  it('throws when a window exists', () => {
    (globalThis as { window?: unknown }).window = {};
    expect(() => chatlyUserHash('shh', 'user-1')).toThrow(/refusing to run in a browser/);
  });

  it('throws when only a document exists', () => {
    // `window` alone is shimmed by a few bundlers and by jsdom; either global
    // is enough of a signal to stop.
    (globalThis as { document?: unknown }).document = {};
    expect(() => chatlyUserHash('shh', 'user-1')).toThrow(/refusing to run in a browser/);
  });

  it('names the threat, not just the rule', () => {
    (globalThis as { window?: unknown }).window = {};
    expect(() => chatlyUserHash('shh', 'user-1')).toThrow(/impersonate/);
  });

  it('refuses BEFORE validating its arguments', () => {
    // Otherwise the browser message is shadowed by "secret is empty" in the
    // one case a developer is most likely to hit: a server-only env var read
    // in a client component, which is `undefined` there.
    (globalThis as { window?: unknown }).window = {};
    expect(() => chatlyUserHash('', '')).toThrow(/refusing to run in a browser/);
  });
});

describe('the browser stub the exports map points at', () => {
  it('exists with the same signature, so a bundle fails at the call and not at resolution', () => {
    expect(typeof browserStub).toBe('function');
    expect(browserStub.length).toBe(2);
  });

  it('throws when called, naming the threat and the fix', () => {
    expect(() => browserStub('shh', 'user-1')).toThrow(/bundled for the browser/);
    expect(() => browserStub('shh', 'user-1')).toThrow(/impersonate/);
    expect(() => browserStub('shh', 'user-1')).toThrow(/userHash/);
  });

  it('does not throw on IMPORT, which would take the whole chunk down', () => {
    // It is also imported in a real Node context by
    // `scripts/check-esm-linkable.mjs`, where an import-time throw would fail
    // the build for a reason that has nothing to do with the bug.
    expect(browserStub).toBeDefined();
  });
});
