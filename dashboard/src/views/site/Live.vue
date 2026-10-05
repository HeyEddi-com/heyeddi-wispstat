<template>
  <section class="card">
    <h2>Last 30 minutes</h2>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else>{{ data.pageviews }} pageviews · {{ data.events }} events</p>
    <ul>
      <li v-for="row in data.paths" :key="row.path">{{ row.path }} — {{ row.pv }}</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError, api } from '../../lib/api';

const route = useRoute();
const error = ref('');
const data = ref<{ pageviews: number; events: number; paths: Array<{ path: string; pv: number }> }>({
  pageviews: 0,
  events: 0,
  paths: [],
});

onMounted(async () => {
  try {
    const body = await api<{ data: typeof data.value }>(`/api/v1/sites/${route.params.siteId}/live`);
    data.value = body.data;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load live view';
  }
});
</script>
