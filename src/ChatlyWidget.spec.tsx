/**
 * `<ChatlyWidget />`.
 *
 * These are the bugs a hand-written `useEffect` integration has, in the order
 * a developer meets them: StrictMode boots twice, unmount leaks the widget,
 * and a parent re-render with a fresh object literal re-initialises it under
 * the visitor. Each one is a test here rather than a paragraph in a README.
 *
 * `@testing-library/react` is the dashboard's test library, at the dashboard's
 * version. No new library was added for this package.
 */
import {
  __testing,
  EVENT_HANDLERS,
  WIDGET_EVENT_NAMES,
  type ChatlyHandlerName,
} from '@chatlychat/widget-element';
import { act, render } from '@testing-library/react';
import { StrictMode, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatlyWidget } from './ChatlyWidget.js';
import { useChatly, useChatlyEvent } from './useChatly.js';

let calls: unknown[][] = [];

interface ShimWindow {
  Chatly?: ((...args: unknown[]) => void) & { q?: unknown[]; publicId?: string; nonce?: string };
}

const w = globalThis.window as unknown as ShimWindow;

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c[0] === method).map((c) => c.slice(1));
}

/** Fire the widget-side subscription for `event`, as the bundle would. */
function emit(event: string, detail: unknown): void {
  for (const call of calls) {
    if (call[0] === 'on' && call[1] === event) {
      (call[2] as (d: unknown) => void)(detail);
    }
  }
}

/**
 * A `localStorage` of our own: jsdom under Node does not provide one here, so
 * a test that relies on the real thing reads `undefined` and takes the guarded
 * branch — which passes against an implementation that never reads storage.
 */
const STORE = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get: () => ({
    getItem: (key: string): string | null => STORE.get(key) ?? null,
    setItem: (key: string, value: string): void => void STORE.set(key, value),
    removeItem: (key: string): void => void STORE.delete(key),
    clear: (): void => STORE.clear(),
  }),
});

beforeEach(() => {
  vi.useFakeTimers();
  __testing.reset();
  STORE.clear();
  calls = [];
  w.Chatly = Object.assign((...args: unknown[]) => {
    calls.push(args);
  }, {});
});

