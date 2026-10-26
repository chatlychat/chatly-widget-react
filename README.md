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

Every [init option](https://chatlychat.com/guides/channel-web) is a prop:
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

And all twelve of the events, as callbacks: `onReady`, `onOpen`, `onClose`,
`onMessage`, `onMessageAck`, `onMessageReceived`, `onUnread`,
`onConversation`, `onIdentified`, `onReset`, `onAction`, `onError`. Pass
inline arrow functions freely — they are read through a ref, so a new one on
every render costs nothing and the handler that fires is always the latest.

`onMessage` means "the visitor sent something" and has never fired for a
reply. `onMessageReceived` is an agent or bot message that arrived while its
thread was on screen, and `onUnread` is the badge number — fired as soon as it
is known and on every change.

### What a prop change actually does

This is the part worth knowing, because the three outcomes are different:

| changed prop            | what happens                                          |
| ----------------------- | ----------------------------------------------------- |
| `visitor`               | `identify()`. Nothing is re-mounted.                  |
| `visitor` → `undefined` | `reset()` — a sign-out, so the next session is fresh. |
| `visitor={null}`        | `reset()` **on mount too**, not only on a change.     |
| `locale`                | `setLocale()`. Nothing is re-mounted.                 |
| anything else           | `init()` again, which **destroys and re-mounts**.     |

A re-mount loses nothing durable — the conversation lives on the server — but
it closes an open panel. What this component guarantees is that it only happens
when a value really changed, not when a parent re-rendered.

### `visitor={null}` — signing out on a page that loaded signed out

The two `visitor` rows above are **transitions**: the prop held an identity and
then went away. A page that renders already signed out never makes that
transition, so the previous account's external id stays in the browser — the
widget keeps it at `chatly:xid:<publicId>` so it can spot an account switch. On
a shared device that is the last person's identity outliving a sign-out that
happened in another tab.

Pass `null` and the widget compares its own stored identity on mount and resets
itself if one is there. You need no `localStorage` key of your own for it:

```tsx
// signed out, and saying so
<ChatlyWidget publicId="acme-web" visitor={user ? { externalId: user.id, userHash } : null} />
```

**An absent `visitor` still changes nothing, deliberately.** The widget cannot
tell it apart from "identity has not resolved yet", and a reset on that would
drop a live conversation every time your auth check is slow — so
`visitor={user ? {…} : undefined}` keeps today's behaviour. `null` is the
opt-in. It is also ignored when `identity` or `identityEndpoint` is set, since
a provider answers the same question under the same rule.

A changed `theme` value is applied live with `setTheme()` — an open panel is
repainted in place, with no re-mount and no network request — so computing the
theme from your light/dark state is safe. The prop re-initialises only when a
top-level key is REMOVED (or set to `undefined`), because a merge cannot
un-apply one; a value changed live and then removed keeps its last value until
a page load.

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
`setLabel`, `removeLabel`, `setLocale`, `track`, `registerPushToken`, `reset`,
`dismiss`, `setStorageConsent`, `setConsent`, `setOffset`, `setTheme`,
`getUnreadCount`, `hasSession`, `startConversation`, `setContext`,
`reportAction` — plus `load`.

`load()` is the one method that is **not** the widget's: it is the loader's,
and it starts the bundle download without opening anything (what `lazy="manual"`
needs, and what a hover-prefetch on your own button does). It is here so you
never have to reach for `window.Chatly`. It is a no-op once the bundle is up.

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

Calling any of them before a widget has mounted is safe, and since 0.19.0 the
call is not lost either: it is **queued and replayed** as soon as one mounts.
A "Chat with us" link in your header keeps its first click even when
`<ChatlyWidget>` renders a commit later, or after a channel id has been
fetched. One console warning says the call was queued, because a page that
never mounts a widget still gets nothing. It never throws: a misconfigured
chat must not break your click handler.

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

There **is** an `unread` event, and it is what a badge should use. It carries
`{ count }` and it is replayed to a late subscriber, so a component that
mounts a minute after the page did still gets the current number:

```tsx
import { useState } from 'react';
import { useChatly, useChatlyEvent } from '@chatlychat/widget-react';

function UnreadBadge() {
  const chatly = useChatly();
  // `getUnreadCount()` is the same number, for the first paint — before any
  // change has happened there is no event to have heard.
  const [unread, setUnread] = useState(() => chatly.getUnreadCount());
  useChatlyEvent('unread', (detail) => setUnread((detail as { count: number }).count));

  return unread > 0 ? <span className="badge">{unread}</span> : null;
}
```

No request of your own, no second visitor session to reconcile, and nothing to
install beyond this package. The widget refreshes the number at boot, when the
tab comes back, when the panel closes, and on a 60-second poll while the
visitor has an open or pending thread they are not looking at — and it spends
nothing at all on a visitor who has never had a conversation.

The count is agent and bot messages the visitor has not had on screen, across
their threads. It is derived from the widget's own watermark rather than the
server's `unreadContactCount`, and the difference matters: nothing zeroes that
column for a visitor, it counts an agent's private notes, and it does not count
bot replies — the most common reply in this product.

This README used to deny that the event existed, and showed a badge built on
`@chatlychat/sdk-js`'s `client.unreadCount()`. That call still exists and is
still right for a page that renders **no widget at all**, but it is a different
number from the one above, and it kept its own visitor session under its own
storage key — so for an anonymous visitor the two were two different contacts
and the count was not about the conversations in the panel. Do not mix them in
one badge.

### `useChatlyEvent` and the props reach the same twelve events

They did not until 2026-10-16: `unread`, `message.ack` and `message.received`
had no `onX` prop and no `chatly-*` DOM event, on the reasoning that "a dotted
name does not survive the rename and a replayed event cannot be a DOM event".
Neither held. A dot becomes a dash, which is what this package already does to
every option name that crosses into HTML, and `ready` was always both replayed
and a DOM event. All twelve now have a prop, a DOM event and a
`useChatlyEvent` name.

`useChatlyEvent` and `subscribe()` still go through `Chatly.on` directly, and
that is the route to prefer for a badge: a replayed event (`ready`, `unread`)
fires at the moment you subscribe, so a hook that mounts long after the page
did is told the current count rather than nothing.

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
claims the widget with `lazy: 'launcher'` and `theme.hideLauncher`, and since
0.18.0 **nothing is fetched at all** until the visitor reaches for the chat —
not the bundle and not `loader.js` either. The first hover, focus or click
downloads both and opens the panel; hovering or focusing starts it early, so
the click usually finds it cached. Pass `prefetchOnHover={false}` to make the
fetch strictly click-triggered.

One exception, and it is the reason the default is `'launcher'` rather than
`'manual'`: a **returning chatter** — a visitor this browser already holds a
conversation for — gets the bundle on mount, with no click. They may have a
reply that arrived while the tab was closed, and the unread badge cannot be
drawn without the bundle, so deferring it is how that reply stays invisible.
A first-time visitor still pays for the loader and nothing else: with
`hideLauncher` set there is no stand-in launcher to paint, so `'launcher'` and
`'manual'` arm the same single trigger and differ only in that one case.

Pass `lazy="manual"` if you want the stricter promise — nothing fetched or
painted until something calls `load()`, returning chatter included — and make
the call yourself:

```tsx
import { useEffect } from 'react';
import { useChatly } from '@chatlychat/widget-react';

function PreloadForReturningChatters() {
  const chatly = useChatly();
  // Safe in a mount effect since 0.18.0: `hasSession()` is answered
  // synchronously, by this package, from the same stored-thread key the
  // loader and the bundle read. It used to be defined by `loader.js` as it
  // evaluated — and the tag is `async`, so an effect in the mount commit
  // asked before anything could answer and got `false`.
  useEffect(() => {
    if (chatly.hasSession()) {
      chatly.load();
    }
  }, [chatly]);
  return null;
}
```

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

| value                 | what happens                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false` (default)     | the bundle is fetched on page load, as it always has been                                                                                                       |
| `true` / `'launcher'` | the loader paints a stand-in launcher matching your theme; using it fetches the bundle and opens the panel. A returning chatter's bundle is fetched immediately |
| `'interaction'`       | as above, plus a pre-warm on the visitor's first interaction with the page                                                                                      |
| `'manual'`            | nothing is painted or fetched until something calls `useChatly().load()` — **returning chatters are not preloaded either**                                      |

A returning chatter is a visitor this browser already holds a conversation
for. Every mode but `'manual'` fetches the bundle for them at once, because
the unread badge cannot be drawn without it and a reply that arrived while
they were away would otherwise be invisible until they clicked. `'manual'`
is the mode that leaves that call to you — `useChatly().hasSession()` is the test,
and since 0.18.0 it is answered **synchronously, at mount**, by this package
rather than by `loader.js`. It had to be: deferring the loader means there is
nothing else to answer it, and `'manual'` is the mode most likely to ask.

Two more things to know before turning it on. A `track()` call made in lazy
mode waits in the queue until the bundle loads, so a visitor who leaves the
page first loses the event. And `lazy` is read once, at mount — changing it in
props afterwards warns rather than taking effect,
because by then the question has been answered.

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
