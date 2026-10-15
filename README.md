# @chatlychat/widget-react

The Chatly chat widget as a React component.

```bash
pnpm add @chatlychat/widget-react
```

```tsx
import { ChatlyWidget, useChatly } from '@chatlychat/widget-react';

export function App() {
  return (
    <>
      {/* One of these, high in the tree. */}
      <ChatlyWidget publicId="acme-web" visitor={{ externalId: user.id, email: user.email }} />
      <Routes />
    </>
  );
}

export function HelpButton() {
  const chatly = useChatly();
  return <button onClick={() => chatly.open('help')}>Help</button>;
}
```

That is the whole integration. No `<script>` tag, no `window.Chatly`, no
effect of your own — the component injects the loader, mounts the widget and
tears it down when it unmounts.

## Why this exists

Without it, the integration is an effect you write by hand:

```tsx
// Don't. This is the version that was in our own docs, and it has three bugs.
useEffect(() => {
  window.Chatly?.init({ publicId });
  return () => window.Chatly?.destroy();
}, [publicId]);
```

1. **It boots twice in StrictMode.** React 18 runs every effect mount →
   cleanup → mount in development, so that is `init` → `destroy` → `init`:
   two visitor sessions minted, and a launcher that visibly flickers.
2. **A `theme` in the deps re-initialises on every render.** `theme={{…}}` is
   a new object each time, so the widget is destroyed and rebuilt underneath a
   visitor who was mid-sentence.
3. **It can never identify anybody.** The only place to put an identity is
   `init`, which has already run by the time your user signs in.

This component fixes all three, and the mechanism is shared with the custom
element in [`@chatlychat/widget-element`](../widget-element) so the two cannot
drift on the part that is hard.

## React is a peer dependency

`react` is in `peerDependencies`, never `dependencies`, and that is a
deliberate exception to this repo's "no new dependencies" rule.

A real dependency resolves a **second copy of React** in any consumer whose
version differs by so much as a patch, and two Reacts on one page break hooks
with `Invalid hook call` — thrown from a component the consumer did not write
and cannot debug. A peer dependency on the framework the consumer is already
using adds nothing to their install and cannot duplicate.

The range is `^18.0.0 || ^19.0.0`. The component uses `useRef` and
`useEffect` and nothing newer, so it works on both.

Everything else here has **one** dependency, `@chatlychat/widget-element`, which
itself has none.

## `<ChatlyWidget />`

