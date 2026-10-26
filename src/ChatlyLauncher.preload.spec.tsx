/**
 * NCH-18 — a returning chatter must not have to click to see their reply.
 *
 * ── The defect ──────────────────────────────────────────────────────────
 *
 * `<ChatlyLauncher publicId>` claimed the widget with `lazy: 'manual'`, and
 * `'manual'` is the one lazy mode that deliberately refuses to load for a
 * returning chatter (the refusal is argued by name on `LoaderShim.hasSession`
 * in `apps/widget-loader/src/lazy.ts`). So a visitor who asked a question
 * yesterday and got an answer overnight came back to a plain button: no
 * badge, no thread, and a reply that stayed invisible until they happened to
 * click. Counting unread needs the bundle, and the bundle was what nothing
 * was fetching.
 *
 * ── What is asserted HERE, and what is asserted next door ───────────────
 *
 * `widget.js` is requested by `loader.js`, never by this package — so no test
 * in this repository can observe both halves in one document without
 * importing an app into a published package's suite. The halves are split
 * deliberately, and each one asserts on a REQUEST rather than on a result
 * some fixture handed back:
 *
 *   - **here**: the `<script>` this component actually puts in the head, the
 *     shim properties the loader reads to make its decision, and the real
 *     queue the loader replays. No stand-in `window.Chatly` at all in the
 *     first two blocks — the component installs its own queueing shim, which
 *     is the object a real page has, so there is nothing to echo a call back.
 *   - **`apps/widget-loader/src/lazy-returning-visitor.spec.ts`**, under
 *     "the shim `<ChatlyLauncher publicId>` produces": the REAL loader,
 *     driven from exactly the shim state pinned below, against a seeded
 *     `chatly:vr:<publicId>` — where the `widget.js` script insertion is
 *     observable. If this file's expectations and that file's inputs ever
 *     disagree, the chain is broken and one of the two is lying.
 *
 * ── The storage read IS this package's now (2026-10-26) ────────────────
 *
 * This said the read was deliberately unmocked because "nothing in
 * `@chatlychat/widget-react` or `@chatlychat/widget-element` reads
 * `chatly:vr:*`", and seeding it would be a fixture that decides nothing.
 * That stopped being true when the lazy triggers moved into the wrapper
 * package: `hasStoredThread` runs here, so the seed is now the input the
 * preload decision is actually made from, and the tests below set it.
 *
 * It also changed what a first-time visitor pays. Owner mode used to fetch
 * `loader.js` at mount unconditionally; now the fetch waits for a trigger, so
 * a first-time visitor's page load makes NO request to any Chatly host. The
 * returning-chatter preload is unchanged and is what acceptance 1 pins — it
 * just has to seed the thread to get it, which is a better test than the one
 * it replaces: that one passed whether or not the branch existed.
 */
import { __testing } from '@chatlychat/widget-element';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatlyLauncher } from './ChatlyLauncher.js';
import { ChatlyWidget } from './ChatlyWidget.js';

interface ShimWindow {
  Chatly?: ((...args: unknown[]) => void) & {
    q?: unknown[];
    publicId?: string;
    lazy?: unknown;
  };
}

const w = globalThis.window as unknown as ShimWindow;

/** Every method name sitting in the queue the loader will read, in order. */
function queuedMethods(): string[] {
  return (w.Chatly?.q ?? [])
    .map((entry) => (entry as ArrayLike<unknown>)[0])
    .filter((name): name is string => typeof name === 'string');
}

/** The options of the queued `init` — what the loader reads `theme` from. */
function queuedInitOptions(): Record<string, unknown> {
  const entry = (w.Chatly?.q ?? []).find((e) => (e as ArrayLike<unknown>)[0] === 'init');
  return ((entry as ArrayLike<unknown> | undefined)?.[1] ?? {}) as Record<string, unknown>;
}

/**
 * `WANTS_UI` in `apps/widget-loader/src/lazy.ts`: the queued calls that make
 * the loader fetch the bundle. A copy, because the loader is an app and this
 * is a published package — and the one that matters, `load`, is also pinned
 * next door.
 */
const WANTS_UI = ['load', 'open', 'toggle', 'show', 'boot', 'startConversation'];

function loaderScripts(): HTMLScriptElement[] {
  return [...document.head.querySelectorAll('script')];
}

function button(container: HTMLElement): HTMLButtonElement {
  const el = container.querySelector('button');
  if (el === null) {
    throw new Error('no button rendered');
  }
  return el;
}

