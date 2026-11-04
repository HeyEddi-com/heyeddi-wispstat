import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function useRange() {
  const route = useRoute();
  const router = useRouter();
  const to = computed(() => (typeof route.query.to === 'string' ? route.query.to : iso(new Date())));
  const from = computed(() => {
    if (typeof route.query.from === 'string') return route.query.from;
    const end = new Date(`${to.value}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 6);
    return iso(end);
  });
  const qs = computed(() => `from=${from.value}&to=${to.value}`);

  function setRange(nextFrom: string, nextTo: string) {
    router.replace({ query: { ...route.query, from: nextFrom, to: nextTo } });
  }

  return { from, to, qs, setRange };
}
