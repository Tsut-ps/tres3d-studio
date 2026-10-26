import { reactive, watch } from 'vue'
import { doc, find, syncUidCounter, type BNode } from './doc'
import { ui } from './store'

// ───────── 履歴・保存 ─────────
const KEY = 'tres-blocks:v1' // localStorage のキー
const HISTORY_LIMIT = 120 // 取り消しで戻れる最大の回数
const SAVE_DELAY_MS = 350 // 編集が止まってから履歴・保存を取るまでの待ち
const stack: string[] = []
let cursor = -1
const hist = reactive({ cursor: -1, len: 0 })
const sync = () => {
  hist.cursor = cursor
  hist.len = stack.length
}
let restoring = false
let held = false
let timer: any

const snapshot = () => JSON.stringify({ canvas: doc.canvas, children: doc.children })

export function loadSnapshot(json: string) {
  const data = JSON.parse(json)
  restoring = true
  doc.canvas = data.canvas ?? {}
  doc.children = data.children ?? []
  restoring = false
  if (ui.selected !== 'canvas' && !find(ui.selected)) ui.selected = 'canvas'
  ui.sel = ui.sel.filter((id) => find(id))
}

function pushHistory() {
  const s = snapshot()
  if (stack[cursor] === s) return
  stack.length = cursor + 1
  stack.push(s)
  if (stack.length > HISTORY_LIMIT) stack.shift()
  cursor = stack.length - 1
  sync()
  try {
    localStorage.setItem(KEY, s)
    ui.save.at = Date.now()
    ui.save.ok = true
  } catch {
    ui.save.ok = false /* 保存できない環境 (プライベートモードなど) */
  }
}
function flush() {
  if (timer) {
    clearTimeout(timer)
    timer = null
    pushHistory()
  }
}

/** ギズモのドラッグ中は履歴を止め、離したときに 1 回だけ記録する (途中の位置まで元に戻さないため) */
export function holdHistory(on: boolean) {
  held = on
  if (!on) {
    clearTimeout(timer)
    timer = null
    pushHistory()
  }
}

export function undo() {
  flush()
  if (cursor > 0) {
    cursor--
    sync()
    loadSnapshot(stack[cursor])
  }
}
export function redo() {
  flush()
  if (cursor < stack.length - 1) {
    cursor++
    sync()
    loadSnapshot(stack[cursor])
  }
}
export const canUndo = () => hist.cursor > 0
export const canRedo = () => hist.cursor < hist.len - 1

export function resetDoc(next: { canvas: Record<string, any>; children: BNode[] }) {
  flush()
  doc.canvas = next.canvas
  doc.children = next.children
  // 前のブロックに結び付いた一時状態は、すべて捨てる
  ui.selected = 'canvas'
  ui.sel = []
  ui.gizmoUid = ''
  ui.addTo = null
  ui.menu = null
  ui.editing = ''
  ui.hover = ''
  ui.drag = null
  ui.errors = {}
  pushHistory()
}

export function initStore(fallback: () => { canvas: Record<string, any>; children: BNode[] }) {
  let loaded = false
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      loadSnapshot(raw)
      loaded = doc.children.length > 0 || Object.keys(doc.canvas).length > 0
      ui.save.restored = loaded
    }
  } catch {
    /* 読めなければサンプルから始める */
  }
  if (!loaded) {
    const d = fallback()
    doc.canvas = d.canvas
    doc.children = d.children
  }
  pushHistory()
  watch(
    () => snapshot(),
    () => {
      if (restoring || held) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        pushHistory()
      }, SAVE_DELAY_MS)
    },
    { flush: 'post' },
  )
  // 最大の連番を引き継ぐ (複製時の重複を避ける)
  syncUidCounter()
}
