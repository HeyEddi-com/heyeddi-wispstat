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
      <label>
        Timezone
        <select v-model="site.tz">
          <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
        </select>
      </label>
      <label>Currency <input v-model="site.currency" maxlength="3" /></label>
      <label>Reporting currency <input v-model="site.reporting_currency" maxlength="3" /></label>
      <label><input v-model="site.digest_enabled" type="checkbox" /> Weekly Slack digest (set secret SLACK_WEBHOOK_URL)</label>
      <label>
        Domain
        <input v-model="domainText" placeholder="example.com" required pattern="^[A-Za-z0-9.-]+$" />
      </label>
      <p class="hint">One root. Measures that host and every subdomain under it.</p>
      <label><input v-model="site.honor_dnt" type="checkbox" /> Honor DNT and Global Privacy Control</label>
      <label><input v-model="site.ingest_paused" type="checkbox" /> Pause ingest</label>
      <label><input v-model="site.sessions_enabled" type="checkbox" /> Approximate sessions</label>
      <p class="hint">Agent access: create a read API key and point the Wispstat MCP at this Worker (see <code>mcp/README.md</code>).</p>
      <label><input v-model="site.upgrade_direct" type="checkbox" /> Upgrade a Direct first touch when a later visit has a source</label>
      <label><input v-model="site.consent_mode" type="checkbox" /> Consented mode (requires your own banner + ws-consent.js)</label>
      <p v-if="site.consent_mode" style="color:#a60">Consented mode stores a first-party ID. Use ws-consent.js and obtain legal consent first.</p>
      <button type="submit">Save settings</button>
    </form>
    <form class="card" @submit.prevent="saveProps">
      <h2>Event properties (max 3)</h2>
      <p>Low-cardinality tags only. Never declare free-text fields.</p>
      <textarea v-model="propsJson" rows="6" placeholder='[{"key":"role","allowed":["founder","developer","other"]}]'></textarea>
      <button type="submit">Save property defs</button>
    </form>
    <section class="card share">
      <h2>Share with a client</h2>
      <p class="hint">Creates a read-only link they can open or iframe. Shown once — copy it now.</p>
      <label>Label <input v-model="shareLabel" placeholder="Acme client" /></label>
      <button type="button" @click="createShareLink" :disabled="sharing">
        {{ sharing ? 'Creating…' : 'Create share link' }}
      </button>
      <div v-if="shareOpenUrl" class="share-out">
        <p><strong>Open in browser</strong></p>
        <p class="ok">{{ shareOpenUrl }}</p>
        <p><strong>Embed iframe</strong></p>
        <pre class="ok">{{ shareIframe }}</pre>
        <button type="button" class="secondary" @click="copyShare">Copy open link</button>
      </div>
    </section>

    <form class="card" @submit.prevent="createKey">
      <h2>API keys</h2>
      <label>Label <input v-model="keyLabel" /></label>
      <label>Kind
        <select v-model="keyKind"><option value="read">read</option><option value="server">server (S2S)</option></select>
      </label>
      <label>Origins (optional; empty = any) <input v-model="keyOrigins" placeholder="https://client.com" /></label>
      <button type="submit">Create key</button>
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
import { timezoneOptions } from '../../lib/timezones';

interface SiteRow {
  site_id: string;
  slug: string | null;
  name: string;
  tz: string;
  currency: string;
  reporting_currency: string;
  digest_enabled: boolean;
  domains: string[];
  honor_dnt: boolean;
  ingest_paused: boolean;
  sessions_enabled: boolean;
  upgrade_direct: boolean;
  consent_mode: boolean;
}

