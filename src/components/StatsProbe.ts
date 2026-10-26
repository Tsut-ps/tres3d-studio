import { defineComponent, reactive } from 'vue'
import { useLoop } from '@tresjs/core'

export const perf = reactive({ fps: 0 })

/** キャンバスの内側に置いて、フレームレートを測る */
export default defineComponent({
  name: 'StatsProbe',
  setup() {
    const { onBeforeRender } = useLoop()
    let acc = 0
    let frames = 0
    onBeforeRender(({ delta }) => {
      acc += delta
      frames++
      if (acc >= 0.5) { perf.fps = Math.round(frames / acc); acc = 0; frames = 0 }
    })
    return () => null
  },
})
