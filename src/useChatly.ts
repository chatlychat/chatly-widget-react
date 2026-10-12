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
import { controls, subscribe, type ChatlyEventName } from '@chatlychat/widget-element';
import { useEffect, useRef } from 'react';

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
 * Calling any of these with no widget mounted warns in the console and does
 * nothing. It does not throw: a click handler on the host page must not break
 * because the chat is misconfigured.
 */
export function useChatly(): typeof controls {
  return controls;
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
