<template>
  <div class="card">
    <h2>Returning visitors</h2>
    <p>Counted only for people who accepted consented mode. Cookieless traffic cannot be joined across days.</p>
    <p>{{ report.returning }} returning of {{ report.visitors }} consented visitors.</p>
    <table v-if="report.cohorts.length">
      <thead><tr><th>First day</th><th>Visitors</th><th>Came back</th></tr></thead>
      <tbody>
        <tr v-for="row in report.cohorts" :key="row.first_day">
          <td>{{ row.first_day }}</td>
          <td>{{ row.visitors }}</td>
          <td>{{ row.returning }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../../lib/api';

const route = useRoute();
const report = ref({ visitors: 0, returning: 0, cohorts: [] as Array<{ first_day: string; visitors: number; returning: number }> });

onMounted(async () => {
  report.value = await api(`/api/v1/sites/${route.params.siteId}/retention`);
});
</script>
