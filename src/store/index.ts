import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { api, ApiError, setSessionExpiredHandler } from '../api/client';
import { clearJar, hasSession, loadJar } from '../api/cookies';
import { ConnStatus, Socket } from '../realtime/socket';
import { Conversation, Message, PresenceStatus, ReplyTo, Server, User } from '../types';
import { applyReaction, cmpId, isLocal, parsePresenceEvent, parsePresenceMap } from '../utils';

interface Chat {
  items: Message[]; // oldest -> newest; local (unsent/unconfirmed) messages are at the end
  hasMoreBefore: boolean;
  loadingOlder: boolean;
  loaded: boolean;
  error?: string;
}
const emptyChat = (): Chat => ({ items: [], hasMoreBefore: false, loadingOlder: false, loaded: false });

export interface AppState {
  booting: boolean;
  me: User | null;
  servers: Server[];
  conversations: Conversation[];
  chats: Record<string, Chat>;
  activeConversationId: string | null;
  connection: ConnStatus;
  notice: string | null;
  /** Unread badge per conversation (tracked on this device, see lastRead below). */
  unread: Record<string, number>;
  /** Per open conversation: first message that was unread when it was opened, and how many there were. */
  newMarker: Record<string, { id: string; count: number }>;
  /** Presence by user id, from the `hello` presences map and presence events. */
  presence: Record<string, PresenceStatus>;
  /** True once a `hello` carried a presences map; before that no status dots are shown. */
  presenceKnown: boolean;

  setNotice(n: string | null): void;
  boot(): Promise<void>;
  login(email: string, password: string): Promise<'ok' | 'mfa'>;
  loginMfa(code: string, backup: boolean): Promise<void>;
  logout(): Promise<void>;
  expire(): void;
  refreshConversations(): Promise<void>;
  openConversation(id: string): Promise<void>;
  closeConversation(id: string): void;
  loadLatest(id: string): Promise<void>;
  loadOlder(id: string): Promise<void>;
  send(convId: string, content: string, reply?: ReplyTo): void;
  retryMessage(convId: string, localId: string): void;
  discardMessage(convId: string, localId: string): void;
  edit(convId: string, msgId: string, content: string): Promise<void>;
  remove(convId: string, msgId: string): Promise<void>;
  toggleReaction(convId: string, msg: Message, emoji: string): Promise<void>;
  handleEvent(type: string, payload: any): void;
}

let socket: Socket | null = null;
let mfaToken: string | null = null;
const ackTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const norm = (m: Message, convId: string): Message => ({
  ...m,
  conversation_id: convId,
  reactions: m.reactions ?? [],
  is_deleted: !!m.is_deleted,
  type: m.type ?? 'text',
});

const sortConvs = (list: Conversation[]) =>
  [...list].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));

const sendError = (status?: string, error?: string) =>
  status === 'not_friends'
    ? 'You need to be friends with this person to message them.'
    : status === 'pending_deletion'
      ? 'This account is pending deletion.'
      : error || 'Message failed to send.';

/**
 * Unread tracking. The documented API has no read-state or unread-count endpoint, so "read" is tracked on
 * this device: the newest message id seen per conversation is saved locally. A conversation is unread when
 * its latest message is from someone else and newer than that id. Tracking starts the first time a
 * conversation is seen (nothing is marked unread retroactively), and it is not synced with other devices.
 */
const LAST_READ_KEY = 'flackle.lastRead.v1';
let lastRead: Record<string, string> = {};
const loggedEventTypes = new Set<string>();
let liveSeen: Record<string, string> = {}; // newest message id already counted from a live event, per conversation
const maxId = (a?: string, b?: string) => (!a ? b : !b ? a : cmpId(a, b) >= 0 ? a : b);
const loadLastRead = async () => {
  try {
    lastRead = JSON.parse((await AsyncStorage.getItem(LAST_READ_KEY)) ?? '{}');
  } catch {
    lastRead = {};
  }
};
const saveLastRead = () => {
  AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(lastRead)).catch(() => {});
};
const markRead = (convId: string, msgId: string) => {
  if (!lastRead[convId] || cmpId(msgId, lastRead[convId]) > 0) {
    lastRead[convId] = msgId;
    saveLastRead();
  }
};

