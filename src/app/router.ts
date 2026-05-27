import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from './layout/AppLayout.vue';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          redirect: { name: 'messages' },
        },
        {
          path: 'charts',
          name: 'charts',
          component: () => import('@/pages/ChartPage.vue'),
        },
        {
          path: 'messages',
          name: 'messages',
          component: () => import('@/pages/MessagesPage.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/pages/SettingsPage.vue'),
        },
        {
          path: 'service/calls',
          name: 'service.calls',
          component: () => import('@/pages/service/CallsPage.vue'),
        },
      ],
    },
  ],
});
