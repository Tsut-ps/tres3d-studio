import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

// npm run build         … dist/ に分けて出力する。どこに置いても動くよう、相対パスで読み込む
// npm run build:single  … dist/index.html の 1 ファイルにまとめる (メールで送る・単体で配るとき用)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [vue(), mode === 'single' && viteSingleFile()],
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
}))
