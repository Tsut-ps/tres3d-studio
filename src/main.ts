import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

createApp(App).mount('#app')

// 動作確認用 (URL に ?debug を付けたときだけ公開する)
if (new URLSearchParams(location.search).has('debug')) {
  Promise.all([
    import('./model/store'),
    import('./model/doc'),
    import('./model/history'),
    import('./model/layout'),
    import('./blocks/schema'),
    import('./exportCode'),
    import('./preview/align'),
    import('./preview/sceneHandle'),
  ]).then(([store, docModel, history, layoutModel, schema, exportCode, align, handle]) => {
    ;(window as any).__app = {
      ...store,
      ...docModel,
      ...history,
      ...layoutModel,
      ...schema,
      generate: exportCode.generate,
      align,
      sceneHandle: handle.sceneHandle,
    }
  })
}
