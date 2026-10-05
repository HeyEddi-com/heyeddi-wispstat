import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Claim from './views/Claim.vue';
import Overview from './views/Overview.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Overview },
    { path: '/claim', component: Claim },
  ],
});

createApp(App).use(router).mount('#app');
