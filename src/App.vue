<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { REVISION } from 'three'
import Palette from './components/Palette.vue'
import Workspace from './components/Workspace.vue'
import Inspector from './components/Inspector.vue'
import Preview from './components/Preview.vue'
import CodeView from './components/CodeView.vue'
import JsonDialog from './components/JsonDialog.vue'
import Ico from './components/Ico.vue'
import { SAMPLES } from './model/samples'
import ContextMenu from './components/ContextMenu.vue'
import {
  copySelected,
  duplicateSelected,
  pasteClip,
  clearAdd,
  removeSelected,
  selectBlock,
  ui,
  flash,
  visibleOrder,
} from './model/store'
import { canRename, doc, find } from './model/doc'
import { canRedo, canUndo, initStore, redo, resetDoc, undo } from './model/history'
import { BEHAVIOR_HOSTS, REG } from './blocks/schema'
import { setTextureLoadedHandler } from './blocks/textures'
import { layout, LIMITS, resetLayout } from './model/layout'

initStore(() => SAMPLES[0].build())
setTextureLoadedHandler(() => {
  /* 画像の読み込み完了。TresJS 側が次フレームで反映する */
})

const tab = ref<'pal' | 'ws' | 'insp'>('ws')
const menu = ref<HTMLDetailsElement | null>(null)
const toastEl = ref<HTMLElement | null>(null)
// 通知は最前面の層 (top layer) に出す。ダイアログが開いていても隠れない。出すたびに開き直して、直前に開いた層より上に積む
watch(
  () => ui.toast,
  (t) => {
    const el = toastEl.value as any
    if (!t || !el?.showPopover) return
    try {
      if (el.matches(':popover-open')) el.hidePopover()
      el.showPopover()
    } catch {
      /* 古いブラウザでは z-index だけで出す */
    }
  },
)

// 「＋ 動き」などを押したら、画面が狭いときはパレットのタブへ移す
watch(
  () => ui.addReq,
  () => {
    tab.value = 'pal'
  },
)

// 重いシーンは、組み立て・シェーダーの準備で一瞬止まることがある。先にメニューを閉じて「読み込み中」を描いてから切り替える
const LOADING_PAINT_MS = 120 // 「読み込み中」を描くために待つ上限
const LOADING_MAX_MS = 8000 // 描画の合図が来なくても、表示を消すまでの時間
let busyTimer: any
async function loadSample(i: number) {
  const s = SAMPLES[i]
  if (menu.value) menu.value.open = false
  ui.busy = `「${s.label}」を読み込み中…`
  await Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    new Promise((r) => setTimeout(r, LOADING_PAINT_MS)),
  ])
  resetDoc(s.build())
  flash(`「${s.label}」を読み込みました`)
  clearTimeout(busyTimer)
  busyTimer = setTimeout(() => {
    ui.busy = ''
  }, LOADING_MAX_MS) // 描画の合図が来なくても、表示は必ず消す
}

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
function onDragEnd() {
  ui.drag = null
}

