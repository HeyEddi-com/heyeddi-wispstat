<template>
  <div>
    <p v-if="error" class="error">{{ error }}</p>
    <form class="card" @submit.prevent="create">
      <h2>New funnel</h2>
      <label>Name <input v-model="name" required /></label>
      <label>Steps, in order <input v-model="steps" placeholder="signup, checkout, purchase" required /></label>
      <button type="submit">Save funnel</button>
    </form>
    <article v-for="funnel in funnels" :key="funnel.funnel_id" class="card">
      <h2>{{ funnel.name }}</h2>
      <ol>
        <li v-for="(step, index) in funnel.steps" :key="step">
          {{ step }} — {{ funnel.counts?.[index] ?? 0 }}
        </li>
      </ol>
      <button type="button" @click="remove(funnel.funnel_id)">Delete</button>
    </article>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError, api } from '../../lib/api';
import { useRange } from '../../lib/range';

interface Funnel {
  funnel_id: number;
  name: string;
  steps: string[];
  counts?: number[];
}

const route = useRoute();
const { from, to } = useRange();
const funnels = ref<Funnel[]>([]);
const name = ref('');
const steps = ref('');
const error = ref('');

async function load() {
  const body = await api<{ data: Funnel[] }>(
    `/api/v1/sites/${route.params.siteId}/funnels?from=${from.value}&to=${to.value}`
  );
  funnels.value = body.data;
}

async function create() {
  error.value = '';
  try {
    await api(`/api/v1/sites/${route.params.siteId}/funnels`, {
      method: 'POST',
      body: JSON.stringify({
        name: name.value,
        steps: steps.value.split(',').map((step) => step.trim()).filter(Boolean),
      }),
    });
    name.value = '';
    steps.value = '';
    await load();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not save funnel';
  }
}

async function remove(id: number) {
  await api(`/api/v1/sites/${route.params.siteId}/funnels/${id}`, { method: 'DELETE' });
  await load();
}

onMounted(load);
watch([from, to], load);
</script>
