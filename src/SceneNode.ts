import {
  defineComponent,
  h,
  inject,
  onErrorCaptured,
  ref,
  shallowRef,
  Suspense,
  type InjectionKey,
  type PropType,
} from 'vue'
import { useLoop } from '@tresjs/core'
import { REG, type BlockDef } from './schema'
import { ui, revealNode } from './store'
import { type BNode } from './doc'
import { makeTexture, type TexDesc } from './textures'
import { SafeSoftShadows } from './previewOnly'

/** プレビューのドラッグ (視点操作) の直後にクリック扱いされないよう、Preview が更新する */
export const pointerState = { moved: false, ctrl: false, shift: false, alt: false }

export interface SceneInfo {
  cameraUid: string | null
  /** ブロックのカメラから見ているか */ useScene?: boolean
}
export const SCENE_INFO: InjectionKey<{ value: SceneInfo }> = Symbol('scene-info')

/** 未設定のプロパティは既定値を返す */
export function val(n: BNode, key: string, fallback?: any) {
  return n.props[key] ?? REG[n.def]?.propMap[key]?.def ?? fallback
}

/** 再コンパイルが必要なマテリアル設定は、変わったらマテリアルを作り直す */
const REBUILD_KEYS = [
  'flatShading',
  'vertexColors',
  'alphaTest',
  'alphaHash',
  'fog',
  'dithering',
  'premultipliedAlpha',
  'toneMapped',
  'transparent',
  'wireframe',
  'side',
  'shadowSide',
  'forceSinglePass',
  'alphaToCoverage',
]
function rebuildSig(n: BNode) {
  const sig: any[] = REBUILD_KEYS.map((k) => n.props[k])
  for (const [k, v] of Object.entries(n.props))
    if (REG[n.def]?.propMap[k]?.type === 'texture') sig.push(k, !!v)
  return JSON.stringify(sig)
}

/**
 * 入れ子のパス (shadow-mapSize など) に配列を渡すと、TresJS は Vector を .set() せず配列で置き換えてしまう。
 * そのため成分ごとに分けて渡す: shadow-mapSize-x / shadow-mapSize-y
 */
export function expandAttr(key: string, value: any): [string, any][] {
  // TresJS は camelCase 化に radashi を使い、大文字が連続するキー (stencilZFail, iridescenceIOR) を
  // stencilZfail / iridescenceIor に壊してしまう。kebab にすれば元の名前に戻る
  if (/[A-Z]{2}/.test(key) && !key.includes('-'))
    key = key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
  if (key.includes('-') && Array.isArray(value))
    return value.map((v, i) => [`${key}-${'xyzw'[i]}`, v] as [string, any])
  return [[key, value]]
}

/** ブロックのプロパティを、TresJS に渡す属性に変換する */
export function buildAttrs(n: BNode, def: BlockDef) {
  const attrs: Record<string, any> = {}
  for (const [key, v] of Object.entries(n.props)) {
    const pd = def.propMap[key]
    if (!pd || def.argKeys?.includes(key)) continue
    if (pd.type === 'texture') {
      const t = makeTexture(v as TexDesc, key)
      if (t) attrs[key] = t
    } else for (const [k, x] of expandAttr(key, v)) attrs[k] = x
  }
  if (def.argKeys) attrs.args = def.argKeys.map((k) => val(n, k))
  if (def.attach) attrs.attach = def.attach
  return attrs
}

const hsl = (h_: number, s: number, l: number) =>
  `hsl(${(((h_ % 1) + 1) % 1) * 360}, ${s * 100}%, ${l * 100}%)`

