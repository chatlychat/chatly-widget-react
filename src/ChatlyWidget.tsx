/**
 * `<ChatlyWidget />` — the widget as a React component.
 *
 * ── What this replaces ──────────────────────────────────────────────────
 *
 * Without it, a React app integrates by hand-writing the effect:
 *
 *     useEffect(() => {
 *       window.Chatly?.init({ publicId });
 *       return () => window.Chatly?.destroy();
 *     }, [publicId]);
 *
 * That snippet has three bugs, and all three were in the version of it we
 * published in our own docs. In StrictMode it boots twice (two sessions, a
 * visibly flickering launcher). With a `theme={{…}}` literal in the deps it
 * re-inits on every parent render, closing the visitor's open panel. And
 * nothing in it ever calls `identify()`, so a visitor who signs in after load
 * stays anonymous — because the only place to put an identity was `init`,
 * which already ran.
 *
 * The lifecycle lives in `@chatlychat/widget-element` (refcounting, deferred
 * teardown, structural prop comparison) so the React and custom-element
 * wrappers cannot drift on the part that is hard.
 *
 * ── React is a peerDependency ───────────────────────────────────────────
 *
 * Declared `peerDependencies`, never `dependencies`. A real dependency would
 * resolve a SECOND copy of React in any consumer whose version differs by so
 * much as a patch, and two Reacts on one page break hooks with
 * "Invalid hook call" — from a component the consumer did not write. A peer
 * dep on the framework the consumer is already using is the one case where
 * adding to the dependency block is right, and it costs their install nothing.
 */
import {
  startWidget,
  type ChatlyEmbedHandle,
  type ChatlyEmbedHandlers,
  type ChatlyEmbedOptions,
} from '@chatlychat/widget-element';
import { useEffect, useRef } from 'react';

import type { CSSProperties, ReactElement } from 'react';

export interface ChatlyWidgetProps extends ChatlyEmbedOptions, ChatlyEmbedHandlers {
  /**
   * Render the chat INSIDE this component's own box instead of floating it in
   * the page corner.
   *
   * This is the React-shaped answer to `mountTo`. The container is a `<div>`
   * this component renders, so it provably exists when `init` runs — which is
   * the failure the widget's `mountTo` refusal exists to make loud ("not
   * mounted — mountTo selector matched nothing"). Give it a height through
   * `className` or `style`; it has a 420px minimum so a container with none
   * is still usable.
   */
  inline?: boolean;
  /** Only meaningful with `inline`. */
  className?: string;
  /** Only meaningful with `inline`. */
  style?: CSSProperties;
}

/**
 * Keys that are this component's own, not the widget's.
 *
 * Listed so `optionsFrom` can strip them by name. Spreading the rest means a
 * widget option added later needs no change here — the failure that costs is
 * the reverse (a prop of ours leaking into `init`), which this prevents.
 */
const LOCAL_PROPS = ['inline', 'className', 'style'] as const;

const HANDLER_PROPS = [
  'onReady',
  'onOpen',
  'onClose',
  'onMessage',
  'onConversation',
  'onIdentified',
  'onReset',
  'onAction',
  'onError',
] as const;

function optionsFrom(props: ChatlyWidgetProps, mountTo: Element | undefined): ChatlyEmbedOptions {
  const options: Record<string, unknown> = {};
  const skip = new Set<string>([...LOCAL_PROPS, ...HANDLER_PROPS]);
  for (const [key, value] of Object.entries(props)) {
    if (!skip.has(key) && value !== undefined) {
      options[key] = value;
    }
  }
  if (mountTo !== undefined) {
    options['mountTo'] = mountTo;
  }
  return options as unknown as ChatlyEmbedOptions;
}

function handlersFrom(props: ChatlyWidgetProps): ChatlyEmbedHandlers {
  return {
    onReady: props.onReady,
    onOpen: props.onOpen,
    onClose: props.onClose,
    onMessage: props.onMessage,
    onConversation: props.onConversation,
    onIdentified: props.onIdentified,
    onReset: props.onReset,
    onAction: props.onAction,
    onError: props.onError,
  };
}

export function ChatlyWidget(props: ChatlyWidgetProps): ReactElement | null {
  const container = useRef<HTMLDivElement | null>(null);
  const handle = useRef<ChatlyEmbedHandle | null>(null);

  /*
   * The latest callbacks, behind a stable indirection.
   *
   * `onMessage={(m) => …}` is a NEW function on every render. Handing it
   * straight to the lifecycle would either re-register subscribers every
   * commit or pin the first render's closure forever — the stale-callback bug
   * that makes a wrapper feel haunted (the handler fires with props from
   * three navigations ago). One stable object of forwarders that read this ref
   * is the standard answer and the only one that is correct in both
   * directions.
   */
  const latest = useRef<ChatlyEmbedHandlers>(handlersFrom(props));
  useEffect(() => {
    latest.current = handlersFrom(props);
    // No dependency array: this must run after EVERY commit, because that is
    // what "latest" means. There is nothing to compare and nothing to skip.
  });

  const forwarders = useRef<ChatlyEmbedHandlers>({
    onReady: (session) => latest.current.onReady?.(session),
    onOpen: (detail) => latest.current.onOpen?.(detail),
    onClose: () => latest.current.onClose?.(),
    onMessage: (message) => latest.current.onMessage?.(message),
    onConversation: (detail) => latest.current.onConversation?.(detail),
    onIdentified: (session) => latest.current.onIdentified?.(session),
    onReset: (detail) => latest.current.onReset?.(detail),
    onAction: (detail) => latest.current.onAction?.(detail),
    onError: (detail) => latest.current.onError?.(detail),
  });

  /*
   * The props of the FIRST render, captured by `useRef`'s initial-value
   * semantics rather than read from the render scope.
   *
   * The mount effect has an empty dependency array — mount and unmount, which
   * is exactly right — and reading `props` inside it would make
   * `react-hooks/exhaustive-deps` demand them as dependencies, at which point
   * the effect re-runs on every render and we are back to re-initialising the
   * widget for a new object literal. The update effect below is what applies
   * later props, and it does so through a structural comparison.
   */
  const initial = useRef(props);

  useEffect(() => {
    if (initial.current.inline === true && container.current === null) {
      /*
       * Should be impossible — effects run after the DOM is committed — but if
       * it ever happens the alternative is mounting a FLOATING widget on a
       * page built to embed one, which is the exact outcome the widget's own
       * refusal path exists to prevent. Refuse, and say which component.
       */
      console.warn('[Chatly] <ChatlyWidget inline> did not get its container — not mounted');
      return undefined;
    }
    const started = startWidget(
      // The claim identity. `forwarders` is a per-instance ref object, so two
      // mounted components are two claims and one of them unmounting does not
      // take the widget with it.
      forwarders,
      optionsFrom(initial.current, container.current ?? undefined),
      forwarders.current,
    );
    handle.current = started;
    return () => {
      started.stop();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    // Again no dependency array. Every commit re-offers the props; the
    // lifecycle decides what, if anything, that means — `visitor` becomes an
    // `identify()`, `locale` a `setLocale()`, and only a material change to
    // the rest costs a re-init.
    handle.current?.update(optionsFrom(props, container.current ?? undefined), forwarders.current);
  });

  if (props.inline !== true) {
    return null;
  }
  return <div ref={container} className={props.className} style={props.style} />;
}
