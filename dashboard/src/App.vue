<template>
  <div class="app">
    <header v-if="claimed">
      <h1>HeyEddi Wispstat</h1>
      <nav>
        <router-link to="/">Overview</router-link>
      </nav>
    </header>
    
    <main>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const claimed = ref(false);

onMounted(async () => {
  try {
    const response = await fetch('/config');
    const data = await response.json();
    claimed.value = data.claimed;
  } catch (error) {
    console.error('Failed to load config:', error);
  }
});
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
</style>
