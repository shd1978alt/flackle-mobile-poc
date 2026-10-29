import { CSRF_COOKIE, HTTP_ORIGIN } from '../config';
import { Conversation, Message, Server, User } from '../types';
import { applySetCookie, clearJar, cookieHeader, getCookie } from './cookies';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

interface Opts {
  skipCsrf?: boolean; // login, login/mfa, refresh are exempt from the CSRF token check
  noRefresh?: boolean;
}
interface Raw {
  status: number;
  ok: boolean;
  data: any;
}

async function send(method: string, path: string, body: unknown, opts: Opts): Promise<Raw> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const cookie = cookieHeader();
  if (cookie) headers.Cookie = cookie;
  if (method !== 'GET' && !opts.skipCsrf) {
    const token = getCookie(CSRF_COOKIE);
    if (token) headers['x-csrf-token'] = token;
  }
  const res = await fetch(HTTP_ORIGIN + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'omit', // we manage cookies ourselves, see cookies.ts
  });
  // Cookies may be set, rotated or cleared on any response, including errors.
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) applySetCookie(setCookie);

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, ok: res.ok, data };
}

// Single-flight refresh: refresh tokens have reuse detection, so concurrent 401s must share one call.
let refreshing: Promise<'ok' | 'rejected' | 'error'> | null = null;
function refreshOnce() {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await send('POST', '/api/auth/refresh', undefined, { skipCsrf: true });
        if (r.ok) return 'ok' as const;
        if (r.status === 401 || r.status === 403) {
          // Only an explicit rejection means the session is dead; network errors and 5xx do not.
          await clearJar();
          onSessionExpired?.();
          return 'rejected' as const;
        }
        return 'error' as const;
      } catch {
        return 'error' as const;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function request(method: string, path: string, body?: unknown, opts: Opts = {}): Promise<any> {
  // Authenticated writes need the csrf cookie; a GET establishes it if missing.
  if (method !== 'GET' && !opts.skipCsrf && !getCookie(CSRF_COOKIE)) {
    try {
      await send('GET', '/api/auth/me', undefined, {});
    } catch {}
  }
  let r = await send(method, path, body, opts);
  // Throttled reads are safe to retry with backoff; throttled writes are surfaced to the caller.
  for (let i = 0; r.status === 429 && method === 'GET' && i < 2; i++) {
    await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
    r = await send(method, path, body, opts);
  }
  if (r.status === 401 && !opts.noRefresh) {
    if ((await refreshOnce()) === 'ok') r = await send(method, path, body, opts);
  }
  if (r.status === 403 && r.data?.code === 'csrf_invalid' && !opts.skipCsrf) {
    r = await send(method, path, body, opts); // replacement cookie was just stored
  }
  if (!r.ok) {
    const msg =
      (r.data && typeof r.data === 'object' && r.data.error) ||
      (r.status === 429 ? 'Too many requests. Please wait a moment and try again.' : `Request failed (${r.status})`);
    throw new ApiError(r.status, msg, r.data?.code);
  }
  return r.data;
}

const enc = encodeURIComponent;

export const api = {
  login: (email: string, password: string) =>
    request('POST', '/api/auth/login', { email, password }, { skipCsrf: true, noRefresh: true }),
  loginMfa: (mfa_token: string, code: string, backup: boolean) =>
    request(
      'POST',
      '/api/auth/login/mfa',
      backup ? { mfa_token, backup_code: code } : { mfa_token, code },
      { skipCsrf: true, noRefresh: true },
    ),
  logout: () => request('POST', '/api/auth/logout', undefined, { noRefresh: true }),
  me: async (): Promise<User> => {
    const d = await request('GET', '/api/auth/me');
    return d?.user ?? d;
  },
  servers: async (): Promise<Server[]> => {
    const d = await request('GET', '/api/servers');
    return Array.isArray(d) ? d : d?.servers ?? [];
  },
  conversations: async (): Promise<Conversation[]> => {
    const d = await request('GET', '/api/conversations');
    return Array.isArray(d) ? d : d?.conversations ?? [];
  },
  conversation: async (id: string): Promise<Conversation> => {
    const d = await request('GET', `/api/conversations/${id}`);
    return d?.conversation ?? d;
  },
  messages: (id: string, limit = 50, before?: string): Promise<{
    messages: Message[];
    has_more?: boolean;
    has_more_before?: boolean;
  }> =>
    request('GET', `/api/conversations/${id}/messages?limit=${limit}${before ? `&before=${before}` : ''}`),
  editMessage: (convId: string, msgId: string, content: string): Promise<Message> =>
    request('PATCH', `/api/conversations/${convId}/messages/${msgId}`, { content }),
  deleteMessage: (convId: string, msgId: string) =>
    request('DELETE', `/api/conversations/${convId}/messages/${msgId}`),
  addReaction: (convId: string, msgId: string, emoji: string) =>
    request('PUT', `/api/conversations/${convId}/messages/${msgId}/reactions/${enc(emoji)}`),
  removeReaction: (convId: string, msgId: string, emoji: string) =>
    request('DELETE', `/api/conversations/${convId}/messages/${msgId}/reactions/${enc(emoji)}`),
  wsUrl: (): Promise<{ url: string; ticket: string }> => request('GET', '/api/ws/url'),
};
