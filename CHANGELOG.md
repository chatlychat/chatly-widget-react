# @chatlychat/widget-react — changelog

## 0.1.0 — unreleased

- Initial release: `<ChatlyWidget />`, `useChatly()`, `useChatlyEvent()`.
- React 18 StrictMode safe (one boot, not two), tears the widget down on
  unmount, and turns an `identity`/`locale` prop change into `identify()` /
  `setLocale()` rather than a re-init.
