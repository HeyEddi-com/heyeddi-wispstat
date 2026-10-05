<template>
  <BreakdownList :title="title" :dim="dim" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import BreakdownList from './BreakdownList.vue';

const route = useRoute();
const dim = computed(() => String(route.params.dim || 'path'));
const titles: Record<string, string> = {
  path: 'Pages',
  entry: 'Entry pages',
  ref_host: 'Referrers',
  country: 'Countries',
  lang: 'Languages',
  device: 'Devices',
  browser: 'Browsers',
  os: 'Operating systems',
  event: 'Events',
};
const title = computed(() => titles[dim.value] || dim.value);
</script>
