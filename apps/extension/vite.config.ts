import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@cmt-autofill/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
});
