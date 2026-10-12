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
import { __testing } from '@chatlychat/widget-element';
import { act, render } from '@testing-library/react';
import { StrictMode, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatlyWidget } from './ChatlyWidget.js';
import { useChatly, useChatlyEvent } from './useChatly.js';

let calls: unknown[][] = [];

interface ShimWindow {
  Chatly?: ((...args: unknown[]) => void) & { q?: unknown[]; publicId?: string };
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

beforeEach(() => {
  vi.useFakeTimers();
  __testing.reset();
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
