<template>
  <main class="docs-page">
    <a class="skip-link" href="#docs-main">Skip to content</a>

    <header id="docs-main" class="docs-hero">
      <p class="docs-eyebrow">Official documentation</p>
      <h1>Wispstat docs</h1>
      <p class="hero-lede">
        Cookie-free analytics on your Cloudflare Worker. Pageviews, outbound links,
        downloads, and form submits are automatic; goals and client shares are opt-in.
      </p>
      <div class="hero-actions">
        <router-link class="primary-button" to="/">Open overview</router-link>
        <a class="text-link" href="#install">Install snippet</a>
        <a class="text-link" href="#share">Share with clients</a>
      </div>
    </header>

    <div class="docs-shell">
      <nav class="docs-toc" aria-label="On this page">
        <p class="docs-toc-label">On this page</p>
        <ol>
          <li v-for="item in navItems" :key="item.id">
            <a
              :href="`#${item.id}`"
              :aria-current="activeId === item.id ? 'location' : undefined"
              @click="goToSection(item.id, $event)"
            >
              <span class="docs-toc-tick" aria-hidden="true" />
              {{ item.label }}
            </a>
          </li>
        </ol>
      </nav>

      <div class="docs-body">
        <section id="install" class="section" aria-labelledby="install-title">
          <h2 id="install-title">Install</h2>
          <p class="section-body">Add a site with one domain root, then paste the tracker on hosts you want measured.</p>
          <ol class="install-flow">
            <li>
              <div>
                <strong>Create the site</strong>
                <span>Overview → Add a site. One domain (e.g. <code>example.com</code> or <code>app.example.com</code>) — that host and all subdomains under it.</span>
              </div>
            </li>
            <li>
              <div>
                <strong>Paste the snippet</strong>
                <span>From Settings or the create response. Before <code>&lt;/body&gt;</code> is fine.</span>
                <pre>{{ trackerSnippet }}</pre>
              </div>
            </li>
            <li>
              <div>
                <strong>Confirm Live</strong>
                <span>Open the site → Live. You should see pageviews after a hit (and after rollups for day totals).</span>
              </div>
            </li>
          </ol>
          <p class="policy-note"><code>data-site</code> is public HTML. It is an identifier, not a secret.</p>
        </section>

        <section id="defaults" class="section" aria-labelledby="defaults-title">
          <h2 id="defaults-title">What logs by default</h2>
          <p class="section-body">Pageviews plus light auto-events. Disable autos with <code>data-auto-events="false"</code>.</p>
          <div class="capability-grid" role="list">
            <article class="capability-row" role="listitem">
              <span class="status-pill now">Default</span>
              <div>
                <strong>Pageview on load</strong>
                <p>Unless you set <code>data-auto="false"</code>.</p>
              </div>
            </article>
            <article class="capability-row" role="listitem">
              <span class="status-pill now">Default</span>
              <div>
                <strong>SPA route changes</strong>
                <p><code>data-spa="auto"</code> watches history push/replace/popstate.</p>
              </div>
            </article>
            <article class="capability-row" role="listitem">
              <span class="status-pill now">Default</span>
              <div>
                <strong>Outbound · downloads · form submit</strong>
                <p><code>outbound:host</code>, <code>file_download:…</code>, <code>form_submit</code> (never field values).</p>
              </div>
            </article>
            <article class="capability-row" role="listitem">
              <span class="status-pill now">Default</span>
              <div>
                <strong>Heat + scroll</strong>
                <p>12×12 viewport click grid + scroll depth. Off with <code>data-heatmap="false"</code>.</p>
              </div>
            </article>
            <article class="capability-row" role="listitem">
              <span class="status-pill soon">Manual</span>
              <div>
                <strong>Signup, purchase, custom goals</strong>
                <p>Fire <code>wispstat('event', …)</code> yourself.</p>
              </div>
            </article>
          </div>
          <p class="section-body">
            Optional attributes: <code>data-respect-dnt</code>,
            <code>data-exclude="/admin"</code>, <code>data-mask="/user/*"</code>,
            <code>data-hash-mode</code>, <code>data-file-types</code>.
          </p>
        </section>

        <section id="attribution" class="section" aria-labelledby="attribution-title">
          <h2 id="attribution-title">Attribution</h2>
          <p class="section-body">
            First pageview of a load captures <code>utm_*</code>, or <code>ref</code>/<code>via</code>, plus external referrer.
            That becomes same-day first-touch for the visitor. Goals inherit it. CRM handoff: <code>wispstat('attribution')</code>.
          </p>
        </section>

        <section id="visits" class="section" aria-labelledby="visits-title">
          <h2 id="visits-title">Visits</h2>
          <p class="section-body">
            Site → Visits: same-day timelines (no replay). Filter by duration, form submit present/absent, or a visitor hash.
            Typical paths summarize the filtered set. Raw detail lasts ~3 days.
          </p>
        </section>

        <section id="heatmaps" class="section" aria-labelledby="heatmaps-title">
          <h2 id="heatmaps-title">Heatmaps</h2>
          <p class="section-body">
            Site → Heatmaps: aggregate attention (grid clicks + scroll depth). Not a CSS screenshot overlay and not session replay.
          </p>
        </section>

        <section id="events" class="section" aria-labelledby="events-title">
          <h2 id="events-title">Custom events</h2>
          <p class="section-body">Call from your app when something meaningful happens. Names ≤64 chars, charset <code>[a-z0-9_:.-]</code>.</p>
          <div class="command-list" role="list">
            <article class="command-row" role="listitem">
              <code>wispstat('pageview')</code>
              <div>
                <strong>Manual pageview</strong>
                <p>Useful if auto pageviews are off.</p>
              </div>
            </article>
            <article class="command-row" role="listitem">
              <code>wispstat('event', 'signup')</code>
              <div>
                <strong>Named event</strong>
                <p>Pair with a Goal of kind event for conversion rates.</p>
              </div>
            </article>
            <article class="command-row" role="listitem">
              <code>wispstat('event', 'purchase', {{ '{ value: 49.9 }' }})</code>
              <div>
                <strong>Event + value</strong>
                <p>Revenue in the site currency.</p>
              </div>
            </article>
            <article class="command-row" role="listitem">
              <code>wispstat('event', 'signup', {{ '{ props: { role: \'founder\' } }' }})</code>
              <div>
                <strong>Capped props</strong>
                <p>Only after you define property keys under Settings → Event properties.</p>
              </div>
            </article>
          </div>
        </section>

        <section id="mcp" class="section" aria-labelledby="mcp-title">
          <h2 id="mcp-title">MCP</h2>
          <p class="section-body">
            Agents use a thin MCP server (<code>mcp/</code>) with a read API key — no Slack digest, no Firebase.
            Tools: budget, summary, sources, live, visits, timeline. See <code>mcp/README.md</code>.
          </p>
        </section>

        <section id="share" class="section" aria-labelledby="share-title">
          <h2 id="share-title">Share with a client</h2>
          <p class="section-body">Read-only summary. They can open a link or embed an iframe. No login for them.</p>
          <ol class="install-flow">
            <li>
              <div>
                <strong>Create share link</strong>
                <span>Site → Settings → Share with a client. Shown once — copy it.</span>
              </div>
            </li>
            <li>
              <div>
                <strong>Open in browser</strong>
                <pre>{{ embedOpen }}</pre>
              </div>
            </li>
            <li>
              <div>
                <strong>Or embed</strong>
                <pre>{{ embedIframe }}</pre>
              </div>
            </li>
          </ol>
          <p class="policy-note">Keys stay valid until you Revoke them. Treat the URL like a password.</p>
        </section>

        <section id="security" class="section" aria-labelledby="security-title">
          <h2 id="security-title">Security</h2>
          <ul class="plain-list">
            <li>Visitors: no cookies in default mode; daily hashed IDs; one domain root + its subdomains.</li>
            <li>Forms: submit events never include field values.</li>
            <li>You: email/password on this Worker; use a strong password; keep SETUP_TOKEN private.</li>
            <li>Clients: share links only see that site’s rolled-up numbers.</li>
          </ul>
        </section>

        <section id="budget" class="section" aria-labelledby="budget-title">
          <h2 id="budget-title">Data budget</h2>
          <p class="section-body">
            Overview estimates Cloudflare Free usage today (writes and requests vs ~100k/day caps).
            Counts rise with real pageviews and events only — not a fake floor.
          </p>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

