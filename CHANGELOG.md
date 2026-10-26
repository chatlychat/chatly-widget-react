# @chatlychat/widget-react — changelog

## 0.18.0 — 2026-10-26

Picks up `@chatlychat/widget-element` 0.20.0, and with it a privacy fix that applies to `<ChatlyWidget>` and `<ChatlyLauncher>`: with `lazy` set to anything but `'off'`, nothing is requested from any Chatly host until the visitor reaches for the chat. Previously every mode fetched `loader.js` on page load. See that package's changelog for why it needed a code move rather than a branch.

## 0.17.0 — 2026-10-26

Picks up `@chatlychat/widget-element` 0.19.0. New prop `onNotice` for the bot's ephemeral notice: it receives `{ conversationId, replyTo, body }`.

## 0.16.0 — 2026-10-26

Picks up `@chatlychat/widget-element` 0.18.0. New prop `onNavigate` for the `navigate` card action: it receives `{ path, label, conversationId, messageId, actionId }` and is what stops the widget navigating by itself.

## 0.15.2 — 2026-10-26

Picks up `@chatlychat/widget-element` 0.17.0. **Behaviour change: visit telemetry is now opt-in.** The widget's own `visitor.*` events are held until analytics consent is granted, and opening the chat no longer grants it. New prop `analytics="grant"` for sites outside any consent regime.

## 0.15.1 — 2026-10-25

Pins `@chatlychat/widget-element` 0.16.2, which adds `setConsent` and CMP-neutral `consent: 'auto'`.

## 0.15.0 — 2026-10-25

- **`<ChatlyLauncher anchor="[data-bar]">`** — a flat prop, folded into
  `theme.anchor`, for a design-system component composing over this one
  (CHT-SI17). `theme={{ anchor }}` worked already; the flat prop exists so a
  wrapper need not know which option object the field lives in, and it WINS
  over the theme object as the more specific statement. An absent prop leaves
  `theme.anchor` alone rather than blanking it.
- **Most `<ChatlyLauncher>` users need neither.** Owner mode forces
  `theme.hideLauncher`, and the widget now anchors the panel to whichever
  element called `open()` — this button. Reach for `anchor` when the panel
  should clear something else, such as a sticky bar the button sits in.
- The per-category **`storage={{ functional, analytics, marketing }}`** object
  is pinned by a test, in both directions: it compiles as a prop and arrives in
  `init` with all three categories intact. It was already typed through
  `Partial<ChatlyEmbedOptions>`; what was missing was evidence.
- `consent` / `consentCategory` are still **not** implemented. They are blocked
  on Cookie Munch's category registry and SuiteConsent v1.

## 0.8.0 — 2026-10-19

