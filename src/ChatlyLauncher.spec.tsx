/**
 * `<ChatlyLauncher />`.
 *
 * The component has two modes and one thing it must never do. The modes are
 * owner (there is a `publicId`, so it claims the widget with the bundle
 * deferred) and control (there is not, so it only opens a widget somebody
 * else mounted). The thing it must never do is end up with two widgets or two
 * launchers on one page.
 *
 * Everything here talks to the loader's shim — a callable `window.Chatly`
 * with a recording stand-in behind it — because that is the state a real page
 * is in for the whole of lazy mode: the bundle has not arrived, and every
 * call is a queued one.
 */
import { __testing } from '@chatlychat/widget-element';
import { act, fireEvent, render } from '@testing-library/react';
import { StrictMode, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatlyLauncher } from './ChatlyLauncher.js';
import { ChatlyWidget } from './ChatlyWidget.js';

let calls: unknown[][] = [];

interface ShimWindow {
  Chatly?: ((...args: unknown[]) => void) & {
    q?: unknown[];
    publicId?: string;
    lazy?: unknown;
    nonce?: string;
  };
}

const w = globalThis.window as unknown as ShimWindow;

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c[0] === method).map((c) => c.slice(1));
}

function initOptions(index = 0): Record<string, unknown> {
  return (argsFor('init')[index]?.[0] ?? {}) as Record<string, unknown>;
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

describe('what it renders', () => {
  it('is a real button with a usable default label', () => {
    const { container } = render(<ChatlyLauncher />);
    const button = container.querySelector('button');
    expect(button?.type).toBe('button');
    expect(button?.textContent).toBe('Chat with us');
  });

  it('takes children, a className and a style, because the host owns the look', () => {
    const { container } = render(
      <ChatlyLauncher className="btn btn-primary" style={{ borderRadius: 8 }}>
        <span>Need a hand?</span>
      </ChatlyLauncher>,
    );
    const button = container.querySelector('button');
    expect(button?.className).toBe('btn btn-primary');
    expect(button?.textContent).toBe('Need a hand?');
    expect(button?.style.borderRadius).toBe('8px');
  });

  it('labels an icon-only button, which has no text of its own', () => {
    // CLAUDE.md §4: aria-labels on icon-only buttons. A `<button>` whose only
    // child is an SVG announces nothing at all.
    const { container } = render(
      <ChatlyLauncher>
        <svg />
      </ChatlyLauncher>,
    );
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Open chat');
  });

  it('leaves a text button unlabelled, so a screen reader reads the text once', () => {
    const { container } = render(<ChatlyLauncher label="Support" />);
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBeNull();
  });
});

describe('control mode — no publicId', () => {
  it('mounts nothing', () => {
    render(<ChatlyLauncher />);
    expect(argsFor('init')).toHaveLength(0);
    expect(__testing.isMounted()).toBe(false);
  });

  it('claims nothing, so it cannot hold a widget up after its owner unmounts', () => {
    // A claim is what keeps the widget alive. An extra one from a header
    // button would stop the reference count ever reaching zero.
    render(
      <>
        <ChatlyWidget publicId="acme-web" />
        <ChatlyLauncher />
      </>,
    );
    expect(__testing.claimCount()).toBe(1);
  });

  it('opens the widget somebody else mounted', () => {
    const { container } = render(
      <>
        <ChatlyWidget publicId="acme-web" />
        <ChatlyLauncher openTab="help" />
      </>,
    );
    act(() => {
      container.querySelector('button')?.click();
    });
    expect(argsFor('open')).toEqual([['help']]);
  });
});

describe('owner mode — with a publicId', () => {
  it('claims the widget with the bundle deferred', () => {
    render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    /*
     * `'launcher'`, not `'manual'` — NCH-18. With `theme.hideLauncher` set
     * (the assertion below this one) the loader paints nothing in either
     * mode and arms the same one trigger, the queue watch that carries this
     * button's `load` and `open`. The single branch they differ in is the
     * returning chatter, and `'manual'` is the mode that refuses it by
     * design. `ChatlyLauncher.preload.spec.tsx` is where that is pinned in
     * both directions.
     */
    expect(w.Chatly?.lazy).toBe('launcher');
    expect(__testing.claimCount()).toBe(1);
  });

  it('keeps an explicit lazy="manual" meaning exactly what it says', () => {
    // A host that types `'manual'` has been promised that nothing loads
    // until it calls `load()`. The DEFAULT may preload; an explicit value
    // may not be overridden, or the prop is a control that appears to work.
    render(
      <ChatlyLauncher publicId="acme-web" lazy="manual">
        Chat
      </ChatlyLauncher>,
    );
    expect(w.Chatly?.lazy).toBe('manual');
  });

  it('passes any other lazy mode through untouched', () => {
    render(
      <ChatlyLauncher publicId="acme-web" lazy="interaction">
        Chat
      </ChatlyLauncher>,
    );
    expect(w.Chatly?.lazy).toBe('interaction');
  });

  it("hides the widget's own launcher, so there is only one button", () => {
    // Nothing in the lifecycle would catch this: the widget would render its
    // floating bubble right next to the button the host just styled.
    render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    expect(initOptions()['theme']).toEqual({ hideLauncher: true });
  });

  it('lets a host ask for both launchers anyway', () => {
    render(
      <ChatlyLauncher publicId="acme-web" theme={{ hideLauncher: false }}>
        Chat
      </ChatlyLauncher>,
    );
    expect(initOptions()['theme']).toEqual({ hideLauncher: false });
  });

  it('opens on click, through the same queue the snippet has always used', () => {
    // Before the bundle lands this is a queued `open`, which the loader
    // treats as a trigger: it fetches the bundle, replays the queue, and the
    // panel opens. One path, both states.
    const { container } = render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    act(() => {
      container.querySelector('button')?.click();
    });
    expect(argsFor('open')).toEqual([[undefined]]);
  });

  /*
   * `fireEvent.pointerOver`, not `pointerenter`.
   *
   * React synthesises `onPointerEnter` from the native `pointerover`/
   * `pointerout` pair at the root container — it does not listen for
   * `pointerenter` at all, because that event does not bubble and so cannot
   * reach a delegated listener. Dispatching `pointerenter` directly runs
   * nothing and reports a working prefetch as broken.
   */
  it('prefetches on hover, without opening anything', () => {
    const { container } = render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    const button = container.querySelector('button');
    if (button === null) {
      throw new Error('no button rendered');
    }
    act(() => {
      fireEvent.pointerOver(button);
    });
    expect(argsFor('load')).toHaveLength(1);
    expect(argsFor('open')).toHaveLength(0);
  });

  it('prefetches on focus, so a keyboard visitor gets the same head start', () => {
    const { container } = render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    const button = container.querySelector('button');
    if (button === null) {
      throw new Error('no button rendered');
    }
    act(() => {
      fireEvent.focus(button);
    });
    expect(argsFor('load')).toHaveLength(1);
  });

  it('can have the hover prefetch turned off', () => {
    const { container } = render(
      <ChatlyLauncher publicId="acme-web" prefetchOnHover={false}>
        Chat
      </ChatlyLauncher>,
    );
    const button = container.querySelector('button');
    if (button === null) {
      throw new Error('no button rendered');
    }
    act(() => {
      fireEvent.pointerOver(button);
      fireEvent.focus(button);
    });
    expect(argsFor('load')).toHaveLength(0);
  });

  it('honours an onClick that prevents the default', () => {
    const { container } = render(
      <ChatlyLauncher publicId="acme-web" onClick={(e) => e.preventDefault()}>
        Chat
      </ChatlyLauncher>,
    );
    act(() => {
      container.querySelector('button')?.click();
    });
    expect(argsFor('open')).toHaveLength(0);
  });

  it('initialises once in StrictMode, not twice', () => {
    render(
      <StrictMode>
        <ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>
      </StrictMode>,
    );
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(argsFor('init')).toHaveLength(1);
    expect(__testing.isMounted()).toBe(true);
  });

  it('releases its claim on unmount', () => {
    const { unmount } = render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    unmount();
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(__testing.isMounted()).toBe(false);
  });

  it('claims once when the publicId arrives on a later render', () => {
    // A page that fetches its channel id, or reads it from a provider that
    // resolves on the second render. A mount-only effect would leave this
    // launcher permanently in control mode, warning "no widget is mounted" on
    // every click.
    function Late(): ReactElement {
      const [id, setId] = useState<string | undefined>(undefined);
      return (
        <>
          <button type="button" data-testid="resolve" onClick={() => setId('acme-web')} />
          <ChatlyLauncher publicId={id}>Chat</ChatlyLauncher>
        </>
      );
    }
    const { container } = render(<Late />);
    expect(argsFor('init')).toHaveLength(0);
    act(() => {
      container
        .querySelector('[data-testid="resolve"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(argsFor('init')).toHaveLength(1);
    expect(__testing.claimCount()).toBe(1);
  });

  it('re-offers props without re-initialising for a fresh object literal', () => {
    // The bug every hand-written integration has: a parent re-render with a
    // new `theme={{…}}` closes the visitor's open panel.
    function Parent(): ReactElement {
      const [, bump] = useState(0);
      return (
        <>
          <button type="button" data-testid="bump" onClick={() => bump((n) => n + 1)} />
          <ChatlyLauncher publicId="acme-web" theme={{ primaryColor: '#111111' }}>
            Chat
          </ChatlyLauncher>
        </>
      );
    }
    const { container } = render(<Parent />);
    act(() => {
      container
        .querySelector('[data-testid="bump"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(argsFor('init')).toHaveLength(1);
  });
});

describe('both components on one page', () => {
  it('is one widget and one claim each, not two widgets', () => {
    // The lifecycle is reference-counted by claim identity, so this is a
    // single `init` with two claimants.
    render(
      <>
        <ChatlyWidget publicId="acme-web" />
        <ChatlyLauncher publicId="acme-web" />
      </>,
    );
    expect(argsFor('init')).toHaveLength(1);
    expect(__testing.claimCount()).toBe(2);
  });

  it('survives either one unmounting', () => {
    function Page({ widget }: { widget: boolean }): ReactElement {
      return (
        <>
          {widget ? <ChatlyWidget publicId="acme-web" /> : null}
          <ChatlyLauncher publicId="acme-web" />
        </>
      );
    }
    const { rerender } = render(<Page widget />);
    rerender(<Page widget={false} />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(__testing.isMounted()).toBe(true);
  });

  it('warns when the two ask for different things, instead of picking one in silence', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <>
        <ChatlyWidget publicId="acme-web" theme={{ primaryColor: '#111111' }} />
        <ChatlyLauncher publicId="acme-web" theme={{ primaryColor: '#222222' }} />
      </>,
    );
    expect(warn.mock.calls.flat().join(' ')).toContain('FIRST mount owns the configuration');
  });
});

/*
 * ── The CSP nonce ─────────────────────────────────────────────────────────
 *
 * Owner mode is the one that injects: it claims the widget, so it is what
 * puts `loader.js` on the page. Control mode claims nothing and injects
 * nothing, and the nonce there is simply unused rather than lost.
 *
 * As in `ChatlyWidget.spec.tsx`, the recording shim is deleted first — with
 * one already on the page the lifecycle correctly declines to inject a second
 * loader script.
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

  it('stamps the script it injects in owner mode', () => {
    render(
      <ChatlyLauncher publicId="acme-web" nonce="l4unch">
        Chat
      </ChatlyLauncher>,
    );
    act(() => void vi.advanceTimersByTime(50));
    expect(injectedLoaderScript()?.getAttribute('nonce')).toBe('l4unch');
    expect(injectedLoaderScript()?.nonce).toBe('l4unch');
    // On the shim too, which is where the loader reads it to stamp the bundle
    // this component exists to defer.
    expect((globalThis.window as unknown as ShimWindow).Chatly?.nonce).toBe('l4unch');
  });

  it('injects exactly what it always did without one', () => {
    render(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    act(() => void vi.advanceTimersByTime(50));
    expect(injectedLoaderScript()?.hasAttribute('nonce')).toBe(false);
    expect((globalThis.window as unknown as ShimWindow).Chatly?.nonce).toBeUndefined();
  });

  it('keeps the nonce out of the widget init options', () => {
    // The nonce is the loader's and the bundle's, carried on the shim. In
    // owner mode this component's own `init` must not gain a key of that name.
    const chatly = Object.assign((...args: unknown[]) => {
      calls.push(args);
    }, {});
    w.Chatly = chatly;
    render(
      <ChatlyLauncher publicId="acme-web" nonce="l4unch">
        Chat
      </ChatlyLauncher>,
    );
    act(() => void vi.advanceTimersByTime(50));
    expect(initOptions()).not.toHaveProperty('nonce');
    expect(initOptions()['publicId']).toBe('acme-web');
  });
});

/**
 * The CHT-SI17 props a design-system component composes over: `anchor`, the
 * per-category `storage` object, and `consent` / `consentCategory`.
 *
 * The last two were recorded here as blocked on a consent manager's category
 * registry. CHT-X02 (ADR 0071) shipped them on `ChatlyEmbedOptions` instead —
 * `consent: 'auto'` reads the page's shared consent API, `support_chat` is the
 * default category and any other is a raw string — and this component takes
 * them through `Partial<ChatlyEmbedOptions>` like every other init key. What
 * was missing was the evidence, which is the test below.
 */
describe('composing props (CHT-SI17)', () => {
  it('folds a flat `anchor` into the theme, where init reads it', () => {
    render(
      <ChatlyLauncher publicId="acme-web" anchor="[data-bar]">
        Chat
      </ChatlyLauncher>,
    );
    act(() => void vi.advanceTimersByTime(50));
    expect(initOptions()['theme']).toMatchObject({ hideLauncher: true, anchor: '[data-bar]' });
    /*
     * And NOT at the top level. `init` ignores an unknown key in silence, so
     * an `anchor` left outside `theme` is a prop that typechecks, passes
     * through and does nothing — which is what happens if it falls out of
     * `LOCAL_PROPS`.
     */
    expect(initOptions()).not.toHaveProperty('anchor');
  });

  it('lets the flat prop win over the theme object, and leaves the theme alone when absent', () => {
    render(
      <ChatlyLauncher publicId="acme-web" theme={{ anchor: '#from-theme' }} anchor="#flat">
        Chat
      </ChatlyLauncher>,
    );
    act(() => void vi.advanceTimersByTime(50));
    expect(initOptions()['theme']).toMatchObject({ anchor: '#flat' });

    calls = [];
    __testing.reset();
    render(
      <ChatlyLauncher publicId="acme-web" theme={{ anchor: '#from-theme' }}>
        Chat
      </ChatlyLauncher>,
    );
    act(() => void vi.advanceTimersByTime(50));
    // Not `undefined`: `exactOptionalPropertyTypes` is off here, so an
    // unconditional `{ anchor: props.anchor }` would blank this.
    expect(initOptions()['theme']).toMatchObject({ anchor: '#from-theme' });
  });

  /*
   * The tracker recorded the per-category storage object as "still untyped"
   * on this component. It is typed — `ChatlyEmbedOptions['storage']` carries
   * the object form and `ChatlyLauncherProps` extends `Partial<>` of it — so
   * what was missing was evidence. This is the evidence: the object compiles
   * as a prop AND arrives in `init` with all three categories intact.
   */
  it('threads the per-category storage object through untouched', () => {
    render(
      <ChatlyLauncher
        publicId="acme-web"
        storage={{ functional: 'on-open', analytics: 'deny', marketing: 'deny' }}
      >
        Chat
      </ChatlyLauncher>,
    );
    act(() => void vi.advanceTimersByTime(50));
    expect(initOptions()['storage']).toEqual({
      functional: 'on-open',
      analytics: 'deny',
      marketing: 'deny',
    });
  });

  /*
   * Control: add `'consent'` to `LOCAL_PROPS` and this fails — the prop still
   * typechecks and the loader, which reads `consent` off the queued `init`,
   * never sees it.
   */
  it('passes consent and consentCategory to init, where the loader reads them', () => {
    render(
      <ChatlyLauncher publicId="acme-web" consent="auto" consentCategory="preferences">
        Chat
      </ChatlyLauncher>,
    );
    act(() => void vi.advanceTimersByTime(50));
    expect(initOptions()).toMatchObject({ consent: 'auto', consentCategory: 'preferences' });
  });

  it('still takes the string form, including the default mode', () => {
    render(
      <ChatlyLauncher publicId="acme-web" storage="deny">
        Chat
      </ChatlyLauncher>,
    );
    act(() => void vi.advanceTimersByTime(50));
    expect(initOptions()['storage']).toBe('deny');
  });
});
