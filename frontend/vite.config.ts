import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    // Enable source maps for production debugging
    sourcemap: true,
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
    // Remove console.log and debugger in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})
