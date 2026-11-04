<template>
  <div class="overview">
    <div class="toolbar hero">
      <div>
        <p class="kicker">Signal desk</p>
        <h1>Overview</h1>
      </div>
      <router-link v-if="unauthorized" class="ghost" to="/login">Sign in</router-link>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="budget" class="card budget" aria-label="Cloudflare Free data budget today">
      <div class="budget-head">
        <strong>Data budget today</strong>
        <span class="hint">Cloudflare Free · resets ~00:00 UTC</span>
      </div>
      <div class="meters">
        <div class="meter">
          <div class="meter-top">
            <span>Writes</span>
            <span class="mono">{{ budget.writes_estimate.toLocaleString() }} / {{ budget.write_cap.toLocaleString() }}</span>
          </div>
          <div class="track" role="meter" :aria-valuenow="budget.writes_estimate" :aria-valuemax="budget.write_cap">
            <div class="fill" :style="{ width: pct(budget.writes_estimate, budget.write_cap) }" />
          </div>
        </div>
        <div class="meter">
          <div class="meter-top">
            <span>Requests</span>
            <span class="mono">{{ budget.requests_estimate.toLocaleString() }} / {{ budget.request_cap.toLocaleString() }}</span>
          </div>
          <div class="track" role="meter" :aria-valuenow="budget.requests_estimate" :aria-valuemax="budget.request_cap">
            <div class="fill" :style="{ width: pct(budget.requests_estimate, budget.request_cap) }" />
          </div>
        </div>
      </div>
      <p v-if="budget.shed" class="shed">Ingest is shedding load for about a minute.</p>
    </section>

    <div v-if="sites.length" class="grid">
      <article v-for="site in sites" :key="site.site_id" class="card site">
        <h2><router-link :to="`/sites/${site.site_id}`">{{ site.name }}</router-link></h2>
        <p class="stats">
          <span>{{ site.visitors.toLocaleString() }} visitors</span>
          <span>{{ site.pv.toLocaleString() }} pageviews</span>
          <span>{{ money(site.revenue, site.currency) }}</span>
        </p>
        <Chart :values="site.sparkline" :label="`${site.name} visitors`" />
      </article>
    </div>
    <p v-else-if="!unauthorized && !error" class="empty">No sites yet — add one below.</p>

    <form class="card add" @submit.prevent="addSite">
      <h2>Add a site</h2>
      <label>Name <input v-model="name" required /></label>
      <label>
        Domain
        <input v-model="domain" placeholder="example.com or app.example.com" required pattern="^[A-Za-z0-9.-]+$" />
      </label>
      <p class="field-hint">One root only. Includes that host and all subdomains under it. Put the matching snippet on those hosts.</p>
      <label>
        Timezone
        <select v-model="tz">
          <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
        </select>
      </label>
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
import { setAuthed } from '../lib/session';
import { timezoneOptions } from '../lib/timezones';

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
const domain = ref('');
const tz = ref(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
const zones = timezoneOptions(tz.value);
const snippet = ref('');

function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
}

function pct(value: number, cap: number) {
  if (cap <= 0) return '0%';
  return `${Math.min(100, (value / cap) * 100).toFixed(1)}%`;
}

async function load() {
  try {
    const [overview, usage] = await Promise.all([
      api<{ data: Card[] }>(`/api/v1/overview?${qs.value}`),
      api<Budget>('/api/v1/budget'),
    ]);
    sites.value = overview.data;
    budget.value = usage;
    setAuthed(true);
  } catch (err) {
    unauthorized.value = err instanceof ApiError && err.status === 401;
    if (unauthorized.value) setAuthed(false);
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
        domain: domain.value.trim(),
        tz: tz.value || 'UTC',
      }),
    });
    snippet.value = created.snippet;
    name.value = '';
    domain.value = '';
    await load();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not create site';
  }
}

onMounted(load);
</script>

<style scoped>
.kicker {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--app-accent);
}

.hero h1 {
  margin: 0;
  font-size: clamp(1.8rem, 3vw, 2.4rem);
}

.ghost {
  border: 1px solid var(--app-border);
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  color: var(--app-text);
}

.budget-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.hint {
  color: var(--app-text-muted);
  font-size: 0.85rem;
}

.meters {
  display: grid;
  gap: 1rem;
}

.meter-top {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.4rem;
  color: var(--app-text-muted);
  font-size: 0.9rem;
}

.track {
  height: 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-bg) 80%, black);
  border: 1px solid var(--app-border);
  overflow: hidden;
}

.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--app-accent-dim), var(--app-accent));
  border-radius: inherit;
  transition: width 400ms var(--app-ease);
}

.shed {
  margin: 0.85rem 0 0;
  color: var(--app-danger);
}

.site h2 {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}

.site h2 a {
  color: var(--app-text);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  margin: 0 0 0.85rem;
  color: var(--app-text-muted);
  font-size: 0.9rem;
}

.empty {
  color: var(--app-text-muted);
}

.add h2 {
  margin: 0 0 0.5rem;
}

.field-hint {
  margin: -0.35rem 0 0.75rem;
  color: var(--app-text-muted);
  font-size: 0.85rem;
}
</style>