export const SceneNode = defineComponent({
  name: 'SceneNode',
  props: { node: { type: Object as PropType<BNode>, required: true } },
  setup(props) {
    const info = inject(SCENE_INFO, { value: { cameraUid: null } } as any)
    const objRef = shallowRef<any>(null)
    const hoverK = { v: 0 }
    const hovering = ref(false)
    const toggled = ref(false)
    let jumpAt = -1
    let animated = false
    let lastElapsed = 0
    const { onBeforeRender } = useLoop()

    const target = () => {
      let o = objRef.value
      if (!o) return null
      if (!o.isObject3D) o = o.instance ?? o.value ?? o.group ?? null
      return o?.isObject3D ? o : null
    }

    onBeforeRender(({ elapsed, delta }) => {
      lastElapsed = elapsed
      const n = props.node
      const bs = n.behaviors.filter((b) => !b.off)
      if (!bs.length) {
        // 動きを外した直後は、動いていた途中の位置・向きが残るので、プロパティの値に戻す
        if (animated) {
          animated = false
          const o0 = target()
          if (o0) {
            const p = val(n, 'position', [0, 0, 0]),
              r = val(n, 'rotation', [0, 0, 0]),
              k = val(n, 'scale', [1, 1, 1])
            o0.position.set(p[0], p[1], p[2])
            o0.rotation.set(r[0], r[1], r[2])
            o0.scale.set(k[0], k[1], k[2])
          }
        }
        return
      }
      animated = true
      const o = target()
      if (!o) return
      const bpos = val(n, 'position', [0, 0, 0]),
        brot = val(n, 'rotation', [0, 0, 0]),
        bsc = val(n, 'scale', [1, 1, 1])
      // ギズモで編集しているあいだは動きを止めて、プロパティの値のまま見せる (Unity の編集モードと同じ)
      if (ui.gizmoUid === n.uid) {
        o.position.set(bpos[0], bpos[1], bpos[2])
        o.rotation.set(brot[0], brot[1], brot[2])
        o.scale.set(bsc[0], bsc[1], bsc[2])
        return
      }
      const pos = [...bpos],
        rot = [...brot],
        sc = [...bsc]
      let mul = 1
      const AX: any = { x: 0, y: 1, z: 2 }
      for (const b of bs) {
        const P = (k: string) => val(b, k)
        switch (b.def) {
          case 'bhv:spin': {
            const s = P('speed')
            rot[0] += s[0] * elapsed
            rot[1] += s[1] * elapsed
            rot[2] += s[2] * elapsed
            break
          }
          case 'bhv:bob':
            pos[AX[P('axis')]] +=
              P('amplitude') * Math.sin(elapsed * Math.PI * 2 * P('frequency') + P('phase'))
            break
          case 'bhv:orbit': {
            const a = elapsed * P('speed') + P('phase'),
              r = P('radius'),
              c = P('center')
            const [i, j] = P('plane') === 'xz' ? [0, 2] : P('plane') === 'xy' ? [0, 1] : [1, 2]
            pos[0] = c[0]
            pos[1] = c[1]
            pos[2] = c[2]
            pos[i] += Math.cos(a) * r
            pos[j] += Math.sin(a) * r
            break
          }
          case 'bhv:pulse':
            mul *= 1 + P('amount') * Math.sin(elapsed * Math.PI * 2 * P('frequency'))
            break
          case 'bhv:colorCycle': {
            const mat = Array.isArray(o.material) ? o.material[0] : o.material
            mat?.color?.set(hsl(elapsed * P('speed'), P('saturation'), P('lightness')))
            break
          }
          case 'bhv:hover': {
            hoverK.v += ((hovering.value ? 1 : 0) - hoverK.v) * Math.min(1, delta * 12)
            mul *= 1 + (P('scale') - 1) * hoverK.v
            break
          }
          case 'bhv:click': {
            if (P('action') === 'toggleScale' && toggled.value) mul *= P('scale')
            if (P('action') === 'jump' && jumpAt >= 0) {
              const t = elapsed - jumpAt
              if (t < 0.7) pos[1] += Math.abs(Math.sin((t / 0.7) * Math.PI)) * 1.2
            }
            break
          }
        }
      }
      o.position.set(pos[0], pos[1], pos[2])
      o.rotation.set(rot[0], rot[1], rot[2])
      o.scale.set(sc[0] * mul, sc[1] * mul, sc[2] * mul)
    })

    onErrorCaptured((err) => {
      ui.errors[props.node.uid] = (err as Error)?.message ?? String(err)
      return false
    })

    const child = (c: BNode) => h(SceneNode, { node: c, key: c.uid })

    return () => {
      const n = props.node
      const def = REG[n.def]
      if (!def || n.off) return null
      delete ui.errors[n.uid]
      const attrs = buildAttrs(n, def)
      // SoftShadows はシェーダーを書き換えるので、値の変更時は付け直す専用ラッパーを使う
      if (n.def === 'vue:SoftShadows')
        return h(SafeSoftShadows, { ...attrs, sig: JSON.stringify(n.props) })

      // ── 材質・形状 (末端)
      if (def.kind === 'world') {
        // Fog などは引数 (near/far…) を後から差し替えられないので、変わったら作り直す
        return h(def.tag, { ...attrs, key: JSON.stringify(attrs.args) })
      }
      if (def.kind === 'geometry' || def.kind === 'material') {
        return h(def.source === 'vue' ? def.comp : def.tag, attrs)
      }
      if (def.kind === 'controls' && info.value.useScene) return null // カメラ視点では視点操作を付けない
      if (def.kind === 'effect' || def.kind === 'controls') {
        if (def.kind === 'controls') attrs.makeDefault = attrs.makeDefault ?? true
        return h(def.comp, attrs)
      }
      if (def.source === 'custom') return h(def.comp, attrs)

      // ── 子を持つもの
      const kids: any[] = []
      if (def.slots?.geometry && n.geometry && !n.geometry.off) kids.push(child(n.geometry))
      // 形状が空のメッシュ等は、頂点が 0 個の形状を付けておく (形状が無いと TresJS 内部が position を読んで例外を出す)
      else if (def.slots?.geometry && def.source === 'three') {
        kids.push(
          h('TresBufferGeometry', { key: 'no-geometry' }, [
            h('TresBufferAttribute', {
              attach: 'attributes-position',
              args: [new Float32Array(0), 3],
            }),
          ]),
        )
      }
      if (def.slots?.material && n.material && !n.material.off) {
        kids.push(h(SceneNode, { node: n.material, key: n.material.uid + rebuildSig(n.material) }))
      }
      for (const c of n.children) if (!c.off) kids.push(child(c))

      if (def.kind === 'composer') {
        return h(Suspense, null, { default: () => h(def.comp, attrs, { default: () => kids }) })
      }

      if (def.kind === 'camera')
        attrs.makeDefault = !!info.value.useScene && info.value.cameraUid === n.uid

      // ── プレビューとブロックの対応: three のオブジェクトに uid を持たせる (枠の表示に使う)
      if (def.source === 'three' && ['object', 'light', 'camera', 'helper'].includes(def.kind)) {
        attrs.userData = { ...(attrs.userData ?? {}), __uid: n.uid }
      }
      // 形のあるオブジェクトは、プレビューでクリックするとブロックが選ばれ、ホバーでブロック欄も光る
      const pickable = def.source === 'three' && def.kind === 'object' && n.def !== 'three:Group'

      // ── 動きブロックに必要なイベント
      const bs = n.behaviors.filter((b) => !b.off)
      const hasHover = bs.some((b) => b.def === 'bhv:hover')
      if (hasHover || pickable) {
        attrs.onPointerenter = () => {
          hovering.value = true
          if (pickable) ui.hover = n.uid
        }
        attrs.onPointerleave = () => {
          hovering.value = false
          if (pickable && ui.hover === n.uid) ui.hover = ''
        }
      }
      const click = bs.find((b) => b.def === 'bhv:click')
      if (click || pickable) {
        attrs.onClick = (e: any) => {
          if (pointerState.moved || pointerState.alt) return
          if (pickable) {
            e?.stopPropagation?.()
            revealNode(n.uid, { ctrl: pointerState.ctrl, shift: pointerState.shift })
          }
          if (!click) return
          const a = val(click, 'action')
          const o = target()
          if (a === 'toggleScale') toggled.value = !toggled.value
          else if (a === 'jump') jumpAt = lastElapsed
          else if (a === 'randomColor') {
            const mat = Array.isArray(o?.material) ? o.material[0] : o?.material
            mat?.color?.set(hsl(Math.random(), 0.7, 0.55))
          }
        }
      }

      if (def.source === 'vue') {
        return h(def.comp, { ...attrs, ref: objRef }, { default: () => kids })
      }
      return h(def.tag, { ...attrs, ref: objRef }, kids)
    }
  },
})
