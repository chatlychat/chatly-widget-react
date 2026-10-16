# @chatlychat/widget-react — changelog

## 0.4.0 — 2026-10-16

- **Three new event props**: `onMessageAck`, `onMessageReceived` and
  `onUnread`, on both `<ChatlyWidget />` and `<ChatlyLauncher />`. All twelve
  of the widget's events now have a prop; nine did.

  The last line of the 0.3.0 entry below reads "There is no `unread` event to
  subscribe to today", which was already untrue when it shipped: the widget
  emitted one, replayed to a late subscriber, and it is the right number for a
  badge. The README's `UnreadBadge` section has been rewritten around it
  (`useChatlyEvent('unread', …)` plus `getUnreadCount()` for first paint);
  what was still missing, until now, was the prop.

- The two components' handler plumbing moved into one module and takes its
  names from `@chatlychat/widget-element`'s `EVENT_HANDLERS`, so a widget
  event added later reaches a React prop with no edit in this package.

- `ChatlyMessageAckEvent` and `ChatlyUnreadEvent` are re-exported from the
  package root, so the three new props can be typed without reaching into
  `@chatlychat/widget-element`.

- Requires `@chatlychat/widget-element@0.4.0`, which is where the three
  events are forwarded from. `react` is still a **peer** dependency.

## 0.3.0 — 2026-10-15

- `nonce` on `<ChatlyWidget />` and `<ChatlyLauncher />`: the page's CSP
  nonce, for an app served `script-src 'nonce-…'` with no `'unsafe-inline'`.
  Passed to the embed lifecycle, which stamps the `loader.js` script and
  publishes the value on the loader shim. Optional; absent-by-default
  behaviour is unchanged. Not sufficient on its own — see the note in
  `@chatlychat/widget-element`'s changelog about the other two injection
  points.
- README fix: the `UnreadBadge` example counted `message` events, which fire
  only when the VISITOR sends something — an agent's reply does not fire one,
  so the example never counted a reply. Replaced with
  `@chatlychat/sdk-js`'s `unreadCount()`, plus the caveat that decides whether
  the number is right: the headless client keeps its own visitor session, so
  it has to be `identify()`-ed with the same identity as the widget, and an
  anonymous visitor's two sessions are two different contacts. There is no
  `unread` event to subscribe to today.

## 0.2.0 — 2026-10-14

- `<ChatlyLauncher />`: render your own button and boot the widget on demand.
  With a `publicId` it owns the widget with `lazy: 'manual'`, so `widget.js`
  (~44KB gzipped) is not fetched until a visitor uses the button; without one
  it is a control for a widget `<ChatlyWidget />` already mounted. Hover and
  focus prefetch the bundle. In owner mode it sets `theme.hideLauncher` so you
  do not get two launchers.
- `lazy` on `<ChatlyWidget />` (and `<chatly-widget lazy>`): `false` by
  default, so every existing embed is unchanged. See the README for the four
  modes and the two costs.
- `@chatlychat/widget-react/server`: `chatlyUserHash(secret, externalId)` for
  identity verification. A SEPARATE entry point, pointed at a throwing stub
  under the `browser` export condition and refusing to run if it finds a
  `window` — the IDV secret is a server secret, and a helper that invited it
  into a bundle would make identity verification worse than absent.

## 0.1.2 — 2026-10-13

- Release note: this is the version ON npm. `0.1.3` was accepted by npm and
  never completed — "staged" — so it is unusable and can never be published;
  the next release skips it.

- Metadata only; no code change. `repository` pointed at
  `github.com/livechat/platform` (a 404) rather than at this package's own
  repo. Corrected in-tree earlier, but npm freezes metadata per version, so it
  took this publish to reach the registry. Depends on
  `@chatlychat/widget-element@0.1.1`, republished for the same reason.

## 0.1.0 — unreleased

- Initial release: `<ChatlyWidget />`, `useChatly()`, `useChatlyEvent()`.
- React 18 StrictMode safe (one boot, not two), tears the widget down on
  unmount, and turns an `identity`/`locale` prop change into `identify()` /
  `setLocale()` rather than a re-init.