const origin = typeof location !== 'undefined' ? location.origin : 'https://your-worker.workers.dev';

const trackerSnippet = computed(
  () => `<script defer src="${origin}/ws.js" data-site="s_yourSiteIdHere"><` + `/script>`
);
const embedOpen = computed(() => `${origin}/embed/s_yourSiteIdHere?key=wsk_…`);
const embedIframe = computed(
  () =>
    `<iframe src="${embedOpen.value}" title="Wispstat" width="100%" height="220" style="border:0;border-radius:12px" loading="lazy"></iframe>`
);

const navItems = [
  { id: 'install', label: 'Install' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'attribution', label: 'Attribution' },
  { id: 'visits', label: 'Visits' },
  { id: 'heatmaps', label: 'Heatmaps' },
  { id: 'events', label: 'Custom events' },
  { id: 'mcp', label: 'MCP' },
  { id: 'share', label: 'Share' },
  { id: 'security', label: 'Security' },
  { id: 'budget', label: 'Data budget' },
];

const activeId = ref(navItems[0]!.id);

function goToSection(id: string, event: Event) {
  event.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
  activeId.value = id;
}

function onScroll() {
  const offset = 96;
  let current = navItems[0]!.id;
  for (const item of navItems) {
    const el = document.getElementById(item.id);
    if (!el) continue;
    if (el.getBoundingClientRect().top - offset <= 0) current = item.id;
  }
  activeId.value = current;
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  if (location.hash) {
    const id = location.hash.slice(1);
    if (navItems.some((item) => item.id === id)) {
      activeId.value = id;
      document.getElementById(id)?.scrollIntoView();
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
});
</script>

<style scoped>
.docs-page {
  padding-bottom: 4rem;
}

.skip-link {
  position: absolute;
  left: -999px;
  top: 0;
  z-index: 100;
  padding: 0.5rem 0.75rem;
  background: var(--app-accent);
  color: #062116;
}

.skip-link:focus {
  left: 0.75rem;
  top: 0.75rem;
}

.docs-hero,
.docs-shell {
  max-width: 1180px;
  margin-inline: auto;
}

.docs-hero {
  padding: clamp(2rem, 5vw, 3.5rem) 0 clamp(1.75rem, 4vw, 2.75rem);
}

.docs-eyebrow {
  margin: 0 0 0.5rem;
  color: var(--app-accent);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.docs-hero h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 2.75rem);
  letter-spacing: -0.04em;
}