// ── 領域の境界をドラッグして、プレビューの大きさを調整する
const main = ref<HTMLElement | null>(null)
const splitting = ref<'' | 'v' | 'h'>('')
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
function startSplit(kind: 'v' | 'h', e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  splitting.value = kind
  layout.wide = false
  const move = (ev: PointerEvent) => {
    const r = main.value?.getBoundingClientRect()
    if (!r) return
    if (kind === 'v')
      layout.rightW = Math.round(
        clamp(r.right - ev.clientX - 6, LIMITS.rightMin, r.width * LIMITS.rightMaxRatio),
      )
    else
      layout.prevH =
        Math.round(
          clamp(
            ((ev.clientY - r.top - 6) / r.height) * 1000,
            LIMITS.prevMin * 10,
            LIMITS.prevMax * 10,
          ),
        ) / 10
  }
  const up = () => {
    splitting.value = ''
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}
function keySplit(kind: 'v' | 'h', e: KeyboardEvent) {
  const step = e.shiftKey ? 4 : 1
  if (kind === 'v' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    layout.wide = false
    layout.rightW = clamp(
      layout.rightW + (e.key === 'ArrowLeft' ? 1 : -1) * 24 * step,
      LIMITS.rightMin,
      1200,
    )
    e.preventDefault()
  } else if (kind === 'h' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    layout.wide = false
    layout.prevH = clamp(
      layout.prevH + (e.key === 'ArrowDown' ? 1 : -1) * 3 * step,
      LIMITS.prevMin,
      LIMITS.prevMax,
    )
    e.preventDefault()
  }
}

const savedText = computed(() => {
  if (!ui.save.ok) return '保存できません'
  if (ui.save.at)
    return `自動保存 ${new Date(ui.save.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
  return ui.save.restored ? '前回の続き' : '自動保存'
})
onMounted(() => {
  if (ui.save.restored) flash('前回の続きから開きました')
  else {
    try {
      ui.intro = localStorage.getItem('tres-blocks:intro') !== 'done'
    } catch {
      ui.intro = true
    }
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('dragend', onDragEnd)
  window.addEventListener('drop', onDragEnd)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('dragend', onDragEnd)
  window.removeEventListener('drop', onDragEnd)
})
</script>

<template>
  <div class="app">
    <header class="hdr">
      <div class="brand">
        <span class="logo" aria-hidden="true"><i /><i /><i /></span>
        <h1>Tres3D Studio</h1>
        <small>TresJS 5 · three r{{ REVISION }}</small>
      </div>
      <span
        class="saved"
        :class="{ bad: !ui.save.ok }"
        :title="
          ui.save.ok
            ? '編集するたびに、このブラウザの中へ自動で保存します。次に開いたとき、続きから始まります'
            : 'このブラウザでは保存できません (プライベートモードなど)。大事なものは JSON で控えてください'
        "
      >
        <Ico :name="ui.save.ok ? 'check' : 'x'" :size="13" />{{ savedText }}
      </span>
      <span class="grow" />
      <button
        class="btn ghost"
        type="button"
        :disabled="!canUndo()"
        title="元に戻す (Ctrl+Z)"
        @click="undo"
      >
        <Ico name="undo" /><span class="lbl">元に戻す</span>
      </button>
      <button
        class="btn ghost"
        type="button"
        :disabled="!canRedo()"
        title="やり直す (Ctrl+Y)"
        @click="redo"
      >
        <Ico name="redo" /><span class="lbl">やり直す</span>
      </button>
      <details ref="menu" class="menu">
        <summary class="btn ghost"><Ico name="layers" /><span class="lbl">サンプル</span></summary>
        <ul>
          <li v-for="(s, i) in SAMPLES" :key="s.id">
            <button type="button" @click="loadSample(i)">
              <b>{{ s.label }}</b
              ><small>{{ s.note }}</small>
            </button>
          </li>
        </ul>
      </details>
      <button class="btn ghost" type="button" title="保存・読み込み" @click="ui.showJson = true">
        <Ico name="braces" /><span class="lbl">JSON</span>
      </button>
      <button
        class="btn ghost icon-only"
        type="button"
        title="はじめに (使い方)"
        aria-label="はじめに"
        :aria-pressed="ui.intro"
        @click="ui.intro = !ui.intro"
      >
        <Ico name="help" />
      </button>
      <button
        class="btn primary"
        type="button"
        title="Vue のコードを表示"
        @click="ui.showCode = true"
      >
        <Ico name="code" /><span class="lbl">コード</span>
      </button>
    </header>

    <main
      ref="main"
      class="main"
      :class="{ wide: layout.wide }"
      :style="{
        '--right-w': layout.wide ? '54%' : layout.rightW + 'px',
        '--prev-h': (layout.wide ? 72 : layout.prevH) + '%',
      }"
    >
      <section class="pane pal-pane" :data-off="tab !== 'pal' || undefined"><Palette /></section>
      <section class="pane ws-pane" :data-off="tab !== 'ws' || undefined"><Workspace /></section>
      <section class="prev-pane"><Preview /></section>
      <section class="pane insp-pane" :data-off="tab !== 'insp' || undefined">
        <Inspector />
      </section>
      <div
        class="split split-v"
        :class="{ drag: splitting === 'v' }"
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        aria-label="プレビューの幅 (左右キーで調整、ダブルクリックで元に戻す)"
        title="ドラッグで幅を調整 / ダブルクリックで元に戻す"
        @pointerdown.prevent="startSplit('v', $event)"
        @keydown="keySplit('v', $event)"
        @dblclick="resetLayout"
      />
      <div
        class="split split-h"
        :class="{ drag: splitting === 'h' }"
        role="separator"
        aria-orientation="horizontal"
        tabindex="0"
        aria-label="プレビューの高さ (上下キーで調整、ダブルクリックで元に戻す)"
        title="ドラッグで高さを調整 / ダブルクリックで元に戻す"
        @pointerdown.prevent="startSplit('h', $event)"
        @keydown="keySplit('h', $event)"
        @dblclick="resetLayout"
      />
    </main>

    <nav class="mtabs" aria-label="表示する領域">
      <button type="button" :aria-pressed="tab === 'pal'" @click="tab = 'pal'">パレット</button>
      <button type="button" :aria-pressed="tab === 'ws'" @click="tab = 'ws'">
        ブロック <small>{{ doc.children.length }}</small>
      </button>
      <button type="button" :aria-pressed="tab === 'insp'" @click="tab = 'insp'">プロパティ</button>
    </nav>

    <ContextMenu />
    <CodeView />
    <JsonDialog />
    <div
      ref="toastEl"
      class="toast"
      popover="manual"
      :data-on="ui.toast ? '' : undefined"
      role="status"
      aria-live="polite"
    >
      {{ ui.toast }}
    </div>
  </div>
</template>
