import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Claim from './views/Claim.vue';
import Login from './views/Login.vue';
import Overview from './views/Overview.vue';
import Docs from './views/Docs.vue';
import SiteShell from './views/SiteShell.vue';
import Summary from './views/site/Summary.vue';
import Live from './views/site/Live.vue';
import Sources from './views/site/Sources.vue';
import Goals from './views/site/Goals.vue';
import Funnels from './views/site/Funnels.vue';
import Retention from './views/site/Retention.vue';
import Breakdown from './views/site/Breakdown.vue';
import Utm from './views/site/Utm.vue';
import Export from './views/site/Export.vue';
import Settings from './views/site/Settings.vue';
import Visits from './views/site/Visits.vue';
import Heatmaps from './views/site/Heatmaps.vue';
import Embed from './views/Embed.vue';
import { authReady, authed, loadConfig, refreshAuth } from './lib/session';

const publicWhenClaimed = new Set(['/login', '/docs']);

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Overview },
    { path: '/docs', component: Docs },
    { path: '/instructions', redirect: '/docs' },
    { path: '/claim', component: Claim },
    { path: '/login', component: Login },
    { path: '/embed/:siteId', component: Embed },
    {
      path: '/sites/:siteId',
      component: SiteShell,
      children: [
        { path: '', component: Summary },
        { path: 'live', component: Live },
        { path: 'visits', component: Visits },
        { path: 'heatmaps', component: Heatmaps },
        { path: 'sources', component: Sources },
        { path: 'goals', component: Goals },
        { path: 'funnels', component: Funnels },
        { path: 'retention', component: Retention },
        { path: 'breakdown/:dim', component: Breakdown },
        { path: 'utm', component: Utm },
        { path: 'export', component: Export },
        { path: 'settings', component: Settings },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.path.startsWith('/embed')) return true;
  const config = await loadConfig().catch(() => ({ claimed: false, auth_providers: ['local'] }));
  if (!config.claimed && to.path !== '/claim') return '/claim';
  if (config.claimed && to.path === '/claim') return '/';
  if (!config.claimed) return true;

  if (!authReady.value) await refreshAuth();

  const isPublic = publicWhenClaimed.has(to.path);
  if (!authed.value && !isPublic) return '/login';
  if (authed.value && to.path === '/login') return '/';
  return true;
});

createApp(App).use(router).mount('#app');
