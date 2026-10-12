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

Plus four of its own:

| prop                  | type                                                          |
| --------------------- | ------------------------------------------------------------- |
| `loaderUrl`           | Where `loader.js` is served from. **Self-hosting: set this.** |
| `locale`              | Calls `setLocale()` once the widget is up.                    |
| `inline`              | Render the chat inside this component's own box.              |
| `className` / `style` | Applied to the inline container.                              |

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
function UnreadBadge() {
  const [unread, setUnread] = useState(0);
  useChatlyEvent('message', () => setUnread((n) => n + 1));
  useChatlyEvent('open', () => setUnread(0));
  return unread > 0 ? <span className="badge">{unread}</span> : null;
}
```

Subscribes for the life of the component. The handler is read through a ref,
so an inline arrow does not re-subscribe on every render.

`'ready'` fires immediately if the session is already up — the widget replays
the last one — which is what makes this usable from a component that mounts
long after the page did.

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

Safe. The component renders `null` (or an empty `<div>` when `inline`), and
everything that touches `window` happens in an effect, which never runs on the
server. There is no `'use client'` needed in Next.js App Router beyond the one
your own component already has if it uses hooks.

## Self-hosting

Set `loaderUrl` to your deployment's. `GET /v1/channels/:id` returns the right
value as `embed.loaderUrl` — read it from there rather than typing a host, and
note that a running widget talks to **three** origins (widget host, API host,
realtime host); the same endpoint reports all of them as `connectOrigins` for
your CSP.

## License

MIT — see `LICENSE`.

---

## About this repository

This is a **mirror**. `@chatlychat/widget-react` is built from a private monorepo where the rest
of the platform, its migrations and its contract checks live, so a pull request here
cannot be merged directly — but a patch is still the fastest way to get something
fixed and we will port it with attribution.

What you can do here: read the source, run the tests (`npm install && npm test`),
open an issue, or open a PR and we will treat the diff as the proposal.

Issues: https://github.com/chatlychat/chatly-widget-react/issues · Docs: https://chatlychat.com/docs
