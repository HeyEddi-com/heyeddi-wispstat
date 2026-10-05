<template>
  <section class="card">
    <h1>Wispstat</h1>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="summary">{{ summary.visitors }} visitors · {{ summary.pv }} pageviews · {{ summary.revenue }} revenue</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const error = ref('');
const summary = ref<{ visitors: number; pv: number; revenue: number } | null>(null);

onMounted(async () => {
  const key = typeof route.query.key === 'string' ? route.query.key : '';
  if (!key) {
    error.value = 'Add a read key as ?key=';
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
});
</script>
