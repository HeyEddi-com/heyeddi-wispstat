<template>
  <form class="card" @submit.prevent="download">
    <h2>Export rollups</h2>
    <label>Dataset
      <select v-model="dataset">
        <option value="daily">Daily</option>
        <option value="sources">Sources</option>
        <option value="goals">Goals</option>
      </select>
    </label>
    <label>Format
      <select v-model="format">
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
    </label>
    <p v-if="error" class="error">{{ error }}</p>
    <button type="submit">Download</button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { useRange } from '../../lib/range';

const route = useRoute();
const { qs } = useRange();
const dataset = ref('daily');
const format = ref('csv');
const error = ref('');

async function download() {
  error.value = '';
  const path = `/api/v1/sites/${route.params.siteId}/export?dataset=${dataset.value}&format=${format.value}&${qs.value}`;
  const response = await fetch(path);
  if (!response.ok) {
    error.value = 'Export failed';
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `wispstat.${format.value}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>
