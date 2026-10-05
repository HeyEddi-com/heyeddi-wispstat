<template>
  <div>
    <div class="toolbar">
      <h1>Overview</h1>
      <router-link v-if="unauthorized" to="/login">Sign in</router-link>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <section v-if="budget" class="card budget">
      <strong>Data budget today</strong>
      <p>Writes {{ budget.writes_estimate }} / {{ budget.write_cap }} · Requests {{ budget.requests_estimate }} / {{ budget.request_cap }}</p>
      <p v-if="budget.shed">Ingest is shedding load for about a minute.</p>
    </section>
    <div class="grid">
      <article v-for="site in sites" :key="site.site_id" class="card">
        <h2><router-link :to="`/sites/${site.site_id}`">{{ site.name }}</router-link></h2>
        <p>{{ site.visitors }} visitors · {{ site.pv }} pageviews · {{ money(site.revenue, site.currency) }}</p>
        <Chart :values="site.sparkline" :label="`${site.name} visitors`" />
      </article>
    </div>
    <form class="card" @submit.prevent="addSite">
      <h2>Add a site</h2>
      <label>Name <input v-model="name" required /></label>
      <label>Domains <input v-model="domains" placeholder="example.com, www.example.com" required /></label>
      <label>Timezone <input v-model="tz" placeholder="UTC" /></label>
      <p v-if="snippet" class="ok">{{ snippet }}</p>
      <button type="submit">Create site</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Chart from '../components/Chart.vue';
import { ApiError, api } from '../lib/api';
import { useRange } from '../lib/range';

interface Card {
  site_id: string;
  name: string;
  currency: string;
  visitors: number;
  pv: number;
  revenue: number;
  sparkline: number[];
}
interface Budget {
  writes_estimate: number;
  write_cap: number;
  requests_estimate: number;
  request_cap: number;
  shed: boolean;
}

const { qs } = useRange();
const sites = ref<Card[]>([]);
const budget = ref<Budget | null>(null);
const error = ref('');
const unauthorized = ref(false);
const name = ref('');
const domains = ref('');
const tz = ref('UTC');
const snippet = ref('');

function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
}

async function load() {
  try {
    const [overview, usage] = await Promise.all([
      api<{ data: Card[] }>(`/api/v1/overview?${qs.value}`),
      api<Budget>('/api/v1/budget'),
    ]);
    sites.value = overview.data;
    budget.value = usage;
  } catch (err) {
    unauthorized.value = err instanceof ApiError && err.status === 401;
    error.value = err instanceof ApiError ? err.message : 'Could not load overview';
  }
}

async function addSite() {
  error.value = '';
  snippet.value = '';
  try {
    const created = await api<{ snippet: string }>('/api/v1/sites', {
      method: 'POST',
      body: JSON.stringify({
        name: name.value,
        domains: domains.value.split(',').map((domain) => domain.trim()).filter(Boolean),
        tz: tz.value || 'UTC',
      }),
    });
    snippet.value = created.snippet;
    name.value = '';
    domains.value = '';
    await load();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not create site';
  }
}

onMounted(load);
</script>
