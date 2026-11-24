import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { isPublishableKey } from './src/supabaseKey';

export default defineConfig(({ mode }) => {
  const key = loadEnv(mode, process.cwd()).VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (key && !isPublishableKey(key)) throw new Error('Configurare una chiave Supabase publishable o anon.');
  return {
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
            id.includes('/scheduler/') ||
            id.includes('/react-is/') ||
            id.includes('/use-sync-external-store/')
          ) {
            return 'vendor-react';
          }

          if (['/@reduxjs/','/react-redux/','/redux/','/redux-thunk/','/reselect/','/immer/'].some(part=>id.includes(part))) {
            return 'vendor-state';
          }

          if (id.includes('/recharts/')) {
            return 'vendor-recharts';
          }

          if (id.includes('/d3-') || id.includes('/victory-vendor/')) {
            return 'vendor-d3';
          }

          if (id.includes('/@supabase/') || id.includes('/@scure/')) {
            return 'vendor-supabase';
          }
        },
      },
    },
  },
  };
});
