<template>
  <div>
    <p v-if="error" class="error">{{ error }}</p>
    <ul>
      <li v-for="link in links" :key="link.id">
        {{ link.label || link.full_url }}
        <button type="button" @click="copy(link.full_url)">Copy</button>
        <button type="button" @click="remove(link.id)">Delete</button>
      </li>
    </ul>
    <form class="card" @submit.prevent="create">
      <h2>UTM link</h2>
      <label>Label <input v-model="form.label" /></label>
      <label>Base URL <input v-model="form.base_url" type="url" required placeholder="https://example.com/pricing" /></label>
      <label>Source <input v-model="form.utm_source" /></label>
      <label>Medium <input v-model="form.utm_medium" /></label>
      <label>Campaign <input v-model="form.utm_campaign" /></label>
      <button type="submit">Save link</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError, api } from '../../lib/api';

interface Link { id: number; label: string | null; full_url: string }

const route = useRoute();
const links = ref<Link[]>([]);
const error = ref('');
const form = reactive({ label: '', base_url: '', utm_source: '', utm_medium: '', utm_campaign: '' });

async function load() {
  const body = await api<{ data: Link[] }>(`/api/v1/sites/${route.params.siteId}/utm-links`);
  links.value = body.data;
}

async function create() {
  error.value = '';
  try {
    await api(`/api/v1/sites/${route.params.siteId}/utm-links`, { method: 'POST', body: JSON.stringify(form) });
    form.label = '';
    form.base_url = '';
    await load();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not save link';
  }
}

async function remove(id: number) {
  await api(`/api/v1/sites/${route.params.siteId}/utm-links/${id}`, { method: 'DELETE' });
  await load();
}

async function copy(url: string) {
  await navigator.clipboard.writeText(url);
}

onMounted(load);
</script>
