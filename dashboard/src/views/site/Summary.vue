<template>
  <div class="summary">
    <p v-if="error" class="error">{{ error }}</p>

    <div class="toolbar hero">
      <div>
        <p class="kicker">Signal desk</p>
        <h1>Metrics</h1>
        <p class="lede">Range totals, journeys, and attention — jump into detail when something looks off.</p>
      </div>
      <div class="actions">
        <router-link class="ghost" :to="`/sites/${siteId}/visits`">Visits</router-link>
        <router-link class="ghost" :to="`/sites/${siteId}/heatmaps`">Heatmaps</router-link>
        <router-link class="ghost" :to="`/sites/${siteId}/live`">Live</router-link>
      </div>
    </div>

    <div v-if="summary" class="meters">
      <article class="card metric">
        <p class="label">Visitors</p>
        <p class="value">{{ summary.visitors.toLocaleString() }}</p>
        <p v-if="summary.delta?.visitors != null" class="delta" :data-sign="sign(summary.delta.visitors)">
          {{ fmtDelta(summary.delta.visitors) }} vs prior
        </p>
      </article>
      <article class="card metric">
        <p class="label">Pageviews</p>
        <p class="value">{{ summary.pv.toLocaleString() }}</p>
        <p v-if="summary.delta?.pv != null" class="delta" :data-sign="sign(summary.delta.pv)">
          {{ fmtDelta(summary.delta.pv) }} vs prior
        </p>
      </article>
      <article class="card metric">
        <p class="label">Events</p>
        <p class="value">{{ summary.events.toLocaleString() }}</p>
      </article>
      <article class="card metric">
        <p class="label">Conversions</p>
        <p class="value">{{ (summary.conversions ?? 0).toLocaleString() }}</p>
      </article>
      <article class="card metric">
        <p class="label">Revenue</p>
        <p class="value">{{ money(summary.revenue) }}</p>
      </article>
      <article
        v-if="summary.sessions"
        class="card metric"
        title="Approximate same-day sessions. Shared IPs merge visitors; sessions end at midnight site time."
      >
        <p class="label">Sessions <small>approx</small></p>
        <p class="value">{{ summary.sessions.sessions.toLocaleString() }}</p>
        <p class="muted">{{ summary.sessions.pages_per_visit ?? '—' }} ppv · bounce {{ bounce }}</p>
      </article>
    </div>

    <div class="card">
      <h2>Pageviews over range</h2>
      <Chart :values="series" label="Pageviews" />
    </div>

    <div class="grid two">
      <Breakdown title="Top pages" dim="path" />
      <section class="card">
        <h2>Top sources</h2>
        <ul class="sources">
          <li v-for="row in sourceRows" :key="row.channel">
            <span>{{ row.channel }}</span>
            <span class="muted">{{ row.visitors.toLocaleString() }} visitors</span>
          </li>
        </ul>
        <p v-if="!sourceRows.length" class="empty">No sources in this range.</p>
        <router-link class="text-link" :to="`/sites/${siteId}/sources`">Full sources →</router-link>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Chart from '../../components/Chart.vue';
import { ApiError, api } from '../../lib/api';
import { useRange } from '../../lib/range';
import Breakdown from './BreakdownList.vue';

const route = useRoute();
const siteId = computed(() => String(route.params.siteId));
const { qs } = useRange();
const summary = ref<{
  visitors: number;
  pv: number;
  events: number;
  conversions?: number;
  revenue: number;
  delta?: { visitors: number | null; pv: number | null };
  sessions: { sessions: number; pages_per_visit?: number; bounce_rate?: number } | null;
} | null>(null);
const series = ref<number[]>([]);
const sourceRows = ref<Array<{ channel: string; visitors: number }>>([]);
const error = ref('');

const bounce = computed(() => {
  const rate = summary.value?.sessions?.bounce_rate;
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
});

function money(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value || 0);
}

function sign(n: number | null) {
  if (n == null) return 'flat';
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'flat';
}

function fmtDelta(n: number | null) {
  if (n == null) return 'n/a';
  const pct = Math.round(n * 1000) / 10;
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

async function load() {
  const id = route.params.siteId;
  try {
    const [sum, times, sources] = await Promise.all([
      api<{ data: typeof summary.value }>(`/api/v1/sites/${id}/summary?${qs.value}`),
      api<{ data: Array<{ value: number }> }>(`/api/v1/sites/${id}/timeseries?metric=pv&grain=day&${qs.value}`),
      api<{ data: Array<{ channel: string; visitors: number }> }>(`/api/v1/sites/${id}/sources?level=channel&${qs.value}`),
    ]);
    summary.value = sum.data;
    series.value = times.data.map((point) => point.value);
    sourceRows.value = sources.data.slice(0, 8);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load this site';
  }
}

onMounted(load);
watch(qs, load);
</script>

<style scoped>
.kicker {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--app-accent);
}
.hero {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: end;
}
.hero h1 { margin: 0; }
.lede {
  margin: 0.35rem 0 0;
  color: var(--app-text-muted);
  max-width: 36rem;
}
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.ghost {
  border: 1px solid var(--app-border);
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  color: var(--app-text);
}
.meters {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
}
.metric .label {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.metric .value {
  margin: 0.35rem 0 0;
  font-size: 1.55rem;
  font-weight: 600;
}
.delta { margin: 0.25rem 0 0; font-size: 0.8rem; }
.delta[data-sign='up'] { color: var(--app-accent); }
.delta[data-sign='down'] { color: var(--app-danger); }
.muted { color: var(--app-text-muted); font-size: 0.85rem; margin: 0.25rem 0 0; }
.two {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}
.sources { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
.sources li { display: flex; justify-content: space-between; gap: 1rem; }
.text-link { display: inline-block; margin-top: 0.75rem; color: var(--app-accent); }
.empty { color: var(--app-text-muted); }
</style>
