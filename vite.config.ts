import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { PrimeVueResolver } from '@primevue/auto-import-resolver';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    Components({
      resolvers: [PrimeVueResolver()],
      dts: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
          @use "@/shared/assets/sakai/layout/variables/_common" as *;
          @use "@/shared/assets/sakai/layout/variables/_dark" as *;
          @use "@/shared/assets/sakai/layout/variables/_light" as *;
        `
      }
    },
  },
  optimizeDeps: {
    // include: ['primevue', 'primeicons'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('/primevue/') || id.includes('/@primevue/') || id.includes('/primeicons/')) {
            return 'vendor-prime';
          }

          if (id.includes('/vue/') || id.includes('/vue-router/') || id.includes('/pinia/')) {
            return 'vendor-vue';
          }

          if (id.includes('/@tanstack/')) {
            return 'vendor-tanstack';
          }

          if (id.includes('/chart.js/')) {
            return 'vendor-chart';
          }

          return 'vendor-misc';
        },
      },
    },
  },
});
