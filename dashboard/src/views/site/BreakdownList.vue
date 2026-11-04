<template>
  <section class="card">
    <h2>{{ title }}</h2>
    <ul>
      <li v-for="row in rows" :key="row.k">{{ row.k }} — {{ row.pv || row.visitors || row.events }}</li>
      <li v-if="rows.length === 0">Nothing in this range.</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../../lib/api';
import { useRange } from '../../lib/range';

const props = defineProps<{ title: string; dim: string }>();
const route = useRoute();
const { qs } = useRange();
const rows = ref<Array<{ k: string; pv: number; visitors: number; events: number }>>([]);

async function load() {
  const id = route.params.siteId;
  const body = await api<{ data: typeof rows.value }>(`/api/v1/sites/${id}/breakdown?dim=${props.dim}&${qs.value}`);
  rows.value = body.data;
}

onMounted(load);
watch(qs, load);
</script>
