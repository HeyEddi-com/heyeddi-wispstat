<template>
  <div class="app">
    <div class="scanline" aria-hidden="true" />
    <header v-if="claimed && !isEmbed" class="shell-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true" />
        <div>
          <p class="brand-kicker">HeyEddi</p>
          <h1>Wispstat</h1>
        </div>
      </div>
      <nav>
        <router-link to="/">Overview</router-link>
        <router-link to="/docs">Docs</router-link>
        <router-link v-if="!authed" to="/login">Sign in</router-link>
        <button v-else type="button" class="link" @click="logout">Sign out</button>
      </nav>
    </header>

    <main>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from './lib/api';
import { authed, claimed, loadConfig, refreshAuth, setAuthed } from './lib/session';

const route = useRoute();
const router = useRouter();
const isEmbed = computed(() => route.path.startsWith('/embed'));

onMounted(async () => {
  await loadConfig().catch(() => undefined);
  if (claimed.value && !isEmbed.value) await refreshAuth();
});

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  setAuthed(false);
  router.push('/login');
}
</script>

<style>
@import "./assets/design-tokens.css";

.app {
  min-height: 100vh;
  position: relative;
}

.scanline {
  pointer-events: none;
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent 3px,
    rgba(255, 255, 255, 0.015) 3px,
    rgba(255, 255, 255, 0.015) 4px
  );
  opacity: 0.45;
  z-index: 0;
}

.shell-header,
main {
  position: relative;
  z-index: 1;
}

.shell-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.1rem 1.75rem;
  border-bottom: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  backdrop-filter: blur(12px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.brand-mark {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--app-accent);
  box-shadow: 0 0 0 4px var(--app-accent-soft), 0 0 18px var(--app-accent);
  animation: pulse 2.8s var(--app-ease) infinite;
}

.brand-kicker {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

.shell-header h1 {
  margin: 0;
  font-size: 1.35rem;
}

nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 1.1rem;
}

nav a {
  color: var(--app-text-muted);
  font-size: 0.95rem;
}

nav a.router-link-active {
  color: var(--app-accent);
}

main {
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.75rem 1.5rem 3rem;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (max-width: 640px) {
  .shell-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
