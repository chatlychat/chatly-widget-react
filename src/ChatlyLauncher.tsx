/**
 * `<ChatlyLauncher />` — your button, our widget, loaded on demand.
 *
 * ── What it is for ──────────────────────────────────────────────────────
 *
 * Two different jobs, and which one you get depends on whether you give it a
 * `publicId`. That is the only switch, and it is deliberate: a prop named
 * `mode` would make the caller describe something the props already say.
 *
 *   **Owner.** `<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>` and
 *   nothing else on the page. It claims the widget with `lazy: 'manual'`, so
 *   `loader.js` (~2KB) is fetched and `widget.js` (~44KB) is NOT. The first
 *   click loads the bundle and opens the panel. A visitor who never clicks
 *   never pays for the bundle at all.
 *
 *   **Control.** `<ChatlyLauncher>Help</ChatlyLauncher>` on a page that
 *   already renders `<ChatlyWidget>`. It claims nothing and mounts nothing —
 *   clicking it is `useChatly().open()`. This is the shape you want for a
 *   header link or a button inside a modal.
 *
 * ── Why it does not render a styled launcher ────────────────────────────
 *
 * It renders a bare `<button>` with your children in it. That looks like a
 * missing feature and is the point: this package has no stylesheet and no
 * build step beyond `tsc`, so the alternatives were injecting a `<style>` tag
 * from a React component or shipping inline styles that fight Tailwind, a
 * design system and dark mode. The widget's OWN launcher is the styled one —
 * reach for `<ChatlyWidget>` if that is what you want. This is for a host
 * page that already has a button it likes.
 *
 * ── Avoiding two widgets, and two launchers ─────────────────────────────
 *
 * Two mechanisms, for two different mistakes.
 *
 * Double MOUNTING is handled by the shared lifecycle: `startWidget` is
 * reference-counted by claim identity, the first claim owns the
 * configuration, and a second one with different options warns (see
 * `warnOnConflict` in `@chatlychat/widget-element`). So `<ChatlyWidget>` plus
 * `<ChatlyLauncher publicId>` is one widget, not two, and unmounting either
 * one does not take it down.
 *
 * Double LAUNCHERS is the subtler one, because nothing in the lifecycle would
 * catch it: in owner mode the widget would render its own floating bubble
 * next to the button you just styled. So owner mode forces
 * `theme.hideLauncher`, which you can still override by passing
 * `theme={{ hideLauncher: false }}` explicitly if two launchers is genuinely
 * what you want.
 *
 * If `<ChatlyWidget>` mounts FIRST it owns the configuration, and this
 * component's `hideLauncher` is one of the options that loses — so you get
 * both buttons. The fix is to set it on `<ChatlyWidget>`; there is no way for
 * this component to reach into a configuration it does not own, and silently
 * trying would desynchronise the reference count.
 *
 * ── SSR ─────────────────────────────────────────────────────────────────
 *
 * Nothing here touches `window`, `document` or `navigator` at module scope or
 * during render. Everything browser-shaped happens in an effect or an event
 * handler, neither of which runs on a server, and `startWidget` returns an
 * inert handle when there is no `window` at all. `ChatlyLauncher.ssr.spec.tsx`
 * renders this in a Node environment with no DOM — the only honest test of
 * that claim, since a jsdom suite has a `window` and would pass either way.
 */
import { controls, prefetchWidget, startWidget } from '@chatlychat/widget-element';
import { useEffect, useRef } from 'react';

import type {
  ChatlyEmbedHandle,
  ChatlyEmbedHandlers,
  ChatlyEmbedOptions,
  ChatlyLazyMode,
} from '@chatlychat/widget-element';
import type { CSSProperties, MouseEvent, ReactElement, ReactNode } from 'react';

export interface ChatlyLauncherProps extends Partial<ChatlyEmbedOptions>, ChatlyEmbedHandlers {
  /**
   * What goes inside the button. A string, an icon, whatever you render.
   *
   * With no children the button reads "Chat with us", because a launcher
   * with no label is a launcher nobody clicks and an empty `<button>` is an
   * accessibility failure rather than a styling choice.
   */
  children?: ReactNode;
  /** Shorthand for a text-only button. Ignored when `children` is given. */
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** Which tab the panel opens on. */
  openTab?: 'home' | 'messages' | 'help';
  /**
   * When the bundle is fetched, in OWNER mode. Ignored in control mode,
   * where another component already owns the widget.
   *
   * Defaults to `'manual'`: nothing is fetched until this button is used.
   * That is the whole reason this component exists — `lazy={false}` turns it
   * into `<ChatlyWidget theme={{ hideLauncher: true }}>` with extra steps,
   * and is offered only because a host that wants the panel to open with no
   * delay at all has a legitimate reason to ask.
   */
  lazy?: ChatlyLazyMode;
  /**
   * Start the download on hover and focus, so the click that follows finds
   * the bundle in cache. On by default.
   *
   * It is a `('load')` call on the loader, not a mount: nothing is rendered,
   * no session is minted, and a visitor who hovers and leaves has cost
   * themselves one cached file. Turn it off to make the fetch strictly
   * click-triggered — on a page where the button is large or near the
   * pointer's resting place, hover is not much of a signal.
   */
  prefetchOnHover?: boolean;
  /** Runs before the widget is asked to open. Call `preventDefault()` to stop it. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  id?: string;
  /** Defaults to the button's own text, or "Open chat" for an icon-only button. */
  'aria-label'?: string;
}

