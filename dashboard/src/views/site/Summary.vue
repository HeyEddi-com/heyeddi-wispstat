<template>
  <div>
    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="summary" class="grid">
      <article class="card"><h2>Visitors</h2><p>{{ summary.visitors }}</p></article>
      <article class="card"><h2>Pageviews</h2><p>{{ summary.pv }}</p></article>
      <article class="card"><h2>Events</h2><p>{{ summary.events }}</p></article>
      <article class="card"><h2>Revenue</h2><p>{{ summary.revenue }}</p></article>
    </div>
    <div class="card">
      <h2>Pageviews</h2>
      <Chart :values="series" label="Pageviews" />
    </div>
    <div class="grid">
      <Breakdown title="Top pages" dim="path" />
      <section class="card">
        <h2>Sources</h2>
        <ul>
          <li v-for="row in sourceRows" :key="row.channel">{{ row.channel }} — {{ row.visitors }} visitors</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Chart from '../../components/Chart.vue';
import { ApiError, api } from '../../lib/api';
import { useRange } from '../../lib/range';
import Breakdown from './BreakdownList.vue';

const route = useRoute();
const { qs } = useRange();
const summary = ref<{ visitors: number; pv: number; events: number; revenue: number } | null>(null);
const series = ref<number[]>([]);
const sourceRows = ref<Array<{ channel: string; visitors: number }>>([]);
const error = ref('');

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
    sourceRows.value = sources.data;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load this site';
  }
}

onMounted(load);
watch(qs, load);
</script>
