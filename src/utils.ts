import { ApiError } from './api/client';
import { HTTP_ORIGIN } from './config';
import { Conversation, Message, PresenceStatus, Reaction, ReplyTo, User } from './types';

export const isLocal = (id: string) => id.startsWith('local:');

// IDs are decimal strings (snowflake-like); compare numerically without BigInt.
export function cmpId(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export const userName = (u?: User | null) => (u ? u.display_name?.trim() || u.username : 'Unknown');

export function resolveUrl(u?: string | null): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return HTTP_ORIGIN + (u.startsWith('/') ? '' : '/') + u;
}

export function otherUser(conv: Conversation, meId: string): User | undefined {
  return conv.members.find((m) => m.user.id !== meId)?.user ?? conv.members[0]?.user;
}

export function convTitle(conv: Conversation, meId: string): string {
  if (conv.type === 'dm') return userName(otherUser(conv, meId));
  return (
    conv.name ||
    conv.members.filter((m) => m.user.id !== meId).map((m) => userName(m.user)).join(', ') ||
    'Group'
  );
}

export function convAvatar(conv: Conversation, meId: string): string | null | undefined {
  return conv.type === 'dm' ? otherUser(conv, meId)?.avatar_url : conv.icon_url;
}

// Figma list rows: "You: <text>" for your own last message, plain text for theirs.
// (Groups, which the design doesn't cover, prefix the sender's name.)
export function previewText(conv: Conversation, meId: string): string {
  const m = conv.last_message;
  if (!m) return 'No messages yet';
  let text: string;
  if (m.is_deleted) text = 'Message deleted';
  else if (m.type !== 'text') text = 'Unsupported message';
  else text = m.content.replace(/\s+/g, ' ');
  if (m.sender?.id === meId) return `You: ${text}`;
  if (conv.type === 'dm') return text;
  const sender = conv.members.find((x) => x.user.id === m.sender?.id)?.user ?? m.sender;
  return `${userName(sender)}: ${text}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
}

export function formatTime(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Conversation list time, as in the design: "9:41" today, "Yesterday", weekday, then a short date.
export function formatListTime(iso?: string | null): string {
  if (!iso) return '';
  const diff = dayDiff(iso);
  if (diff <= 0) return formatTime(iso).replace(/\s?[AP]M$/i, '');
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return new Date(iso).toLocaleDateString([], { weekday: 'long' });
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function toReply(m: Message): ReplyTo {
  return {
    id: m.id,
    content: m.content,
    sender_id: m.sender.id,
    sender_username: m.sender.username,
    sender_display_name: m.sender.display_name,
  };
}

// Reaction events carry an absolute `count` and the actor, but never the viewer's `me` flag.
export function applyReaction(
  list: Reaction[],
  emoji: string,
  count: number,
  actorId: string,
  meId: string,
  added: boolean,
): Reaction[] {
  const existing = list.find((r) => r.emoji === emoji);
  if (count <= 0) return list.filter((r) => r.emoji !== emoji);
  const me = actorId === meId ? added : existing?.me ?? false;
  if (existing) return list.map((r) => (r.emoji === emoji ? { ...r, count, me } : r));
  return [...list, { emoji, count, me }];
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Could not reach the server. Check your connection and try again.';
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayDiff = (iso: string) => Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
export const sameDay = (a: string, b: string) => startOfDay(new Date(a)) === startOfDay(new Date(b));

// "Today, October 22" / "Yesterday, October 21" / "October 4" (with the year when it isn't this year).
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const diff = dayDiff(iso);
  const date = d.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}),
  });
  if (diff === 0) return `Today, ${date}`;
  if (diff === 1) return `Yesterday, ${date}`;
  return date;
}

export interface Row {
  msg: Message;
  day?: string; // date divider shown above this message
}

/** Oldest -> newest rows, marking where a new day starts. The design shows a header on every message. */
export function buildRows(items: Message[]): Row[] {
  return items.map((m, i) => {
    const prev = items[i - 1];
    const newDay = !!prev && !sameDay(prev.created_at, m.created_at);
    return { msg: m, day: i === 0 || newDay ? dayLabel(m.created_at) : undefined };
  });
}

/**
 * Presence payloads are not documented (WEBSOCKET.md only says `hello` carries a `presences` map and that
 * presence events exist), so parsing is deliberately tolerant. Accepts a status string, an object with
 * status/state/presence, or a boolean. The design has three states: online, do-not-disturb and offline
 * (invisible); idle/away are shown as online.
 */
export function normalizePresence(v: unknown): PresenceStatus | undefined {
  if (v === true) return 'online';
  if (v === false || v === null) return 'invisible';
  if (typeof v === 'string') {
    const s = v.toLowerCase().replace(/[\s-]/g, '_');
    if (['online', 'idle', 'away', 'active'].includes(s)) return 'online';
    if (['dnd', 'do_not_disturb', 'busy'].includes(s)) return 'dnd';
    if (['offline', 'invisible', ''].includes(s)) return 'invisible';
    return undefined;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return normalizePresence(o.status ?? o.state ?? o.presence ?? o.online);
  }
  return undefined;
}

/** Accepts `{ [userId]: status }`, or `[{ user_id, status }]`. */
export function parsePresenceMap(raw: unknown): Record<string, PresenceStatus> {
  const out: Record<string, PresenceStatus> = {};
  const put = (id: unknown, v: unknown) => {
    const st = normalizePresence(v);
    if ((typeof id === 'string' || typeof id === 'number') && st) out[String(id)] = st;
  };
  if (Array.isArray(raw)) {
    for (const e of raw) put((e as any)?.user_id ?? (e as any)?.userId ?? (e as any)?.user?.id ?? (e as any)?.id, e);
  } else if (raw && typeof raw === 'object') {
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) put(id, v);
  }
  return out;
}

/** A single presence event: `{ user_id, status }` or a wrapped map. */
export function parsePresenceEvent(p: any): Record<string, PresenceStatus> {
  if (!p || typeof p !== 'object') return {};
  if (p.presences) return parsePresenceMap(p.presences);
  const id = p.user_id ?? p.userId ?? p.user?.id ?? p.id;
  return id === undefined ? {} : parsePresenceMap({ [String(id)]: p });
}