.hero-lede {
  margin: 0.85rem 0 0;
  max-width: 40rem;
  color: var(--app-text-muted);
  font-size: 1.05rem;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem 1.25rem;
  align-items: center;
  margin-top: 1.25rem;
}

.primary-button {
  display: inline-flex;
  align-items: center;
  padding: 0.65rem 1.1rem;
  border-radius: 8px;
  background: var(--app-accent);
  color: #062116;
  font-family: var(--app-font-display);
  font-weight: 600;
  text-decoration: none;
}

.text-link {
  color: var(--app-text-muted);
  font-weight: 600;
  text-decoration: none;
}

.text-link:hover {
  color: var(--app-accent);
}

.docs-shell {
  display: grid;
  grid-template-columns: 13.5rem minmax(0, 1fr);
  gap: clamp(1.5rem, 4vw, 3.5rem);
  align-items: start;
}

.docs-toc {
  position: sticky;
  top: 1.25rem;
  padding-block: 0.5rem 2rem;
}

.docs-toc-label {
  margin: 0 0 0.75rem;
  color: var(--app-accent);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.docs-toc ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.15rem;
  border-left: 1px solid var(--app-border);
}

.docs-toc a {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 44px;
  padding: 0.15rem 0.75rem 0.15rem 0.9rem;
  margin-left: -1px;
  color: var(--app-text-muted);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  border-left: 2px solid transparent;
}

