<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CATS, REG, defsOfCat, type BlockDef } from '../schema'
import { addFromPalette, addTarget, clearAdd, ui } from '../store'
import { canDrop, nameOf } from '../doc'
import Ico from './Ico.vue'
import { CAT_ICON, iconOf } from '../icons'

const cat = computed({
  get: () => ui.palCat,
  set: (v) => {
    ui.palCat = v
  },
})
const list = ref<HTMLElement | null>(null)
const q = ref('')

const norm = (s: string) => s.toLowerCase()
const result = computed<BlockDef[]>(() => {
  const s = norm(q.value.trim())
  if (!s) return defsOfCat(cat.value)
  return Object.values(REG).filter((d) =>
    [d.label, d.tag, d.id, d.aka ?? '', d.desc ?? ''].some((t) => norm(t).includes(s)),
  )
})
const counts = computed(() => Object.fromEntries(CATS.map((c) => [c.id, defsOfCat(c.id).length])))

// 「＋ 動き」などを押したら、検索を空にして、合う種類の先頭を見せる
watch(
  () => ui.addReq,
  () => {
    q.value = ''
    nextTick(() => {
      if (list.value) list.value.scrollTop = 0
    })
  },
)
const target = computed(() => (ui.addTo ? addTarget() : null))
const SLOT_LABEL: Record<string, string> = {
  geometry: '形状',
  material: '素材',
  behaviors: '動き',
  children: '中',
}
const targetLabel = computed(() => {
  const t = target.value
  if (!t) return ''
  return `${t.parent ? nameOf(t.parent) : 'シーン'} › ${SLOT_LABEL[t.slot] ?? ''}`
})
const fits = (d: BlockDef) => {
  const t = target.value
  return !t || canDrop(d, t.parent, t.slot) || d.kind === 'effect'
}
function add(d: BlockDef) {
  const t = target.value
  if (t && !fits(d)) return void addFromPalette(d.id, t) // 置けない旨の通知を出す
  addFromPalette(d.id, t ?? undefined)
}

function dragStart(e: DragEvent, d: BlockDef) {
  ui.drag = { defId: d.id }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', d.id)
  }
}
</script>

<template>
  <div class="pal">
    <div class="pane-head"><h2>パレット</h2></div>
    <label class="search">
      <Ico name="search" :size="15" />
      <input v-model="q" type="search" placeholder="ブロックを検索" aria-label="ブロックを検索" />
    </label>
    <div v-if="!q" class="cats" role="tablist" aria-label="ブロックの種類">
      <button
        v-for="c in CATS"
        :key="c.id"
        class="cat"
        role="tab"
        type="button"
        :aria-selected="cat === c.id"
        :style="{ '--c': `var(--c-${c.id})` }"
        @click="cat = c.id"
      >
        <Ico :name="CAT_ICON[c.id]" :size="14" /><span>{{ c.label }}</span
        ><small :title="`${counts[c.id]} 個のブロック`">{{ counts[c.id] }}</small>
      </button>
    </div>
    <p v-if="target" class="addto">
      <span>追加先</span><b>{{ targetLabel }}</b>
      <button
        class="ibtn"
        type="button"
        aria-label="追加先の指定を解く"
        title="指定を解く (Esc)"
        @click="clearAdd"
      >
        <Ico name="x" :size="14" />
      </button>
    </p>
    <ul ref="list" class="items" :aria-label="q ? '検索結果' : '選択中の種類のブロック'">
      <li
        v-for="d in result"
        :key="d.id"
        class="item"
        :class="{ blocked: !fits(d) }"
        :data-kind="d.kind"
        :style="{ '--c': `var(--c-${d.cat})`, '--ink': `var(--ink-${d.cat})` }"
        draggable="true"
        @dragstart="dragStart($event, d)"
        @dragend="ui.drag = null"
      >
        <button
          type="button"
          :title="`${d.tag}${d.props.length ? ' ・ ' + d.props.length + ' 項目' : ''}${d.desc ? '\n' + d.desc : ''}`"
          @click="add(d)"
        >
          <Ico :name="iconOf(d)" :size="15" class="kind-ico" />
          <span class="item-name">{{ d.label }}</span>
          <code v-if="q" class="item-tag">{{ d.tag }}</code>
        </button>
      </li>
      <li v-if="!result.length" class="none">見つかりません</li>
    </ul>
  </div>
</template>
