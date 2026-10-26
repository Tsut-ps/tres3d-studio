<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { generate, type Mark } from '../codegen'
import { REG } from '../schema'
import { flash, revealNode, ui } from '../store'
import { find, nameOf } from '../doc'
import { layout } from '../layout'
import Ico from './Ico.vue'

const root = ref<HTMLElement | null>(null)
const lines = ref<HTMLElement | null>(null)

// 広い画面では、画面の下に並べて出す (ブロックを操作しながらコードを見られる)。狭い画面では、これまでどおりのダイアログ
const mq = window.matchMedia('(min-width: 1000px) and (min-height: 560px)')
const docked = ref(mq.matches)
const onMq = () => {
  docked.value = mq.matches
}
onMounted(() => mq.addEventListener('change', onMq))
onBeforeUnmount(() => mq.removeEventListener('change', onMq))

const gen = computed(() => (ui.showCode ? generate() : { files: [], install: '' }))
const active = ref(1)
const file = computed(() => gen.value.files[Math.min(active.value, gen.value.files.length - 1)])

// ── ダイアログ表示 (狭い画面)
watch(
  [() => ui.showCode, docked],
  async ([v, d]) => {
    await nextTick()
    const el = root.value
    if (!(el instanceof HTMLDialogElement)) return
    if (v && !d && !el.open) el.showModal()
    if ((!v || d) && el.open) el.close()
  },
  { immediate: true, flush: 'post' },
)

// ── ブロックとコード行の対応
type Meta = { cat: string; name: string }
const metaOf = (m: Mark): Meta => {
  if (m.uid === 'canvas') return { cat: 'root', name: 'シーン設定' }
  const f = find(m.uid)
  return f
    ? { cat: REG[f.node.def]?.cat ?? 'helper', name: nameOf(f.node) }
    : { cat: 'helper', name: '' }
}
const rows = computed(() => {
  const f = file.value
  if (!f) return []
  const text = f.code.split('\n')
  const inner: (Mark | null)[] = text.map(() => null)
  // 広い範囲から順に塗り、狭い (内側の) 範囲で上書きする。1 行は、いちばん内側のブロックに属する
  for (const m of [...(f.marks ?? [])].sort(
    (a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from,
  )) {
    for (let i = m.from; i <= m.to; i++) inner[i] = m
  }
  const cache = new Map<Mark, Meta>()
  return text.map((t, i) => {
    const m = inner[i]
    let meta: Meta | null = null
    if (m) {
      meta = cache.get(m) ?? metaOf(m)
      cache.set(m, meta)
    }
    return { t, m, meta }
  })
})
const selUids = computed(() => new Set(ui.selected === 'canvas' ? ['canvas'] : ui.sel))
const hitsOf = (f: { marks?: Mark[] } | undefined) => {
  const s = new Set<number>()
  for (const m of f?.marks ?? [])
    if (selUids.value.has(m.uid)) for (let i = m.from; i <= m.to; i++) s.add(i)
  return s
}
const hit = computed(() => hitsOf(file.value))
const nothingMapped = computed(
  () => ui.selected !== 'canvas' && ui.showCode && !gen.value.files.some((f) => hitsOf(f).size),
)

const hov = ref<{ m: Mark; at: number } | null>(null)
function enter(i: number, m: Mark | null) {
  hov.value = m ? { m, at: i } : null
  ui.hover = m && m.uid !== 'canvas' ? m.uid : ''
}
function leave() {
  hov.value = null
  ui.hover = ''
}

let fromCode = false
function pick(m: Mark | null, e: MouseEvent) {
  if (!m || window.getSelection()?.toString()) return // 文字を選んでいるときは何もしない
  fromCode = true
  if (m.uid === 'canvas') ui.selected = 'canvas'
  else revealNode(m.uid, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })
}

// ブロックの選択が変わったら、対応するコードの位置へ (コードから選んだときは動かさない)
watch(
  () => [ui.showCode, ui.selected, ui.sel.join(',')] as const,
  async (n, o) => {
    if (!ui.showCode) return
    if (fromCode) {
      fromCode = false
      return
    }
    await nextTick()
    const justOpened = !o?.[0]
    const cur = hitsOf(file.value)
    if (ui.selected === 'canvas') {
      if (!justOpened && !cur.size) {
        active.value = Math.max(
          0,
          gen.value.files.findIndex((f) => hitsOf(f).size),
        )
        await nextTick()
      }
    } else if (!cur.size) {
      const i = gen.value.files.findIndex((f) => hitsOf(f).size)
      if (i >= 0) {
        active.value = i
        await nextTick()
      }
    }
    // 動きの付いたブロックは、スクリプトとテンプレートの両方が光る。テンプレート (後ろ) のほうへ寄せる
    const on = [...(lines.value?.querySelectorAll('.cl.on') ?? [])]
    let start = on[on.length - 1]
    for (let k = on.length - 2; k >= 0 && on[k].nextElementSibling === on[k + 1]; k--) start = on[k]
    start?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  },
  { flush: 'post' },
)

