import { defineComponent, onBeforeUnmount, onMounted, unref, watch } from 'vue'
import * as THREE from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { ui } from '../store'
import { find, hostUid } from '../doc'
/** 自由視点の位置を覚えておく (視点を切り替えて戻ったとき・キャンバスを作り直したときに元の場所へ戻す) */
export const viewPose: { pos: number[] | null; target: number[] | null; skip: boolean } = {
  pos: null,
  target: null,
  skip: false,
}

/**
 * プレビューの視点操作 (Unity のシーンビューに合わせる)。
 *   右ドラッグ=回転 / 中ドラッグ=平行移動 / ホイール=ズーム
 *   Alt+左ドラッグ=回転 / Alt+右ドラッグ=ズーム / F=選択物に寄る
 * 書き出すコードには含まれない。
 */
export default defineComponent({
  name: 'ViewControls',
  setup() {
    const ctx = useTres() as any
    const { onBeforeRender } = useLoop()
    let pending = !!viewPose.pos && ui.view === 'free'
    let anim: null | {
      t: number
      from: THREE.Vector3
      to: THREE.Vector3
      fromT: THREE.Vector3
      toT: THREE.Vector3
    } = null
    let elapsed0 = -1
    // 自由視点のあいだ、毎フレーム姿勢を控える (視点の切り替えで作り直されるとき、その時点ではもう ui.view が変わっているため)
    let last: { pos: number[]; target: number[] | null } | null = null

    const buttons = (alt: boolean) => ({
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: alt ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE,
    })
    // OrbitControls より先 (キャプチャ段階) に、押されたボタンと Alt の状態で割り当てを切り替える
    function onDown(e: PointerEvent) {
      const c: any = unref(ctx.controls)
      if (c) c.mouseButtons = buttons(e.altKey)
    }
    let host: Element | null = null
    onMounted(() => {
      host = document.querySelector('.prev-canvas')
      host?.addEventListener('pointerdown', onDown as any, true)
    })
    onBeforeUnmount(() => {
      host?.removeEventListener('pointerdown', onDown as any, true)
      if (viewPose.skip) {
        viewPose.skip = false
        viewPose.pos = viewPose.target = null
        return
      }
      if (last) {
        viewPose.pos = last.pos
        viewPose.target = last.target
      }
    })

    function targets(): THREE.Object3D[] {
      const sc = unref(ctx.scene) as THREE.Scene
      const ids = new Set(
        (ui.sel.length ? ui.sel : ui.selected !== 'canvas' ? [ui.selected] : [])
          .filter((id) => find(id))
          .map(hostUid),
      )
      const out: THREE.Object3D[] = []
      if (ids.size) {
        sc.traverse((o) => {
          if (!o.userData.__helper && ids.has(o.userData.__uid)) out.push(o)
        })
      } else {
        // 何も選んでいなければ、シーン全体 (ライト・カメラ・補助線は除く)
        sc.children.forEach((o) => {
          if (
            !o.userData.__helper &&
            !(o as any).isLight &&
            !(o as any).isCamera &&
            !(o as any).isGridHelper &&
            !(o as any).isAxesHelper &&
            !(o as any).isTransformControlsRoot
          )
            out.push(o)
        })
      }
      return out
    }

    function frame() {
      const cam = unref(ctx.camera) as THREE.PerspectiveCamera | THREE.OrthographicCamera
      const c: any = unref(ctx.controls)
      if (!cam) return
      const box = new THREE.Box3()
      for (const o of targets()) {
        o.updateWorldMatrix(true, true)
        const b = new THREE.Box3().setFromObject(o)
        if (b.isEmpty())
          box.expandByPoint(o.getWorldPosition(new THREE.Vector3())).expandByScalar(0.5)
        else box.union(b)
      }
      if (box.isEmpty()) return
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      const r = Math.max(sphere.radius, 0.5)
      const fov = (cam as THREE.PerspectiveCamera).isPerspectiveCamera
        ? (cam as THREE.PerspectiveCamera).fov
        : 50
      const dist = (r / Math.sin((fov * Math.PI) / 360)) * 1.15
      const fromT = c?.target ? c.target.clone() : sphere.center.clone()
      const dir = cam.position.clone().sub(fromT)
      if (dir.lengthSq() < 1e-6) dir.set(1, 0.6, 1)
      dir.normalize()
      anim = {
        t: 0,
        from: cam.position.clone(),
        to: sphere.center.clone().addScaledVector(dir, dist),
        fromT,
        toT: sphere.center.clone(),
      }
      elapsed0 = -1
    }

    watch(() => ui.frameReq, frame)

    // 読み込み中の表示は、切り替え後に数フレーム描けたら消す
    let shown = 0
    watch(
      () => ui.busy,
      () => {
        shown = 0
      },
    )
    onBeforeRender(({ delta }) => {
      if (ui.busy && ++shown >= 4) ui.busy = ''
      if (ui.view === 'free' && !pending) {
        const cam0 = unref(ctx.camera) as THREE.Camera | undefined
        const c0: any = unref(ctx.controls)
        if (cam0)
          last = { pos: cam0.position.toArray(), target: c0?.target ? c0.target.toArray() : null }
      }
      if (pending) {
        const cam = unref(ctx.camera) as THREE.Camera | undefined
        const c: any = unref(ctx.controls)
        if (cam && c && viewPose.pos) {
          cam.position.fromArray(viewPose.pos)
          if (viewPose.target && c.target) c.target.fromArray(viewPose.target)
          c.update?.()
          pending = false
        }
      }
      if (!anim) return
      const cam = unref(ctx.camera) as THREE.Camera
      const c: any = unref(ctx.controls)
      anim.t = Math.min(1, anim.t + delta / 0.28)
      const k = 1 - Math.pow(1 - anim.t, 3)
      cam.position.lerpVectors(anim.from, anim.to, k)
      const tgt = new THREE.Vector3().lerpVectors(anim.fromT, anim.toT, k)
      if (c?.target) {
        c.target.copy(tgt)
        c.update?.()
      } else cam.lookAt(tgt)
      if (anim.t >= 1) anim = null
    })
    return () => null
  },
})
