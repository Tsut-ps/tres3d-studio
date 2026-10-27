import { defineComponent, nextTick, watch } from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import { doc, composerActive, walk } from '../model/doc'
import { REG } from '../blocks/schema'

/**
 * コンポーザーが無くなったとき、描画の仕方を普通の描画に戻す。
 *
 * エフェクトコンポーザーは、置かれると描画の仕方を自分のものに差し替える。
 * ところが、取り除かれても元に戻さないため、そのままだと画面が更新されなくなる。
 */
export default defineComponent({
  name: 'RenderFallback',
  setup() {
    const { render } = useLoop()
    const { scene, camera, renderer } = useTresContext()

    const hasComposer = () => {
      let found = false
      walk(doc.children, (n) => {
        if (!n.off && REG[n.def]?.kind === 'composer' && composerActive(n)) found = true
      })
      return found
    }
    watch(hasComposer, async (now, was) => {
      if (now || !was) return
      await nextTick()
      render((notifyFrameRendered: () => void) => {
        const cam = camera.activeCamera.value
        if (!cam || !renderer.instance) return
        renderer.instance.render(scene.value, cam)
        notifyFrameRendered()
      })
    })
    return () => null
  },
})
