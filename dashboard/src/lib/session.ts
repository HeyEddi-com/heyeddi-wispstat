import { ref } from 'vue';

export const claimed = ref(false);

export async function loadConfig(): Promise<{ claimed: boolean; auth_providers: string[] }> {
  const data = await fetch('/config').then((response) => response.json());
  claimed.value = !!data.claimed;
  return data;
}
