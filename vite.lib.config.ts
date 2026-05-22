import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Vite library-mode build config.
// Produces:
//   dist/index.js    (ESM)
//   dist/index.cjs   (CommonJS)
//   dist/index.d.ts  (TypeScript declarations, emitted by tsc separately)
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib/index.ts'),
      name: 'vFDIO',
      formats: ['es', 'cjs'],
      fileName: (format) => format === 'es' ? 'index.js' : 'index.cjs',
    },
    rollupOptions: {
      // Don't bundle peer deps — the consumer provides them
      external: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'react-redux',
        '@reduxjs/toolkit',
        'react-router-dom',
      ],
      output: {
        globals: {
          react: 'React',
          'react/jsx-runtime': 'ReactJSXRuntime',
          'react-dom': 'ReactDOM',
          'react-redux': 'ReactRedux',
          '@reduxjs/toolkit': 'RTK',
          'react-router-dom': 'ReactRouterDOM',
        },
      },
    },
    outDir: 'pkg-dist',
    // Keep source maps for debugging from the host app
    sourcemap: true,
  },
});