afterEach(() => {
  __testing.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('mounting', () => {
  it('initialises once in StrictMode, not twice', () => {
    // React 18 StrictMode runs mount → cleanup → mount. A naive effect makes
    // that two `POST /v1/widget/init` round trips and a launcher that
    // visibly flickers in development.
    render(
      <StrictMode>
        <ChatlyWidget publicId="acme-web" />
      </StrictMode>,
    );
    act(() => void vi.advanceTimersByTime(50));
    expect(argsFor('init')).toHaveLength(1);
    expect(argsFor('destroy')).toHaveLength(0);
  });

  it('passes the props through as init options', () => {
    render(<ChatlyWidget publicId="acme-web" theme={{ primaryColor: '#111111' }} />);
    expect(argsFor('init')[0]?.[0]).toEqual({
      publicId: 'acme-web',
      theme: { primaryColor: '#111111' },
    });
  });

  it('never passes its OWN props to the widget', () => {
    // `inline`, `className` and `style` are this component's. A prop of ours
    // leaking into `init` is invisible until the day the widget adds an
    // option by one of those names.
    render(<ChatlyWidget publicId="acme-web" inline className="h-96" style={{ width: 300 }} />);
    const options = argsFor('init')[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(options).sort()).toEqual(['mountTo', 'publicId']);
  });

  it('tears the widget down on unmount', () => {
    const view = render(<ChatlyWidget publicId="acme-web" />);
    view.unmount();
    act(() => void vi.advanceTimersByTime(50));
    expect(argsFor('destroy')).toHaveLength(1);
  });

  it('renders nothing at all when floating', () => {
    const view = render(<ChatlyWidget publicId="acme-web" />);
    expect(view.container.innerHTML).toBe('');
  });
});

describe('inline mounting', () => {
  it('mounts into its own div, which exists by the time init runs', () => {
    /*
     * This is the React-shaped answer to `mountTo`. The widget REFUSES to
     * mount when a `mountTo` selector matches nothing — rightly, because a
     * floating bubble on a page built to embed the chat reads as a bug — and
     * a container this component renders itself cannot be missing.
     */
    const view = render(<ChatlyWidget publicId="acme-web" inline className="chat-box" />);
    const div = view.container.querySelector('div.chat-box');
    expect(div).not.toBeNull();
    expect(argsFor('init')[0]?.[0]).toEqual({ publicId: 'acme-web', mountTo: div });
  });
});

describe('prop changes', () => {
  it('does not re-init for a new object literal with the same contents', () => {
    function Host(): ReactElement {
      const [, bump] = useState(0);
      return (
        <>
          <button onClick={() => bump((n) => n + 1)}>render</button>
          {/* A brand new theme object and a brand new arrow on every render —
              which is what every real parent produces. */}
          <ChatlyWidget
            publicId="acme-web"
            theme={{ primaryColor: '#111111' }}
            onMessage={() => undefined}
          />
        </>
      );
    }
    const view = render(<Host />);
    act(() => view.getByText('render').click());
    act(() => view.getByText('render').click());
    expect(argsFor('init')).toHaveLength(1);
  });

  it('identifies when the visitor prop arrives, without re-initialising', () => {
    const view = render(<ChatlyWidget publicId="acme-web" />);
    view.rerender(<ChatlyWidget publicId="acme-web" visitor={{ externalId: 'u_42' }} />);
    expect(argsFor('init')).toHaveLength(1);
    expect(argsFor('identify')).toEqual([[{ externalId: 'u_42' }]]);
  });

  it('calls the LATEST handler, not the one from the first render', () => {
    // The stale-closure bug. A wrapper that pins the first render's callbacks
    // fires them with props from three navigations ago.
    const seen: string[] = [];
    const view = render(<ChatlyWidget publicId="acme-web" onOpen={() => seen.push('first')} />);
    view.rerender(<ChatlyWidget publicId="acme-web" onOpen={() => seen.push('second')} />);
    emit('open', undefined);
    expect(seen).toEqual(['second']);
  });
});

describe('event props', () => {
  /*
   * ── Derived, because a list of names here would rot ───────────────────
   *
   * The widget emits twelve events and this component offered nine props:
   * `onMessageAck`, `onMessageReceived` and `onUnread` did not exist, so a
   * React consumer could not be told that a reply arrived or that the unread
   * count changed. Every test in this file passed throughout, because each
   * one names the one event it cares about.
   *
   * The expected set comes from `WIDGET_EVENT_NAMES` — `Object.keys` of a map
   * the compiler holds exhaustive against `ChatlyEventName`. A thirteenth
   * event with no prop fails here instead of shipping.
   *
   * The floor guards the blind case: an empty derived set would make the
   * assertion below a comparison of two empty arrays.
   */
  it('offers a prop for EVERY widget event, and fires each one', () => {
    expect(WIDGET_EVENT_NAMES.length).toBeGreaterThanOrEqual(12);

    const seen: Array<[string, unknown]> = [];
    // `detail?` and not `detail`: `onClose` takes no argument, and a handler
    // that requires one is not assignable to it.
    const handlers: Partial<Record<ChatlyHandlerName, (detail?: unknown) => void>> = {};
    for (const name of WIDGET_EVENT_NAMES) {
      const prop = EVENT_HANDLERS[name];
      handlers[prop] = (detail) => seen.push([prop, detail]);
    }

    render(<ChatlyWidget publicId="acme-web" {...handlers} />);
    for (const name of WIDGET_EVENT_NAMES) {
      emit(name, { from: name });
    }

    expect(seen).toEqual(WIDGET_EVENT_NAMES.map((name) => [EVENT_HANDLERS[name], { from: name }]));
  });
});

describe('useChatly', () => {
  it('controls the widget from a component that does not own it', () => {
    function HelpButton(): ReactElement {
      const chatly = useChatly();
      return <button onClick={() => chatly.open('help')}>Help</button>;
    }
    const view = render(
      <>
        <ChatlyWidget publicId="acme-web" />
        <HelpButton />
      </>,
    );
    act(() => view.getByText('Help').click());
    expect(argsFor('open')).toEqual([['help']]);
  });

  it('is referentially stable, so it is safe in a dependency array', () => {
    const seen: unknown[] = [];
    function Probe(): null {
      seen.push(useChatly());
      return null;
    }
    const view = render(<Probe />);
    view.rerender(<Probe />);
    expect(seen[0]).toBe(seen[1]);
  });
});

describe('useChatlyEvent', () => {
  it('subscribes once and calls the latest handler', () => {
    const seen: string[] = [];
    function Badge({ tag }: { tag: string }): null {
      useChatlyEvent('message', () => seen.push(tag));
      return null;
    }
    const view = render(
      <>
        <ChatlyWidget publicId="acme-web" />
        <Badge tag="first" />
      </>,
    );
    view.rerender(
      <>
        <ChatlyWidget publicId="acme-web" />
        <Badge tag="second" />
      </>,
    );
    emit('message', { id: 'm1', body: 'hi', authorType: 'agent' });
    expect(seen).toEqual(['second']);
  });

  it('unsubscribes on unmount', () => {
    function Badge(): null {
      useChatlyEvent('message', () => undefined);
      return null;
    }
    const view = render(<Badge />);
    view.unmount();
    expect(argsFor('off').filter((a) => a[0] === 'message')).toHaveLength(1);
  });
});

/*
 * ── The CSP nonce ─────────────────────────────────────────────────────────
 *
 * A host served `script-src 'nonce-X'` with no `'unsafe-inline'` runs a
 * script only if it carries X. `nonce` is a prop by virtue of
 * `ChatlyEmbedOptions`, and these assert on the ATTRIBUTE of the script that
 * was actually injected — a nonce that reaches the lifecycle and not the DOM
 * is the entire bug class.
 *
 * `window.Chatly` is DELETED first: with a shim already on the page the
 * lifecycle correctly injects nothing, on the grounds that the host pasted
 * the snippet and its loader is already on its way. Every other test in this
 * file wants that shim, so these three are the ones that take it away.
 */
describe('the CSP nonce', () => {
  function injectedLoaderScript(): HTMLScriptElement | null {
    return document.head.querySelector('script[data-chatly-loader]');
  }

  beforeEach(() => {
    delete w.Chatly;
    for (const script of [...document.head.querySelectorAll('script[data-chatly-loader]')]) {
      script.remove();
    }
  });

  it('stamps the script the embed injects', () => {
    render(<ChatlyWidget publicId="acme-web" nonce="r3act" />);
    act(() => void vi.advanceTimersByTime(50));
    expect(injectedLoaderScript()?.getAttribute('nonce')).toBe('r3act');
    // The property as well: it is what the browser's CSP check reads, and the
    // only half that survives HTML's nonce-hiding.
    expect(injectedLoaderScript()?.nonce).toBe('r3act');
  });

  it('publishes it on the shim, for the loader and the bundle', () => {
    // This package injects one of the chain's three script tags. `widget.js`
    // and the deferred chunks are stamped by the loader and the bundle, which
    // read the nonce from here.
    render(<ChatlyWidget publicId="acme-web" nonce="r3act" />);
    act(() => void vi.advanceTimersByTime(50));
    expect((globalThis.window as unknown as ShimWindow).Chatly?.nonce).toBe('r3act');
  });

  it('injects exactly what it always did without one', () => {
    // 0.2.0 is published. The no-nonce case has to be unchanged, so it is
    // pinned rather than assumed.
    render(<ChatlyWidget publicId="acme-web" />);
    act(() => void vi.advanceTimersByTime(50));
    expect(injectedLoaderScript()?.hasAttribute('nonce')).toBe(false);
    expect((globalThis.window as unknown as ShimWindow).Chatly?.nonce).toBeUndefined();
  });

  it('survives a re-render with a fresh props object', () => {
    // A parent re-render produces a new object literal with the same nonce.
    // That is not a change, so it must not warn and must not re-init.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = render(<ChatlyWidget publicId="acme-web" nonce="r3act" />);
    view.rerender(<ChatlyWidget publicId="acme-web" nonce="r3act" />);
    act(() => void vi.advanceTimersByTime(50));
    expect(warn).not.toHaveBeenCalled();
    expect(injectedLoaderScript()?.getAttribute('nonce')).toBe('r3act');
  });
});

describe('visitor={null} on a page that loaded signed out', () => {
  /*
   * NPOL-4, and a privacy fix rather than a convenience. `reset()` on
   * sign-out is a TRANSITION, so a page that renders already signed out
   * leaves the previous account's `chatly:xid:<publicId>` in the browser —
   * on a shared device, the last person's identity surviving a sign-out that
   * happened in another tab.
   */
  it('resets when an identity is stored for this channel', () => {
    STORE.set('chatly:xid:acme-web', 'u_previous');
    render(<ChatlyWidget publicId="acme-web" visitor={null} />);
    expect(argsFor('reset')).toHaveLength(1);
    // And `null` never reaches the widget's own `init`.
    expect(argsFor('init')[0]?.[0]).toEqual({ publicId: 'acme-web' });
  });

  it('changes nothing when `visitor` is merely absent', () => {
    /*
     * The control that makes this an opt-in. `visitor={user?.id ? {…} :
     * undefined}` renders on every commit before an auth check resolves, and
     * resetting there would drop a live conversation on every slow endpoint.
     */
    STORE.set('chatly:xid:acme-web', 'u_previous');
    render(<ChatlyWidget publicId="acme-web" visitor={undefined} />);
    expect(argsFor('reset')).toEqual([]);
  });
});
