import { reactive, watch } from 'vue'
import { REG, type BlockDef, type CatId } from './schema'
import {
  canDrop,
  cloneNode,
  detach,
  doc,
  find,
  insert,
  isDescendant,
  newNode,
  type BNode,
  type Slot,
} from './doc'

// 画面の状態 (ui)・選択・ブロックの編集コマンド。木そのものの操作は doc.ts、取り消しと保存は history.ts

export const ui = reactive({
  /** 選択中のブロック (複数のときは最後に選んだもの。インスペクタとギズモの対象) */
  selected: 'canvas' as string,
  /** 選択中のブロックすべて (Ctrl/Shift クリックで複数選択) */
  sel: [] as string[],
  /** プレビューのギズモ: off=選択のみ (Q) / 移動 (W) / 回転 (E) / 拡大 (R) */
  gizmo: 'translate' as 'off' | 'translate' | 'rotate' | 'scale',
  space: 'world' as 'world' | 'local',
  /** プレビューの視点: 自由 = 作業用のカメラ / camera = ブロックのカメラから見た絵 */
  view: 'free' as 'free' | 'camera',
  /** ギズモが付いているブロック。その動き (回転・上下など) は、編集中だけ止める */
  gizmoUid: '' as string,
  /** 増えるたびに、プレビューが選択物 (なければ全体) に寄る (F) */
  frameReq: 0,
  /** 右クリックメニュー。uid が空なら作業台の空き地 */
  menu: null as null | { x: number; y: number; uid: string },
  /** 名前を変更中のブロック (F2・ダブルクリック) */
  editing: '' as string,
  /** ホバー中のブロック (ブロック欄・プレビューのどちらからでも。両方で強調する) */
  hover: '' as string,
  /** プレビューで選ばれたブロックを、ブロック欄でスクロールして見せるための合図 ("uid:時刻") */
  reveal: '' as string,
  /** ドラッグ中の対象。ドロップ先のハイライト判定に使う */
  drag: null as null | { defId?: string; uid?: string },
  /** 「＋ 動き」「＋ ブロック」を押して選んだ追加先。パレットのブロックを押すと、ここへ入る (uid が空ならシーン直下) */
  addTo: null as null | { uid: string; slot: Slot },
  /** パレットで開いている種類 */
  palCat: 'object' as CatId,
  /** 追加先を選んだ合図。画面が狭いとき、パレットのタブへ切り替える */
  addReq: 0,
  errors: {} as Record<string, string>,
  showCode: false,
  showJson: false,
  toast: '' as string,
  /** 重い切り替え (サンプルの読み込みなど) の最中は、プレビューに出す文言。空なら出さない */
  busy: '' as string,
  /** 自動保存の状態。at は最後に保存した時刻、restored は前回の続きから開いたとき true */
  save: { at: 0, ok: true, restored: false },
  /** ギズモで動かすとき、ほかのオブジェクトの面・中心・床に吸い付ける */
  snapObj: true,
  /** 「はじめに」の案内を出すか */
  intro: false,
})

// 直接 ui.selected を書き換えた場合も、複数選択の集合を食い違わせない
watch(
  () => ui.selected,
  (v) => {
    ui.addTo = null // 別のブロックを選んだら、追加先の指定は解く
    if (v === 'canvas') ui.sel = []
    else if (!ui.sel.includes(v)) ui.sel = [v]
  },
  { flush: 'sync' },
)

/** 追加先を選び、パレットをそれに合う種類へ移す */
export function startAdd(parent: BNode | null, slot: Slot) {
  ui.addTo = { uid: parent?.uid ?? '', slot }
  const pk = parent ? REG[parent.def].kind : ''
  ui.palCat =
    slot === 'geometry'
      ? 'geometry'
      : slot === 'material'
        ? 'material'
        : slot === 'behaviors'
          ? 'motion'
          : pk === 'composer'
            ? 'effect'
            : 'object'
  ui.addReq++
}
export const clearAdd = () => {
  ui.addTo = null
}
/** 選んだ追加先 (消えていたら null) */
export function addTarget(): null | { parent: BNode | null; slot: Slot } {
  const a = ui.addTo
  if (!a) return null
  if (!a.uid) return { parent: null, slot: a.slot }
  const f = find(a.uid)
  return f ? { parent: f.node, slot: a.slot } : null
}
export const isSelected = (id: string) => ui.selected === id || ui.sel.includes(id)

export const selectedInfo = () => (ui.selected === 'canvas' ? null : find(ui.selected))

