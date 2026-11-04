import { ref } from 'vue';

/** Instance has been claimed (public /config). */
export const claimed = ref(false);

/** Browser has a valid operator session cookie. */
export const authed = ref(false);

export async function loadConfig(): Promise<{ claimed: boolean; auth_providers: string[] }> {
  const data = await fetch('/config').then((response) => response.json());
  claimed.value = !!data.claimed;
  return data;
}

/** Probe a cookie-auth endpoint; updates `authed`. */
export async function refreshAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/v1/budget', { credentials: 'same-origin' });
    authed.value = response.ok;
  } catch {
    authed.value = false;
  }
  return authed.value;
}

export function setAuthed(value: boolean): void {
  authed.value = value;
}
