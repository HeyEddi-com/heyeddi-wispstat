<template>
  <div class="claim">
    <div class="card">
      <h1>Claim This Instance</h1>
      <p class="subtitle">Set up your analytics instance</p>
      
      <form @submit.prevent="handleClaim">
        <div class="field">
          <label>Setup Token</label>
          <input 
            v-model="setupToken" 
            type="password" 
            placeholder="Enter SETUP_TOKEN from deployment"
            required
          />
        </div>
        
        <div class="field">
          <label>Email</label>
          <input 
            v-model="email" 
            type="email" 
            placeholder="your@email.com"
            required
          />
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
        
        <div v-if="error" class="error">{{ error }}</div>
        
        <button type="submit" :disabled="loading">
          {{ loading ? 'Claiming...' : 'Claim Instance' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

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
    
    router.push('/');
  } catch (err) {
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
  min-height: 80vh;
}

.card {
  background: #fff;
  border-radius: 8px;
  padding: 2rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

h1 {
  font-size: 1.75rem;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
  margin-bottom: 2rem;
}

.field {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

input:focus {
  outline: none;
  border-color: #4CAF50;
}

button {
  width: 100%;
  padding: 0.75rem;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: #45a049;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  background: #ffebee;
  color: #c62828;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}
</style>
