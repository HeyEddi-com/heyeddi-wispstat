<template>
  <svg class="chart" viewBox="0 0 320 80" role="img" :aria-label="label">
    <defs>
      <linearGradient id="signal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--app-accent)" stop-opacity="0.35" />
        <stop offset="100%" stop-color="var(--app-accent)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <polygon v-if="area" :points="area" fill="url(#signal)" />
    <polyline v-if="points" fill="none" stroke="var(--app-accent)" stroke-width="2.2" :points="points" />
    <text v-else x="8" y="40" fill="var(--app-text-muted)" font-size="12">No data in this range</text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ values: number[]; label?: string }>();
const label = computed(() => props.label || 'Chart');

const coords = computed(() => {
  if (props.values.length === 0) return [] as Array<{ x: number; y: number }>;
  const max = Math.max(...props.values, 1);
  return props.values.map((value, index) => {
    const x = props.values.length === 1 ? 160 : (index / (props.values.length - 1)) * 320;
    const y = 76 - (value / max) * 68;
    return { x, y };
  });
});

const points = computed(() => coords.value.map((c) => `${c.x},${c.y}`).join(' '));
const area = computed(() => {
  if (coords.value.length === 0) return '';
  const line = coords.value.map((c) => `${c.x},${c.y}`).join(' ');
  const first = coords.value[0]!;
  const last = coords.value[coords.value.length - 1]!;
  return `${first.x},80 ${line} ${last.x},80`;
});
</script>

<style scoped>
.chart {
  width: 100%;
  height: 80px;
  background: color-mix(in srgb, var(--app-bg) 55%, transparent);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}
</style>
