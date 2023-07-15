import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src/index.ts', 'src/lib'],
    }),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    }
  },

  server: {
    port: 3000,
  },

  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib/index.ts'),
      name: 'InfiniteGalleryReact',
      formats: ['es', 'umd'],
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
          globals: {
              'react': 'React',
              'react-dom': 'ReactDOM',
          },
      },
    },
  }
})
