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
export { useChatly, useChatlyEvent } from './useChatly.js';

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
  ChatlyMessageEvent,
  ChatlyQuickLink,
  ChatlyQuip,
  ChatlySession,
  ChatlyTheme,
} from '@chatlychat/widget-element';
