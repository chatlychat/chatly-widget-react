/**
 * Hooks for controlling a widget that is already mounted.
 *
 * The split matters: `<ChatlyWidget />` OWNS the widget (one per page, high in
 * the tree), and everything else — a "Chat with us" button in the header, a
 * badge in the nav, a help link inside a modal — controls it through
 * `useChatly()`. Rendering a second `<ChatlyWidget />` to get at `open()` is
 * the mistake this exists to make unnecessary, and the lifecycle warns when
 * someone makes it anyway.
 */
import {
  controls,
  prefetchWidget,
  subscribe,
  type ChatlyEventName,
} from '@chatlychat/widget-element';
import { useEffect, useRef } from 'react';

/**
 * What the hook hands back: the widget's methods, plus `load`.
 *
 * ── Why `load` is added HERE and not to `controls` (NPOL-5) ─────────────
 *
 * `controls` mirrors `ChatlyApi` — the methods `window.Chatly` really has —
 * and `scripts/check-widget-wrapper-parity.mjs` compares the two in BOTH
 * directions so that a wrapper cannot invent widget surface. `load` is the
 * LOADER's verb (`WANTS_UI` in `apps/widget-loader/src/lazy.ts`); the bundle
 * has no such method and warns `ignored a call to unknown method "load"` if
 * you hand it one. Putting it on `controls` would therefore need a carve-out
 * in that gate for a method the comparison is right about.
 *
 * So it is composed on at this layer instead, over `prefetchWidget()`, which
 * already exists for exactly this and is already argued for by name in
 * `lazy.ts` — including why it must not go through `dispatch`. The gate keeps
 * its two-way comparison and the README stops telling React consumers to
 * reach through `window.Chatly`.
 *
 * `hasSession()` needed nothing: it IS widget surface, so it has been on
 * `controls` — and on this hook — all along.
 */
const api: typeof controls & { load: () => void } = { ...controls, load: prefetchWidget };

/**
 * The widget's post-boot methods.
 *
 * A module-level constant, returned as-is: it is referentially stable, so it
 * is safe in a dependency array and in a `useCallback` closure, and there is
 * no state for a hook to hold. It is a hook rather than a plain import purely
 * for discoverability — and because it is where the "mount the widget first"
 * contract is documented.
 *
 * Every method returns `void`, including `identify`, which the widget's own
 * API returns a promise from. The call may be queued before the bundle has
 * arrived, and there is nothing to await in that state; `useChatlyEvent`
 * (or `onIdentified`) is how you learn it landed.
 *
 * Calling any of these before a widget has mounted is safe, and since 0.19.0
 * it is not lost either: the call is queued and replayed as soon as one
 * mounts, so a "Chat with us" link that renders above `<ChatlyWidget>` keeps
 * its first click. One console warning says so, because a page that never
 * mounts a widget still gets nothing. It never throws — a click handler on
 * the host page must not break because the chat is misconfigured.
 *
 * `load()` is the exception to "the widget's methods": see `api` above.
 */
export function useChatly(): typeof api {
  return api;
}

/**
 * Subscribe to a widget event for the life of this component.
 *
 * The handler is read through a ref, so an inline arrow function does not
 * re-subscribe on every render — the same reason `<ChatlyWidget />` keeps its
 * callbacks behind one. Without it, a consumer writing the obvious
 * `useChatlyEvent('message', (m) => setCount(c => c + 1))` would register and
 * unregister a subscriber on every commit, and would do so against the
 * widget's `off`, which can only remove a handler it matches by identity.
 *
 * `'ready'` fires immediately if the session is already up: the widget replays
 * the last one, which is what makes this usable from a component that mounts
 * long after the page did.
 */
export function useChatlyEvent(event: ChatlyEventName, handler: (detail: unknown) => void): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    return subscribe(event, (detail) => latest.current(detail));
    // `event` only. The handler is deliberately NOT a dependency — see above.
  }, [event]);
}
