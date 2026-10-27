import { reactive } from 'vue'
import {
  REG,
  CANVAS_PROPS,
  BEHAVIOR_HOSTS,
  type BlockDef,
  type Kind,
  type PropDef,
} from '../blocks/schema'

// ブロックの木 (文書) のモデル。画面の状態には触れない。
// 画面の状態 (選択・ui) は store.ts、取り消しと自動保存は history.ts

// ───────── 型 ─────────
export interface BNode {
  uid: string
  def: string
  props: Record<string, any>
  geometry: BNode | null
  material: BNode | null
  children: BNode[]
  behaviors: BNode[]
  collapsed?: boolean
  /** 一時的に無効 (プレビューに出さない) */
  off?: boolean
}
export type Slot = 'children' | 'geometry' | 'material' | 'behaviors'
export interface Doc {
  canvas: Record<string, any>
  children: BNode[]
}

let counter = 0
/** 読み込んだ文書の数だけ連番を進める (複製したときに uid が重ならないように) */
export const syncUidCounter = () => walk(doc.children, () => counter++)
export const uid = () => `n${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const doc = reactive<Doc>({ canvas: {}, children: [] })

// ───────── 検索 ─────────
export interface Found {
  node: BNode
  list: BNode[] | null
  parent: BNode | null
  slot: Slot | 'root'
}

export function find(
  id: string,
  nodes: BNode[] = doc.children,
  parent: BNode | null = null,
): Found | null {
  for (const n of nodes) {
    if (n.uid === id) return { node: n, list: nodes, parent, slot: parent ? 'children' : 'root' }
    if (n.geometry?.uid === id) return { node: n.geometry, list: null, parent: n, slot: 'geometry' }
    if (n.material?.uid === id) return { node: n.material, list: null, parent: n, slot: 'material' }
    const b = n.behaviors.find((x) => x.uid === id)
    if (b) return { node: b, list: n.behaviors, parent: n, slot: 'behaviors' }
    const r = find(id, n.children, n)
    if (r) return r
  }
  return null
}

export function isDescendant(ancestor: BNode, id: string): boolean {
  return (
    !!find(id, ancestor.children) ||
    ancestor.geometry?.uid === id ||
    ancestor.material?.uid === id ||
    ancestor.behaviors.some((b) => b.uid === id)
  )
}

export function walk(
  nodes: BNode[],
  fn: (n: BNode, parent: BNode | null) => void,
  parent: BNode | null = null,
) {
  for (const n of nodes) {
    fn(n, parent)
    if (n.geometry) fn(n.geometry, n)
    if (n.material) fn(n.material, n)
    n.behaviors.forEach((b) => fn(b, n))
    walk(n.children, fn, n)
  }
}

/** 形状・素材・動きのブロックは、持ち主 (メッシュなど) のブロックを返す。プレビューで光らせる対象の判定に使う */
export function hostUid(id: string): string {
  const f = find(id)
  if (!f) return ''
  return f.slot === 'geometry' || f.slot === 'material' || f.slot === 'behaviors'
    ? (f.parent?.uid ?? '')
    : f.node.uid
}

// ───────── 作成 ─────────
const SWATCH = [
  '#5b8def',
  '#ef6b5b',
  '#f0b429',
  '#34b88a',
  '#b36cf0',
  '#ee6aa7',
  '#4cc3d9',
  '#9aa5b4',
]
let swatchIdx = 0

export function newNode(
  defId: string,
  overrides: Record<string, any> = {},
  withAuto = true,
): BNode {
  const def = REG[defId]
  const n: BNode = {
    uid: uid(),
    def: defId,
    props: { ...(def.init ?? {}), ...overrides },
    geometry: null,
    material: null,
    children: [],
    behaviors: [],
  }
  if (withAuto && def.auto) {
    if (def.auto.geometry) n.geometry = newNode(def.auto.geometry, {}, false)
    if (def.auto.material) {
      const extra =
        def.auto.material === 'three:MeshStandardMaterial'
          ? { color: SWATCH[swatchIdx++ % SWATCH.length], roughness: 0.45, metalness: 0.1 }
          : {}
      n.material = newNode(def.auto.material, extra, false)
    }
  }
  if (def.kind === 'composer') n.props = { ...n.props }
  return n
}

export function cloneNode(n: BNode): BNode {
  const c: BNode = JSON.parse(JSON.stringify(n))
  const reid = (x: BNode) => {
    x.uid = uid()
    x.geometry && reid(x.geometry)
    x.material && reid(x.material)
    x.behaviors.forEach(reid)
    x.children.forEach(reid)
  }
  reid(c)
  return c
}

// ───────── ドロップ規則 ─────────
const ROOT_KINDS: Kind[] = [
  'camera',
  'controls',
  'light',
  'object',
  'helper',
  'staging',
  'world',
  'composer',
]

export function canDrop(childDef: BlockDef, parent: BNode | null, slot: Slot): boolean {
  if (!parent) return slot === 'children' && ROOT_KINDS.includes(childDef.kind)
  const pd = REG[parent.def]
  if (slot === 'geometry') return childDef.kind === 'geometry' && !!pd.slots?.geometry
  if (slot === 'material')
    return childDef.kind === 'material' && pd.slots?.material === childDef.matFor
  if (slot === 'behaviors') return childDef.kind === 'behavior' && BEHAVIOR_HOSTS.includes(pd.kind)
  return !!pd.slots?.children && !!pd.childKinds?.includes(childDef.kind)
}

// ───────── 変更操作 ─────────
export function detach(id: string): BNode | null {
  const f = find(id)
  if (!f) return null
  if (f.slot === 'geometry' && f.parent) {
    f.parent.geometry = null
    return f.node
  }
  if (f.slot === 'material' && f.parent) {
    f.parent.material = null
    return f.node
  }
  if (f.list) {
    f.list.splice(f.list.indexOf(f.node), 1)
    return f.node
  }
  return null
}

export function insert(node: BNode, parent: BNode | null, slot: Slot, index = -1) {
  if (slot === 'geometry' && parent) {
    parent.geometry = node
    return
  }
  if (slot === 'material' && parent) {
    parent.material = node
    return
  }
  const list =
    slot === 'behaviors' && parent ? parent.behaviors : parent ? parent.children : doc.children
  if (index < 0 || index > list.length) list.push(node)
  else list.splice(index, 0, node)
}

/** 同じ階層の中で、上 (-1) か下 (+1) へ1つ動かす */
export function moveSibling(id: string, dir: -1 | 1) {
  const f = find(id)
  if (!f || !f.list) return
  const i = f.list.indexOf(f.node)
  const j = i + dir
  if (j < 0 || j >= f.list.length) return
  f.list.splice(i, 1)
  f.list.splice(j, 0, f.node)
}

export const canRename = (id: string) => {
  const n = find(id)?.node
  return !!n && !!REG[n.def]?.propMap.name
}
export const nameOf = (n: BNode) =>
  typeof n.props.name === 'string' && n.props.name ? n.props.name : (REG[n.def]?.label ?? n.def)
export function renameNode(id: string, name: string) {
  const n = find(id)?.node
  const pd = n && REG[n.def]?.propMap.name
  if (!n || !pd) return
  const v = name.trim()
  if (v) n.props.name = v
  else delete n.props.name
}

const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)

export function propDefOf(node: BNode | null, key: string): PropDef | undefined {
  return node ? REG[node.def]?.propMap[key] : CANVAS_PROPS.find((p) => p.key === key)
}

export function setProp(props: Record<string, any>, def: PropDef, value: any) {
  if (value === undefined || (same(value, def.def) && def.def !== undefined)) delete props[def.key]
  else props[def.key] = value
}

export function resetAll(props: Record<string, any>) {
  for (const k of Object.keys(props)) delete props[k]
}

/**
 * 画面に加わるコンポーザーか。
 * エフェクトが 1 つも入っていない・enabled が false のコンポーザーは、画面に何も出さず、
 * プレビューが止まって見える (ライブラリの仕様)。そのため、プレビューにも書き出しにも入れない。
 */
export function composerActive(n: BNode): boolean {
  return n.props.enabled !== false && n.children.some((c) => !c.off)
}
