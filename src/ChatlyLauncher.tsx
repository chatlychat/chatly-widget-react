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
 *   nothing else on the page. It claims the widget with `lazy: 'launcher'`
 *   and `theme.hideLauncher`, so `loader.js` (~2KB) is fetched and
 *   `widget.js` (~44KB) is NOT. The first hover, focus or click loads the
 *   bundle and opens the panel. A first-time visitor who never reaches for
 *   the button never pays for the bundle at all — and a RETURNING chatter
 *   gets it on mount, because they may have a reply waiting. See
 *   `DEFAULT_OWNER_LAZY`.
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
 * what you want. Note what that override also switches on: `hideLauncher` is
 * what suppresses lazy mode's stand-in launcher, so turning it off means the
 * loader paints its placeholder bubble beside your button and the real one
 * replaces it when the bundle lands.
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

import { forwardersTo, handlersFrom, HANDLER_PROPS } from './handlers.js';

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
   * Defaults to `'launcher'`: nothing is fetched for a first-time visitor
   * until this button is hovered, focused or clicked, and the bundle IS
   * fetched on mount for a returning chatter who already holds a
   * conversation on this channel. That is the whole reason this component
   * exists — `lazy={false}` turns it into
   * `<ChatlyWidget theme={{ hideLauncher: true }}>` with extra steps, and is
   * offered only because a host that wants the panel to open with no delay
   * at all has a legitimate reason to ask.
   *
   * Pass `'manual'` to get the stricter promise: nothing is fetched or
   * painted until something calls `Chatly('load')`, not even for a returning
   * chatter. See `DEFAULT_OWNER_LAZY` for why that is not the default.
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
  /**
   * A CSS selector the panel positions itself above (CHT-D11).
   *
   * ── Read this before reaching for it: you probably do not need it ───────
   *
   * Owner mode forces `theme.hideLauncher`, and with `hideLauncher` and no
   * `panelOffsetY` the widget anchors the panel to whichever element called
   * `open()` — which is THIS BUTTON, by construction. So the thing this prop
   * is for already happens, and a `<ChatlyLauncher>` that sets nothing does
   * not have the bug (CHT-B04) that the panel covers the button that opened
   * it.
   *
   * What it is for is the case where the panel should clear something OTHER
   * than this button: a sticky bar this button sits inside, a toolbar, a
   * container whose height changes. Name that element instead.
   *
   * ── Why it is a prop of its own and not just `theme={{ anchor }}` ───────
   *
   * That spelling works and always did — `theme` is part of
   * `ChatlyEmbedOptions`. This exists because the ask (CHT-SI17) is for a
   * design-system component to compose over this one with flat props and no
   * product logic of its own: `<SupportChatButton anchor="#bar" />` should
   * not have to know that `anchor` lives inside `theme`. It MERGES into
   * `theme`, so `theme={{ anchor: '#a' }}` and `anchor="#b"` do not fight —
   * the flat prop wins, as the more specific statement.
   *
   * It is deliberately not `anchor={false}`: the opt-out is `panelOffsetY`,
   * a number you measured, and "put the panel back on top of my button" is
   * not a behaviour worth a flag.
   */
  anchor?: string;
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
  /*
   * `anchor` is LOCAL even though it ends up in the options, because it is
   * not an `init` key: it belongs inside `theme`. Left out of this list the
   * loop below would copy it to `options.anchor`, where `init` ignores an
   * unknown key in silence — a prop that typechecks, passes through, and does
   * nothing. That is this repo's most-repeated defect shape and it is one
   * array entry away in either direction.
   */
  'anchor',
] as const;

/**
 * What owner mode asks the loader for when the host says nothing about `lazy`.
 *
 * ── The defect this value is the fix for (NCH-18) ────────────────────────
 *
 * It was `'manual'`, and `'manual'` is the one lazy mode that deliberately
 * does NOT load for a returning chatter — see the `hasSession` docblock in
 * `apps/widget-loader/src/lazy.ts`, where that refusal is argued for by name.
 * So a visitor who asked a question yesterday, got an answer overnight and
 * came back to a page whose only chat affordance is `<ChatlyLauncher>` saw a
 * plain button: no badge, no thread, and a reply that stayed invisible until
 * they happened to click. Counting unread needs the bundle, and the bundle
 * was exactly what nothing was fetching.
 *
 * ── Why the default moved instead of the component calling `load()` ──────
 *
 * The obvious fix is `hasSession() && Chatly('load')` in a mount effect. It
 * is wrong twice.
 *
 * First, as of the fix: `Chatly.hasSession` was assigned by `loader.js` as it
 * evaluated, and the lifecycle injects that script `async` in the very effect
 * this call would sit in. So the predicate read `undefined` —
 * `controls.hasSession()` falls back to `false` — and the preload never fired
 * on a real page. It fired in a test that seeds the stub, which is the shape
 * of green suite this repo has shipped before. That half is no longer true:
 * `startWidget` installs `hasSession` synchronously (`defer-loader.ts`), so
 * the predicate is answerable in a mount effect now. The second reason below
 * is the one still holding this default where it is.
 *
 * Second, `props.lazy ?? 'manual'` cannot tell an absent prop from an
 * explicit `lazy="manual"`, and those two must not behave the same: a host
 * that types `'manual'` has been promised that nothing loads until it says
 * so, and a wrapper that preloads anyway has lied to it. Adding a sentinel
 * for "absent" would make the two distinguishable — and would leave the
 * DEFAULT making a promise it then breaks. The honest fix is for the default
 * to stop choosing the mode whose whole meaning is a promise the wrapper is
 * not in a position to keep. `'launcher'` is an ordinary value a host can
 * type for itself, so there is no hidden mode and no sentinel: absent means
 * `'launcher'`, explicit `'manual'` means `'manual'`.
 *
 * ── Why `'launcher'` is the same thing for everyone but that one visitor ──
 *
 * Owner mode also forces `theme.hideLauncher`, and `armLazyLoad` skips the
 * stand-in launcher when that is set. So with no `mountTo` and no
 * `'interaction'` pre-warm, `'launcher'` and `'manual'` arm exactly the same
 * single trigger — the queue watch that carries this button's `load` and
 * `open` — and differ in one branch only: the returning-chatter preload. A
 * first-time visitor who never touches the button still costs `loader.js`
 * and nothing else, which is what `ChatlyLauncher.preload.spec.tsx` pins.
 */
const DEFAULT_OWNER_LAZY: ChatlyLazyMode = 'launcher';

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
  options['lazy'] = props.lazy ?? DEFAULT_OWNER_LAZY;
  options['theme'] = {
    hideLauncher: true,
    ...props.theme,
    // Last, so the flat prop beats `theme={{ anchor }}` — and spread
    // conditionally, so an absent `anchor` does not write `undefined` over a
    // value the theme object set. `exactOptionalPropertyTypes` is off in this
    // package, so `{ anchor: undefined }` typechecks and would silently blank
    // the theme's own setting.
    ...(props.anchor === undefined ? {} : { anchor: props.anchor }),
  };
  return options as unknown as ChatlyEmbedOptions;
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

  const forwarders = useRef<ChatlyEmbedHandlers>(forwardersTo(latest));

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