/**
 * A working `localStorage`, optionally seeded with a thread for `publicId`.
 *
 * `window.localStorage` is `undefined` under this suite even though the config
 * gives the document a real URL: jsdom 30 does not expose it through the
 * key-copy vitest's jsdom environment performs. The loader's own harness
 * carries the same stub for the same reason — see `installStore` in
 * `apps/widget-loader/src/loader-harness.ts`.
 *
 * `chatly:vr:<publicId>` is the unread watermark, and its mere EXISTENCE is
 * what `hasStoredThread` reads as "this browser has chatted here". The value
 * is deliberately not a realistic payload: anything that looked like one would
 * suggest the shape matters, and it does not.
 */
function installStore(seedThreadFor?: string): void {
  const map = new Map<string, string>();
  if (seedThreadFor !== undefined) {
    map.set(`chatly:vr:${seedThreadFor}`, '{}');
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    vi.stubGlobal(name, {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  installStore();
  __testing.reset();
  // No recording stand-in: the component installs the real queueing shim,
  // exactly as it does on a page where the loader has not arrived yet.
  delete w.Chatly;
  for (const script of loaderScripts()) {
    script.remove();
  }
});

afterEach(() => {
  __testing.reset();
  delete w.Chatly;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('what owner mode asks the loader for (acceptance 1)', () => {
  it('requests loader.js synchronously on mount for a returning chatter', () => {
    // The seed IS the feature. Without a stored thread this is a first-time
    // visitor and the correct answer is no request at all — which is what the
    // next block asserts.
    installStore('acme-web');
    render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);

    /*
     * Asserted BEFORE any timer is advanced, and that is the test.
     * "Within 1s of mount" is only achievable if the request goes out in the
     * mount commit: a preload that waits for a task or a frame is a preload
     * the visitor's own click beats on a slow connection, which is the state
     * they were in already.
     */
    const scripts = loaderScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.src).toBe('https://widget.chatlychat.com/loader.js');
    expect(scripts[0]?.async).toBe(true);

    /*
     * The three shim facts the decision rests on. `publicId` is the key
     * `chatly:vr:*` is looked up under, so getting it wrong is a preload that
     * silently never happens — and now that the lookup runs in this package
     * rather than in `loader.js`, this suite can see the consequence.
     */
    expect(w.Chatly?.publicId).toBe('acme-web');
    expect(queuedInitOptions()['theme']).toEqual({ hideLauncher: true });

    /*
     * `lazy` is CLEARED by the time the script goes in, and that is deliberate
     * rather than a loss. `loader.js` reads it as its own script evaluates, so
     * leaving it would arm a second set of triggers behind a decision this
     * package has already made — in `'launcher'` mode drawing no placeholder
     * (there is one already) and then waiting for a click the returning
     * visitor never has to give. The mode it ASKED for is observable in the
     * first-time case below, where nothing fired.
     */
    expect('lazy' in (w.Chatly ?? {})).toBe(false);
  });

  it('requests nothing at mount for a first-time visitor', () => {
    /*
     * The control for the test above: with no stored thread, the same mount
     * makes no request. Without this, seeding storage would prove nothing —
     * the old version of acceptance 1 passed whether or not the
     * returning-chatter branch existed, because owner mode fetched the loader
     * for everybody.
     */
    render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    expect(loaderScripts()).toHaveLength(0);
    expect(w.Chatly?.lazy).toBe('launcher');
  });

  it('asks for a mode the loader preloads in, not the one that refuses', () => {
    // `'manual'` is the single mode whose returning-chatter branch is OFF.
    // Pinned as an inequality as well as the equality above, so that a future
    // mode change has to be deliberate about this one property.
    render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    expect(w.Chatly?.lazy).not.toBe('manual');
  });

  it('asks the loader to paint no stand-in launcher beside the host button', () => {
    /*
     * `theme.hideLauncher` is what makes `'launcher'` and `'manual'`
     * equivalent for a first-time visitor: `armLazyLoad` skips the
     * placeholder when it is set, so the only trigger armed is the queue
     * watch. Without it, moving the default would have put a second bubble
     * on every page using this component.
     */
    render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    expect(queuedInitOptions()['theme']).toEqual({ hideLauncher: true });
    expect(queuedInitOptions()['mountTo']).toBeUndefined();
  });

  it('still asks for nothing at all in control mode', () => {
    // No publicId: another component owns the widget, and this one must not
    // inject a loader or touch the shim.
    render(<ChatlyLauncher>Help</ChatlyLauncher>);
    expect(loaderScripts()).toHaveLength(0);
    expect(w.Chatly).toBeUndefined();
  });

  it('cannot ask twice, or ask at all as a non-owner', () => {
    /*
     * The decision is made ONCE, by the loader, from one shim property that
     * only the first claim writes — so there is no second preload to fire and
     * no way for a joining claim to fire one. `<ChatlyWidget>` mounted first
     * owns the configuration here, so the mode stays its own (eager, which
     * loads for everybody including a returning chatter) and the launcher's
     * `'launcher'` loses, exactly as every other non-owner option does.
     *
     * This is the regression the mode-based fix cannot have: a `load()` call
     * in a mount effect would have been made by BOTH components, and the
     * second one would have been a non-owner overriding a configuration it
     * does not own.
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <>
        <ChatlyWidget publicId="acme-web" />
        <ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>
      </>,
    );
    expect(loaderScripts()).toHaveLength(1);
    expect(w.Chatly?.lazy).toBeUndefined();
    expect(queuedMethods().filter((m) => m === 'init')).toHaveLength(1);
    warn.mockRestore();
  });
});

describe('a first-time visitor pays for nothing at all (acceptance 2)', () => {
  it('requests nothing and queues nothing that would fetch the bundle', () => {
    render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    act(() => void vi.advanceTimersByTime(1000));

    /*
     * This block was titled "pays for nothing but the loader" and asserted
     * ONE script in the head, because owner mode fetched `loader.js` at mount
     * whatever `lazy` said. It is zero now: the triggers are in this package,
     * so the decision is made before any request rather than inside the
     * script that had to be fetched to make it.
     */
    expect(loaderScripts()).toHaveLength(0);
    expect(queuedMethods().filter((m) => WANTS_UI.includes(m))).toEqual([]);
  });

  it('asks for the bundle on hover', () => {
    const { container } = render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    // `pointerOver`, not `pointerenter`: React synthesises `onPointerEnter`
    // from the bubbling pair, so a direct `pointerenter` runs nothing.
    act(() => void fireEvent.pointerOver(button(container)));
    expect(queuedMethods()).toContain('load');
  });

  it('asks for the bundle on focus, so a keyboard visitor gets the head start', () => {
    const { container } = render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    act(() => void fireEvent.focus(button(container)));
    expect(queuedMethods()).toContain('load');
  });

  it('asks for the bundle AND the panel on click', () => {
    const { container } = render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    act(() => void button(container).click());
    expect(queuedMethods()).toContain('open');
  });

  it('queues nothing on hover or focus with the prefetch turned off', () => {
    const { container } = render(
      <ChatlyLauncher publicId="acme-web" prefetchOnHover={false}>
        Chat
      </ChatlyLauncher>,
    );
    act(() => {
      fireEvent.pointerOver(button(container));
      fireEvent.focus(button(container));
    });
    expect(queuedMethods().filter((m) => WANTS_UI.includes(m))).toEqual([]);
  });
});

describe('a reply that arrived while the tab was closed (acceptance 3)', () => {
  /*
   * The unread total itself is the bundle's — it is counted from
   * `chatly:vr:<publicId>` against the conversation endpoints, in
   * `apps/widget`. What this component owns is whether the host is subscribed
   * in time to hear it, and that is a question about ORDER: the widget
   * replays `ready` to a late subscriber but `unread` is a moment, so a
   * subscription that lands after `init` misses the first emission — the one
   * that carries the reply waiting since yesterday.
   */
  it('subscribes to unread BEFORE init, so the first total is not missed', () => {
    render(
      <ChatlyLauncher publicId="acme-web" onUnread={() => undefined}>
        Chat
      </ChatlyLauncher>,
    );
    const methods = queuedMethods();
    const subscribed = (w.Chatly?.q ?? []).findIndex(
      (e) => (e as ArrayLike<unknown>)[0] === 'on' && (e as ArrayLike<unknown>)[1] === 'unread',
    );
    expect(subscribed).toBeGreaterThanOrEqual(0);
    expect(subscribed).toBeLessThan(methods.indexOf('init'));
  });

  it('delivers { count: 1 } to onUnread with no click anywhere', () => {
    const onUnread = vi.fn();
    render(
      <ChatlyLauncher publicId="acme-web" onUnread={onUnread}>
        Chat
      </ChatlyLauncher>,
    );

    /*
     * The forwarder is taken OUT OF THE QUEUE — the same array the loader
     * drains and hands to the bundle — and called with the payload the widget
     * emits. Nothing here is a stand-in that could agree with a broken
     * wrapper: if the subscription were missing, there would be no function
     * to find.
     */
    const entry = (w.Chatly?.q ?? []).find(
      (e) => (e as ArrayLike<unknown>)[0] === 'on' && (e as ArrayLike<unknown>)[1] === 'unread',
    ) as ArrayLike<unknown> | undefined;
    const forward = entry?.[2] as ((detail: unknown) => void) | undefined;
    expect(typeof forward).toBe('function');
    act(() => {
      forward?.({ count: 1 });
    });

    expect(onUnread).toHaveBeenCalledWith({ count: 1 });
    // And nothing that needed a visitor's hand: no hover, no focus, no click,
    // so nothing in the queue that a visitor reaching for the chat would put
    // there.
    expect(queuedMethods().filter((m) => WANTS_UI.includes(m))).toEqual([]);
  });
});
