/**
 * What a BUNDLER gets when it resolves `@chatlychat/widget-react/server`.
 *
 * The `exports` map points the `browser` condition here, so webpack, Vite,
 * Rollup, esbuild and Next.js's client compiler all pick this file instead of
 * `server.js`. Three things follow from that, and all three are the point:
 *
 *   - `node:crypto` never enters a browser bundle, so nobody sees the
 *     "can't resolve 'node:crypto'" error and reaches for a polyfill, which
 *     would make the real implementation work in the browser — the exact
 *     outcome this is here to prevent;
 *   - the function still EXISTS, with the same signature, so the build does
 *     not fail on a missing export and the error a developer sees is about
 *     the mistake rather than about module resolution;
 *   - it throws the moment it is called, naming the threat.
 *
 * Why not throw at import time, which would be louder? Because a module-scope
 * `throw` takes the whole chunk with it: the stack points at the bundle, every
 * unrelated export sharing the chunk dies, and an import inside a branch that
 * never runs breaks the page anyway. See the longer note in `server.ts`.
 */

/**
 * The browser stand-in. Always throws — see this file's header and the threat
 * model in `server.ts`.
 *
 * Named for what it does and exported under the public name, rather than
 * declared as a second `function chatlyUserHash`. Two functions of one name
 * are two copies of a decision as far as any reader — or
 * `check-duplicate-helpers.mjs` — can tell, and the gate is right to say so:
 * the one in `server.ts` computes a hash and this one refuses to. They are
 * different functions that happen to share an export name.
 *
 * @throws always.
 */
function refuseInBrowser(_secret: string, _externalId: string): never {
  throw new Error(
    "chatlyUserHash: @chatlychat/widget-react/server was bundled for the browser. It can't " +
      'run there, and it must not: the identity-verification secret is a SERVER secret, and ' +
      'anything that can compute this hash can impersonate any of your users to the widget. ' +
      'Move the call to your backend — a server component, a route handler, an API endpoint — ' +
      'and send only the resulting hash to the client as visitor.userHash.',
  );
}

/**
 * The public name, so `import { chatlyUserHash } from '…/server'` type-checks
 * and resolves in a browser build — and then refuses at call time.
 */
export const chatlyUserHash: (secret: string, externalId: string) => string = refuseInBrowser;
