<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { REG, BEHAVIOR_HOSTS } from '../schema'
import { iconOf } from '../icons'
import { ui, removeNode, duplicateNode, isSelected, selectBlock } from '../store'
import { setProp, nameOf, canRename, renameNode, type BNode, type Slot } from '../doc'
import { val } from '../SceneNode'
import PropEditor from './PropEditor.vue'
import DropZone from './DropZone.vue'
import Ico from './Ico.vue'

defineOptions({ name: 'BlockView' })
const props = defineProps<{ node: BNode; parent: BNode | null; at: Slot | 'root' }>()

const def = computed(() => REG[props.node.def])
const mini = computed(() => ['geometry', 'material', 'behavior'].includes(def.value.kind))
const hostsBehavior = computed(() => BEHAVIOR_HOSTS.includes(def.value.kind))
const hasBody = computed(() => !mini.value && (!!def.value.slots || hostsBehavior.value))
const selected = computed(() => isSelected(props.node.uid))
const active = computed(() => ui.selected === props.node.uid)
const title = computed(() => nameOf(props.node))
const named = computed(() => title.value !== def.value.label)
const editing = computed(() => ui.editing === props.node.uid)
const editBox = ref<HTMLInputElement | null>(null)
function startRename() {
  if (!canRename(props.node.uid)) return
  ui.editing = props.node.uid
  nextTick(() => {
    editBox.value?.focus()
    editBox.value?.select()
  })
}
function endRename(commit: boolean, e?: Event) {
  if (ui.editing !== props.node.uid) return
  if (commit) renameNode(props.node.uid, (e?.target as HTMLInputElement)?.value ?? '')
  ui.editing = ''
}
// F2 (App から ui.editing が立つ) でも入力欄にフォーカスする
watch(editing, (v) => {
  if (v)
    nextTick(() => {
      editBox.value?.focus()
      editBox.value?.select()
    })
})
function onSelect(e: MouseEvent) {
  selectBlock(props.node.uid, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })
}
function onMenu(e: MouseEvent) {
  if (!isSelected(props.node.uid)) selectBlock(props.node.uid)
  else ui.selected = props.node.uid
  ui.menu = { x: e.clientX, y: e.clientY, uid: props.node.uid }
}
const hovered = computed(() => ui.hover === props.node.uid)
const root = ref<HTMLElement | null>(null)
// プレビューでこのブロックが選ばれたら、見える位置までスクロールする
watch(
  () => ui.reveal,
  (v) => {
    if (v.startsWith(props.node.uid + ':'))
      nextTick(() => root.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  },
)
const changed = computed(() => Object.keys(props.node.props).length)
const err = computed(() => ui.errors[props.node.uid])
// 見出しに出すのは先頭2項目まで。残りはインスペクタで編集する
const pills = computed(() =>
  def.value.primary
    .map((k) => def.value.propMap[k])
    .filter(Boolean)
    .slice(0, 2),
)
const total = computed(() => def.value.props.length)

function dragStart(e: DragEvent) {
  ui.drag = { uid: props.node.uid }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', props.node.uid)
  }
}
const emptyLabel = computed(() => (def.value.kind === 'composer' ? '＋ エフェクト' : '＋ ブロック'))
const matLabel = computed(
  () =>
    (
      ({
        mesh: '素材をここへ',
        points: '点の素材をここへ',
        line: '線の素材をここへ',
        sprite: 'スプライトの素材をここへ',
      }) as any
    )[def.value.slots?.material ?? 'mesh'],
)
</script>

