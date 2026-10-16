/**
 * The handler plumbing both components share.
 *
 * ── Why it is here and not written out twice ────────────────────────────
 *
 * `<ChatlyWidget>` and `<ChatlyLauncher>` each had their own `HANDLER_PROPS`
 * list, their own `handlersFrom`, and their own object of stable forwarders —
 * three copies apiece of the same nine names. That made six lists in this
 * package, downstream of the four in `@chatlychat/widget-element`, and on
 * 2026-10-16 all ten of them were missing the same three events: the widget
 * emits `message.ack`, `message.received` and `unread`, and a React consumer
 * could not reach any of them.
 *
 * The names now come from `EVENT_HANDLERS`, which the element package keeps
 * exhaustive against `ChatlyEventName` with the compiler. Adding a widget
 * event reaches a React prop with no edit here at all.
 *
 * The cost is one cast per helper, at a boundary where the key is a variable.
 * The payload types a consumer writes against are unaffected: they live on
 * `ChatlyEmbedHandlers`, which `ChatlyWidgetProps` and `ChatlyLauncherProps`
 * both extend, so `onMessage={(m) => m.conversationId}` is still checked.
 */
import { EVENT_HANDLERS, type ChatlyEmbedHandlers } from '@chatlychat/widget-element';

/**
 * Every handler prop, in the widget's event order.
 *
 * Both components strip these from the props they spread into `init` — a
 * callback is not an init option, and one leaking through would be a key the
 * widget does not know about.
 */
export const HANDLER_PROPS: ReadonlyArray<keyof ChatlyEmbedHandlers> =
  Object.values(EVENT_HANDLERS);

/** The caller's callbacks, copied off whatever props object they came on. */
export function handlersFrom(props: ChatlyEmbedHandlers): ChatlyEmbedHandlers {
  const handlers: Record<string, unknown> = {};
  for (const name of HANDLER_PROPS) {
    handlers[name] = props[name];
  }
  return handlers as ChatlyEmbedHandlers;
}

/**
 * One stable forwarder per event, reading through `latest`.
 *
 * This is the indirection that makes an inline arrow prop safe:
 * `onMessage={(m) => …}` is a new function on every render, and handing it
 * straight to the lifecycle would either re-register subscribers every commit
 * or pin the first render's closure forever. The objects this returns are
 * created once per component instance (`useRef`'s initial value) and never
 * replaced.
 */
export function forwardersTo(latest: { current: ChatlyEmbedHandlers }): ChatlyEmbedHandlers {
  const forwarders: Record<string, (detail?: unknown) => void> = {};
  for (const name of HANDLER_PROPS) {
    forwarders[name] = (detail?: unknown): void => {
      // The handler signatures differ per event; the detail is the widget's
      // own payload, forwarded untouched. Same single cast as the forwarder
      // table in `@chatlychat/widget-element`, and for the same reason.
      const handler = latest.current[name] as ((d?: unknown) => void) | undefined;
      handler?.(detail);
    };
  }
  return forwarders as ChatlyEmbedHandlers;
}
