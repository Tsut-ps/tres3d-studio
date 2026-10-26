import { defineComponent, onBeforeUnmount, onMounted, unref } from 'vue'
import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { useLoop, useTres } from '@tresjs/core'
import { find, holdHistory, propDefOf, setProp, ui, type BNode } from '../store'
import { REG } from '../schema'
import { pointerState } from '../SceneNode'
import { sceneHandle } from '../sceneHandle'
import { collectPlanes, isMovable, snapObject, type SnapHit, type SnapPlanes } from '../align'

/**
 * プレビュー専用のギズモ (移動・回転・拡大の矢印)。
 * 選択中のオブジェクトにつけて、ドラッグした結果をそのままブロックのプロパティへ書き戻す。
 * 同じ階層で一緒に選んだブロックにも、同じ変化量を足す。書き出すコードには含まれない。
 */
const r4 = (n: number) => Math.round(n * 1e4) / 1e4
const SNAP = { translate: 0.5, rotate: THREE.MathUtils.degToRad(15), scale: 0.1 }
type Vec = [number, number, number]

export default defineComponent({
  name: 'GizmoLayer',
  setup() {
    const { scene, camera, renderer, controls } = useTres()
    const { onBeforeRender } = useLoop()
    let tc: any = null
    let root: THREE.Object3D | null = null
    let obj: THREE.Object3D | null = null
    let uid = ''
    let retryAt = 0
    let ctrl = false
    let planes: SnapPlanes | null = null
    let guides: THREE.LineSegments | null = null
    let others: { node: BNode; pos: Vec; rot: Vec; sc: Vec }[] = []
    let start = { pos: [0, 0, 0] as Vec, rot: [0, 0, 0] as Vec, sc: [1, 1, 1] as Vec }

    const onKeyChange = (e: KeyboardEvent) => {
      ctrl = e.ctrlKey || e.metaKey
    }
    onMounted(() => {
      window.addEventListener('keydown', onKeyChange)
      window.addEventListener('keyup', onKeyChange)
    })

    const cam = () => unref(camera) as THREE.Camera
    function ensure() {
      if (tc) return tc
      const dom = ((unref(renderer) as any)?.domElement ??
        document.querySelector('.prev-canvas canvas')) as HTMLElement
      if (!dom) return null
      tc = new TransformControls(cam(), dom)
      tc.size = 0.85
      root = tc.getHelper()
      root.userData.__helper = true
      ;(unref(scene) as THREE.Scene).add(root)
      tc.addEventListener('dragging-changed', (e: any) => {
        const c: any = unref(controls)
        if (c) c.enabled = !e.value
        // ギズモのドラッグは、その後のクリックで別のブロックを選んでしまわないよう「動いた」扱いにする
        if (e.value) {
          pointerState.moved = true
          snapshotStart()
          planes =
            ui.snapObj && tc.mode === 'translate' && obj
              ? collectPlanes(obj, new Set(ui.sel))
              : null
        } else {
          planes = null
          showGuides([])
        }
        holdHistory(!!e.value)
      })
      tc.addEventListener('objectChange', onChange)
      return tc
    }

    const vec = (v: THREE.Vector3 | THREE.Euler): Vec => [r4(v.x), r4(v.y), r4((v as any).z)]
    const getv = (n: BNode, key: string, fb: Vec): Vec =>
      Array.isArray(n.props[key])
        ? ([...n.props[key]] as Vec)
        : ((REG[n.def]?.propMap[key]?.def as Vec | undefined) ?? fb)

    function snapshotStart() {
      const f = find(uid)
      if (!f) return
      start = {
        pos: getv(f.node, 'position', [0, 0, 0]),
        rot: getv(f.node, 'rotation', [0, 0, 0]),
        sc: getv(f.node, 'scale', [1, 1, 1]),
      }
      // 一緒に選んでいる、同じ親のブロック
      others = ui.sel
        .filter((id) => id !== uid)
        .map((id) => find(id))
        .filter(
          (o): o is NonNullable<typeof o> =>
            !!o &&
            o.parent === f.parent &&
            o.slot === f.slot &&
            !!REG[o.node.def]?.propMap.position,
        )
        .map((o) => ({
          node: o.node,
          pos: getv(o.node, 'position', [0, 0, 0]),
          rot: getv(o.node, 'rotation', [0, 0, 0]),
          sc: getv(o.node, 'scale', [1, 1, 1]),
        }))
    }

    function write(n: BNode, key: string, v: Vec) {
      const pd = propDefOf(n, key)
      if (pd) setProp(n.props, pd, v.map(r4))
    }

    function onChange() {
      const f = find(uid)
      if (!f || !obj) return
      const mode = tc.mode as 'translate' | 'rotate' | 'scale'
      if (mode === 'translate') {
        // Ctrl を押しているあいだは、グリッドへの吸着を優先する
        if (planes && !ctrl) showGuides(snapObject(obj, planes, threshold()))
        else if (planes) showGuides([])
        const p = vec(obj.position)
        write(f.node, 'position', p)
        for (const o of others)
          write(o.node, 'position', [
            o.pos[0] + p[0] - start.pos[0],
            o.pos[1] + p[1] - start.pos[1],
            o.pos[2] + p[2] - start.pos[2],
          ])
      } else if (mode === 'rotate') {
        const r = vec(obj.rotation)
        write(f.node, 'rotation', r)
        for (const o of others)
          write(o.node, 'rotation', [
            o.rot[0] + r[0] - start.rot[0],
            o.rot[1] + r[1] - start.rot[1],
            o.rot[2] + r[2] - start.rot[2],
          ])
      } else {
        const s = vec(obj.scale)
        write(f.node, 'scale', s)
        const k = (a: number, b: number) => (Math.abs(b) < 1e-6 ? 1 : a / b)
        for (const o of others)
          write(o.node, 'scale', [
            o.sc[0] * k(s[0], start.sc[0]),
            o.sc[1] * k(s[1], start.sc[1]),
            o.sc[2] * k(s[2], start.sc[2]),
          ])
      }
    }

    /** 吸着の距離: 画面で約 10px 分 */
    function threshold() {
      const c = cam() as THREE.PerspectiveCamera
      const dom = sceneHandle.dom
      const h = dom?.clientHeight || 600
      if ((c as any).isOrthographicCamera) return 10 / ((c as any).zoom || 1) / 50
      const d = c.position.distanceTo(obj!.getWorldPosition(new THREE.Vector3()))
      return (10 * 2 * d * Math.tan(THREE.MathUtils.degToRad(c.fov / 2))) / h
    }
    const AXC = [0xff6b6b, 0x5ee08a, 0x6bb0ff]
    /** そろえた線を、プレビューに一時的に描く (書き出すコードには入らない) */
    function showGuides(hits: SnapHit[]) {
      const sc = unref(scene) as THREE.Scene
      if (!hits.length) {
        if (guides) guides.visible = false
        return
      }
      if (!guides) {
        guides = new THREE.LineSegments(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }),
        )
        guides.userData.__helper = true
        guides.renderOrder = 999
        guides.frustumCulled = false
        sc.add(guides)
      }
      const pos: number[] = [],
        col: number[] = []
      for (const h of hits) {
        const c = new THREE.Color(AXC[h.axis])
        pos.push(h.mine.x, h.mine.y, h.mine.z, h.theirs.x, h.theirs.y, h.theirs.z)
        col.push(c.r, c.g, c.b, c.r, c.g, c.b)
      }
      guides.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      guides.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      guides.visible = true
    }

    function detach() {
      if (tc?.object) tc.detach()
      obj = null
      uid = ''
      if (ui.gizmoUid) ui.gizmoUid = ''
    }

    /** ギズモを付けられるブロックか (位置を持つ three のオブジェクト・ライト・カメラ) */
    const eligible = isMovable

    onBeforeRender(({ elapsed }) => {
      const sc = unref(scene) as THREE.Scene | undefined
      if (!sc) return
      sceneHandle.scene = sc
      sceneHandle.camera = cam()
      sceneHandle.dom = ((unref(renderer) as any)?.domElement ?? null) as HTMLElement | null
      const want =
        ui.selected !== 'canvas' && ui.gizmo !== 'off' && eligible(ui.selected) ? ui.selected : ''
      if (!want) {
        if (tc) detach()
        return
      }
      const t = ensure()
      if (!t) return
      t.camera = cam()
      if (uid !== want || (obj && !obj.parent)) {
        detach()
        uid = want
        retryAt = 0
      }
      if (!obj) {
        if (elapsed < retryAt) return
        retryAt = elapsed + 0.3
        let found: THREE.Object3D | null = null
        sc.traverse((o) => {
          if (!found && !o.userData.__helper && o.userData.__uid === uid) found = o
        })
        if (!found) return
        // カメラ視点で見ているカメラ自身には、ギズモが出せない (視点そのものなので)
        if (found === cam()) return
        obj = found
        t.attach(obj)
      }
      t.setMode(ui.gizmo)
      t.setSpace(ui.gizmo === 'scale' ? 'local' : ui.space)
      t.setTranslationSnap(ctrl ? SNAP.translate : null)
      t.setRotationSnap(ctrl ? SNAP.rotate : null)
      t.setScaleSnap(ctrl ? SNAP.scale : null)
      if (ui.gizmoUid !== uid) ui.gizmoUid = uid
    })

    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onKeyChange)
      window.removeEventListener('keyup', onKeyChange)
      if (tc) {
        tc.detach()
        root?.removeFromParent()
        tc.dispose()
      }
      if (guides) {
        guides.removeFromParent()
        guides.geometry.dispose()
        ;(guides.material as THREE.Material).dispose()
      }
      sceneHandle.scene = null
      sceneHandle.camera = null
      sceneHandle.dom = null
      ui.gizmoUid = ''
      holdHistory(false)
    })
    return () => null
  },
})