.docs-toc a:hover,
.docs-toc a[aria-current='location'] {
  color: var(--app-text);
}

.docs-toc a[aria-current='location'] {
  border-left-color: var(--app-accent);
}

.docs-toc-tick {
  width: 0.45rem;
  height: 0.45rem;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--app-text-muted) 45%, transparent);
}

.docs-toc a[aria-current='location'] .docs-toc-tick {
  background: var(--app-accent);
  box-shadow: 0 0 0 4px var(--app-accent-soft);
}

.section {
  padding-block: 1.75rem 2.25rem;
  border-top: 1px solid var(--app-border);
}

.section:first-child {
  border-top: 0;
  padding-top: 0.25rem;
}

.section h2 {
  margin: 0 0 0.65rem;
  font-size: 1.45rem;
  letter-spacing: -0.03em;
}

.section-body {
  margin: 0 0 1rem;
  color: var(--app-text-muted);
  max-width: 42rem;
}

.install-flow {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1rem;
  counter-reset: step;
}

.install-flow > li {
  display: grid;
  grid-template-columns: 2rem 1fr;
  gap: 0.85rem;
  counter-increment: step;
}

.install-flow > li::before {
  content: counter(step);
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 8px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-accent);
  font-family: var(--app-font-display);
  font-weight: 700;
  font-size: 0.9rem;
}

.install-flow strong {
  display: block;
  margin-bottom: 0.25rem;
}

.install-flow span {
  display: block;
  color: var(--app-text-muted);
}

.install-flow pre,
.command-row code + div,
pre {
  margin: 0.65rem 0 0;
  padding: 0.85rem 1rem;
  background: color-mix(in srgb, var(--app-bg) 70%, black);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  color: var(--app-ok);
  font-family: var(--app-font-mono);
  font-size: 0.82rem;
  white-space: pre-wrap;
  word-break: break-all;
}

.capability-grid,
.command-list {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0;
}

.capability-row,
.command-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.85rem;
  align-items: start;
  padding: 0.9rem 1rem;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
}

.command-row {
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
}

.command-row code {
  display: block;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-bg) 70%, black);
  border: 1px solid var(--app-border);
  color: var(--app-accent);
  font-family: var(--app-font-mono);
  font-size: 0.78rem;
  word-break: break-all;
}

.command-row p,
.capability-row p {
  margin: 0.25rem 0 0;
  color: var(--app-text-muted);
  font-size: 0.92rem;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  height: 1.5rem;
  padding: 0 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.status-pill.now {
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.status-pill.soon {
  background: color-mix(in srgb, var(--app-text-muted) 18%, transparent);
  color: var(--app-text-muted);
}

.plain-list {
  margin: 0;
  padding-left: 1.15rem;
  color: var(--app-text-muted);
}

.plain-list li {
  margin: 0.4rem 0;
}

.policy-note {
  margin: 1rem 0 0;
  color: var(--app-text-muted);
  font-size: 0.9rem;
}

code {
  font-family: var(--app-font-mono);
  font-size: 0.88em;
  color: var(--app-accent);
}

@media (max-width: 860px) {
  .docs-shell {
    grid-template-columns: 1fr;
  }

  .docs-toc {
    position: static;
    padding-bottom: 0;
  }

  .docs-toc ol {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    border-left: 0;
  }

  .docs-toc a {
    border: 1px solid var(--app-border);
    border-radius: 999px;
    min-height: 2.25rem;
    margin: 0;
  }

  .command-row {
    grid-template-columns: 1fr;
  }
}
</style>
