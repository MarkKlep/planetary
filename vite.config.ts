import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = __dirname;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: `${rootDir}/index.html`,
        heatmap: `${rootDir}/heatmap.html`,
      },
    },
  },
});