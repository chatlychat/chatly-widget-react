/**
 * `@chatlychat/widget-react/server` — the one thing in this package that must
 * never reach a browser.
 *
 * ═══ THE THREAT ══════════════════════════════════════════════════════════
 *
 * Identity verification exists to stop this attack: you call
 * `Chatly('identify', { externalId: user.id })`, and anyone who can read your
 * page source lifts your snippet onto their own site, runs the same line with
 * SOMEBODY ELSE'S user id, and reads that person's entire support history. The
 * defence is a `userHash` — `HMAC-SHA256(channel IDV secret, externalId)` —
 * which only your backend can compute, because only your backend has the
 * secret.
 *
 * A helper that computes that HMAC inside a React package is therefore an
 * invitation to the exact failure the feature prevents. The call needs the
 * secret as an argument; the obvious place for a React developer to put a
 * call is a component; a component is bundled; and a secret in a bundle is a
 * secret every visitor has. At that point identity verification is not merely
 * off, it is WORSE than off: the dashboard says "verified", the API accepts
 * every hash, and the impersonation it was bought to prevent works perfectly
 * while looking defended. One attacker with devtools open gets every
 * customer's conversation history.
 *
 * So the function is here, behind its own entry point, and it refuses to run
 * in a browser.
 *
 * ═══ THE THREE LAYERS, AND WHY THREE ═════════════════════════════════════
 *
 *   1. **A separate subpath.** `@chatlychat/widget-react/server`, not the
 *      package root. `import { chatlyUserHash } from '@chatlychat/widget-react'`
 *      does not and will never resolve — which is the cheapest possible
 *      signal, because it is a type error in the editor before anything is
 *      built.
 *   2. **A `browser` condition.** The `exports` map points this subpath at
 *      `server-browser.js` for every bundler that resolves browser
 *      conditions — webpack, Vite, Rollup, esbuild, Next.js's client
 *      compiler. That file has the same signature and throws.
 *   3. **A runtime guard,** below. Belt and braces for the bundler that does
 *      not honour conditions, the `require` that bypasses them, and the
 *      Electron renderer that is Node AND a browser at once.
 *
 * Layer 2 throws when CALLED rather than when imported, and that is a
 * decision rather than laziness. A module-scope `throw` poisons the whole
 * chunk: the stack trace points at the bundle, every unrelated export in the
 * same chunk dies with it, and an import that a dead code branch never
 * actually uses takes the page down. Throwing at the call site names the
 * mistake where it was made. `scripts/check-esm-linkable.mjs` also imports
 * every built module in this package in a real Node context, so an
 * import-time throw would fail the build for the wrong reason.
 *
 * ═══ WHY NOT A FETCH HELPER ══════════════════════════════════════════════
 *
 * The browser-safe alternative — a helper that GETs a hash from the
 * consumer's own backend — was considered and rejected. It is three lines of
 * `fetch` wrapped in an opinion about a route shape we do not define, it
 * cannot be tested against anything real, and it would have to live beside a
 * node-only implementation anyway for the server that mints the hash. A
 * consumer who wants that writes it in less code than importing it.
 *
 * ═══ THE CONSTRUCTION IS THE SERVER'S, NOT THE DOCS' ═════════════════════
 *
 * Copied from `verifyIdentityHash` in
 * `apps/api/src/modules/widget/security.ts`:
 *
 *     createHmac('sha256', secret).update(externalId).digest('hex')
 *
 * Lowercase HEX, not base64. The secret used as the RAW STRING it was copied
 * as — not hex-decoded first, even though it looks like hex. The message is
 * the `externalId`, not the email and not a concatenation. A hash that is
 * subtly wrong in any of those four ways fails closed with a 403 whose
 * message says only that verification failed, so `server.spec.ts` pins the
 * digest against the vector `packages/sdk-node` pins against the API, and
 * re-runs the API's own constant-time comparison over the result.
 */
import { createHmac } from 'node:crypto';

