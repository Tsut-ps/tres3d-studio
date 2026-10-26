import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 単一HTMLにまとめて出力する（公開・配布を簡単にするため）
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
})