// 開いたときは Scene.vue から (ブロックの中身が多いので)
watch(
  () => ui.showCode,
  (v) => {
    if (v) active.value = Math.min(1, Math.max(0, gen.value.files.length - 1))
  },
)

// ── 下に並べたときの高さを、上端のつまみで変える
function grip(e: PointerEvent) {
  const y0 = e.clientY,
    h0 = layout.codeH
  const move = (ev: PointerEvent) => {
    layout.codeH = Math.round(
      Math.min(window.innerHeight * 0.7, Math.max(140, h0 + (y0 - ev.clientY))),
    )
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function selectAll() {
  const el = lines.value
  if (!el) return
  const r = document.createRange()
  r.selectNodeContents(el)
  const s = window.getSelection()
  s?.removeAllRanges()
  s?.addRange(r)
}
async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    flash(`${label}をコピーしました`)
  } catch {
    selectAll()
    flash('選択しました。Ctrl/⌘+C でコピーしてください')
  }
}
</script>

<template>
  <component
    :is="docked ? 'section' : 'dialog'"
    v-if="!docked || ui.showCode"
    ref="root"
    :class="docked ? 'codedock' : 'dlg code'"
    :style="docked ? { height: layout.codeH + 'px' } : undefined"
    :aria-labelledby="'code-title'"
    @close="ui.showCode = false"
    @click.self="!docked && (ui.showCode = false)"
  >
    <div v-if="ui.showCode" class="dlg-in cv" :class="{ dock: docked }">
      <div
        v-if="docked"
        class="dock-grip"
        role="separator"
        aria-orientation="horizontal"
        aria-label="コードの高さ"
        title="ドラッグで高さを調整"
        @pointerdown.prevent="grip"
      />
      <header class="dlg-head">
        <h2 id="code-title">TresJS コード</h2>
        <div class="ftabs" role="tablist">
          <button
            v-for="(f, i) in gen.files"
            :key="f.name"
            role="tab"
            type="button"
            :aria-selected="i === Math.min(active, gen.files.length - 1)"
            @click="active = i"
          >
            {{ f.name }}
          </button>
        </div>
        <span class="grow" />
        <button
          class="btn ghost"
          type="button"
          :title="gen.install"
          @click="copy(gen.install, 'インストールコマンド')"
        >
          <Ico name="copy" /> インストール
        </button>
        <button class="btn ghost" type="button" @click="copy(file.code, file.name)">
          <Ico name="copy" /> {{ file.name }}
        </button>
        <button class="btn ghost" type="button" @click="ui.showCode = false">
          <Ico name="x" /> 閉じる
        </button>
      </header>
      <p class="cv-note">
        <span class="cv-key" aria-hidden="true"><i /><i /><i /></span>
        左の色の帯は、その行に対応するブロックの色です。行を押すとブロックが選ばれ、ブロックを選ぶと対応する行が光ります。
        <b v-if="nothingMapped" class="cv-warn"
          >いま選んでいるブロックは、コードに出ません（無効にしているため）。</b
        >
      </p>
      <div
        ref="lines"
        class="codelines"
        tabindex="0"
        role="region"
        aria-label="生成されたコード"
        @mouseleave="leave"
      >
        <div
          v-for="(r, i) in rows"
          :key="i"
          class="cl"
          :class="{ on: hit.has(i), mapped: !!r.m, rng: !!hov && i >= hov.m.from && i <= hov.m.to }"
          :style="r.meta ? { '--c': `var(--c-${r.meta.cat})` } : undefined"
          @mouseenter="enter(i, r.m)"
          @click="pick(r.m, $event)"
        >
          <span class="cl-n">{{ i + 1 }}</span
          ><span class="cl-t">{{ r.t || ' ' }}</span>
          <span v-if="hov && hov.at === i && r.meta?.name" class="cl-tag">{{ r.meta.name }}</span>
        </div>
      </div>
    </div>
  </component>
</template>