Every [init option](https://chatlychat.com/docs/channel-web) is a prop:
`publicId` (required), `apiUrl`, `realtimeUrl`, `visitor`, `theme`,
`behavior`, `quickLinks`, `copy`, `copyByLocale`, `cssOverrides`.

Plus five of its own:

| prop                  | type                                                     |
| --------------------- | -------------------------------------------------------- |
| `loaderUrl`           | Where `loader.js` is served from. Rarely set; see below. |
| `locale`              | Calls `setLocale()` once the widget is up.               |
| `nonce`               | Your page's CSP nonce, if you serve one; see below.      |
| `inline`              | Render the chat inside this component's own box.         |
| `className` / `style` | Applied to the inline container.                         |

And the events, as callbacks: `onReady`, `onOpen`, `onClose`, `onMessage`,
`onConversation`, `onIdentified`, `onReset`, `onAction`, `onError`. Pass
inline arrow functions freely — they are read through a ref, so a new one on
every render costs nothing and the handler that fires is always the latest.

### What a prop change actually does

This is the part worth knowing, because the three outcomes are different:

| changed prop            | what happens                                          |
| ----------------------- | ----------------------------------------------------- |
| `visitor`               | `identify()`. Nothing is re-mounted.                  |
| `visitor` → `undefined` | `reset()` — a sign-out, so the next session is fresh. |
| `locale`                | `setLocale()`. Nothing is re-mounted.                 |
| anything else           | `init()` again, which **destroys and re-mounts**.     |

A re-mount loses nothing durable — the conversation lives on the server — but
it closes an open panel. The widget has no `setTheme`, so there is no honest
alternative; what this component guarantees is that it only happens when a
value really changed, not when a parent re-rendered.

`loaderUrl` is the exception: changing it after load warns and does nothing,
because the bundle is already fetched and pointing the running widget at
another deployment would need a page reload.

### `nonce` — a page served with a strict CSP

If your app is served `script-src 'nonce-…'` with no `'unsafe-inline'`, pass
that response's nonce:

```tsx
// Next.js App Router: the nonce your middleware minted for THIS response
import { headers } from 'next/headers';

export default async function Layout() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <ChatlyWidget publicId="acme-web" nonce={nonce} />;
}
```

It goes on the `loader.js` script the component injects, and onto
`window.Chatly.nonce` so that `widget.js`, the deferred chunks and the panel's
own stylesheet carry it too. Without it a nonce-only policy blocks the loader,
and the only sign is a CSP violation in your console.

`nonce` also works on `<ChatlyLauncher publicId>`, which is the other
component that injects the loader.

**Mint a fresh value per response and never hardcode one.** A nonce that
repeats is no better than `'unsafe-inline'`: anyone who can read one page's
source can inject a script the next page will run. This component caches
nothing — but a framework will happily cache the HTML you put it in, so the
value has to come from the request. It is read once, before the loader is
injected; changing it in props afterwards warns rather than re-stamping a
script the browser has already evaluated.

If your policy allows the widget's origin by host instead, leave the prop off.
Nothing is stamped and the embed injects exactly what it always has.

### Inline mounting

```tsx
<ChatlyWidget publicId="acme-web" inline className="h-[600px] w-full rounded-lg border" />
```

The chat fills the box instead of floating in the corner — a support page, a
sidebar, a full-page `/chat` route. In this mode there is no launcher, no
corner offset, and `close()` warns instead of working (hide or unmount your
own container instead).

This is the React shape of the widget's `mountTo` option, and it closes
`mountTo`'s one sharp edge: the container must exist when `init` runs, and a
selector that matches nothing makes the widget refuse to mount at all. A
container this component renders itself cannot be missing.

Give it a height. It has a 420px minimum so a container with none is still
usable.

## `useChatly()`

Returns the widget's post-boot methods: `open`, `close`, `toggle`,
`identify`, `setUser`, `setCustomAttributes`, `deleteCustomAttribute`,
`setLabel`, `removeLabel`, `setLocale`, `track`, `registerPushToken`, `reset`.

The object is referentially stable, so it is safe in a dependency array.

`init` and `destroy` are deliberately **not** on it. The component owns the
lifecycle; calling them behind its back leaves it believing a widget is
mounted that is not, after which the next unmount does nothing and the next
mount does nothing.

Every method returns `void`, including `identify`, which the widget's own API
returns a promise from. Your call may be queued before the bundle has arrived
and there is nothing to await in that state — use `onIdentified` (or
`useChatlyEvent('identified', …)`) to learn that it landed, and `onError` to
learn that it did not.

Calling any of them with no widget mounted warns in the console and does
nothing. It never throws: a misconfigured chat must not break your click
handler.

## `useChatlyEvent(event, handler)`

```tsx
function ChatAnalytics() {
  useChatlyEvent('open', () => analytics.track('chat_opened'));
  // The detail is `unknown` here. For the typed payload, use the component's
  // own `onMessage={(m) => …}` — see `<ChatlyWidget />` above.
  useChatlyEvent('message', () => analytics.track('visitor_sent_message'));
  return null;
}
```

Subscribes for the life of the component. The handler is read through a ref,
so an inline arrow does not re-subscribe on every render.

`'ready'` fires immediately if the session is already up — the widget replays
the last one — which is what makes this usable from a component that mounts
long after the page did.

### What `'message'` is, and is not

**`'message'` fires when the VISITOR sends something.** An agent's reply does
not fire it, and neither does a bot's. It is the hook for "this person started
talking to us" — analytics, a form you want to stop showing, a Slack ping —
and it is the wrong hook for anything about incoming mail.

This README showed an `UnreadBadge` built on it, which never counted a single
reply. It counted the visitor's own messages, and the bug was invisible
because the number went up when you tested it by typing.

### An unread badge

There is **no `unread` event today**, so a badge has to ask the server. The
count is on the wire — `@chatlychat/sdk-js` exposes it:

```tsx
import { Chatly } from '@chatlychat/sdk-js'; // a separate install
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatlyEvent } from '@chatlychat/widget-react';

function UnreadBadge() {
  const [unread, setUnread] = useState(0);
  // Built in an effect, never at module scope: `Chatly.init()` reads
  // localStorage in its constructor, which throws on a server and on a
  // browser with site data blocked.
  const client = useRef<ReturnType<typeof Chatly.init> | null>(null);

  const refresh = useCallback(() => {
    client.current?.unreadCount().then(setUnread, () => undefined);
  }, []);

  // On mount, when the tab comes back, and when the panel closes — the three
  // moments the number can have changed without this component hearing.
  useEffect(() => {
    client.current ??= Chatly.init({ publicId: 'acme-web' });
    refresh();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);
  useChatlyEvent('close', refresh);
  useChatlyEvent('open', () => setUnread(0));

  return unread > 0 ? <span className="badge">{unread}</span> : null;
}
```

Why a request rather than a counter: the case a badge exists for is a reply
that arrived after the visitor closed the tab, and no client-side tally can
know about that one. `unreadCount()` sums `unreadContactCount` across the
visitor's threads, which is the same number the widget's own Messages tab
renders.

It is deliberately not on `window.Chatly`. Making it known at page load would
mean a request for every visitor, including the large majority who never open
the chat and already pay for `widget.js` on every page view.

**One caveat, and it decides whether the number is right.** A `Chatly` client
keeps its own visitor session, under a different storage key from the widget's.
For a signed-in visitor, call `client.identify()` with the same identity you
pass to `<ChatlyWidget visitor={…} />` and both resolve to the same contact:

```tsx
await client.current?.identify({ externalId: user.id, userHash }); // same userHash
```

For an **anonymous** visitor there is nothing to resolve them by, so the two
sessions are two different contacts and the count will not be about the
conversations in the panel. Until the widget publishes the count itself, an
unread badge is a feature for signed-in visitors.

## `<ChatlyLauncher />` — your button, the bundle loaded on demand

```tsx
import { ChatlyLauncher } from '@chatlychat/widget-react';

// Owner: nothing else mounts the widget, and `widget.js` (~44KB gzipped) is
// not fetched until somebody uses this button.
<ChatlyLauncher publicId="acme-web" className="btn btn-primary">
  Chat with us
</ChatlyLauncher>;

// Control: a page that already renders <ChatlyWidget />. Claims nothing;
// clicking it is `useChatly().open()`.
<ChatlyLauncher openTab="help">Help</ChatlyLauncher>;
```

Whether it owns the widget is decided by one thing: a `publicId`. With one it
claims the widget with `lazy: 'manual'`, so the loader (~2KB) is fetched and
the bundle is not; the first click downloads the bundle and opens the panel.
Hovering or focusing the button starts that download early, so the click
usually finds it cached — pass `prefetchOnHover={false}` to make the fetch
strictly click-triggered.

It renders a bare `<button>` with your children in it, and that is
deliberate: this package ships no stylesheet, so the alternative was inline
styles that fight your design system. If you want the styled floating
launcher, that is `<ChatlyWidget />`.

In owner mode it also sets `theme.hideLauncher`, so you do not get your button
_and_ the widget's own bubble. Pass `theme={{ hideLauncher: false }}` if you
want both. One caveat if you render `<ChatlyWidget />` as well: the first
mount owns the configuration, so put `hideLauncher` there instead.

### `lazy` on `<ChatlyWidget />`

The same option works on `<ChatlyWidget />` and on `<chatly-widget>`, with
the widget's own launcher kept:

| value                 | what happens                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `false` (default)     | the bundle is fetched on page load, as it always has been                                                  |
| `true` / `'launcher'` | the loader paints a stand-in launcher matching your theme; using it fetches the bundle and opens the panel |
| `'interaction'`       | as above, plus a pre-warm on the visitor's first interaction with the page                                 |
| `'manual'`            | nothing is painted or fetched until something calls `Chatly('load')`                                       |

Two things to know before turning it on. A `track()` call made in lazy mode
waits in the queue until the bundle loads, so a visitor who leaves the page
first loses the event. And `lazy` is read once, when `loader.js` evaluates —
changing it in props afterwards warns rather than taking effect, because by
then the question has been answered.

With `inline`, where there is no launcher at all, the trigger is the
container approaching the viewport instead.

## Verifying identity: `@chatlychat/widget-react/server`

```ts
// A server component, a route handler, a `getServerSideProps` — anywhere
// that is not the browser.
import { chatlyUserHash } from '@chatlychat/widget-react/server';

const userHash = chatlyUserHash(process.env.CHATLY_IDV_SECRET!, user.id);
```

Then pass the hash — and only the hash — to the client as
`visitor={{ externalId: user.id, userHash }}`.

**The secret must never reach a browser.** Anything that can compute this
hash can impersonate any of your users to the widget, so a secret in your
bundle makes identity verification worse than useless: the dashboard still
reports it as on, the API accepts every hash, and one attacker with devtools
open reads every customer's support history.

That is why this is a separate entry point rather than a root export, why the
package's `exports` map points it at a throwing stub under the `browser`
condition, and why the function refuses to run if it finds a `window` or a
`document`. It is the same digest as `chatlyIdentityHash` in
`@chatlychat/sdk-node`; if your backend already uses that, keep using it.

## One widget per page

`window.Chatly` is a singleton, so there is one widget per page whatever you
render. Two mounted `<ChatlyWidget />`s with different options is a
misconfiguration: the **first** one owns the configuration, the second's
options are ignored (its event handlers still fire), and you get a console
warning saying so. Render one, high in the tree, and reach for `useChatly()`
everywhere else.

Two mounted with the _same_ options is harmless and silent — which is what
makes a `<ChatlyWidget />` inside a layout that remounts on navigation safe.

## Server-side rendering

Safe. `<ChatlyWidget />` renders `null` (or an empty `<div>` when `inline`),
`<ChatlyLauncher />` renders a `<button>`, and everything that touches
`window` happens in an effect or an event handler — neither of which runs on
the server. There is no `'use client'` needed in Next.js App Router beyond the
one your own component already has if it uses hooks.

`src/ChatlyLauncher.ssr.spec.tsx` renders both components with
`react-dom/server` in a Node environment where `window` and `document` are
genuinely undefined, because a jsdom test has a `window` and would pass either
way.

## Serving the loader yourself

Set `loaderUrl` if you serve `loader.js` off your own CDN, or to aim the
component at another Chatly environment. `GET /v1/channels/:id` returns the
right value as `embed.loaderUrl` — read it from there rather than typing a
host, and note that the loader looks for the bundle beside whatever URL you
give it, so `widget.js` and its chunks have to be served from the same path.
The same endpoint reports the origins a running widget connects to as
`connectOrigins` — the API host, and the realtime host under both `https:` and
`wss:`, which a browser matches separately — for your CSP.

## License

MIT — see `LICENSE`.

---

## About this repository

This is a **mirror**. `@chatlychat/widget-react` is built from a private monorepo where the rest
of the platform, its migrations and its contract checks live, so a pull request here
cannot be merged directly — but a patch is still the fastest way to get something
fixed and we will port it with attribution.

What you can do here: read the source, run the tests, open an issue, or open a PR
and we will treat the diff as the proposal.

Issues: https://github.com/chatlychat/chatly-widget-react/issues · Docs: https://chatlychat.com/docs
