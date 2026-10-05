<template>
  <div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="revealed" class="ok">Copy this key now. It will not be shown again: {{ revealed }}</p>
    <form v-if="site" class="card" @submit.prevent="save">
      <h2>Site</h2>
      <p>Site ID: {{ site.site_id }}</p>
      <pre>{{ snippet }}</pre>
      <label>Name <input v-model="site.name" /></label>
      <label>Slug <input v-model="site.slug" /></label>
      <label>Timezone <input v-model="site.tz" /></label>
      <label>Currency <input v-model="site.currency" maxlength="3" /></label>
      <label>Domains <input v-model="domainText" /></label>
      <label><input v-model="site.honor_dnt" type="checkbox" /> Honor DNT and Global Privacy Control</label>
      <label><input v-model="site.ingest_paused" type="checkbox" /> Pause ingest</label>
      <label><input v-model="site.digest_enabled" type="checkbox" /> Weekly Slack digest</label>
      <p>Sessions and consented mode stay off until those versions ship.</p>
      <button type="submit">Save settings</button>
    </form>
    <form class="card" @submit.prevent="createKey">
      <h2>API keys</h2>
      <label>Label <input v-model="keyLabel" /></label>
      <label>Origins <input v-model="keyOrigins" placeholder="https://example.com" /></label>
      <button type="submit">Create read key</button>
      <ul>
        <li v-for="key in keys" :key="key.key_id">
          {{ key.label || key.key_id }} ({{ key.kind }})
          <button type="button" @click="revoke(key.key_id)" :disabled="!!key.revoked_at">Revoke</button>
        </li>
      </ul>
    </form>
    <form class="card" @submit.prevent="addMember">
      <h2>Members</h2>
      <label>Email <input v-model="memberEmail" type="email" /></label>
      <label>Role
        <select v-model="memberRole"><option value="viewer">Viewer</option><option value="owner">Owner</option></select>
      </label>
      <button type="submit">Save member</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError, api } from '../../lib/api';

interface SiteRow {
  site_id: string;
  slug: string | null;
  name: string;
  tz: string;
  currency: string;
  domains: string[];
  honor_dnt: boolean;
  ingest_paused: boolean;
  digest_enabled: boolean;
}

const route = useRoute();
const site = ref<SiteRow | null>(null);
const domainText = ref('');
const error = ref('');
const keys = ref<Array<{ key_id: string; kind: string; label: string | null; revoked_at: number | null }>>([]);
const keyLabel = ref('');
const keyOrigins = ref('');
const revealed = ref('');
const memberEmail = ref('');
const memberRole = ref('viewer');
const snippet = computed(() => {
  if (!site.value) return '';
  return `<script defer src="${location.origin}/ws.js" data-site="${site.value.site_id}"><` + '/script>';
});

async function load() {
  const id = route.params.siteId;
  const [sites, keyBody] = await Promise.all([
    api<{ data: SiteRow[] }>('/api/v1/sites'),
    api<{ data: typeof keys.value }>(`/api/v1/sites/${id}/api-keys`),
  ]);
  site.value = sites.data.find((row) => row.site_id === id) || null;
  domainText.value = site.value?.domains.join(', ') || '';
  keys.value = keyBody.data;
}

async function save() {
  if (!site.value) return;
  error.value = '';
  try {
    await api(`/api/v1/sites/${site.value.site_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: site.value.name,
        slug: site.value.slug || null,
        tz: site.value.tz,
        currency: site.value.currency,
        domains: domainText.value.split(',').map((domain) => domain.trim()).filter(Boolean),
        honor_dnt: site.value.honor_dnt,
        ingest_paused: site.value.ingest_paused,
        digest_enabled: site.value.digest_enabled,
      }),
    });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not save';
  }
}

async function createKey() {
  revealed.value = '';
  const created = await api<{ key: string }>(`/api/v1/sites/${route.params.siteId}/api-keys`, {
    method: 'POST',
    body: JSON.stringify({
      label: keyLabel.value,
      kind: 'read',
      allowed_origins: keyOrigins.value.split(',').map((origin) => origin.trim()).filter(Boolean),
    }),
  });
  revealed.value = created.key;
  await load();
}

async function revoke(id: string) {
  await api(`/api/v1/sites/${route.params.siteId}/api-keys/${id}`, { method: 'DELETE' });
  await load();
}

async function addMember() {
  error.value = '';
  try {
    await api(`/api/v1/sites/${route.params.siteId}/members`, {
      method: 'PUT',
      body: JSON.stringify({ email: memberEmail.value, role: memberRole.value }),
    });
    memberEmail.value = '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not save member';
  }
}

onMounted(load);
</script>
