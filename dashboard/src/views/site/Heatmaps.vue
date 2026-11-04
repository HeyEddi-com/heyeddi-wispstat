<template>
  <div class="heat">
    <div class="toolbar hero">
      <div>
        <p class="kicker">Attention map</p>
        <h1>Heatmaps</h1>
        <p class="lede">
          Aggregate viewport-grid clicks and scroll depth — no screenshots, no session replay.
          Cells are relative to the visitor’s viewport (12×12).
        </p>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <form class="card filters" @submit.prevent="reload">
      <label>Day <input v-model="day" type="date" required /></label>
      <label>
        Path
        <select v-model="path">
          <option value="">Top path automatically</option>
          <option v-for="row in paths" :key="row.path" :value="row.path">
            {{ row.path }} ({{ row.events }})
          </option>
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>

    <div class="layout">
      <section class="card map-card">
        <div class="map-head">
          <h2>{{ data?.path || '—' }}</h2>
          <span class="muted">{{ data?.source === 'raw' ? 'Live raw day' : 'Rolled up' }} · max {{ data?.max_clicks || 0 }}</span>
        </div>
        <div
          class="grid-map"
          role="img"
          :aria-label="`Click intensity grid for ${data?.path || 'path'}`"
          :style="{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }"
        >
          <div
            v-for="cell in matrix"
            :key="`${cell.gx}-${cell.gy}`"
            class="cell"
            :title="`${cell.clicks} clicks · (${cell.gx},${cell.gy})`"
            :style="{ opacity: cell.clicks ? 0.18 + 0.82 * (cell.clicks / (data?.max_clicks || 1)) : 0.04 }"
          />
        </div>
        <p v-if="data && !data.cells.length" class="empty">No click heat for this day/path yet. Interact on the live site with the tracker installed.</p>
      </section>

      <aside class="side">
        <section class="card">
          <h2>Scroll depth</h2>
          <ul class="scrolls">
            <li v-for="row in data?.scroll_depth || []" :key="row.depth">
              <span>{{ row.depth }}%</span>
              <div class="bar"><i :style="{ width: scrollPct(row.events) }" /></div>
              <span class="mono">{{ row.events }}</span>
            </li>
          </ul>
        </section>
        <section class="card">
          <h2>Hot paths</h2>
          <ul class="paths">
            <li v-for="row in paths" :key="row.path">
              <button type="button" class="linkish" @click="pickPath(row.path)">{{ row.path }}</button>
              <span class="muted">{{ row.events }}</span>
            </li>
          </ul>
          <p v-if="!paths.length" class="empty">No heat/scroll events yet.</p>
        </section>
        <section class="card metrics">
          <h2>How to read this</h2>
          <ul class="plain">
            <li>Brighter cells = more primary clicks in that viewport region.</li>
            <li>Not a pixel-perfect overlay of your CSS — intentional privacy tradeoff.</li>
            <li>Disable with <code>data-heatmap="false"</code> on the snippet.</li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError, api } from '../../lib/api';
import { useRange } from '../../lib/range';

interface HeatBody {
  day: string;
  path: string;
  grid_size: number;
  source: 'raw' | 'rollup';
  max_clicks: number;
  cells: Array<{ gx: number; gy: number; clicks: number }>;
  scroll_depth: Array<{ depth: number; events: number }>;
  paths: Array<{ path: string; events: number }>;
}

const route = useRoute();
const { to } = useRange();
const day = ref(to.value);
const path = ref('');
const data = ref<HeatBody | null>(null);
const error = ref('');
const gridSize = computed(() => data.value?.grid_size || 12);
const paths = computed(() => data.value?.paths || []);

const matrix = computed(() => {
  const size = gridSize.value;
  const map = new Map((data.value?.cells || []).map((c) => [`${c.gx}:${c.gy}`, c.clicks]));
  const out: Array<{ gx: number; gy: number; clicks: number }> = [];
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      out.push({ gx, gy, clicks: map.get(`${gx}:${gy}`) || 0 });
    }
  }
  return out;
});

function scrollPct(events: number) {
  const max = Math.max(1, ...(data.value?.scroll_depth || []).map((r) => r.events));
  return `${Math.min(100, (events / max) * 100)}%`;
}

function pickPath(next: string) {
  path.value = next;
  reload();
}

async function reload() {
  error.value = '';
  try {
    const params = new URLSearchParams({ day: day.value });
    if (path.value) params.set('path', path.value);
    data.value = await api<HeatBody>(`/api/v1/sites/${route.params.siteId}/heatmap?${params}`);
    if (!path.value && data.value.path) path.value = data.value.path;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load heatmap';
    data.value = null;
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
.hero h1 { margin: 0; }
.lede {
  margin: 0.35rem 0 0;
  color: var(--app-text-muted);
  max-width: 42rem;
}
.filters {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  align-items: end;
}
.layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(18rem, 1.4fr) minmax(14rem, 0.9fr);
}
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
}
.map-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.85rem;
}
.map-head h2 { margin: 0; font-size: 1.05rem; word-break: break-all; }
.grid-map {
  display: grid;
  gap: 2px;
  aspect-ratio: 4 / 3;
  background: color-mix(in srgb, var(--app-bg) 70%, black);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  padding: 4px;
}
.cell {
  border-radius: 3px;
  background: var(--app-accent);
  min-height: 0;
}
.side { display: grid; gap: 1rem; align-content: start; }
.scrolls, .paths, .plain {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.scrolls li, .paths li {
  display: grid;
  grid-template-columns: 3rem 1fr auto;
  gap: 0.5rem;
  align-items: center;
}
.paths li { grid-template-columns: 1fr auto; }
.bar {
  height: 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-bg) 80%, black);
  border: 1px solid var(--app-border);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--app-accent-dim), var(--app-accent));
}
.linkish {
  background: transparent;
  border: 0;
  color: var(--app-text);
  text-align: left;
  padding: 0;
  cursor: pointer;
  font: inherit;
}
.muted { color: var(--app-text-muted); font-size: 0.85rem; }
.empty { color: var(--app-text-muted); }
.plain li { color: var(--app-text-muted); font-size: 0.9rem; }
</style>
