import { defineComponent, onBeforeUnmount, onMounted, unref, watch } from 'vue'
import * as THREE from 'three'
import { useTres } from '@tresjs/core'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * 通信不要のスタジオ環境光。three.js 付属の RoomEnvironment から環境マップを作り、
 * scene.environment に設定する。金属やガラスの映り込みに使う。
 */
export const StudioEnv = defineComponent({
  name: 'StudioEnv',
  props: {
    intensity: { type: Number, default: 1 },
    background: { type: Boolean, default: false },
    blurriness: { type: Number, default: 0 },
    backgroundIntensity: { type: Number, default: 1 },
  },
  setup(props) {
    const ctx: any = useTres()
    let target: THREE.WebGLRenderTarget | null = null
    let prevEnv: THREE.Texture | null = null
    let prevBg: any = null

    const getScene = (): THREE.Scene | undefined => unref(ctx.scene)
    const getRenderer = (): any => {
      const r = unref(ctx.renderer)
      return r?.instance ? unref(r.instance) : r
    }

    function apply() {
      const scene: any = getScene()
      if (!scene || !target) return
      scene.environment = target.texture
      scene.environmentIntensity = props.intensity
      if (props.background) {
        scene.background = target.texture
        scene.backgroundBlurriness = props.blurriness
        scene.backgroundIntensity = props.backgroundIntensity
      } else if (scene.background === target.texture) {
        scene.background = prevBg
      }
    }

    onMounted(() => {
      const renderer = getRenderer()
      const scene: any = getScene()
      if (!renderer || !scene) return
      prevEnv = scene.environment
      prevBg = scene.background
      const pmrem = new THREE.PMREMGenerator(renderer)
      const room = new RoomEnvironment()
      target = pmrem.fromScene(room, 0.04)
      pmrem.dispose()
      room.dispose?.()
      apply()
    })
    watch(
      () => [props.intensity, props.background, props.blurriness, props.backgroundIntensity],
      apply,
    )
    onBeforeUnmount(() => {
      const scene: any = getScene()
      if (scene && target) {
        if (scene.environment === target.texture) scene.environment = prevEnv
        if (scene.background === target.texture) scene.background = prevBg
      }
      target?.dispose()
    })
    return () => null
  },
})
