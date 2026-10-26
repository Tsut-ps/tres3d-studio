<script setup lang="ts">
import { computed, ref } from 'vue'
import { REG } from '../schema'
import { addFromPalette, moveNode, startAdd, ui } from '../store'
import { canDrop, find, isDescendant, type BNode, type Slot } from '../doc'
const props = defineProps<{
  parent: BNode | null
  at: Slot
  index?: number
  label?: string
  /** 既に中身がある枠を包むとき。中身ごと置き換え先になる */
  wrap?: boolean
  gap?: boolean
  /** 押すと、パレットがこの追加先に合う種類へ移る (空の受け口・「＋ …」の行) */
  pick?: boolean
}>()

const ok = computed(() => {
  const d = ui.drag
  if (!d) return false
  const dragged = d.uid ? find(d.uid)?.node : null
  const defId = d.defId ?? dragged?.def
  const def = defId ? REG[defId] : null
  if (!def || !canDrop(def, props.parent, props.at)) return false
  if (
    dragged &&
    props.parent &&
    (props.parent.uid === dragged.uid || isDescendant(dragged, props.parent.uid))
  )
    return false
  // 自分自身のすぐ隣は意味がない
  return true
})
const over = ref(false)
const target = computed(
  () =>
    !!props.pick &&
    !!ui.addTo &&
    ui.addTo.uid === (props.parent?.uid ?? '') &&
    ui.addTo.slot === props.at,
)

function onOver(e: DragEvent) {
  if (!ok.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = ui.drag?.uid ? 'move' : 'copy'
  over.value = true
}
function onDrop(e: DragEvent) {
  over.value = false
  if (!ok.value) return
  e.preventDefault()
  e.stopPropagation()
  const d = ui.drag!
  ui.drag = null
  if (d.defId) addFromPalette(d.defId, { parent: props.parent, slot: props.at, index: props.index })
  else if (d.uid) moveNode(d.uid, props.parent, props.at, props.index ?? -1)
}
</script>

<template>
  <div
    class="dz"
    :class="{
      active: ok,
      over: over && ok,
      blocked: !!ui.drag && !ok,
      wrap,
      gap,
      empty: !wrap && !gap,
      pick,
      target,
    }"
    :role="pick ? 'button' : undefined"
    :tabindex="pick ? 0 : undefined"
    @dragover="onOver"
    @dragleave="over = false"
    @drop="onDrop"
    @click="pick && ($event.stopPropagation(), startAdd(parent, at))"
    @keydown.enter.self.prevent="pick && startAdd(parent, at)"
    @keydown.space.self.prevent="pick && startAdd(parent, at)"
  >
    <slot>
      <span v-if="label" class="dz-label">{{ label }}</span>
    </slot>
  </div>
</template>