/** ブロックを選び、閉じている親を開いて、ブロック欄で見える位置までスクロールさせる */
export function revealNode(id: string, mods?: { ctrl?: boolean; shift?: boolean }) {
  const chain: BNode[] = []
  const dfs = (nodes: BNode[]): boolean => {
    for (const n of nodes) {
      if (
        n.uid === id ||
        n.geometry?.uid === id ||
        n.material?.uid === id ||
        n.behaviors.some((b) => b.uid === id)
      ) {
        chain.push(n)
        return true
      }
      if (dfs(n.children)) {
        chain.push(n)
        return true
      }
    }
    return false
  }
  dfs(doc.children)
  for (const n of chain) if (n.collapsed) n.collapsed = undefined
  selectBlock(id, mods)
  ui.reveal = `${id}:${Date.now()}`
}

// ───────── 選択 (Unity と同じ: Ctrl=追加/解除、Shift=範囲) ─────────
let anchor = ''

/** 画面に見えている順のブロック一覧 (閉じたブロックの中は含まない) */
export function visibleOrder(): string[] {
  const out: string[] = []
  const rec = (nodes: BNode[]) => {
    for (const n of nodes) {
      out.push(n.uid)
      if (n.collapsed) continue
      if (n.geometry) out.push(n.geometry.uid)
      if (n.material) out.push(n.material.uid)
      n.behaviors.forEach((b) => out.push(b.uid))
      rec(n.children)
    }
  }
  rec(doc.children)
  return out
}

export function selectBlock(id: string, mods: { ctrl?: boolean; shift?: boolean } = {}) {
  if (mods.shift && anchor && find(anchor)) {
    const order = visibleOrder()
    const a = order.indexOf(anchor),
      b = order.indexOf(id)
    if (a >= 0 && b >= 0) {
      ui.sel = order.slice(Math.min(a, b), Math.max(a, b) + 1)
      ui.selected = id
      return
    }
  }
  if (mods.ctrl) {
    if (ui.sel.includes(id)) {
      ui.sel = ui.sel.filter((x) => x !== id)
      ui.selected = ui.sel[ui.sel.length - 1] ?? 'canvas'
    } else {
      ui.sel = [...ui.sel, id]
      ui.selected = id
    }
    anchor = id
    return
  }
  anchor = id
  ui.sel = [id]
  ui.selected = id
}

/** 選択中のうち、親も選ばれているものを除いた一覧 (まとめて消す・複製する対象) */
export function topSelection(): string[] {
  const ids = (ui.sel.length ? ui.sel : ui.selected !== 'canvas' ? [ui.selected] : []).filter(
    (id) => find(id),
  )
  return ids.filter((id) => !ids.some((o) => o !== id && isDescendant(find(o)!.node, id)))
}

/** 追加先を探す。選択中のブロックが入れ物なら中へ、そうでなければ同じ階層、だめなら最上位 */
export function defaultTarget(childDef: BlockDef): { parent: BNode | null; slot: Slot } {
  const k = childDef.kind
  const sel = selectedInfo()
  const host = sel?.node
  if (host) {
    const slotFor: Slot | null =
      k === 'geometry'
        ? 'geometry'
        : k === 'material'
          ? 'material'
          : k === 'behavior'
            ? 'behaviors'
            : null
    if (slotFor && canDrop(childDef, host, slotFor)) return { parent: host, slot: slotFor }
    if (slotFor && sel.parent && canDrop(childDef, sel.parent, slotFor))
      return { parent: sel.parent, slot: slotFor }
    if (!slotFor) {
      if (canDrop(childDef, host, 'children')) return { parent: host, slot: 'children' }
      if (sel.parent && sel.slot === 'children' && canDrop(childDef, sel.parent, 'children'))
        return { parent: sel.parent, slot: 'children' }
    }
  }
  return { parent: null, slot: 'children' }
}

export function addFromPalette(
  defId: string,
  target?: { parent: BNode | null; slot: Slot; index?: number },
): BNode | null {
  const def = REG[defId]
  if (!def) return null
  let t = target ?? defaultTarget(def)
  // エフェクトは必ずコンポーザーの中。無ければ作る
  if (def.kind === 'effect' && !(t.parent && REG[t.parent.def].kind === 'composer')) {
    let comp = doc.children.find((n) => REG[n.def].kind === 'composer')
    if (!comp) {
      comp = newNode('post:Composer')
      doc.children.push(comp)
    }
    t = { parent: comp, slot: 'children' }
  }
  if (!canDrop(def, t.parent, t.slot)) {
    flash('ここには置けません')
    return null
  }
  // 形状・素材は1つだけ。置き換え
  const node = newNode(defId)
  insert(node, t.parent, t.slot, (t as any).index ?? -1)
  ui.addTo = null
  ui.selected = node.uid
  if (t.parent) t.parent.collapsed = false
  return node
}

