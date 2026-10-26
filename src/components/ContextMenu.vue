<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { REG } from '../schema'
import { canRename, copySelected, doc, duplicateSelected, find, hasClip, moveSibling, pasteClip, removeSelected, toggleOffSelected, topSelection, ui, walk } from '../store'
import Ico from './Ico.vue'

const el = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })

const ids = computed(() => (ui.menu?.uid ? topSelection() : []))
const many = computed(() => ids.value.length > 1)
const one = computed(() => (ids.value.length === 1 ? find(ids.value[0]) : null))
const allOff = computed(() => ids.value.length > 0 && ids.value.every((id) => find(id)?.node.off))
const idx = computed(() => (one.value?.list ? one.value.list.indexOf(one.value.node) : -1))
const sfx = computed(() => (many.value ? ` (${ids.value.length}個)` : ''))

const close = () => { ui.menu = null }
function run(fn: () => void) { close(); fn() }
function showCode() { ui.showCode = true }
function rename() { ui.editing = ids.value[0] }
function setAll(collapsed: boolean) { walk(doc.children, (n) => { n.collapsed = collapsed || undefined }) }

// 画面の外にはみ出さないよう、表示してから位置を直す
watch(() => ui.menu, async (m) => {
  if (!m) return
  pos.value = { x: m.x, y: m.y }
  await nextTick()
  const r = el.value?.getBoundingClientRect()
  if (r) pos.value = { x: Math.max(8, Math.min(m.x, innerWidth - r.width - 8)), y: Math.max(8, Math.min(m.y, innerHeight - r.height - 8)) }
  el.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
})
function outside(e: Event) { if (ui.menu && !el.value?.contains(e.target as Node)) close() }
function key(e: KeyboardEvent) {
  if (!ui.menu) return
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); e.stopPropagation()
    const bs = [...(el.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const i = bs.indexOf(document.activeElement as HTMLButtonElement)
    bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus()
  }
}
onMounted(() => {
  window.addEventListener('pointerdown', outside, true)
  window.addEventListener('keydown', key, true)
  window.addEventListener('resize', close)
  window.addEventListener('blur', close)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('keydown', key, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('blur', close)
})
const label = computed(() => (one.value ? REG[one.value.node.def]?.label : ''))
</script>

<template>
  <div v-if="ui.menu" ref="el" class="cmenu" role="menu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @contextmenu.prevent>
    <template v-if="ui.menu.uid && ids.length">
      <p v-if="label && !many" class="cm-title">{{ label }}</p>
      <button type="button" role="menuitem" :disabled="many || !canRename(ids[0])" @click="run(rename)"><Ico name="pencil" :size="14" />名前を変更<kbd>F2</kbd></button>
      <button type="button" role="menuitem" @click="run(duplicateSelected)"><Ico name="copy" :size="14" />複製{{ sfx }}<kbd>Ctrl+D</kbd></button>
      <button type="button" role="menuitem" @click="run(() => { copySelected() })"><Ico name="clipboard" :size="14" />コピー{{ sfx }}<kbd>Ctrl+C</kbd></button>
      <button type="button" role="menuitem" :disabled="!hasClip()" @click="run(pasteClip)"><Ico name="paste" :size="14" />貼り付け<kbd>Ctrl+V</kbd></button>
      <button type="button" role="menuitem" @click="run(showCode)"><Ico name="code" :size="14" />コードで見る</button>
      <hr />
      <button type="button" role="menuitem" @click="run(toggleOffSelected)"><Ico :name="allOff ? 'eye' : 'eye-off'" :size="14" />{{ allOff ? '有効にする' : '一時的に無効にする' }}</button>
      <button type="button" role="menuitem" :disabled="many || idx <= 0" @click="run(() => moveSibling(ids[0], -1))"><Ico name="up" :size="14" />上へ</button>
      <button type="button" role="menuitem" :disabled="many || idx < 0 || !one?.list || idx >= one.list.length - 1" @click="run(() => moveSibling(ids[0], 1))"><Ico name="down" :size="14" />下へ</button>
      <hr />
      <button type="button" role="menuitem" class="danger" @click="run(removeSelected)"><Ico name="trash" :size="14" />削除{{ sfx }}<kbd>Del</kbd></button>
    </template>
    <template v-else>
      <button type="button" role="menuitem" :disabled="!hasClip()" @click="run(pasteClip)"><Ico name="paste" :size="14" />貼り付け<kbd>Ctrl+V</kbd></button>
      <hr />
      <button type="button" role="menuitem" @click="run(() => setAll(true))"><Ico name="fold" :size="14" />すべて閉じる</button>
      <button type="button" role="menuitem" @click="run(() => setAll(false))"><Ico name="unfold" :size="14" />すべて開く</button>
    </template>
  </div>
</template>
