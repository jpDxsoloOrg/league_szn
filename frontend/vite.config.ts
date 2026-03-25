import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
const devPort = Number(process.env.VITE_DEV_PORT ?? 3000)
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3001'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: devPort,
    proxy: {
      '/dev': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    // Generate source maps for error tracking but don't expose them in built output
    sourcemap: 'hidden',
    // Split vendor chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // React core libraries
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Internationalization
          'i18n-vendor': ['i18next', 'react-i18next'],
          // AWS/Auth libraries
          'aws-vendor': ['aws-amplify', 'amazon-cognito-identity-js'],
        },
      },
    },
  },
  esbuild: {
    // Remove console.log/debug in production (preserves console.error/warn for logger utility)
    pure: process.env.NODE_ENV === 'production' ? ['console.log', 'console.debug'] : [],
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
  },
})
