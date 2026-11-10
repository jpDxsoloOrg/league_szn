import { defineConfig, mergeConfig } from 'vite';
import { HttpsProxyAgent } from 'https-proxy-agent';
import baseConfig from './vite.config';

/**
 * Local preview against the dev API. The dev API only allows the dev site's
 * origin, so requests go through this server's proxy. Not used by any build.
 *
 *   VITE_API_BASE_URL=/remote-api npx vite --mode devtest --config vite.config.devdata.ts
 */
const DEV_API_ORIGIN = 'https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com';
const DEV_SITE_ORIGIN = 'https://dev.leagueszn.jpdxsolo.com';
const outboundProxy = process.env.HTTPS_PROXY;

export default mergeConfig(baseConfig, defineConfig({
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/remote-api': {
        target: DEV_API_ORIGIN,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/remote-api/, '/devtest'),
        headers: { origin: DEV_SITE_ORIGIN },
        ...(outboundProxy ? { agent: new HttpsProxyAgent(outboundProxy) } : {}),
      },
    },
  },
}));
