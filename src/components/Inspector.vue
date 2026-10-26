<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { REG, CANVAS_PROPS, type PropDef } from '../schema'
import { GROUPS } from '../labels'
import { ui, flash } from '../store'
import { doc, find, resetAll, setProp, nameOf } from '../doc'
import { val } from '../SceneNode'
import PropEditor from './PropEditor.vue'
import Ico from './Ico.vue'
import { iconOf } from '../icons'

const info = computed(() => (ui.selected === 'canvas' ? null : find(ui.selected)))
const node = computed(() => info.value?.node ?? null)
const def = computed(() => (node.value ? REG[node.value.def] : null))
const isCanvas = computed(() => !node.value)

const propsObj = computed<Record<string, any>>(() => (node.value ? node.value.props : doc.canvas))
const defs = computed<PropDef[]>(() => (def.value ? def.value.props : CANVAS_PROPS))

const query = ref('')
const onlyChanged = ref(false)
const closed = reactive<Record<string, boolean | undefined>>({})

const cur = (pd: PropDef) =>
  node.value ? val(node.value, pd.key) : (propsObj.value[pd.key] ?? pd.def)
const isChanged = (pd: PropDef) => pd.key in propsObj.value
const changedCount = computed(() => defs.value.filter(isChanged).length)

const filtered = computed(() => {
  const s = query.value.trim().toLowerCase()
  return defs.value.filter((p) => {
    if (onlyChanged.value && !isChanged(p)) return false
    if (!s) return true
    return p.key.toLowerCase().includes(s) || p.label.toLowerCase().includes(s)
  })
})

const groups = computed(() => {
  const order = GROUPS.map((g) => g.id)
  const map = new Map<string, PropDef[]>()
  for (const p of filtered.value) {
    if (!map.has(p.group)) map.set(p.group, [])
    map.get(p.group)!.push(p)
  }
  return [...map.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([id, list]) => ({
      id,
      list,
      label: GROUPS.find((g) => g.id === id)?.label ?? id,
      changed: list.filter(isChanged).length,
      total: defs.value.filter((p) => p.group === id).length,
    }))
})

const COLLAPSED_BY_DEFAULT = new Set(['render', 'advanced', 'other', 'maps'])
function isOpen(g: { id: string; changed: number }) {
  const k = (def.value?.id ?? 'canvas') + ':' + g.id
  if (query.value.trim()) return true
  if (closed[k] !== undefined) return !closed[k]
  return !COLLAPSED_BY_DEFAULT.has(g.id) || g.changed > 0
}
function toggle(g: { id: string; changed: number }) {
  const k = (def.value?.id ?? 'canvas') + ':' + g.id
  closed[k] = isOpen(g)
}

function set(pd: PropDef, v: any) {
  setProp(propsObj.value, pd, v)
}
function reset(pd: PropDef) {
  delete propsObj.value[pd.key]
}

