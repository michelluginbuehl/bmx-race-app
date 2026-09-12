import { defineConfig } from 'vite';

// Preview deployments can never connect to production data, even with a URL flag.
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_ENVIRONMENT': JSON.stringify(
      process.env.VERCEL_ENV === 'production' ||
      (!process.env.VERCEL_ENV && process.env.BMX_APP_ENVIRONMENT === 'production')
        ? 'production' : 'test'
    ),
  },
});
