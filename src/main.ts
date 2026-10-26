import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

createApp(App).mount('#app')

// 動作確認用 (URL に ?debug を付けたときだけ公開する)
if (new URLSearchParams(location.search).has('debug')) {
  Promise.all([
    import('./store'),
    import('./schema'),
    import('./codegen'),
    import('./align'),
    import('./sceneHandle'),
  ]).then(([store, schema, codegen, align, handle]) => {
    ;(window as any).__app = {
      ...store,
      ...schema,
      generate: codegen.generate,
      align,
      sceneHandle: handle.sceneHandle,
    }
  })
}
