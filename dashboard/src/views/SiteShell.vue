<template>
  <div>
    <p><router-link to="/">All sites</router-link></p>
    <nav class="subnav">
      <router-link :to="link('')">Overview</router-link>
      <router-link :to="link('live')">Live</router-link>
      <router-link :to="link('sources')">Sources</router-link>
      <router-link :to="link('goals')">Goals</router-link>
      <router-link :to="link('breakdown/path')">Pages</router-link>
      <router-link :to="link('breakdown/event')">Events</router-link>
      <router-link :to="link('breakdown/lang')">Languages</router-link>
      <router-link :to="link('utm')">UTM links</router-link>
      <router-link :to="link('export')">Export</router-link>
      <router-link :to="link('settings')">Settings</router-link>
    </nav>
    <form class="toolbar" @submit.prevent="apply">
      <label>From <input v-model="fromInput" type="date" /></label>
      <label>To <input v-model="toInput" type="date" /></label>
      <button type="submit">Apply</button>
    </form>
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useRange } from '../lib/range';

const route = useRoute();
const { from, to, setRange } = useRange();
const fromInput = ref(from.value);
const toInput = ref(to.value);

watch([from, to], () => {
  fromInput.value = from.value;
  toInput.value = to.value;
});

function link(suffix: string) {
  const path = suffix ? `/sites/${route.params.siteId}/${suffix}` : `/sites/${route.params.siteId}`;
  return { path, query: route.query };
}

function apply() {
  setRange(fromInput.value, toInput.value);
}
</script>
