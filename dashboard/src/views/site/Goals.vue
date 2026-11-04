<template>
  <div>
    <p v-if="error" class="error">{{ error }}</p>
    <table>
      <thead><tr><th>Name</th><th>Kind</th><th>Match</th><th>Pattern</th><th></th></tr></thead>
      <tbody>
        <tr v-for="goal in goals" :key="goal.goal_id">
          <td>{{ goal.name }}</td>
          <td>{{ goal.kind }}</td>
          <td>{{ goal.match_type }}</td>
          <td>{{ goal.pattern }}</td>
          <td><button type="button" @click="remove(goal.goal_id)">Delete</button></td>
        </tr>
      </tbody>
    </table>
    <form class="card" @submit.prevent="create">
      <h2>New goal</h2>
      <label>Name <input v-model="name" required /></label>
      <label>Kind
        <select v-model="kind"><option value="event">Event</option><option value="path">Path</option></select>
      </label>
      <label>Match
        <select v-model="matchType"><option value="exact">Exact</option><option value="prefix">Prefix</option></select>
      </label>
      <label>Pattern <input v-model="pattern" required /></label>
      <button type="submit">Save goal</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError, api } from '../../lib/api';

interface Goal {
  goal_id: number;
  name: string;
  kind: string;
  match_type: string;
  pattern: string;
}

const route = useRoute();
const goals = ref<Goal[]>([]);
const name = ref('');
const kind = ref('event');
const matchType = ref('exact');
const pattern = ref('');
const error = ref('');

async function load() {
  const body = await api<{ data: Goal[] }>(`/api/v1/sites/${route.params.siteId}/goals`);
  goals.value = body.data;
}

async function create() {
  error.value = '';
  try {
    await api(`/api/v1/sites/${route.params.siteId}/goals`, {
      method: 'POST',
      body: JSON.stringify({ name: name.value, kind: kind.value, match_type: matchType.value, pattern: pattern.value }),
    });
    name.value = '';
    pattern.value = '';
    await load();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not save goal';
  }
}

async function remove(id: number) {
  await api(`/api/v1/sites/${route.params.siteId}/goals/${id}`, { method: 'DELETE' });
  await load();
}

onMounted(load);
</script>
