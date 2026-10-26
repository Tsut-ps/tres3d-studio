import { defineComponent, onBeforeUnmount, unref } from 'vue'
import * as THREE from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { ui } from '../store'
import { hostUid } from '../doc'
/**
 * プレビュー専用の目印。
 * 選択中のブロックは黄色、ホバー中のブロックは水色で、対応する物体を枠や形で示す。
 * (ライトは光源の形、カメラは視錐台、それ以外はバウンディングボックス)
 * 書き出すコードには含まれない。
 */
const COLORS = { sel: 0xffd84a, hover: 0x6fd3ff }

interface Slot {
  uid: string
  helper: THREE.Object3D | null
  target: THREE.Object3D | null
  retryAt: number
}

function makeHelper(obj: any, color: number): THREE.Object3D | null {
  let h: any = null
  if (obj.isDirectionalLight) h = new THREE.DirectionalLightHelper(obj, 1.2, color)
  else if (obj.isPointLight) h = new THREE.PointLightHelper(obj, 0.35, color)
  else if (obj.isSpotLight) h = new THREE.SpotLightHelper(obj, color)
  else if (obj.isHemisphereLight) h = new THREE.HemisphereLightHelper(obj, 0.8, color)
  else if (obj.isLight)
    return null // 環境光は位置を持たない
  else if (obj.isCamera) h = new THREE.CameraHelper(obj)
  else h = new THREE.BoxHelper(obj, color)
  if (obj.isCamera) h.setColors?.(color, color, color, color, color)
  h.userData.__helper = true
  h.renderOrder = 999
  h.frustumCulled = false
  h.raycast = () => {} // ポインタ操作の邪魔をしない
  h.traverse((o: any) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of ms) {
      m.depthTest = false
      m.transparent = true
      m.toneMapped = false
      m.fog = false
      m.opacity = 0.95
    }
    o.raycast = () => {}
  })
  return h
}

export default defineComponent({
  name: 'HighlightLayer',
  setup() {
    const { scene, camera } = useTres()
    const { onBeforeRender } = useLoop()
    const sels = new Map<string, Slot>()
    const hoverSlot: Slot = { uid: '', helper: null, target: null, retryAt: 0 }

    const drop = (s: Slot) => {
      if (s.helper) {
        s.helper.removeFromParent()
        s.helper.traverse((o: any) => {
          o.geometry?.dispose?.()
          const m = o.material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else m?.dispose?.()
        })
      }
      s.helper = null
      s.target = null
    }
    const findObj = (sc: THREE.Object3D, id: string) => {
      let r: THREE.Object3D | null = null
      sc.traverse((o) => {
        if (!r && !o.userData.__helper && o.userData.__uid === id) r = o
      })
      return r
    }

    function sync(s: Slot, color: number, want: string, now: number) {
      const sc = unref(scene) as THREE.Scene | undefined
      if (!sc) return
      if (s.uid !== want) {
        drop(s)
        s.uid = want
        s.retryAt = 0
      }
      if (!want) return
      // 対象が作り直された (親から外れた) ときは探し直す
      if (s.target && !s.target.parent) drop(s)
      if (!s.target) {
        if (now < s.retryAt) return
        s.retryAt = now + 0.3
        s.target = findObj(sc, want)
        if (!s.target) return
        // 見ているカメラ自身の枠は、画面いっぱいに出てしまうので出さない
        s.helper = s.target === unref(camera) ? null : makeHelper(s.target, color)
        if (s.helper) sc.add(s.helper)
      }
      const h: any = s.helper
      if (!h) return
      if (h.isBoxHelper) {
        const box = new THREE.Box3().setFromObject(s.target as THREE.Object3D)
        h.visible = !box.isEmpty()
        if (h.visible) h.update()
      } else h.update?.()
    }

    onBeforeRender(({ elapsed }) => {
      // 選択中のブロックすべて (複数選択に対応)
      const ids = ui.sel.length ? ui.sel : ui.selected === 'canvas' ? [] : [ui.selected]
      const want = new Set(ids.map(hostUid).filter(Boolean))
      for (const [id, s] of sels)
        if (!want.has(id)) {
          drop(s)
          sels.delete(id)
        }
      for (const id of want) {
        let s = sels.get(id)
        if (!s) {
          s = { uid: id, helper: null, target: null, retryAt: 0 }
          sels.set(id, s)
        }
        sync(s, COLORS.sel, id, elapsed)
      }
      const hov = ui.hover ? hostUid(ui.hover) : ''
      sync(hoverSlot, COLORS.hover, hov && !want.has(hov) ? hov : '', elapsed)
    })
    onBeforeUnmount(() => {
      for (const s of sels.values()) drop(s)
      drop(hoverSlot)
    })
    return () => null
  },
})
