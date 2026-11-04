<template>
  <section class="embed" :class="{ compact: true }">
    <p class="kicker">Wispstat</p>
    <h1>{{ title }}</h1>
    <p v-if="error" class="error">{{ error }}</p>
    <div v-else-if="summary" class="metrics">
      <div>
        <span class="label">Visitors</span>
        <strong>{{ format(summary.visitors) }}</strong>
      </div>
      <div>
        <span class="label">Pageviews</span>
        <strong>{{ format(summary.pv) }}</strong>
      </div>
      <div>
        <span class="label">Revenue</span>
        <strong>{{ money(summary.revenue) }}</strong>
      </div>
    </div>
    <p v-else class="muted">Loading…</p>
    <p class="range mono" v-if="range">{{ range.from }} → {{ range.to }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const error = ref('');
const title = ref('Site');
const range = ref<{ from: string; to: string } | null>(null);
const summary = ref<{ visitors: number; pv: number; revenue: number } | null>(null);

const currency = ref('USD');

function format(n: number) {
  return new Intl.NumberFormat().format(n);
}

function money(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.value }).format(value);
}

onMounted(async () => {
  const key = typeof route.query.key === 'string' ? route.query.key : '';
  if (!key) {
    error.value = 'Missing read key. Open the share link from site Settings.';
    return;
  }
  const response = await fetch(`/api/v1/sites/${route.params.siteId}/summary`, {
    headers: { 'x-ws-key': key },
  });
  const body = await response.json();
  if (!response.ok) {
    error.value = body.error?.message || 'Could not load embed';
    return;
  }
  summary.value = body.data;
  range.value = { from: body.from, to: body.to };
  currency.value = body.currency || 'USD';
  title.value = body.site?.slug || body.site?.site_id || 'Site';
});
</script>

<style scoped>
.embed {
  margin: 0;
  min-height: 100vh;
  padding: 1.25rem 1.35rem;
  background: var(--app-bg);
}

.kicker {
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--app-accent);
}

h1 {
  margin: 0 0 1rem;
  font-size: 1.15rem;
  color: var(--app-text-muted);
  font-weight: 500;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.metrics > div {
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  padding: 0.85rem 0.9rem;
}

.label {
  display: block;
  color: var(--app-text-muted);
  font-size: 0.75rem;
  margin-bottom: 0.25rem;
}

strong {
  font-family: var(--app-font-display);
  font-size: 1.35rem;
  letter-spacing: -0.02em;
}

.range {
  margin: 0.85rem 0 0;
  color: var(--app-text-muted);
  font-size: 0.75rem;
}

.muted {
  color: var(--app-text-muted);
}

@media (max-width: 520px) {
  .metrics {
    grid-template-columns: 1fr;
  }
}
</style>