/** Props that belong to this component rather than to the widget's `init`. */
const LOCAL_PROPS = [
  'children',
  'label',
  'className',
  'style',
  'openTab',
  'prefetchOnHover',
  'onClick',
  'disabled',
  'id',
  'aria-label',
] as const;

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

/**
 * The options the widget is mounted with, in owner mode.
 *
 * `theme.hideLauncher` is merged rather than assigned so an explicit
 * `theme={{ hideLauncher: false }}` still wins — see the header. Spread
 * first, default second, caller's value last.
 */
function optionsFrom(props: ChatlyLauncherProps): ChatlyEmbedOptions {
  const options: Record<string, unknown> = {};
  const skip = new Set<string>([...LOCAL_PROPS, ...HANDLER_PROPS]);
  for (const [key, value] of Object.entries(props)) {
    if (!skip.has(key) && value !== undefined) {
      options[key] = value;
    }
  }
  options['lazy'] = props.lazy ?? 'manual';
  options['theme'] = { hideLauncher: true, ...props.theme };
  return options as unknown as ChatlyEmbedOptions;
}

function handlersFrom(props: ChatlyLauncherProps): ChatlyEmbedHandlers {
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

export function ChatlyLauncher(props: ChatlyLauncherProps): ReactElement {
  const owns = typeof props.publicId === 'string' && props.publicId.length > 0;
  const handle = useRef<ChatlyEmbedHandle | null>(null);

  /*
   * The same stable-forwarder arrangement `<ChatlyWidget>` uses, and for the
   * same reason: `onMessage={(m) => …}` is a new function every render, and
   * handing it to the lifecycle directly either re-registers subscribers on
   * every commit or pins the first render's closure forever.
   */
  const latest = useRef<ChatlyEmbedHandlers>(handlersFrom(props));
  useEffect(() => {
    latest.current = handlersFrom(props);
  });

  const forwarders = useRef<ChatlyEmbedHandlers>({
    onReady: (session) => latest.current.onReady?.(session),
    onOpen: () => latest.current.onOpen?.(),
    onClose: () => latest.current.onClose?.(),
    onMessage: (message) => latest.current.onMessage?.(message),
    onConversation: (detail) => latest.current.onConversation?.(detail),
    onIdentified: (session) => latest.current.onIdentified?.(session),
    onReset: (detail) => latest.current.onReset?.(detail),
    onAction: (detail) => latest.current.onAction?.(detail),
    onError: (detail) => latest.current.onError?.(detail),
  });

  /*
   * Unmount, and only unmount. An empty dependency array is exactly that —
   * plus StrictMode's cleanup/re-mount pair, which the lifecycle's deferred
   * teardown absorbs (`release` in `@chatlychat/widget-element` schedules the
   * teardown as a task and a re-mount cancels it).
   */
  useEffect(() => {
    return () => {
      handle.current?.stop();
      handle.current = null;
    };
  }, []);

  /*
   * Claim, or re-offer the props, after every commit.
   *
   * No dependency array, as in `<ChatlyWidget>`: the lifecycle's structural
   * comparison decides what a change means — `visitor` becomes an
   * `identify()`, and only a material change to the rest costs a re-init.
   *
   * Starting HERE rather than in a mount-only effect is what makes a
   * `publicId` that arrives late work. A page that fetches its channel id,
   * or reads it from a context provider that resolves on the second render,
   * would otherwise get a launcher that is permanently in control mode and
   * warns "no widget is mounted" on every click.
   *
   * Control mode claims NOTHING — not even an empty claim. A claim is what
   * keeps the widget alive, so an extra one from a header button would hold
   * the widget up after the component that configured it had unmounted, and
   * the reference count would never reach zero.
   */
  useEffect(() => {
    if (!owns) {
      handle.current?.stop();
      handle.current = null;
      return;
    }
    if (handle.current === null) {
      handle.current = startWidget(forwarders, optionsFrom(props), forwarders.current);
      return;
    }
    handle.current.update(optionsFrom(props), forwarders.current);
  });

  const prefetch = (): void => {
    if (props.prefetchOnHover === false) {
      return;
    }
    prefetchWidget();
  };

  const open = (event: MouseEvent<HTMLButtonElement>): void => {
    props.onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }
    /*
     * `controls.open()` and nothing else — in particular, NOT a second
     * "please boot now" path.
     *
     * Before the bundle lands this is a queued call, and the loader treats a
     * queued `open` as a trigger: it fetches the bundle, replays the queue,
     * and the panel opens. After the bundle lands it is a direct call. One
     * code path, both states, and the queue that carries it is the same one
     * the snippet has used since the beginning.
     */
    controls.open(props.openTab);
  };

  const content: ReactNode = props.children ?? props.label ?? 'Chat with us';
  const ariaLabel = props['aria-label'] ?? (typeof content === 'string' ? undefined : 'Open chat');

  return (
    <button
      type="button"
      id={props.id}
      className={props.className}
      style={props.style}
      disabled={props.disabled}
      aria-label={ariaLabel}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onClick={open}
    >
      {content}
    </button>
  );
}