/** Status to draw for a user, or undefined for no dot (not known yet). You are online while the socket is. */
export function presenceFor(st: Pick<AppState, 'me' | 'connection' | 'presence' | 'presenceKnown'>, userId?: string): PresenceStatus | undefined {
  if (!userId) return undefined;
  if (st.me && userId === st.me.id) return st.connection === 'online' ? 'online' : 'invisible';
  if (!st.presenceKnown) return undefined;
  return st.presence[userId] ?? 'invisible'; // not in the map: treated as offline
}

export const useApp = create<AppState>((set, get) => {
  const patchChat = (id: string, fn: (c: Chat) => Chat) =>
    set((s) => ({ chats: { ...s.chats, [id]: fn(s.chats[id] ?? emptyChat()) } }));

  const mapItems = (id: string, fn: (m: Message) => Message) =>
    set((s) => {
      const c = s.chats[id];
      return c ? { chats: { ...s.chats, [id]: { ...c, items: c.items.map(fn) } } } : s;
    });

  const touchConversation = (convId: string, msg: Message) => {
    if (!get().conversations.some((c) => c.id === convId)) {
      // Events can reference conversations not in the earlier list: fetch it.
      api
        .conversation(convId)
        .then((c) =>
          set((s) =>
            s.conversations.some((x) => x.id === c.id) ? s : { conversations: sortConvs([...s.conversations, c]) },
          ),
        )
        .catch(() => {});
      return;
    }
    set((s) => ({
      conversations: sortConvs(
        s.conversations.map((c) =>
          c.id === convId ? { ...c, last_message: msg, last_message_at: msg.created_at } : c,
        ),
      ),
    }));
  };

  const refetchConversation = (convId: string) =>
    api
      .conversation(convId)
      .then((c) => set((s) => ({ conversations: sortConvs(s.conversations.map((x) => (x.id === c.id ? c : x))) })))
      .catch(() => {});

  // Recompute badges from the conversation list. Conversations whose latest message is newer than the
  // saved marker get an exact count from their recent history (bounded to 15 requests).
  const syncUnread = async () => {
    const me = get().me;
    if (!me) return;
    const active = get().activeConversationId;
    const next: Record<string, number> = {};
    const todo: Conversation[] = [];
    let baselined = false;
    for (const c of get().conversations) {
      const lm = c.last_message;
      if (!lm) {
        next[c.id] = 0;
      } else if (!lastRead[c.id]) {
        lastRead[c.id] = lm.id; // first time seen: start tracking from here
        baselined = true;
        next[c.id] = 0;
      } else if (c.id === active || lm.sender?.id === me.id || cmpId(lm.id, lastRead[c.id]) <= 0) {
        next[c.id] = 0;
      } else {
        next[c.id] = Math.max(1, get().unread[c.id] ?? 0);
        todo.push(c);
      }
    }
    if (baselined) saveLastRead();
    set({ unread: next });
    for (const c of todo.slice(0, 15)) {
      try {
        const page = await api.messages(c.id, 50);
        const mark = lastRead[c.id];
        const n = (page.messages ?? []).filter((m) => m.sender.id !== me.id && cmpId(m.id, mark) > 0).length;
        set((st) => ({ unread: { ...st.unread, [c.id]: get().activeConversationId === c.id ? 0 : Math.max(1, n) } }));
      } catch {}
    }
  };

  // Merge the latest HTTP page with what we already hold (live events may have landed meanwhile).
  const mergeLatest = (id: string, page: Message[], hasMore: boolean) =>
    patchChat(id, (c) => {
      const server = c.items.filter((m) => !isLocal(m.id));
      const pending = c.items.filter((m) => isLocal(m.id));
      const pageFirst = page[0]?.id;
      const pageLast = page[page.length - 1]?.id;
      const newestKnown = server[server.length - 1]?.id;

      let older: Message[] = [];
      let newer: Message[] = [];
      let hasMoreBefore = hasMore;
      if (pageFirst) {
        // If more history exists than the page covers and our newest known message is older than
        // the page, there is a gap (we were away a long time): drop the stale cache.
        const gap = hasMore && !!newestKnown && cmpId(pageFirst, newestKnown) > 0;
        if (!gap) {
          older = server.filter((m) => cmpId(m.id, pageFirst) < 0);
          newer = server.filter((m) => cmpId(m.id, pageLast) > 0);
          if (older.length) hasMoreBefore = c.hasMoreBefore;
        }
      }
      // An 'unconfirmed' local message that now appears on the server is that message.
      const stillPending = pending.filter(
        (p) =>
          p.status !== 'unconfirmed' ||
          !page.some(
            (m) =>
              m.sender.id === p.sender.id &&
              m.content === p.content &&
              Date.parse(m.created_at) >= Date.parse(p.created_at) - 60_000,
          ),
      );
      return {
        ...c,
        items: [...older, ...page, ...newer, ...stillPending],
        hasMoreBefore,
        loaded: true,
        error: undefined,
      };
    });

  const startSocket = () => {
    socket?.stop();
    socket = new Socket({
      onEvent: (t, p) => get().handleEvent(t, p),
      onStatus: (connection) => set({ connection }),
      onHello: (reconnect, payload) => {
        if (payload && typeof payload === 'object' && 'presences' in payload) {
          if (__DEV__) console.log('[ws] hello presences:', JSON.stringify(payload.presences)?.slice(0, 400));
          try {
            set({ presence: parsePresenceMap(payload.presences), presenceKnown: true });
          } catch (e) {
            if (__DEV__) console.warn('[ws] could not parse hello presences', e);
          }
        }
        if (!reconnect) return;
        // No replay on reconnect: re-sync the list and the open thread over HTTP.
        void (async () => {
          await get().refreshConversations();
          const active = get().activeConversationId;
          set((s) => ({ chats: active && s.chats[active] ? { [active]: s.chats[active] } : {} }));
          if (active) await get().loadLatest(active);
        })();
      },
    });
    socket.start();
  };

  return {
    booting: true,
    me: null,
    servers: [],
    conversations: [],
    chats: {},
    activeConversationId: null,
    connection: 'offline',
    notice: null,
    unread: {},
    newMarker: {},
    presence: {},
    presenceKnown: false,

    setNotice: (notice) => set({ notice }),

    boot: async () => {
      setSessionExpiredHandler(() => get().expire());
      await loadJar();
      if (hasSession()) {
        try {
          const me = await api.me();
          const [servers, conversations] = await Promise.all([api.servers(), api.conversations()]);
          await loadLastRead();
          set({ me, servers, conversations: sortConvs(conversations) });
          startSocket();
          void syncUnread();
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) await clearJar();
        }
      }
      set({ booting: false });
    },

    login: async (email, password) => {
      const r = await api.login(email, password);
      if (r?.mfa_required) {
        mfaToken = r.mfa_token;
        return 'mfa';
      }
      await finishLogin();
      return 'ok';
    },

    loginMfa: async (code, backup) => {
      if (!mfaToken) throw new ApiError(400, 'Sign in again to get a new code prompt.');
      await api.loginMfa(mfaToken, code, backup);
      mfaToken = null;
      await finishLogin();
    },

    logout: async () => {
      try {
        await api.logout();
      } catch {}
      get().expire();
    },

    expire: () => {
      socket?.stop();
      socket = null;
      Object.values(ackTimers).forEach(clearTimeout);
      void clearJar();
      lastRead = {};
      liveSeen = {};
      set({ me: null, servers: [], conversations: [], chats: {}, activeConversationId: null, connection: 'offline', notice: null, unread: {}, newMarker: {}, presence: {}, presenceKnown: false });
    },

    refreshConversations: async () => {
      try {
        const list = await api.conversations();
        set({ conversations: sortConvs(list) });
        void syncUnread();
      } catch {}
    },

    openConversation: async (id) => {
      const markAtOpen = lastRead[id]; // captured first: messages that arrive while loading still count as new
      set((st) => ({ activeConversationId: id, unread: { ...st.unread, [id]: 0 } }));
      await get().loadLatest(id);
      const me = get().me;
      const items = (get().chats[id]?.items ?? []).filter((m) => !isLocal(m.id));
      if (me && markAtOpen && !get().newMarker[id]) {
        const fresh = items.filter((m) => m.sender.id !== me.id && cmpId(m.id, markAtOpen) > 0);
        if (fresh.length) set((st) => ({ newMarker: { ...st.newMarker, [id]: { id: fresh[0].id, count: fresh.length } } }));
      }
      const newest = items[items.length - 1];
      if (newest) markRead(id, newest.id);
    },

    closeConversation: (id) => {
      if (get().activeConversationId === id) set({ activeConversationId: null });
      const newest = (get().chats[id]?.items ?? []).filter((m) => !isLocal(m.id)).pop();
      if (newest) markRead(id, newest.id);
      set((st) => {
        const { [id]: _gone, ...rest } = st.newMarker;
        return { newMarker: rest };
      });
    },

    loadLatest: async (id) => {
      try {
        const p = await api.messages(id, 50);
        mergeLatest(id, (p.messages ?? []).map((m) => norm(m, id)), !!(p.has_more_before ?? p.has_more));
      } catch (e) {
        patchChat(id, (c) => ({ ...c, loaded: true, error: e instanceof ApiError ? e.message : 'Could not load messages.' }));
      }
    },

    loadOlder: async (id) => {
      const c = get().chats[id];
      if (!c || c.loadingOlder || !c.hasMoreBefore) return;
      const oldest = c.items.find((m) => !isLocal(m.id));
      if (!oldest) return;
      patchChat(id, (x) => ({ ...x, loadingOlder: true }));
      try {
        const p = await api.messages(id, 50, oldest.id);
        const older = (p.messages ?? []).map((m) => norm(m, id));
        patchChat(id, (x) => {
          const have = new Set(x.items.map((m) => m.id));
          return {
            ...x,
            loadingOlder: false,
            hasMoreBefore: !!(p.has_more_before ?? p.has_more),
            items: [...older.filter((m) => !have.has(m.id)), ...x.items],
          };
        });
      } catch {
        patchChat(id, (x) => ({ ...x, loadingOlder: false }));
      }
    },

    send: (convId, content, reply) => {
      const me = get().me;
      if (!me) return;
      const nonce = uid();
      const local: Message = {
        id: `local:${nonce}`,
        conversation_id: convId,
        content,
        type: 'text',
        is_deleted: false,
        created_at: new Date().toISOString(),
        sender: me,
        reactions: [],
        reply_to: reply ?? null,
        nonce,
        status: 'sending',
      };
      patchChat(convId, (c) => ({ ...c, items: [...c.items, local] }));
      const ok = socket?.send('send_message', {
        conversation_id: convId,
        content,
        nonce,
        ...(reply ? { reply_to_message_id: reply.id } : {}),
      });
      if (!ok) {
        // Never left the device, so a retry cannot duplicate.
        mapItems(convId, (m) =>
          m.nonce === nonce ? { ...m, status: 'failed', error: 'Not connected. Check your connection and retry.' } : m,
        );
        return;
      }
      // A missing ack doesn't prove the message wasn't persisted.
      ackTimers[nonce] = setTimeout(() => {
        delete ackTimers[nonce];
        mapItems(convId, (m) =>
          m.nonce === nonce && m.status === 'sending'
            ? { ...m, status: 'unconfirmed', error: 'No confirmation from the server. It may or may not have been sent.' }
            : m,
        );
      }, 15_000);
    },

    retryMessage: (convId, localId) => {
      const m = get().chats[convId]?.items.find((x) => x.id === localId);
      if (!m) return;
      get().discardMessage(convId, localId);
      get().send(convId, m.content, m.reply_to ?? undefined);
    },

    discardMessage: (convId, localId) =>
      patchChat(convId, (c) => ({ ...c, items: c.items.filter((m) => m.id !== localId) })),

    edit: async (convId, msgId, content) => {
      const updated = await api.editMessage(convId, msgId, content);
      const edited_at = updated?.edited_at ?? new Date().toISOString();
      const text = updated?.content ?? content;
      mapItems(convId, (m) => (m.id === msgId ? { ...m, content: text, edited_at } : m));
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.last_message?.id === msgId ? { ...c, last_message: { ...c.last_message, content: text } } : c,
        ),
      }));
    },

    remove: async (convId, msgId) => {
      await api.deleteMessage(convId, msgId);
      mapItems(convId, (m) => (m.id === msgId ? { ...m, is_deleted: true, content: '', reactions: [] } : m));
      if (get().conversations.find((c) => c.id === convId)?.last_message?.id === msgId) void refetchConversation(convId);
    },

    toggleReaction: async (convId, msg, emoji) => {
      const me = get().me;
      if (!me || isLocal(msg.id)) return;
      const existing = msg.reactions.find((r) => r.emoji === emoji);
      const adding = !existing?.me;
      const apply = (count: number, mine: boolean) =>
        mapItems(convId, (m) =>
          m.id === msg.id ? { ...m, reactions: applyReaction(m.reactions, emoji, count, me.id, me.id, mine) } : m,
        );
      // Optimistic; the socket event then sets the absolute count (idempotent).
      apply(Math.max(0, (existing?.count ?? 0) + (adding ? 1 : -1)), adding);
      try {
        if (adding) await api.addReaction(convId, msg.id, emoji);
        else await api.removeReaction(convId, msg.id, emoji);
      } catch {
        apply(existing?.count ?? 0, existing?.me ?? false);
      }
    },

    handleEvent: (type, p) => {
      const me = get().me;
      if (!me) return;
      switch (type) {
        case 'new_message': {
          const convId: string = p.conversation_id;
          const msg = norm(p as Message, convId);
          const known = !!get().chats[convId]?.items.some((m) => m.id === msg.id);
          if (get().chats[convId]) {
            patchChat(convId, (c) => {
              if (c.items.some((m) => m.id === msg.id)) return c;
              // Echo from another of my sockets carries my nonce: replace the local copy.
              const idx = msg.nonce ? c.items.findIndex((m) => isLocal(m.id) && m.nonce === msg.nonce) : -1;
              if (idx >= 0) {
                const items = [...c.items];
                items[idx] = msg;
                return { ...c, items };
              }
              return { ...c, items: [...c.items, msg] };
            });
          }
          touchConversation(convId, msg);
          if (!known) {
            if (msg.sender?.id === me.id) {
              markRead(convId, msg.id); // sent from another device: everything before it has been seen
              set((st) => ({ unread: { ...st.unread, [convId]: 0 } }));
            } else if (get().activeConversationId === convId) {
              markRead(convId, msg.id);
            } else if (cmpId(msg.id, maxId(liveSeen[convId], lastRead[convId]) ?? '0') > 0) {
              liveSeen[convId] = msg.id; // ids only grow, so a replayed event can't be counted twice
              set((st) => ({ unread: { ...st.unread, [convId]: (st.unread[convId] ?? 0) + 1 } }));
            }
          }
          break;
        }
        case 'message_ack': {
          const { nonce, message_id, status, error } = p;
          if (ackTimers[nonce]) {
            clearTimeout(ackTimers[nonce]);
            delete ackTimers[nonce];
          }
          for (const [convId, c] of Object.entries(get().chats)) {
            const local = c.items.find((m) => isLocal(m.id) && m.nonce === nonce);
            if (!local) continue;
            if (status === 'sent') {
              patchChat(convId, (ch) =>
                ch.items.some((m) => m.id === message_id)
                  ? { ...ch, items: ch.items.filter((m) => m.id !== local.id) }
                  : {
                      ...ch,
                      items: ch.items.map((m) =>
                        m.id === local.id ? { ...m, id: message_id, status: undefined, error: undefined } : m,
                      ),
                    },
              );
              touchConversation(convId, { ...local, id: message_id, status: undefined });
              markRead(convId, message_id);
            } else {
              patchChat(convId, (ch) => ({
                ...ch,
                items: ch.items.map((m) =>
                  m.id === local.id ? { ...m, status: 'failed', error: sendError(status, error) } : m,
                ),
              }));
            }
          }
          break;
        }
        case 'message_edited':
          mapItems(p.conversation_id, (m) =>
            m.id === p.message_id ? { ...m, content: p.content, edited_at: p.edited_at } : m,
          );
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.last_message && c.last_message.id === p.message_id
                ? { ...c, last_message: { ...c.last_message, content: p.content } }
                : c,
            ),
          }));
          break;
        case 'message_deleted':
          mapItems(p.conversation_id, (m) =>
            m.id === p.message_id ? { ...m, is_deleted: true, content: '', reactions: [] } : m,
          );
          if (get().conversations.find((c) => c.id === p.conversation_id)?.last_message?.id === p.message_id) {
            void refetchConversation(p.conversation_id); // the preview should fall back to the previous message
          }
          break;
        case 'message_reaction_added':
        case 'message_reaction_removed': {
          const added = type === 'message_reaction_added';
          mapItems(p.conversation_id, (m) =>
            m.id === p.message_id
              ? { ...m, reactions: applyReaction(m.reactions, p.emoji, p.count, p.user_id, me.id, added) }
              : m,
          );
          break;
        }
        case 'conversation_created': {
          const conv: Conversation = p.conversation ?? p;
          if (conv?.id) {
            set((s) => (s.conversations.some((c) => c.id === conv.id) ? s : { conversations: sortConvs([...s.conversations, conv]) }));
          }
          break;
        }
        case 'conversation_hidden':
          set((s) => ({ conversations: s.conversations.filter((c) => c.id !== p.conversation_id) }));
          break;
        case 'conversation_updated':
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === p.conversation_id
                ? { ...c, ...(p.name !== undefined ? { name: p.name } : {}), ...(p.icon_url !== undefined ? { icon_url: p.icon_url } : {}) }
                : c,
            ),
          }));
          break;
        case 'user_update': {
          const patch: Partial<User> = {};
          for (const k of ['username', 'display_name', 'avatar_url'] as const) if (k in p) (patch as any)[k] = p[k];
          const replyPatch: Record<string, unknown> = {};
          if ('username' in p) replyPatch.sender_username = p.username;
          if ('display_name' in p) replyPatch.sender_display_name = p.display_name;
          if ('avatar_url' in p) replyPatch.sender_avatar_url = p.avatar_url;
          set((s) => ({
            me: s.me && s.me.id === p.user_id ? { ...s.me, ...patch } : s.me,
            conversations: s.conversations.map((c) => ({
              ...c,
              members: c.members.map((m) => (m.user.id === p.user_id ? { ...m, user: { ...m.user, ...patch } } : m)),
            })),
            // names and avatars are shown on every message, so patch the loaded history too
            chats: Object.fromEntries(
              Object.entries(s.chats).map(([id, c]) => [
                id,
                {
                  ...c,
                  items: c.items.map((m) => {
                    let n = m;
                    if (m.sender.id === p.user_id) n = { ...n, sender: { ...m.sender, ...patch } };
                    if (m.reply_to && m.reply_to.sender_id === p.user_id) n = { ...n, reply_to: { ...m.reply_to, ...replyPatch } };
                    return n;
                  }),
                },
              ]),
            ),
          }));
          break;
        }
        case 'group_member_added':
        case 'group_member_removed': {
          if (type === 'group_member_removed' && p.user_id === me.id) {
            set((s) => ({ conversations: s.conversations.filter((c) => c.id !== p.conversation_id) }));
          } else if (Array.isArray(p.members)) {
            const members = p.members.map((m: any) => (m?.user ? m : { user: m }));
            set((s) => ({ conversations: s.conversations.map((c) => (c.id === p.conversation_id ? { ...c, members } : c)) }));
          }
          break;
        }
        case 'error':
          // Protocol/operation errors carry no nonce, so surface them rather than guess which send failed.
          set({ notice: p?.message || p?.code || 'Something went wrong.' });
          break;
        default:
          // Presence events are not documented; accept any event type containing "presence".
          if (__DEV__ && !loggedEventTypes.has(type)) {
            // Dev console only: first sample of each event type this app doesn't handle (helps map undocumented events).
            loggedEventTypes.add(type);
            console.log('[ws] unhandled event:', type, JSON.stringify(p)?.slice(0, 300));
          }
          if (/presence/i.test(type)) {
            try {
              const upd = parsePresenceEvent(p);
              if (Object.keys(upd).length) set((st) => ({ presence: { ...st.presence, ...upd }, presenceKnown: true }));
              else if (__DEV__) console.warn('[ws] presence event not understood:', type, JSON.stringify(p)?.slice(0, 300));
            } catch (e) {
              if (__DEV__) console.warn('[ws] presence handler error', e);
            }
          }
          break; // typing, read state, calls, channels... are out of scope
      }
    },
  };

  async function finishLogin() {
    const me = await api.me();
    const [servers, conversations] = await Promise.all([api.servers(), api.conversations()]);
    await loadLastRead();
    set({ me, servers, conversations: sortConvs(conversations) });
    startSocket();
    void syncUnread();
  }
});