<template>
  <div
    ref="root"
    class="blk"
    :class="{
      mini,
      'blk-sel': selected,
      'blk-active': active,
      'blk-hover': hovered,
      off: node.off,
      bad: !!err,
    }"
    :style="{ '--c': `var(--c-${def.cat})`, '--ink': `var(--ink-${def.cat})` }"
    :data-kind="def.kind"
    @click.stop="onSelect"
    @contextmenu.prevent.stop="onMenu"
    @mouseover.stop="ui.hover = node.uid"
  >
    <div class="blk-head">
      <button
        v-if="hasBody"
        class="fold"
        :class="{ open: !node.collapsed }"
        type="button"
        :aria-expanded="!node.collapsed"
        :aria-label="node.collapsed ? '開く' : '閉じる'"
        @click.stop="node.collapsed = !node.collapsed"
      >
        <Ico name="chevron" :size="14" />
      </button>
      <span
        class="grab"
        :draggable="!editing"
        title="ドラッグして移動"
        @dragstart="dragStart"
        @dragend="ui.drag = null"
      >
        <Ico name="grip" :size="14" />
        <Ico :name="iconOf(def)" :size="15" class="kind-ico" />
        <input
          v-if="editing"
          ref="editBox"
          class="blk-rename"
          type="text"
          :value="named ? title : ''"
          :placeholder="def.label"
          aria-label="ブロックの名前"
          @click.stop
          @mousedown.stop
          @dblclick.stop
          @keydown.stop
          @keydown.enter.prevent="endRename(true, $event)"
          @keydown.esc.prevent="endRename(false)"
          @blur="endRename(true, $event)"
        />
        <template v-else>
          <span
            class="blk-title"
            :title="canRename(node.uid) ? 'ダブルクリックか F2 で名前を変更' : undefined"
            @dblclick.stop="startRename"
            >{{ title }}</span
          >
          <span v-if="named" class="blk-kind">{{ def.label }}</span>
        </template>
      </span>
      <span class="pills">
        <label v-for="pd in pills" :key="pd.key" class="pill" @click.stop>
          <span v-if="pd.type !== 'color'">{{ pd.label }}</span>
          <PropEditor
            compact
            :pd="pd"
            :value="val(node, pd.key)"
            @set="setProp(node.props, pd, $event)"
          />
        </label>
      </span>
      <span class="grow" />
      <span
        v-if="changed"
        class="badge"
        :title="`変更したプロパティ ${changed} 個 (全 ${total} 個中)。右のインスペクタで確認できます`"
        >変更<b>{{ changed }}</b></span
      >
      <button
        class="ibtn"
        type="button"
        :title="node.off ? '有効にする' : '一時的に無効にする'"
        :aria-label="node.off ? '有効にする' : '無効にする'"
        @click.stop="node.off = !node.off || undefined"
      >
        <Ico :name="node.off ? 'eye-off' : 'eye'" />
      </button>
      <button
        class="ibtn"
        type="button"
        title="複製"
        aria-label="複製"
        @click.stop="duplicateNode(node.uid)"
      >
        <Ico name="copy" />
      </button>
      <button
        class="ibtn"
        type="button"
        title="削除"
        aria-label="削除"
        @click.stop="removeNode(node.uid)"
      >
        <Ico name="trash" />
      </button>
    </div>
    <p v-if="err" class="blk-err">{{ err }}</p>

    <div v-if="hasBody && !node.collapsed" class="blk-body">
      <div v-if="def.slots?.geometry" class="slot slot-geometry">
        <span class="slot-label">形状</span>
        <DropZone wrap :pick="!node.geometry" :parent="node" at="geometry">
          <BlockView v-if="node.geometry" :node="node.geometry" :parent="node" at="geometry" />
          <span v-else class="dz-label">形状をここへ</span>
        </DropZone>
      </div>
      <div v-if="def.slots?.material" class="slot slot-material">
        <span class="slot-label">素材</span>
        <DropZone wrap :pick="!node.material" :parent="node" at="material">
          <BlockView v-if="node.material" :node="node.material" :parent="node" at="material" />
          <span v-else class="dz-label">{{ matLabel }}</span>
        </DropZone>
      </div>
      <div
        v-if="hostsBehavior"
        class="slot slot-motion"
        :class="{ 'slot-empty': !node.behaviors.length }"
      >
        <span class="slot-label">動き</span>
        <div class="stack">
          <template v-for="(b, i) in node.behaviors" :key="b.uid">
            <DropZone gap :parent="node" at="behaviors" :index="i" />
            <BlockView :node="b" :parent="node" at="behaviors" />
          </template>
          <DropZone
            pick
            :parent="node"
            at="behaviors"
            :label="node.behaviors.length ? '＋ 動きを追加' : '＋ 動き'"
            class="dz-quiet"
          />
        </div>
      </div>
      <div v-if="def.slots?.children" class="kids">
        <template v-for="(c, i) in node.children" :key="c.uid">
          <DropZone gap :parent="node" at="children" :index="i" />
          <BlockView :node="c" :parent="node" at="children" />
        </template>
        <DropZone
          pick
          :parent="node"
          at="children"
          :label="node.children.length ? '＋ ここに追加' : emptyLabel"
          class="dz-quiet"
        />
      </div>
    </div>
  </div>
</template>