export function moveNode(id: string, parent: BNode | null, slot: Slot, index = -1) {
  const f = find(id)
  if (!f) return
  if (parent && (parent.uid === id || isDescendant(f.node, parent.uid))) {
    flash('自分の中には移動できません')
    return
  }
  if (!canDrop(REG[f.node.def], parent, slot)) {
    flash('ここには置けません')
    return
  }
  // 同じ一覧の中で後ろへ動かすとき、取り除いた分だけ位置がずれる
  let idx = index
  if (f.list && idx >= 0) {
    const same =
      (slot === f.slot || (f.slot === 'root' && !parent && slot === 'children')) &&
      f.parent === parent
    if (same && f.list.indexOf(f.node) < idx) idx -= 1
  }
  detach(id)
  insert(f.node, parent, slot, idx)
  ui.selected = id
}

export function removeNode(id: string) {
  const f = find(id)
  if (!f) return
  detach(id)
  ui.sel = ui.sel.filter((x) => x !== id)
  if (ui.selected === id || !find(ui.selected)) ui.selected = f.parent?.uid ?? 'canvas'
}

function dup(id: string): BNode | null {
  const f = find(id)
  if (!f) return null
  const c = cloneNode(f.node)
  if (f.list) {
    f.list.splice(f.list.indexOf(f.node) + 1, 0, c)
  } else if (f.parent) {
    insert(c, f.parent, f.slot as Slot)
  }
  return c
}

export function duplicateNode(id: string) {
  const c = dup(id)
  if (c) selectBlock(c.uid)
}

/** 選択中のブロックをまとめて削除 */
export function removeSelected() {
  const ids = topSelection()
  if (!ids.length) return
  const parentId = find(ids[0])?.parent?.uid
  for (const id of ids) detach(id)
  ui.sel = []
  ui.selected = parentId && find(parentId) ? parentId : 'canvas'
}

/** 選択中のブロックをまとめて複製。複製したものが選ばれる */
export function duplicateSelected() {
  const made = topSelection().map(dup).filter(Boolean) as BNode[]
  if (!made.length) return
  ui.sel = made.map((n) => n.uid)
  ui.selected = made[made.length - 1].uid
  flash(made.length > 1 ? `${made.length} 個を複製しました` : '複製しました')
}

// ── コピー & 貼り付け
let clip: string[] = []
export const hasClip = () => clip.length > 0

export function copySelected() {
  const ids = topSelection()
  if (!ids.length) return false
  clip = ids.map((id) => JSON.stringify(find(id)!.node))
  flash(ids.length > 1 ? `${ids.length} 個をコピーしました` : 'コピーしました')
  return true
}

/** 選択中のブロックと同じ階層の、すぐ後ろに貼り付ける (選択がなければ最上位の末尾) */
export function pasteClip() {
  if (!clip.length) return
  const made: BNode[] = []
  const sel = ui.selected !== 'canvas' ? find(ui.selected) : null
  let offset = 0
  for (const json of clip) {
    const c = cloneNode(JSON.parse(json))
    const def = REG[c.def]
    let t: { parent: BNode | null; slot: Slot; index: number } | null = null
    if (sel) {
      const slot = (sel.slot === 'root' ? 'children' : sel.slot) as Slot
      if (canDrop(def, sel.parent, slot))
        t = {
          parent: sel.parent,
          slot,
          index: sel.list ? sel.list.indexOf(sel.node) + 1 + offset : -1,
        }
    }
    if (!t) {
      const d = defaultTarget(def)
      if (canDrop(def, d.parent, d.slot)) t = { ...d, index: -1 }
    }
    if (!t) {
      flash('ここには貼り付けできません')
      continue
    }
    insert(c, t.parent, t.slot, t.index)
    offset++
    made.push(c)
  }
  if (!made.length) return
  ui.sel = made.map((n) => n.uid)
  ui.selected = made[made.length - 1].uid
}

/** 選択中のブロックを、まとめて無効 / 有効にする */
export function toggleOffSelected() {
  const nodes = topSelection().map((id) => find(id)!.node)
  if (!nodes.length) return
  const to = !nodes.every((n) => n.off)
  for (const n of nodes) n.off = to || undefined
}

const TOAST_MS = 2200 // 通知を出しておく時間
let toastTimer: any
export function flash(msg: string) {
  ui.toast = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (ui.toast = ''), TOAST_MS)
}