const route = useRoute();
const site = ref<SiteRow | null>(null);
const domainText = ref('');
const zones = ref(timezoneOptions());
const error = ref('');
const keys = ref<Array<{ key_id: string; kind: string; label: string | null; revoked_at: number | null }>>([]);
const keyLabel = ref('');
const keyKind = ref<'read' | 'server'>('read');
const keyOrigins = ref('');
const revealed = ref('');
const shareLabel = ref('Client share');
const sharing = ref(false);
const shareOpenUrl = ref('');
const shareIframe = ref('');
const memberEmail = ref('');
const memberRole = ref('viewer');
const propsJson = ref('[]');
const snippet = computed(() => {
  if (!site.value) return '';
  const file = site.value.consent_mode ? 'ws-consent.js' : 'ws.js';
  return `<script defer src="${location.origin}/${file}" data-site="${site.value.site_id}"><` + '/script>';
});

async function load() {
  const id = route.params.siteId;
  const [sites, keyBody, propsBody] = await Promise.all([
    api<{ data: SiteRow[] }>('/api/v1/sites'),
    api<{ data: typeof keys.value }>(`/api/v1/sites/${id}/api-keys`),
    api<{ data: Array<{ key: string; allowed: string[] }> }>(`/api/v1/sites/${id}/props`),
  ]);
  site.value = sites.data.find((row) => row.site_id === id) || null;
  domainText.value = site.value?.domains[0] || '';
  zones.value = timezoneOptions(site.value?.tz);
  keys.value = keyBody.data;
  propsJson.value = JSON.stringify(propsBody.data.map(({ key, allowed }) => ({ key, allowed })), null, 2);
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
        reporting_currency: site.value.reporting_currency,
        digest_enabled: site.value.digest_enabled,
        domain: domainText.value.trim(),
        honor_dnt: site.value.honor_dnt,
        ingest_paused: site.value.ingest_paused,
        sessions_enabled: site.value.sessions_enabled,
        upgrade_direct: site.value.upgrade_direct,
        consent_mode: site.value.consent_mode,
      }),
    });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not save';
  }
}

async function saveProps() {
  error.value = '';
  try {
    const defs = JSON.parse(propsJson.value) as Array<{ key: string; allowed: string[] }>;
    await api(`/api/v1/sites/${route.params.siteId}/props`, {
      method: 'PUT',
      body: JSON.stringify({ defs }),
    });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not save properties';
  }
}

async function createKey() {
  revealed.value = '';
  shareOpenUrl.value = '';
  shareIframe.value = '';
  const created = await api<{ key: string }>(`/api/v1/sites/${route.params.siteId}/api-keys`, {
    method: 'POST',
    body: JSON.stringify({
      label: keyLabel.value,
      kind: keyKind.value,
      allowed_origins: keyOrigins.value.split(',').map((origin) => origin.trim()).filter(Boolean),
    }),
  });
  revealed.value = created.key;
  await load();
}

async function createShareLink() {
  error.value = '';
  sharing.value = true;
  shareOpenUrl.value = '';
  shareIframe.value = '';
  revealed.value = '';
  try {
    const created = await api<{ key: string }>(`/api/v1/sites/${route.params.siteId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({
        label: shareLabel.value || 'Client share',
        kind: 'read',
        allowed_origins: [],
      }),
    });
    const siteId = String(route.params.siteId);
    shareOpenUrl.value = `${location.origin}/embed/${siteId}?key=${encodeURIComponent(created.key)}`;
    shareIframe.value = `<iframe src="${shareOpenUrl.value}" title="Wispstat" width="100%" height="220" style="border:0;border-radius:12px;overflow:hidden" loading="lazy"></iframe>`;
    await load();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not create share link';
  } finally {
    sharing.value = false;
  }
}

async function copyShare() {
  if (!shareOpenUrl.value) return;
  await navigator.clipboard.writeText(shareOpenUrl.value);
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

<style scoped>
.hint {
  color: var(--app-text-muted);
  margin: 0 0 0.75rem;
}
.share-out {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--app-border);
}
.share-out pre {
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0.35rem 0 0.75rem;
}
button.secondary {
  background: transparent;
  color: var(--app-accent);
  border: 1px solid var(--app-border);
}
</style>
