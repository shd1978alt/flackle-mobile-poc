# Flackle Mobile PoC

React Native (Expo, TypeScript) prototype for iOS and Android over the existing Flackle API.
Scope: sign in, server rail + DM list, open/browse/switch conversations, live send / reply /
edit / delete / reactions. No sign-up, new conversations, attachments, calls, typing or read receipts.

> **Status:** Android has been checked against the live server by the project owner. iOS and
> background/foreground behaviour are still to be verified. The client, store and socket logic was also
> exercised against a fake server built from API.md / WEBSOCKET.md (cookies/CSRF/refresh, MFA, history
> pagination, send/ack, all message and conversation events, reconnect resync); screens were not
> rendered in that harness.

## Setup

Requirements: Node 20+, and for devices either Expo Go or a simulator (Xcode for iOS, Android Studio for Android).

```bash
npm install
npx expo install --fix     # aligns native package versions with your installed Expo SDK
npm start                  # then press i (iOS simulator), a (Android emulator) or scan the QR in Expo Go
```

Direct launch: `npm run ios` / `npm run android`. Only Expo-Go-compatible packages are used, so no
native build is needed. If you prefer a dev build: `npx expo run:ios` / `npx expo run:android`.

Type check: `npm run typecheck`.

## Build files for emulator / simulator

```bash
npm install -g eas-cli && eas login          # free Expo account
eas build --platform android --profile emulator   # -> .apk
eas build --platform ios --profile simulator      # -> .app (zipped), no Apple account needed
```

Each command ends with a download link. Android: drag the `.apk` onto the running emulator. iOS: unzip
the download and drag the `.app` onto the running simulator.

## Styling

Layout follows the web app screenshots: near-black theme, server rail on the left, DM list with
`<sender>: <preview>` rows, flat Discord-style messages (avatar, name, time, consecutive messages
grouped, day separators, replies shown above with a connector, reaction chips), and a DM intro header.
Colours are approximated by eye from the screenshots, and the system font is used. Web elements outside
the PoC scope are intentionally left out: conversation search, My profile, Friends, add-server button,
notification bell, voice controls, presence dots, rich-text toolbar and the member list. The dot on your
own avatar shows the live socket connection state instead (green connected, amber connecting, red offline).

## User cards and servers

- **User card:** tap a sender's avatar or name in a thread to open a profile card (avatar, name,
  `@username`) with a "Message @user" box, like the web popover. The box appears when you already have a
  DM with that person (creating conversations is out of scope) and sends through the same socket path as
  normal messages. The documented API has no banner or bio fields, so the banner is a plain block.
- **Server rail:** tapping a server selects it (active indicator moves, sidebar shows the server name);
  the home tile returns to Direct Messages. **Server channels are not implemented**: API.md and
  WEBSOCKET.md document no endpoint for listing a server's channels or reading channel history, so the
  sidebar shows a "Channels aren't available yet" placeholder. Wiring channels needs those endpoints.

## Test accounts

Create two accounts and make them friends on the website (sending to a DM needs friendship), join
at least one server on the main account, and open a DM between them. Sign in on the phone with the
main account and use the second in the web app.

## Demo check

1. Send, reply, edit, delete and react from each side; both sides should update live.
2. Scroll up in a long DM to load older pages.
3. Check list previews update (including after edit/delete of the latest message).
4. Switch between DMs and back to the list.
5. Background the app, send from the web app, return: the thread should catch up.
6. Toggle airplane mode for a minute, send from web, restore: the status dot goes red -> amber -> green and the thread re-syncs.

## How it works

| Concern | Where | Notes |
| --- | --- | --- |
| Cookies / CSRF | `src/api/cookies.ts`, `client.ts` | Requests use `credentials: 'omit'` with a manual cookie jar (persisted in AsyncStorage). `Set-Cookie` is parsed on every response, including errors. `__Host-csrf` is echoed as `x-csrf-token` on writes; if missing, a `GET /api/auth/me` establishes it; `csrf_invalid` is retried once. |
| Refresh | `client.ts` | A 401 triggers one shared (single-flight) `POST /api/auth/refresh`, then a retry. Only a 401/403 from refresh ends the session; network errors and 5xx don't. |
| Socket | `src/realtime/socket.ts` | One socket per session, fresh ticket per connect, `Origin: https://flackle.com` passed as a native handshake header, app-level ping/pong every 20s, exponential backoff, forced reconnect when the app returns to the foreground. |
| Resync | `store/index.ts` | There is no replay, so every re-`hello` refetches the conversation list and the open thread's latest page and merges it with live events (gap detection drops stale cache). |
| Sending | `store/index.ts` | Local optimistic message with a nonce; `message_ack` swaps in the real ID or marks it failed. No ack within 15s marks it "unconfirmed" (it may have been persisted); retry is manual, and an unconfirmed message that shows up in a resync is deduplicated. |
| Reactions | `utils.ts` `applyReaction` | Events lack the viewer's `me` flag, so it's derived by comparing `user_id` to the signed-in user. Counts are applied as absolute values. |

## Known limitations

- **Untested against the live API/devices** (see status above).
- **WebSocket Origin on iOS:** React Native passes custom handshake headers on Android; on iOS, confirm in the first run that the custom `Origin` is honoured. If the server rejects the socket on iOS, the fallback is a small patch to React Native's iOS WebSocket handshake (or a dev build with a patched `RCTSRWebSocket`).
- Cookie jar is stored unencrypted in AsyncStorage; use secure storage for production.
- Reconnect catches up with one page (50 messages) of the open thread; longer gaps drop the cache and show only the latest page.
- Other open threads aren't kept in sync while closed; they're reloaded when opened.
- Server rail selects servers but channels aren't implemented (no documented endpoints, see above); letter tile when a server has no icon. Groups are listed and `group_member_added/removed` update their members, but only DMs were tested and the member payload shape is assumed to match conversation members.
- Unsupported message types and attachments show as a placeholder.
- User card has no banner/bio (not in the documented API) and can only message people you already have a DM with.
- Avatar URLs are assumed absolute or relative to `https://flackle.com`.
- `maxLength={2000}` counts UTF-16 units, not code points; the server remains authoritative.
- Socket `error` events (no nonce) show as a dismissible banner in the open chat, since they can't be tied to a specific send. Throttled (429) reads retry twice with backoff; throttled writes surface an error.
- No automated tests in the repo; no push notifications; the app is dark-theme only.
- Boot while offline shows the sign-in screen (saved cookies are kept).
