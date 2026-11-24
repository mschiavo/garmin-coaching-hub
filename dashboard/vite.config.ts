import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES_BASE || '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }

          if (id.includes('/recharts/')) {
            return 'vendor-recharts';
          }

          if (id.includes('/d3-')) {
            return 'vendor-d3';
          }

          if (id.includes('/@supabase/') || id.includes('/@scure/')) {
            return 'vendor-supabase';
          }
        },
      },
    },
  },
});