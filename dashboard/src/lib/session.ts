import { ref } from 'vue';

/** Instance has been claimed (public /config). */
export const claimed = ref(false);

/** Browser has a valid operator session cookie. */
export const authed = ref(false);

/** True after the first refreshAuth() attempt this page load. */
export const authReady = ref(false);

export async function loadConfig(): Promise<{ claimed: boolean; auth_providers: string[] }> {
  const data = await fetch('/config', { credentials: 'same-origin', cache: 'no-store' }).then((response) =>
    response.json()
  );
  claimed.value = !!data.claimed;
  return data;
}

/** Probe a cookie-auth endpoint; updates `authed`. Never use a cached response. */
export async function refreshAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/v1/budget', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    authed.value = response.ok;
  } catch {
    authed.value = false;
  } finally {
    authReady.value = true;
  }
  return authed.value;
}

export function setAuthed(value: boolean): void {
  authed.value = value;
  authReady.value = true;
}
