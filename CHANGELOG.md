# @chatlychat/widget-react — changelog

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
