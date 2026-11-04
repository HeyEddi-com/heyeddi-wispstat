<template>
  <div class="claim">
    <form class="card panel" @submit.prevent="submit">
      <p class="kicker">Operator access</p>
      <h1>Sign in</h1>
      <label>Email <input v-model="email" type="email" required /></label>
      <label>Password <input v-model="password" type="password" required /></label>
      <p v-if="error" class="error box">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Signing in…' : 'Sign in' }}</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError, api } from '../lib/api';
import { setAuthed } from '../lib/session';

const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  loading.value = true;
  error.value = '';
  try {
    await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.value, password: password.value }),
    });
    setAuthed(true);
    router.push('/');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not sign in';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.claim {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
}

.panel {
  width: 100%;
  max-width: 24rem;
}

.kicker {
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--app-accent);
}

h1 {
  margin: 0 0 1rem;
}

button {
  width: 100%;
  margin-top: 0.75rem;
}

.box {
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--app-danger) 40%, var(--app-border));
  background: color-mix(in srgb, var(--app-danger) 12%, transparent);
}
</style>
