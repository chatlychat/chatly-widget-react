/**
 * NPOL-5's second half — `load()` on `useChatly()`.
 *
 * An integrator in `lazy="manual"` has to call `load()` themselves for a
 * returning chatter, and the hook did not offer it: the README sent them to
 * `window.Chatly('load')` with a `declare`-shaped cast, in a package whose
 * whole claim is that you do not have to touch the global.
 *
 * `load` could not simply join `controls` — see the docblock in
 * `useChatly.ts` — so it is composed on over `prefetchWidget()`. What that
 * makes this test: an assertion on the CALL THAT REACHES THE SHIM, not on the
 * presence of a property. A `load` wired to `dispatch` would also exist, and
 * would send the bundle a method it warns about by name.
 */
import { __testing } from '@chatlychat/widget-element';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatlyWidget } from './ChatlyWidget.js';
import { useChatly } from './useChatly.js';

import type { ReactElement } from 'react';

interface ShimWindow {
  Chatly?: ((...args: unknown[]) => void) & { init?: unknown };
}

const w = globalThis.window as unknown as ShimWindow;
let calls: unknown[][] = [];

/**
 * What the hook handed back, in a holder rather than a `let`: TypeScript
 * narrows a `let` that is only ever assigned inside a component body to
 * `never`, because nothing in this file's control flow calls that body.
 */
const seen: { api: ReturnType<typeof useChatly> | null } = { api: null };

function Capture(): ReactElement {
  seen.api = useChatly();
  return <span />;
}

/** The loader's shim: callable, with no bundle behind it yet. */
function installShim(): void {
  calls = [];
  w.Chatly = Object.assign((...args: unknown[]) => {
    calls.push(args);
  }, {});
}

beforeEach(() => {
  document.head.innerHTML = '';
  seen.api = null;
  delete w.Chatly;
  __testing.reset();
  installShim();
});

afterEach(() => {
  __testing.reset();
  vi.restoreAllMocks();
});

describe('useChatly', () => {
  it('offers load(), and it reaches the loader rather than the widget', () => {
    render(<Capture />);

    expect(typeof seen.api?.load).toBe('function');
    seen.api?.load();
    // `load`, verbatim — the loader's own trigger. Not `prefetch`, not a
    // queued `init`, and not a second "please boot now" path.
    expect(calls).toEqual([['load']]);
  });

  it('says nothing when the bundle is already up, because load() is a no-op then', () => {
    // The hover-prefetch regression `prefetchWidget` exists about: once
    // `widget.js` has installed itself there is nothing to fetch, and the
    // bundle warns `unknown method "load"` at anything that asks.
    installShim();
    (w.Chatly as { init?: unknown }).init = () => undefined;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<Capture />);
    seen.api?.load();

    expect(calls).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  /*
   * NPOL-5's first half, at the layer it was reported from: a "Chat with us"
   * link whose click lands before `<ChatlyWidget>` has mounted. The link is
   * in a header above the component here, and the widget renders a commit
   * later — a shell waiting on a channel id, which is the real page.
   *
   * Asserted on the queue `loader.js` will replay, because that is all a real
   * page has at this moment: there is no bundle to echo a call back, and a
   * fixture that provided one would agree with a dropped click.
   */
  it('keeps a click made before <ChatlyWidget> mounted', () => {
    delete w.Chatly;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    function Header(): ReactElement {
      const chatly = useChatly();
      return <button type="button" onClick={() => chatly.open('help')} />;
    }
    const { container } = render(<Header />);
    container.querySelector('button')?.click();

    render(<ChatlyWidget publicId="acme-web" />);
    const queued = ((w.Chatly as { q?: unknown[] } | undefined)?.q ?? []).map(
      (entry) => (entry as ArrayLike<unknown>)[0],
    );
    expect(queued).toContain('open');
    expect(queued.indexOf('open')).toBeGreaterThan(queued.indexOf('init'));
  });

  it('still answers hasSession(), which was widget surface all along', () => {
    // NPOL-5 asked for this too. It needed nothing: `hasSession` is on
    // `ChatlyApi`, so it is on `controls`, so it is on this hook — and since
    // 0.20.0 `startWidget` answers it synchronously at mount.
    render(<Capture />);
    expect(typeof seen.api?.hasSession).toBe('function');
    expect(seen.api?.hasSession()).toBe(false);
  });
});