const SCRUB = ['number', 'int', 'angle']
function scrub(e: PointerEvent, pd: PropDef) {
  if (!SCRUB.includes(pd.type) || e.button !== 0) return
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  const x0 = e.clientX
  const v0 = typeof cur(pd) === 'number' ? (cur(pd) as number) : 0
  const range = Math.max(0.0001, (pd.max ?? 10) - (pd.min ?? 0))
  const step = pd.step ?? 0.01
  const move = (ev: PointerEvent) => {
    const k = ev.shiftKey ? 0.1 : 1
    let v = v0 + (((ev.clientX - x0) * range) / 300) * k
    v = pd.type === 'int' ? Math.round(v) : Math.round(v / step) * step
    set(pd, Math.round(v * 1e5) / 1e5)
  }
  const up = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

function copyTag() {
  const t = def.value ? `<${def.value.tag} />` : '<TresCanvas />'
  navigator.clipboard?.writeText(t).then(
    () => flash('タグをコピーしました'),
    () => flash(t),
  )
}
const err = computed(() => (node.value ? ui.errors[node.value.uid] : ''))
const title = computed(() => (node.value ? nameOf(node.value) : 'シーン設定'))
const tag = computed(() => def.value?.tag ?? 'TresCanvas')
const colorVar = computed(() => (def.value ? `var(--c-${def.value.cat})` : 'var(--c-root)'))
const inkVar = computed(() => (def.value ? `var(--ink-${def.value.cat})` : 'var(--ink-root)'))
const headIcon = computed(() => (def.value ? iconOf(def.value) : 'layers'))
</script>

<template>
  <div
    class="insp"
    :class="{ searching: !!query.trim() }"
    :style="{ '--c': colorVar, '--ink': inkVar }"
  >
    <div class="pane-head insp-head">
      <i class="chip"><Ico :name="headIcon" :size="17" /></i>
      <div class="insp-title">
        <h2>{{ title }}</h2>
        <button class="tagbtn" type="button" title="タグをコピー" @click="copyTag">
          <code>{{ '<' + tag + '>' }}</code>
        </button>
      </div>
      <span class="grow" />
      <span
        class="count"
        :title="`既定値から変えたプロパティ ${changedCount} 個 / 全 ${defs.length} 個`"
        >変更 <b>{{ changedCount }}</b> / 全 {{ defs.length }}</span
      >
      <button
        class="btn ghost"
        type="button"
        :disabled="!changedCount"
        title="すべて既定値に戻す"
        @click="resetAll(propsObj)"
      >
        <Ico name="reset" /> 戻す
      </button>
    </div>

    <p v-if="err" class="insp-err">{{ err }}</p>
    <p v-if="def?.warn" class="insp-warn">{{ def.warn }}</p>
    <p v-if="ui.sel.length > 1" class="insp-warn">
      {{ ui.sel.length }} 個を選択中です。ここで編集できるのは、最後に選んだ 1 つです。
    </p>

    <div class="insp-tools">
      <label class="search">
        <Ico name="search" :size="15" />
        <input
          v-model="query"
          type="search"
          placeholder="プロパティを検索"
          aria-label="プロパティを検索"
        />
      </label>
      <div class="seg" role="group" aria-label="表示する項目">
        <button type="button" :aria-pressed="!onlyChanged" @click="onlyChanged = false">
          すべて
        </button>
        <button type="button" :aria-pressed="onlyChanged" @click="onlyChanged = true">
          変更済み
        </button>
      </div>
    </div>

    <div class="insp-scroll">
      <p v-if="!groups.length" class="none">
        {{
          onlyChanged && !query ? 'まだ変更したプロパティはありません' : '一致する項目がありません'
        }}
      </p>
      <section v-for="g in groups" :key="g.id" class="grp">
        <button class="grp-head" type="button" :aria-expanded="isOpen(g)" @click="toggle(g)">
          <Ico name="chevron" :size="14" />
          <span>{{ g.label }}</span>
          <small title="この中のプロパティの数">{{ g.total }} 項目</small>
        </button>
        <div v-if="isOpen(g)" class="rows">
          <div
            v-for="pd in g.list"
            :key="pd.key"
            class="row"
            :class="{ changed: isChanged(pd), wide: ['texture', 'json'].includes(pd.type) }"
          >
            <label
              class="row-label"
              :for="`p-${pd.key}`"
              :class="{ scrub: SCRUB.includes(pd.type) }"
              :title="
                pd.hint ??
                `${pd.key}${pd.def !== undefined && pd.def !== null ? ' (既定: ' + JSON.stringify(pd.def) + ')' : ''}`
              "
              @pointerdown="scrub($event, pd)"
            >
              <span class="lbl">{{ pd.label }}</span>
              <code v-if="pd.label !== pd.key">{{ pd.key }}</code>
              <span v-if="pd.restart" class="mark" title="変更するとキャンバスを作り直します"
                ><Ico name="reset" :size="12"
              /></span>
              <span
                v-if="pd.linked"
                class="mark"
                title="three.js の内部で、別のプロパティと値が連動します"
                ><Ico name="link" :size="12"
              /></span>
            </label>
            <div class="row-ed">
              <PropEditor
                :pd="pd"
                :value="cur(pd)"
                :input-id="`p-${pd.key}`"
                @set="set(pd, $event)"
              />
            </div>
            <button
              class="ibtn reset"
              type="button"
              :disabled="!isChanged(pd)"
              :aria-label="`${pd.label}を既定値に戻す`"
              title="既定値に戻す"
              @click="reset(pd)"
            >
              <Ico name="reset" :size="14" />
            </button>
            <p v-if="pd.hint" class="row-hint">{{ pd.hint }}</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
