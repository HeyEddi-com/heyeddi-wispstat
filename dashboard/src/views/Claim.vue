<template>
  <div class="claim">
    <div class="card panel">
      <p class="kicker">HeyEddi Wispstat</p>
      <h1>Claim this instance</h1>
      <p class="subtitle">One owner. Your Cloudflare account. Cookie-free analytics.</p>

      <form @submit.prevent="handleClaim">
        <div class="field">
          <label>Setup token</label>
          <input
            v-model="setupToken"
            type="password"
            placeholder="SETUP_TOKEN from deployment"
            required
            autocomplete="off"
          />
        </div>

        <div class="field">
          <label>Email</label>
          <input v-model="email" type="email" placeholder="you@example.com" required />
        </div>

        <div class="field">
          <label>Password</label>
          <input
            v-model="password"
            type="password"
            placeholder="At least 12 characters"
            minlength="12"
            required
          />
        </div>

        <div v-if="error" class="error box">{{ error }}</div>

        <button type="submit" :disabled="loading">
          {{ loading ? 'Claiming…' : 'Claim instance' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { claimed, setAuthed } from '../lib/session';

const router = useRouter();
const setupToken = ref('');
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function handleClaim() {
  loading.value = true;
  error.value = '';

  try {
    const response = await fetch('/auth/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setup_token: setupToken.value,
        email: email.value,
        password: password.value,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      error.value = data.error?.message || 'Failed to claim instance';
      return;
    }

    claimed.value = true;
    setAuthed(true);
    router.push('/');
  } catch {
    error.value = 'Network error. Please try again.';
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
  min-height: 100vh;
  padding: 1.5rem;
}

.panel {
  width: 100%;
  max-width: 26rem;
  margin: 0;
}

.kicker {
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--app-accent);
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 1.75rem;
}

.subtitle {
  color: var(--app-text-muted);
  margin: 0 0 1.5rem;
}

.field {
  margin-bottom: 1rem;
}

button {
  width: 100%;
  margin-top: 0.5rem;
}

.box {
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--app-danger) 40%, var(--app-border));
  background: color-mix(in srgb, var(--app-danger) 12%, transparent);
  margin-bottom: 1rem;
}
</style>
