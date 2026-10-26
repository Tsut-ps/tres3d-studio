import { BEHAVIOR_HOSTS, REG } from '../blocks/schema'
import { redo, undo } from '../model/history'
import { canRename, find } from '../model/doc'
import {
  clearAdd,
  copySelected,
  duplicateSelected,
  flash,
  pasteClip,
  removeSelected,
  selectBlock,
  ui,
  visibleOrder,
} from '../model/store'
import { useWindowListener } from './useInteraction'

// キーボードショートカット (Unity に合わせている)。README の操作表と対応する

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
const hasBody = (id: string) => {
  const n = find(id)?.node
  const d = n && REG[n.def]
  return (
    !!d &&
    !['geometry', 'material', 'behavior'].includes(d.kind) &&
    (!!d.slots || BEHAVIOR_HOSTS.includes(d.kind))
  )
}
const TOOL_KEYS: Record<string, 'off' | 'translate' | 'rotate' | 'scale'> = {
  q: 'off',
  w: 'translate',
  e: 'rotate',
  r: 'scale',
}

/** ↑↓ で見えている順に選択を動かす (Shift で範囲)。← で閉じる / 親へ、→ で開く / 中へ */
function arrow(e: KeyboardEvent) {
  const order = visibleOrder()
  if (!order.length) return
  const cur = ui.selected === 'canvas' ? -1 : order.indexOf(ui.selected)
  let to = ''
  if (e.key === 'ArrowDown') to = order[Math.min(order.length - 1, cur + 1)]
  else if (e.key === 'ArrowUp') to = cur <= 0 ? order[0] : order[cur - 1]
  else if (cur >= 0) {
    const f = find(ui.selected)
    if (e.key === 'ArrowLeft') {
      if (hasBody(ui.selected) && !f?.node.collapsed) {
        f!.node.collapsed = true
        return
      }
      to = f?.parent?.uid ?? ''
    } else if (e.key === 'ArrowRight') {
      if (f?.node.collapsed) {
        f.node.collapsed = undefined
        return
      }
      to = order[cur + 1] ?? ''
    }
  } else if (e.key === 'ArrowRight') to = order[0]
  if (!to || to === ui.selected) return
  selectBlock(to, { shift: e.shiftKey })
  ui.reveal = `${to}:${Date.now()}`
}

function onKey(e: KeyboardEvent) {
  if (document.querySelector('dialog[open]')) return
  const mod = e.metaKey || e.ctrlKey
  const k = e.key.toLowerCase()
  if (mod && k === 'z' && !typing(e.target)) {
    e.preventDefault()
    e.shiftKey ? redo() : undo()
    return
  }
  if (mod && k === 'y' && !typing(e.target)) {
    e.preventDefault()
    redo()
    return
  }
  if (typing(e.target)) return
  if (ui.menu) return
  if (mod && k === 'd') {
    e.preventDefault()
    duplicateSelected()
    return
  }
  // 文字を選んでいるときの Ctrl+C は、ふつうのコピーに任せる
  if (mod && k === 'c' && !window.getSelection()?.toString()) {
    if (copySelected()) e.preventDefault()
    return
  }
  if (mod && k === 'v') {
    e.preventDefault()
    pasteClip()
    return
  }
  if (mod && k === 'a') {
    e.preventDefault()
    ui.sel = visibleOrder()
    ui.selected = ui.sel[ui.sel.length - 1] ?? 'canvas'
    return
  }
  if (mod || e.altKey) return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (ui.selected !== 'canvas') {
      e.preventDefault()
      removeSelected()
    }
    return
  }
  if (e.key === 'Escape') {
    if (ui.addTo) {
      clearAdd()
      return
    }
    ui.selected = 'canvas'
    return
  }
  if (e.key === 'F2') {
    if (ui.selected !== 'canvas' && canRename(ui.selected)) {
      e.preventDefault()
      ui.editing = ui.selected
    }
    return
  }
  if (k === 'f') {
    if (ui.view === 'camera') flash('カメラ視点では寄れません。自由視点に切り替えてください')
    else ui.frameReq++
    return
  }
  if (TOOL_KEYS[k]) {
    ui.gizmo = TOOL_KEYS[k]
    return
  }
  if (e.key.startsWith('Arrow') && !(e.target as HTMLElement | null)?.closest?.('.split')) {
    e.preventDefault()
    arrow(e)
  }
}

/** ショートカットを有効にする (App で 1 回だけ呼ぶ) */
export function useShortcuts() {
  useWindowListener('keydown', onKey)
}
