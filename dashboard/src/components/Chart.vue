<template>
  <svg class="chart" viewBox="0 0 320 80" role="img" :aria-label="label">
    <polyline v-if="points" fill="none" stroke="#2e7d32" stroke-width="2" :points="points" />
    <text v-else x="8" y="40" fill="#777">No data in this range</text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ values: number[]; label?: string }>();
const label = computed(() => props.label || 'Chart');
const points = computed(() => {
  if (props.values.length === 0) return '';
  const max = Math.max(...props.values, 1);
  return props.values.map((value, index) => {
    const x = props.values.length === 1 ? 160 : (index / (props.values.length - 1)) * 320;
    const y = 76 - (value / max) * 68;
    return `${x},${y}`;
  }).join(' ');
});
</script>

<style scoped>
.chart { width: 100%; height: 80px; background: #f7faf7; border-radius: 4px; }
</style>
