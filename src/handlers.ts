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
import {
  EVENT_HANDLERS,
  type ChatlyEmbedHandlers,
  type ChatlyEmbedOptions,
} from '@chatlychat/widget-element';

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

/**
 * Every optional property also accepts an explicit `undefined`.
 *
 * ── Why this exists, and why `?:` alone was not enough ───────────────────
 *
 * Under `exactOptionalPropertyTypes` — which this repo does NOT set and two
 * integrators do — `className?: string` and `className: string | undefined`
 * are different types, and only the second accepts a value passed through
 * from a wrapper's own optional prop. So a host component with
 * `className?: string` could not forward it, and the workaround is
 * `{...(className ? { className } : {})}` at every call site: snapnedit
 * wrote it twice and pdfofile twice more, for one prop each.
 *
 * Homomorphic, so it keeps the `?` and only widens the value. Apply it to
 * the INHERITED options, not just the handful of props a component writes
 * out by hand: `ChatlyEmbedOptions` carries 24 of them and a host forwards
 * those too.
 *
 * It costs a non-strict consumer nothing: without the flag the two types are
 * already identical.
 *
 * ── Two components, two shapes, and the difference is load-bearing ──────
 *
 * `LooseOptions` omits `publicId` and `ChatlyWidget` re-declares it, because
 * widening the one REQUIRED member of the 25 would let
 * `publicId={undefined}` typecheck on a component that cannot start without
 * a channel. `Partial` would do the same thing by making it absent-able.
 *
 * `ChatlyLauncher` uses `Loose<Partial<…>>` on purpose, and that is not the
 * same mistake: an absent `publicId` is its owner/companion SWITCH — with one
 * it starts a widget, without one it toggles a widget something else
 * started. Making it required there would delete a documented mode and break
 * six of its own specs.
 *
 * ── What 0.27.0 got wrong, and why its gate agreed ──────────────────────
 *
 * `ChatlyWidget` extended `ChatlyEmbedOptions` RAW, so the four props it
 * writes out by hand accepted `undefined` and the 24 inherited ones did not
 * — which is most of the bug the release claimed to fix, still live for every
 * option an integrator actually forwards. The fixture behind
 * `check-widget-react-exact-optional` forwarded `className` and stopped
 * there, so it exercised only the props named in the fix and passed. It now
 * forwards an inherited option on both components, and pins `publicId`
 * required on one and optional on the other.
 */
export type Loose<T> = { [K in keyof T]: T[K] | undefined };

/** `ChatlyEmbedOptions` with every optional member widened, `publicId` intact. */
export type LooseOptions = Loose<Omit<ChatlyEmbedOptions, 'publicId'>>;
