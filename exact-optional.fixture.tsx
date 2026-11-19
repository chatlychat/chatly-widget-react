/**
 * A HOST's component, compiled with `exactOptionalPropertyTypes: true`
 * against the PUBLISHED `.d.ts` — see `scripts/check-widget-react-exact-optional.mjs`.
 *
 * ── What the first version of this file missed ──────────────────────────
 *
 * It forwarded `className` and `onReady` and passed, while
 * `@chatlychat/widget-react@0.27.0` shipped TWO defects it could not see:
 * `<ChatlyWidget>` refused every INHERITED embed option — the 24 a host
 * actually forwards, as against the 4 props the component writes out by hand
 * and the fixture happened to test.
 *
 * A fixture that exercises only the props named in the fix agrees with the
 * fix. So this one asserts both directions, on both components:
 *
 *   1. an inherited option forwards from a host's own optional prop;
 *   2. `publicId` is required on the widget and optional on the launcher.
 *
 * The required half is a `@ts-expect-error`, which is a real assertion rather
 * than a suppression: if `publicId` ever stops being required, the
 * expectation goes unused and `tsc` fails on the unused directive.
 *
 * No spreads and no conditionals: `{...(x ? { x } : {})}` is the workaround
 * being eliminated, so using it here would hide the thing being tested.
 */
import { ChatlyWidget, ChatlyLauncher } from '@chatlychat/widget-react';

import type { CSSProperties } from 'react';

interface HostProps {
  /** The host's OWN optional props, which is where the `undefined` comes from. */
  readonly cssClass?: string;
  readonly boxStyle?: CSSProperties;
  readonly onUp?: () => void;
  /** An inherited embed option, not one of the component's own props. */
  readonly identityUrl?: string;
  readonly lang?: string;
}

export function HostedWidget(props: HostProps) {
  return (
    <ChatlyWidget
      publicId="pub_test"
      inline
      className={props.cssClass}
      style={props.boxStyle}
      onReady={props.onUp}
      identityEndpoint={props.identityUrl}
      locale={props.lang}
    />
  );
}

export function HostedLauncher(props: HostProps) {
  return (
    <ChatlyLauncher
      publicId="pub_test"
      className={props.cssClass}
      onReady={props.onUp}
      identityEndpoint={props.identityUrl}
      locale={props.lang}
    >
      Chat
    </ChatlyLauncher>
  );
}

/*
 * `publicId` is REQUIRED on the widget and OPTIONAL on the launcher, and the
 * asymmetry is the point: an absent `publicId` is the launcher's
 * owner/companion switch (without one it toggles a widget something else
 * started), while the widget cannot start without a channel. Both are pinned,
 * so neither can be "tidied" into the other.
 */
export const widgetNeedsPublicId = () => (
  // @ts-expect-error publicId is required on ChatlyWidget
  <ChatlyWidget inline />
);
export const launcherInCompanionMode = () => <ChatlyLauncher>Chat</ChatlyLauncher>;