**This package's own source did not change.** `ChatlyWidgetProps extends
ChatlyEmbedOptions` and `useChatly()` returns the element package's `controls`
object, so everything 0.8.0 of `@chatlychat/widget-element` added arrives here
by re-export. The release exists because `pnpm publish` rewrites
`workspace:*` to an EXACT version at pack time, so this package's pin is what
decides whether a React consumer can reach it at all — the same reason 0.7.0
existed.

What a React consumer gets:

- **`useChatly().setTheme({ colorScheme: 'dark' })`** — repaint an open panel
  with no re-mount and no network request. A changed `theme` PROP still
  re-initialises; call the method for a light/dark switch and leave the prop
  alone. Why the prop is not routed through it is in the element package's
  entry.
- **`visitor={{ getToken }}`** for an OIDC channel, and `visitor.userToken`
  for the raw token. Prefer the provider: a token lives ~60 seconds and the
  widget re-sends an identity on every `init`, so a string captured in a
  render is dead by the next one. Nothing minted is ever stored.

## 0.7.0 — 2026-10-19

**This package's own source did not change. The release exists because its
dependency pin is what decides whether `@chatlychat/widget-element@0.7.0`
reaches a React consumer at all, and at 0.6.0 the answer was never.**

`ChatlyWidgetProps extends ChatlyEmbedOptions`, so this package's public prop
type IS the element package's option type — it is re-exported, not restated.
But `pnpm publish` rewrites `workspace:*` to an **exact** version at pack time,
and `@chatlychat/widget-react@0.6.0` therefore went to the registry carrying
`"@chatlychat/widget-element": "0.6.0"`. A consumer on the React wrapper got
that version pinned, and nothing they could do short of an override would move
it. So the two things 0.7.0 of the element package added were, for React:

- `identityFallback="anonymous"` — a type error on `<ChatlyWidget>`, even
  though `optionsFrom` spreads every unknown prop straight into `init` and the
  runtime would have honoured it.
- `storage="on-open"` — a type error for **the widget's own new default**. The
  union was `'allow' | 'deny'`, so the one mode that stores nothing until the
  visitor asks for chat could not be written down in a React prop.

### Changed

- Requires `@chatlychat/widget-element@0.7.0` (exact, as always — see below).
  Upgrading gives `identityFallback`, `storage: 'on-open'`, and the
  `identity_rejected` / `identity_missing_hash` error codes on the existing
  `onError` prop.

### Changed behaviour you did not opt into

**The widget's default storage mode is now `'on-open'`**, from the element
package and the bundle underneath it rather than from anything here. An
embed passing no `storage` prop writes nothing to the device and sends no
visit telemetry until the visitor opens the panel. Pass `storage="allow"` for
the old eager behaviour. Your own `track()` calls are never gated.

### A note on the pin, since it is the reason this version exists

The dependency stays `workspace:*` — an exact pin on the published artifact —
deliberately, not by omission. `startWidget`'s refcounting and deferred
teardown are module-level state, so two copies of `@chatlychat/widget-element`
on one page are two independent lifecycles: the second consumer's `unmount`
cannot see the first one's mount. An exact pin is what guarantees the wrapper
and the element it was tested against are the same instance.

The cost is that this package must be re-released for every element release,
which is what 0.6.0 failed to do. It also means a consumer who depends on
`@chatlychat/widget-element` directly must keep that range able to resolve to
the same version this wrapper pins, or npm installs both and the refcount
splits. Keep the two versions equal.

## 0.6.0 — 2026-10-16

### Added

- An `onConversationChanged` prop on both components, and `setOffset` on
  `controls`. Requires `@chatlychat/widget-element@0.6.0`; `react` is still a
  **peer** dependency.

## 0.5.0 — 2026-10-16

### Changed

- **`<ChatlyLauncher publicId>` now preloads the bundle for a returning
  chatter.** Its owner-mode `lazy` default moved from `'manual'` to
  `'launcher'`, so a reply that arrived while the tab was closed reaches
  `onUnread` without the visitor clicking (Numera NCH-18). A first-time
  visitor still pays for nothing but the loader: owner mode forces
  `theme.hideLauncher`, so `'launcher'` and `'manual'` arm the same single
  trigger and differ in exactly one branch — the returning chatter.
- An explicit `lazy="manual"` is honoured unchanged and still means "load
  nothing until I call `load()`". The old default conflated the two, because
  `props.lazy ?? 'manual'` produced the same value either way; a default must
  not make a promise the host did not ask for.

### Added

- `setOffset` on `controls` and `panelOffsetY` in the theme keys.

### Also in this release

- **`<ChatlyLauncher publicId>` preloads the widget for a returning chatter**
  (NCH-18). Its owner-mode default for `lazy` moved from `'manual'` to
  `'launcher'`, so a visitor this browser already holds a conversation for
  gets `widget.js` on mount instead of on their first click.

  `'manual'` is the one lazy mode that deliberately refuses to load for a
  returning chatter — its promise is that nothing loads until you call
  `Chatly('load')` — and a wrapper had chosen it on your behalf. So someone
  who asked a question yesterday and got an answer overnight came back to a
  plain button: no badge, no thread, and a reply that stayed invisible, since
  counting unread needs the bundle and the bundle was what nothing fetched.

  **Nothing changes for a first-time visitor.** Owner mode also sets
  `theme.hideLauncher`, and the loader skips its stand-in launcher when that
  is set — so with no `mountTo`, `'launcher'` and `'manual'` arm the same
  single trigger (the queue carrying this button's own `load` and `open`) and
  differ in that one case. A visitor who never touches the button still pays
  for the ~2 KB loader and nothing else.

  **If you want the old behaviour, pass `lazy="manual"` explicitly.** An
  explicit `'manual'` was always honoured and still is: the default changed,
  the mode did not. `Chatly.hasSession()` is how you make the call yourself —
  but read the timing note, because `loader.js` is what defines it and that
  tag is `async`.

  One other consequence of the mode, for the few hosts that pass
  `theme={{ hideLauncher: false }}` to get two launchers: that is also what
  suppresses the stand-in, so the loader now paints its placeholder bubble
  beside your button until the real one arrives.

- Docs: the lazy table in the README said `'manual'` fetches nothing while the
  guide said a returning chatter loads eagerly. Both were presented as
  unconditional and only one could be true. Every table now carries the
  exception on the `'manual'` row, and the README has the by-hand recipe.

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
