/**
 * `@chatlychat/widget-react` — the Chatly widget as a React component.
 *
 *     import { ChatlyWidget, useChatly } from '@chatlychat/widget-react';
 *
 *     function App() {
 *       return (
 *         <>
 *           <ChatlyWidget publicId="acme-web" visitor={{ externalId: user.id }} />
 *           <Routes />
 *         </>
 *       );
 *     }
 *
 *     function HelpButton() {
 *       const chatly = useChatly();
 *       return <button onClick={() => chatly.open('help')}>Help</button>;
 *     }
 *
 * React is a peerDependency — see the note at the top of `ChatlyWidget.tsx`.
 * The embed lifecycle comes from `@chatlychat/widget-element`, which has no
 * dependencies of its own and no side effects on import; the custom element it
 * also ships is NOT registered by anything here.
 */
export { ChatlyWidget, type ChatlyWidgetProps } from './ChatlyWidget.js';
/**
 * Your own button, with the bundle loaded on demand.
 *
 *     <ChatlyLauncher publicId="acme-web" className="btn">Chat</ChatlyLauncher>
 *
 * With a `publicId` it owns the widget and nothing of `widget.js` (~44KB
 * gzipped) is fetched until a visitor uses the button. Without one it is a
 * control for a widget `<ChatlyWidget>` already mounted.
 */
export { ChatlyLauncher, type ChatlyLauncherProps } from './ChatlyLauncher.js';
export { useChatly, useChatlyEvent } from './useChatly.js';

/*
 * `chatlyUserHash` is deliberately NOT exported here.
 *
 * It needs the channel's identity-verification secret, and this entry point
 * ends up in browser bundles. Exporting it from the root would invite a
 * consumer to call it in a component and ship the secret to every visitor,
 * which defeats identity verification completely and leaves the dashboard
 * still reporting it as on. It lives at `@chatlychat/widget-react/server`,
 * which the `exports` map points at a throwing stub under the `browser`
 * condition; the full threat model is in `src/server.ts`.
 */

/**
 * Re-exported so a consumer types their props from one import rather than
 * reaching into the element package for a theme type.
 */
export type {
  ChatlyBehavior,
  ChatlyCopy,
  ChatlyEmbedHandlers,
  ChatlyEmbedOptions,
  ChatlyEventName,
  ChatlyIdentity,
  ChatlyInitOptions,
  ChatlyLazyMode,
  ChatlyMessageEvent,
  ChatlyQuickLink,
  ChatlyQuip,
  ChatlySession,
  ChatlyTheme,
} from '@chatlychat/widget-element';
