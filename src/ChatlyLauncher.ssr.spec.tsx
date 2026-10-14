// @vitest-environment node
/**
 * The SSR guard, tested where there is no DOM at all.
 *
 * This file's environment directive is the whole test. The rest of this
 * package's suite runs in jsdom, where `window` and `document` both exist —
 * so a component that touched `window` at module scope, during render, or in
 * a `useRef` initialiser would pass every one of those tests and then break
 * the `next build` of the first consumer who rendered it on a server. The
 * stack trace in that case points at Next.js, not at us, and the report
 * arrives as "your package breaks my build".
 *
 * `environment: node` means `window` and `document` are genuinely undefined,
 * which is the one condition that makes the claim testable. There is no
 * jsdom, no testing-library, and `react-dom/server` is the renderer, because
 * that is what a framework actually calls.
 *
 * It covers the import as well as the render. A top-level `HTMLElement`
 * reference anywhere in the import graph — which is how most web-component
 * packages break SSR, and why `@chatlychat/widget-element` builds its element
 * class inside a function — would throw before the first assertion.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChatlyLauncher } from './ChatlyLauncher.js';
import { ChatlyWidget } from './ChatlyWidget.js';

describe('rendering on a server', () => {
  it('has no window and no document, or this file proves nothing', () => {
    // The control for the control. If a future config change gave this file a
    // DOM, every assertion below would still pass and would mean nothing.
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('renders the launcher to markup without touching a DOM global', () => {
    const html = renderToStaticMarkup(<ChatlyLauncher publicId="acme-web">Chat</ChatlyLauncher>);
    expect(html).toContain('<button');
    expect(html).toContain('Chat');
  });

  it('renders a control-mode launcher too', () => {
    expect(renderToStaticMarkup(<ChatlyLauncher />)).toContain('Chat with us');
  });

  it('renders an inline ChatlyWidget, which is the other component with markup', () => {
    expect(renderToStaticMarkup(<ChatlyWidget publicId="acme-web" inline />)).toContain('<div');
  });

  it('renders a floating ChatlyWidget as nothing at all', () => {
    expect(renderToStaticMarkup(<ChatlyWidget publicId="acme-web" />)).toBe('');
  });
});
