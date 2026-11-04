<template>
  <div class="visits">
    <div class="toolbar hero">
      <div>
        <p class="kicker">Same-day journeys</p>
        <h1>Visits</h1>
        <p class="lede">Timelines from raw hits — no replay. Filters use approximate 30‑min sessions.</p>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <form class="card filters" @submit.prevent="reload">
      <label>Day <input v-model="day" type="date" required /></label>
      <label>Visitor hash <input v-model="vh" placeholder="optional hex" class="mono" /></label>
      <label>Min duration (s) <input v-model.number="minDuration" type="number" min="0" placeholder="0" /></label>
      <label>Has event
        <select v-model="hasEvent">
          <option value="">Any</option>
          <option value="form_submit">form_submit</option>
          <option value="outbound">outbound</option>
          <option value="file_download">file_download</option>
        </select>
      </label>
      <label>Missing event
        <select v-model="missingEvent">
          <option value="">Any</option>
          <option value="form_submit">form_submit</option>
          <option value="outbound">outbound</option>
          <option value="file_download">file_download</option>
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>

    <section v-if="typical.length" class="card">
      <h2>Typical paths (filtered set)</h2>
      <ul class="paths">
        <li v-for="row in typical" :key="row.path">
          <span class="mono">{{ row.path }}</span>
          <span class="muted">{{ row.visits }}</span>
        </li>
      </ul>
    </section>

    <p v-if="!loading && !rows.length && !error" class="empty">No visits for these filters (raw data is kept ~3 days).</p>

    <div class="layout">
      <ul class="card list">
        <li
          v-for="row in rows"
          :key="`${row.vh}-${row.session_index}`"
          :class="{ active: selected?.vh === row.vh && selected?.session_index === row.session_index }"
        >
          <button type="button" class="row" @click="open(row)">
            <span class="mono trunc">{{ short(row.vh) }}</span>
            <span class="meta">{{ row.duration_s }}s · {{ row.pv }} pv · {{ row.events }} ev</span>
            <span class="muted trunc">{{ row.entry_path }} → {{ row.exit_path }}</span>
            <span v-if="row.event_names.length" class="tags">{{ row.event_names.slice(0, 3).join(', ') }}</span>
          </button>
        </li>
      </ul>

      <section v-if="detail" class="card detail">
        <h2>Timeline</h2>
        <p class="mono small">{{ detail.vh }} · session {{ detail.session_index + 1 }}/{{ detail.session_count }}</p>
        <p v-if="detail.meta" class="muted">
          {{ detail.meta.channel }} · {{ detail.meta.source || '—' }} · {{ detail.meta.country || '—' }} · {{ detail.meta.device || '—' }}
        </p>
        <ol class="timeline">
          <li v-for="(item, i) in detail.timeline" :key="i">
            <span class="mono time">{{ formatTs(item.ts) }}</span>
            <span class="pill" :data-kind="item.kind">{{ item.kind === 'pv' ? 'page' : 'event' }}</span>
            <span class="mono">{{ item.kind === 'ev' ? item.name : item.path }}</span>
            <span v-if="item.kind === 'ev'" class="muted mono">{{ item.path }}</span>
          </li>
        </ol>
        <p v-if="!detail.timeline.length" class="empty">No events in this session.</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError, api } from '../../lib/api';
import { useRange } from '../../lib/range';

interface VisitRow {
  vh: string;
  session_index: number;
  start_ts: number;
  end_ts: number;
  duration_s: number;
  pv: number;
  events: number;
  entry_path: string;
  exit_path: string;
  event_names: string[];
}

interface Timeline {
  day: string;
  vh: string;
  session_index: number;
  session_count: number;
  timeline: Array<{ ts: number; kind: 'pv' | 'ev'; name: string | null; path: string }>;
  meta: { channel?: string; source?: string | null; country?: string | null; device?: string | null } | null;
}

const route = useRoute();
const { to } = useRange();
const day = ref(to.value);
const vh = ref('');
const minDuration = ref<number | undefined>(undefined);
const hasEvent = ref('');
const missingEvent = ref('');
const rows = ref<VisitRow[]>([]);
const typical = ref<Array<{ path: string; visits: number }>>([]);
const selected = ref<VisitRow | null>(null);
const detail = ref<Timeline | null>(null);
const error = ref('');
const loading = ref(false);

function short(hash: string) {
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString();
}

async function reload() {
  error.value = '';
  loading.value = true;
  detail.value = null;
  selected.value = null;
  try {
    const params = new URLSearchParams({ day: day.value });
    if (vh.value.trim()) params.set('vh', vh.value.trim());
    if (minDuration.value != null && minDuration.value > 0) params.set('min_duration', String(minDuration.value));
    if (hasEvent.value) params.set('has_event', hasEvent.value);
    if (missingEvent.value) params.set('missing_event', missingEvent.value);
    const body = await api<{
      data: VisitRow[];
      typical_paths: Array<{ path: string; visits: number }>;
    }>(`/api/v1/sites/${route.params.siteId}/visits?${params}`);
    rows.value = body.data;
    typical.value = body.typical_paths || [];
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load visits';
    rows.value = [];
    typical.value = [];
  } finally {
    loading.value = false;
  }
}

async function open(row: VisitRow) {
  selected.value = row;
  error.value = '';
  try {
    detail.value = await api<Timeline>(
      `/api/v1/sites/${route.params.siteId}/visits/${row.vh}?day=${encodeURIComponent(day.value)}&session=${row.session_index}`
    );
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load timeline';
    detail.value = null;
  }
}

onMounted(reload);
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
}

.lede {
  margin: 0.35rem 0 0;
  color: var(--app-text-muted);
  max-width: 40rem;
}

.filters {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  align-items: end;
}

.layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(16rem, 1fr) minmax(18rem, 1.2fr);
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 70vh;
  overflow: auto;
}

.list li {
  border-bottom: 1px solid var(--app-border);
}

.list li.active {
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
}

.row {
  display: grid;
  gap: 0.2rem;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0.75rem 0.5rem;
  cursor: pointer;
}

.meta {
  font-size: 0.85rem;
}

.muted {
  color: var(--app-text-muted);
  font-size: 0.85rem;
}

.trunc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tags {
  font-size: 0.75rem;
  color: var(--app-accent);
}

.paths {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.paths li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.timeline {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.timeline li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.65rem;
  align-items: baseline;
}

.time {
  font-size: 0.8rem;
  color: var(--app-text-muted);
  min-width: 4.5rem;
}

.pill {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border: 1px solid var(--app-border);
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
}

.pill[data-kind='ev'] {
  border-color: var(--app-accent);
  color: var(--app-accent);
}

.small {
  font-size: 0.8rem;
  word-break: break-all;
}

.empty {
  color: var(--app-text-muted);
}
</style>