/**
 * HMAC your visitor's id with the channel's identity-verification secret.
 *
 * **Server only.** The secret must never reach a browser — see the file
 * header for what happens when it does.
 *
 *     // app/layout.tsx — a server component
 *     import { chatlyUserHash } from '@chatlychat/widget-react/server';
 *
 *     const userHash = chatlyUserHash(process.env.CHATLY_IDV_SECRET!, user.id);
 *     return <ChatlyWidget publicId="acme-web"
 *                          visitor={{ externalId: user.id, userHash }} />;
 *
 * Only the digest crosses to the client, which is the whole arrangement: the
 * hash is useless for impersonating anyone else, and it cannot be produced
 * without the secret.
 *
 * Identical in behaviour and in signature to `chatlyIdentityHash` from
 * `@chatlychat/sdk-node`. If your backend already uses that one, keep using
 * it — this exists so a Next.js app does not have to install a second SDK to
 * HMAC a string.
 *
 * @param secret     The web channel's `config.identityVerification.secret`.
 * @param externalId Your own stable id for this person — the same value you
 *                   pass as `visitor.externalId`.
 * @returns 64 lowercase hex characters.
 * @throws if either argument is empty, or if called in a browser.
 */
export function chatlyUserHash(secret: string, externalId: string): string {
  refuseInBrowser();
  /*
   * Empty arguments are refused rather than hashed.
   *
   * An empty secret produces a perfectly valid-looking 64-character digest
   * that any attacker can also compute, which is the one failure mode worse
   * than a wrong hash — the API verifies it against the same empty secret
   * only if the channel also has none, and otherwise 403s with no hint that
   * the cause was an unset env var. `process.env.CHATLY_IDV_SECRET ?? ''` is
   * one line of defensive code away in every consumer.
   *
   * `@chatlychat/sdk-node`'s `chatlyIdentityHash` throws on exactly these
   * two, with the same reasoning.
   */
  if (secret.length === 0) {
    throw new Error('chatlyUserHash: secret is empty');
  }
  if (externalId.length === 0) {
    throw new Error('chatlyUserHash: externalId is empty');
  }
  return createHmac('sha256', secret).update(externalId).digest('hex');
}

/**
 * The third layer: refuse where a secret should not be.
 *
 * `document` as well as `window`, because `window` alone is satisfied by a
 * worker-ish global some bundlers shim in and by jsdom. Both together are a
 * decent proxy for "this code is running somewhere a visitor can read it".
 *
 * A false positive here is possible and acceptable — a server-side renderer
 * that installs a DOM global would be refused, and the message says what to
 * do about it. A false NEGATIVE leaks the secret to every visitor, so the
 * asymmetry decides which way to lean.
 */
function refuseInBrowser(): void {
  if (typeof window === 'undefined' && typeof document === 'undefined') {
    return;
  }
  throw new Error(
    'chatlyUserHash: refusing to run in a browser. The identity-verification secret is a ' +
      'SERVER secret — anything that can compute this hash can impersonate any of your ' +
      'users to the widget. Compute it on your backend and pass only the resulting hash ' +
      'to the client as visitor.userHash.',
  );
}

/**
 * Who is signed in, as your own app already knows it.
 *
 * `email` and `name` are passed straight through to the widget, which uses
 * them to pre-fill the composer and to name the contact in the agent inbox.
 * Neither is verified by anything — only `externalId` is, through the hash —
 * so they are a convenience and never an identity.
 */
export interface ChatlyIdentitySubject {
  /** Your own stable id for this person. The value the hash is computed over. */
  readonly externalId: string;
  readonly email?: string;
  readonly name?: string;
}

export interface ChatlyIdentityHandlerOptions {
  /** The web channel's `config.identityVerification.secret`. Server-only. */
  readonly secret: string;
  /**
   * Who is signed in on THIS request, or `null` for a signed-out visitor.
   *
   * It is handed the request so it can read your own cookie or header, and it
   * may be async. Returning `null` is what signs the widget out; see the
   * asymmetry note below for why nothing else does.
   */
  readonly session: (
    request: Request,
  ) => ChatlyIdentitySubject | null | Promise<ChatlyIdentitySubject | null>;
}

