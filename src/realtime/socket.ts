import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import { api } from '../api/client';
import { WS_ORIGIN } from '../config';

export type ConnStatus = 'offline' | 'connecting' | 'online';

interface Callbacks {
  onEvent(type: string, payload: any): void;
  /** Called on every `hello`. `reconnect` is false only for the first connection of this Socket. */
  onHello(reconnect: boolean, payload: any): void;
  onStatus(status: ConnStatus): void;
}

const HEARTBEAT_MS = 20_000;
const PONG_TIMEOUT_MS = 10_000;

/**
 * One socket per signed-in session. There is no replay, so every (re)connect fetches a fresh
 * single-use ticket, and the owner re-syncs over HTTP on `onHello(true)`.
 */
export class Socket {
  private ws: WebSocket | null = null;
  private gen = 0; // bumped on every teardown so callbacks from stale sockets are ignored
  private stopped = true;
  private attempt = 0;
  private helloCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private hbTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private appSub: NativeEventSubscription | null = null;

  constructor(private cb: Callbacks) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.appSub = AppState.addEventListener('change', (s: AppStateStatus) => {
      // After backgrounding the old socket is often dead without any close event: replace it.
      if (s === 'active' && !this.stopped) this.connectNow();
    });
    this.connectNow();
  }

  stop() {
    this.stopped = true;
    this.appSub?.remove();
    this.appSub = null;
    this.teardown();
    this.cb.onStatus('offline');
  }

  send(type: string, payload: unknown): boolean {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(JSON.stringify({ type, payload }));
      return true;
    } catch {
      return false;
    }
  }

  private connectNow() {
    this.teardown();
    void this.open();
  }

  private teardown() {
    this.gen++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.hbTimer) clearInterval(this.hbTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.retryTimer = this.hbTimer = this.pongTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {}
    }
  }

  private scheduleRetry() {
    if (this.stopped || this.retryTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.attempt) + Math.random() * 500;
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connectNow();
    }, delay);
  }

  private async open() {
    const gen = this.gen;
    this.cb.onStatus('connecting');
    let info: { url: string; ticket: string };
    try {
      info = await api.wsUrl();
    } catch {
      if (gen === this.gen) {
        this.cb.onStatus('offline');
        this.scheduleRetry();
      }
      return;
    }
    if (gen !== this.gen) return; // superseded while fetching the ticket

    const url = `${info.url}${info.url.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(info.ticket)}`;
    // RN's third constructor argument carries native handshake headers. The server requires Origin.
    const ws = new (WebSocket as any)(url, undefined, { headers: { Origin: WS_ORIGIN } }) as WebSocket;
    this.ws = ws;

    ws.onmessage = (e: { data: any }) => {
      if (gen !== this.gen) return;
      let msg: { type: string; payload: any };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      try {
        if (msg.type === 'hello') {
          this.attempt = 0;
          this.helloCount++;
          this.cb.onStatus('online');
          this.startHeartbeat(gen);
          this.cb.onHello(this.helloCount > 1, msg.payload);
        } else if (msg.type === 'pong') {
          if (this.pongTimer) clearTimeout(this.pongTimer);
          this.pongTimer = null;
        } else {
          this.cb.onEvent(msg.type, msg.payload);
        }
      } catch (err) {
        // A bug in one handler must not break the socket; surface it in dev only.
        if (__DEV__) console.warn('[ws] handler error for', msg.type, err);
      }
    };
    ws.onclose = () => {
      if (gen !== this.gen) return;
      this.cb.onStatus('offline');
      this.teardown();
      this.scheduleRetry();
    };
    ws.onerror = () => {
      // a close event follows
    };
  }

  // Application-level ping detects half-open connections that the OS hasn't noticed yet.
  private startHeartbeat(gen: number) {
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = setInterval(() => {
      if (gen !== this.gen) return;
      if (!this.send('ping', {})) return this.connectNow();
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        if (gen === this.gen) this.connectNow();
      }, PONG_TIMEOUT_MS);
    }, HEARTBEAT_MS);
  }
}
