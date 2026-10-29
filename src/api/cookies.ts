import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Minimal manual cookie jar.
 *
 * Why manual: the API needs the `__Host-csrf` cookie VALUE echoed in an `x-csrf-token` header, and
 * React Native's native cookie stores differ between iOS and Android and can't be read from JS
 * without a native module. We therefore make requests with credentials: 'omit', send our own
 * Cookie header, and parse Set-Cookie from responses (including error responses).
 */
const KEY = 'flackle.cookies.v1';
let jar: Record<string, string> = {};

export async function loadJar() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    jar = raw ? JSON.parse(raw) : {};
  } catch {
    jar = {};
  }
}

const persist = () => {
  AsyncStorage.setItem(KEY, JSON.stringify(jar)).catch(() => {});
};

export const hasSession = () => !!(jar['access_token'] || jar['refresh_token']);
export const getCookie = (name: string) => jar[name];
export const cookieHeader = () =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

export async function clearJar() {
  jar = {};
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

/**
 * RN merges multiple Set-Cookie headers into one comma-joined string. Split only on commas that
 * start a new `name=` pair, so `Expires=Wed, 21 Oct ...` stays intact.
 */
export function applySetCookie(header: string) {
  let changed = false;
  for (const raw of header.split(/,(?=\s*[^;,=\s]+=)/)) {
    const parts = raw.split(';').map((p) => p.trim());
    const eq = parts[0].indexOf('=');
    if (eq <= 0) continue;
    const name = parts[0].slice(0, eq);
    const value = parts[0].slice(eq + 1);

    let maxAge: number | null = null;
    let expiresAt: number | null = null;
    for (const attr of parts.slice(1)) {
      const [k, ...rest] = attr.split('=');
      const v = rest.join('=');
      const key = k.toLowerCase();
      if (key === 'max-age') {
        const n = parseInt(v, 10);
        if (!isNaN(n)) maxAge = n;
      } else if (key === 'expires') {
        const t = Date.parse(v);
        if (!isNaN(t)) expiresAt = t;
      }
    }
    const expired =
      value === '' || (maxAge !== null ? maxAge <= 0 : expiresAt !== null && expiresAt < Date.now());

    if (expired) {
      if (name in jar) {
        delete jar[name];
        changed = true;
      }
    } else if (jar[name] !== value) {
      jar[name] = value;
      changed = true;
    }
  }
  if (changed) persist();
}
