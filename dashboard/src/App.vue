<template>
  <div class="app">
    <header v-if="claimed">
      <h1>HeyEddi Wispstat</h1>
      <nav>
        <router-link to="/">Overview</router-link>
        <router-link to="/login">Sign in</router-link>
        <button type="button" class="link" @click="logout">Sign out</button>
      </nav>
    </header>
    
    <main>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from './lib/api';
import { claimed, loadConfig } from './lib/session';

const router = useRouter();

onMounted(() => {
  loadConfig().catch(() => undefined);
});

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  router.push('/login');
}
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  line-height: 1.6;
  color: #333;
  background: #f5f5f5;
}

.app {
  min-height: 100vh;
}

header {
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

nav a {
  margin-left: 1.5rem;
  text-decoration: none;
  color: #666;
}

nav a:hover {
  color: #333;
}

main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

button.link {
  margin-left: 1.5rem;
  background: none;
  border: 0;
  color: #666;
  cursor: pointer;
  font: inherit;
}

.card, .claim .card {
  background: #fff;
  border-radius: 8px;
  padding: 1.25rem;
  margin: 1rem 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.toolbar, .subnav {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: end;
  margin: 1rem 0;
}

label { display: block; font-weight: 500; margin: 0.5rem 0; }
input, select {
  display: block;
  width: 100%;
  max-width: 420px;
  padding: 0.6rem;
  margin-top: 0.25rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font: inherit;
}
button {
  padding: 0.6rem 1rem;
  background: #2e7d32;
  color: #fff;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #eee; }
.error { color: #c62828; }
.ok { color: #2e7d32; word-break: break-all; }
.subnav a { color: #444; }
</style>
