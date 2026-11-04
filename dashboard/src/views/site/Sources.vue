<template>
  <div>
    <div class="toolbar">
      <label>Level
        <select v-model="level">
          <option value="channel">Channel</option>
          <option value="source">Source</option>
          <option value="campaign">Campaign</option>
        </select>
      </label>
      <label>Goal
        <select v-model="goal">
          <option value="">All goals</option>
          <option v-for="item in goals" :key="item.goal_id" :value="String(item.goal_id)">{{ item.name }}</option>
        </select>
      </label>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <table>
      <thead>
        <tr><th>Channel</th><th>Source</th><th>Campaign</th><th>Visitors</th><th>Conv. rate</th><th>Revenue</th><th>Rev / visitor</th></tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="index">
          <td>{{ row.channel }}</td>
          <td>{{ row.source }}</td>
          <td>{{ row.campaign }}</td>
          <td>{{ row.visitors }}</td>
          <td>{{ Math.round(row.conv_rate * 1000) / 10 }}%</td>
          <td>{{ row.value }}</td>
          <td>{{ Math.round(row.revenue_per_visitor * 100) / 100 }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError, api } from '../../lib/api';
import { useRange } from '../../lib/range';

interface Row {
  channel: string;
  source: string;
  campaign: string;
  visitors: number;
  conv_rate: number;
  value: number;
  revenue_per_visitor: number;
}

const route = useRoute();
const { qs } = useRange();
const level = ref('channel');
const goal = ref('');
const goals = ref<Array<{ goal_id: number; name: string }>>([]);
const rows = ref<Row[]>([]);
const error = ref('');

async function load() {
  const id = route.params.siteId;
  const goalQs = goal.value ? `&goal=${goal.value}` : '';
  try {
    const body = await api<{ data: Row[] }>(`/api/v1/sites/${id}/sources?level=${level.value}&${qs.value}${goalQs}`);
    rows.value = body.data;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load sources';
  }
}

onMounted(async () => {
  const body = await api<{ data: Array<{ goal_id: number; name: string }> }>(`/api/v1/sites/${route.params.siteId}/goals`);
  goals.value = body.data;
  await load();
});
watch([level, goal, qs], load);
</script>
