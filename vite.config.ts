import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // 依赖 @open-spaced-repetition/srs-kit 使用了 BigInt 字面量（ES2020），
  // target 低于 es2020 时 esbuild 会原样保留 0n，老浏览器会整包语法报错。
  // 兼容性由 src/engine/compat.ts 在运行时做特性检测兜底，不靠降低语法目标。
  build: { target: 'es2020', cssCodeSplit: false },
})