/**
 * The identity route, as an import — 41 lines every customer was writing
 * (EmojiDex XP-4, 2026-11-16).
 *
 * ═══ WHY THIS SHIPS AND THE REST OF THE LOOP DOES NOT ═════════════════════
 *
 * `chatlyUserHash` above is the hard part and has shipped for a while; the
 * route AROUND it had not, so every integrator wrote the same handler. The
 * one reviewed on 2026-11-16 was correct — and its reporter named the line
 * that will be forgotten next time: `cache-control: no-store`. A cached
 * identity answer served to the wrong visitor is the worst defect this
 * feature can have, and it is one header away in a framework that caches
 * route handlers by default. So it is set here, where nobody has to remember
 * it.
 *
 *     // app/api/chatly/identity/route.ts
 *     import { createIdentityHandler } from '@chatlychat/widget-react/server';
 *     import { auth } from '@/lib/auth';
 *
 *     export const GET = createIdentityHandler({
 *       secret: process.env.CHATLY_IDV_SECRET!,
 *       session: async () => {
 *         const user = await auth();
 *         return user === null ? null : { externalId: user.id, name: user.name };
 *       },
 *     });
 *
 * Then point the widget at it: `<ChatlyLauncher identityEndpoint="/api/chatly/identity">`.
 *
 * ═══ A WEB HANDLER, NOT A NEXT ONE ════════════════════════════════════════
 *
 * `(request: Request) => Promise<Response>` is the whole signature, which is
 * what a Next App Router route handler IS — and also a Remix loader, a Hono
 * handler, a Bun or Deno server, and a Cloudflare Worker. A Next-shaped
 * helper would need `next/server` as a dependency of a package whose only
 * dependency is `@chatlychat/widget-element`, to gain nothing: `NextResponse`
 * extends `Response`. Nothing here imports a framework.
 *
 * Express is the one common server this does NOT drop into, because its
 * `req`/`res` are not these. That is said rather than papered over with an
 * adapter nobody asked for.
 *
 * ═══ THE ENVELOPE IS THE CONTRACT ═════════════════════════════════════════
 *
 * `{ identity: {…} | null }`, which is what `identityEndpoint` in
 * `@chatlychat/widget-element` parses — see `identity-loop.ts` for why it is
 * an envelope rather than a bare object, and for the rule that makes this
 * safe to deploy: **only an explicit `null` signs the visitor out.** A route
 * that is briefly down answers neither shape, and the loop then changes
 * nothing rather than resetting every signed-in visitor's session at once.
 * This handler therefore answers `{ identity: null }` ONLY when `session`
 * said so, and lets an error from `session` propagate as the framework's own
 * 500 — which is the honest signal, and the one the loop ignores.
 *
 * @throws at CREATION time if the secret is empty or this runs in a browser,
 * so a missing env var fails at boot rather than per request. An empty secret
 * produces a digest every attacker can also compute.
 */
export function createIdentityHandler(
  options: ChatlyIdentityHandlerOptions,
): (request: Request) => Promise<Response> {
  /*
   * Both checks HERE, not inside the handler. `chatlyUserHash` would refuse
   * an empty secret on the first signed-in visitor, which is a 500 in
   * production for a mistake visible at boot — and a signed-OUT visitor would
   * never reach it, so the route would look healthy under a smoke test that
   * does not sign in.
   */
  refuseInBrowser();
  if (options.secret.length === 0) {
    throw new Error(
      'createIdentityHandler: secret is empty. Pass the channel’s ' +
        'config.identityVerification.secret — an empty secret produces a hash anyone can ' +
        'compute, so identity verification would be worse than off.',
    );
  }
  return async (request: Request): Promise<Response> => {
    const subject = await options.session(request);
    const identity =
      subject === null
        ? null
        : {
            externalId: subject.externalId,
            ...(subject.email === undefined ? {} : { email: subject.email }),
            ...(subject.name === undefined ? {} : { name: subject.name }),
            userHash: chatlyUserHash(options.secret, subject.externalId),
          };
    return new Response(JSON.stringify({ identity }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // The line this helper exists for. An identity answer is per-visitor
        // and must never be stored by a browser, a CDN or a framework's own
        // route cache.
        'cache-control': 'no-store',
      },
    });
  };
}
