import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // Declarations come from `tsc --emitDeclarationOnly`, not tsup.
  //
  // tsup builds .d.ts with rollup-plugin-dts, which imports the TypeScript
  // compiler API from the `typescript` main entry. TypeScript 7 is the native
  // port: its exports map resolves "." to ./lib/version.cjs, which exports
  // only { version, versionMajorMinor }. `ts.sys` is undefined there, so
  // rollup-plugin-dts throws
  //   TypeError: Cannot read properties of undefined
  //     (reading 'useCaseSensitiveFileNames')
  // The compiler API moved behind `typescript/unstable/*`; this is a
  // deliberate removal, not a bug that a tsup release will fix.
  //
  // tsup's JS output is esbuild-only and needs no TypeScript API, so it runs
  // fine on 7.x. See the `build` script for the declaration step.
  dts: false,
})
