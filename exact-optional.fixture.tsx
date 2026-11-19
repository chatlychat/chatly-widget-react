/**
 * A HOST's component, compiled the way a host compiles it.
 *
 * This repo sets `exactOptionalPropertyTypes: false`, so nothing in the
 * normal build can see the defect this file exists for: under the flag,
 * `className?: string` and `className?: string | undefined` are different
 * types, and only the second accepts a wrapper's own optional prop. Two
 * integrators wrote `{...(className ? { className } : {})}` four times
 * between them to get around it.
 *
 * Compiled by `scripts/check-widget-react-exact-optional.mjs` with the flag
 * ON, against the PUBLISHED `.d.ts` (it imports the package by name, which
 * is why the gate builds both packages first — the published types are what
 * the claim is about, and what a consumer actually gets). It is a TYPE fixture: nothing renders it, and no spread or conditional
 * is allowed in it, because either one would make it pass against the bug.
 */
import { ChatlyLauncher, ChatlyWidget } from '@chatlychat/widget-react';

import type { ReactElement } from 'react';

export function HostLauncher(props: {
  publicId: string;
  className?: string;
  label?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}): ReactElement {
  // Every optional prop forwarded DIRECTLY. This is the line that failed.
  return (
    <ChatlyLauncher
      publicId={props.publicId}
      className={props.className}
      label={props.label}
      onClick={props.onClick}
      consent="auto"
    />
  );
}

export function HostWidget(props: {
  publicId: string;
  className?: string;
  onReady?: () => void;
}): ReactElement {
  return (
    <ChatlyWidget publicId={props.publicId} className={props.className} onReady={props.onReady} />
  );
}
