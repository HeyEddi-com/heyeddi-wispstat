<template>
  <div class="claim">
    <form class="card" @submit.prevent="submit">
      <h1>Sign in</h1>
      <label>Email <input v-model="email" type="email" required /></label>
      <label>Password <input v-model="password" type="password" required /></label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Signing in…' : 'Sign in' }}</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError, api } from '../lib/api';

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
    router.push('/');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not sign in';
  } finally {
    loading.value = false;
  }
}
</script>
