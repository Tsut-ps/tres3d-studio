<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PropDef } from '../schema'
import TextureEditor from './TextureEditor.vue'

const props = defineProps<{
  pd: PropDef
  /** 現在の値（未設定なら既定値） */
  value: any
  compact?: boolean
  inputId?: string
}>()
const emit = defineEmits<{ (e: 'set', v: any): void }>()

const RAD = Math.PI / 180
const r4 = (n: number) => Math.round(n * 1e4) / 1e4
const isAngle = (t: string) => t === 'angle' || t === 'euler'
// 角度は小数 2 桁まで見せる (ラジアン保存の丸め誤差で -90.0002 のようになるのを避ける)
const toShown = (n: number, angle = false) => (angle ? Math.round((n / RAD) * 100) / 100 : r4(n))
const fromShown = (n: number, angle = false) => (angle ? n * RAD : n)

// ── 数値
const isNum = computed(() => ['number', 'int', 'angle'].includes(props.pd.type))
const angle = computed(() => props.pd.type === 'angle')
const shown = computed(() => (typeof props.value === 'number' ? toShown(props.value, angle.value) : ''))
const bounds = computed(() => {
  const v = typeof props.value === 'number' ? props.value : 0
  let min = props.pd.min ?? 0, max = props.pd.max ?? 10
  if (v > max) max = v * 1.25
  if (v < min) min = v * 1.25
  const k = angle.value ? 1 / RAD : 1
  return { min: r4(min * k), max: r4(max * k), step: angle.value ? 1 : (props.pd.step ?? 0.01) }
})
// スライダーの塗りつぶし位置 (%)。つまみより左を色、右を暗い面で描く
const fillPct = computed(() => {
  const { min, max } = bounds.value
  const v = typeof shown.value === 'number' ? shown.value : min
  return max <= min ? 0 : Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))
})
// 既定値の位置（スライダー上の目印）。範囲外なら出さない
const defPct = computed(() => {
  const d = props.pd.def
  if (typeof d !== 'number' || !Number.isFinite(d)) return null
  const { min, max } = bounds.value
  const v = angle.value ? d / RAD : d
  if (max <= min || v < min || v > max) return null
  return ((v - min) / (max - min)) * 100
})
function onNum(e: Event) {
  const t = (e.target as HTMLInputElement).value
  if (t === '') return emit('set', undefined)
  const n = Number(t)
  if (!Number.isNaN(n)) emit('set', props.pd.type === 'int' ? Math.round(fromShown(n, angle.value)) : fromShown(n, angle.value))
}
function onRange(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  emit('set', props.pd.type === 'int' ? Math.round(fromShown(n, angle.value)) : fromShown(n, angle.value))
}

// ── 数値欄のドラッグ (クリックなら、これまでどおり入力)
// 欄を押して横に動かすと値が変わる。右で増え、左で減る。Shift で 1/10 の細かさ。入力中の欄・タッチ操作では働かない
function dragNum(e: PointerEvent, o: { get: () => number; set: (shown: number) => void; step: number; int?: boolean; angle?: boolean }) {
  if (e.button !== 0 || e.pointerType === 'touch') return
  const el = e.currentTarget as HTMLInputElement
  if (document.activeElement === el) return
  const v0 = o.get()
  const bounded = isNum.value && props.pd.min !== undefined && props.pd.max !== undefined
  const base = o.int ? 0.125 : o.angle ? 1 : bounded ? ((props.pd.max as number) - (props.pd.min as number)) / 300 : Math.min(0.25, Math.max(0.01, o.step * 5))
  const perPx = bounded || o.int || o.angle ? base : Math.max(base, Math.abs(v0) * 0.005)
  let acc = v0, lastX = e.clientX, on = false
  const move = (ev: PointerEvent) => {
    if (!on) {
      if (Math.abs(ev.clientX - e.clientX) < 3) return
      on = true; lastX = ev.clientX
      el.blur(); getSelection()?.removeAllRanges(); document.body.classList.add('num-dragging')
      return
    }
    const fine = ev.shiftKey && !o.int
    acc += (ev.clientX - lastX) * perPx * (fine ? 0.1 : 1)
    lastX = ev.clientX
    const unit = fine ? o.step / 10 : o.step
    o.set(r4(Math.round(acc / unit) * unit))
  }
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
    document.body.classList.remove('num-dragging')
    if (!on) el.select()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}
const cast = (n: number) => (props.pd.type === 'int' ? Math.round(fromShown(n, angle.value)) : fromShown(n, angle.value))
function dragSingle(e: PointerEvent) {
  dragNum(e, { get: () => (typeof props.value === 'number' ? toShown(props.value, angle.value) : 0), set: (n) => emit('set', cast(n)), step: bounds.value.step, int: props.pd.type === 'int', angle: angle.value })
}
function dragVec(i: number, e: PointerEvent) {
  dragNum(e, {
    get: () => (Array.isArray(props.value) && typeof props.value[i] === 'number' ? toShown(props.value[i], eul.value) : 0),
    set: (n) => {
      const base = Array.isArray(props.value) ? [...props.value] : Array(vecLen.value).fill(0)
      while (base.length < vecLen.value) base.push(0)
      base[i] = fromShown(n, eul.value)
      emit('set', base)
    },
    step: eul.value ? 1 : (props.pd.step ?? 0.01), angle: eul.value,
  })
}

// ── ベクトル
const vecLen = computed(() => (props.pd.type === 'vec2' ? 2 : props.pd.type === 'vec4' ? 4 : 3))
const vecNames = computed(() => ['x', 'y', 'z', 'w'].slice(0, vecLen.value))
const eul = computed(() => props.pd.type === 'euler')
function vecAt(i: number) {
  const a = props.value
  return Array.isArray(a) && typeof a[i] === 'number' ? toShown(a[i], eul.value) : ''
}
function onVec(i: number, e: Event) {
  const t = (e.target as HTMLInputElement).value
  const base = Array.isArray(props.value) ? [...props.value] : Array(vecLen.value).fill(0)
  while (base.length < vecLen.value) base.push(0)
  const n = Number(t)
  if (t === '' || Number.isNaN(n)) return
  base[i] = fromShown(n, eul.value)
  emit('set', base)
}

// ── 選択
const opts = computed(() => {
  const o = props.pd.options ?? []
  return props.pd.def === undefined && !o.some((x) => x.value === undefined) ? [{ label: '既定', value: undefined }, ...o] : o
})
const optIndex = computed(() => opts.value.findIndex((o) => o.value === props.value))
function onEnum(e: Event) {
  const i = Number((e.target as HTMLSelectElement).value)
  emit('set', opts.value[i]?.value)
}

// ── 色
const hexText = ref('')
watch(() => props.value, (v) => (hexText.value = typeof v === 'string' ? v : ''), { immediate: true })
const colorValue = computed(() => (typeof props.value === 'string' && /^#[0-9a-f]{6}$/i.test(props.value) ? props.value : '#000000'))
function onHex(e: Event) {
  let t = (e.target as HTMLInputElement).value.trim()
  if (/^[0-9a-f]{3,6}$/i.test(t)) t = '#' + t
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) {
    if (t.length === 4) t = '#' + [...t.slice(1)].map((c) => c + c).join('')
    emit('set', t.toLowerCase())
  } else hexText.value = typeof props.value === 'string' ? props.value : ''
}

// ── JSON
const jsonText = ref('')
const jsonBad = ref(false)
watch(() => props.value, (v) => { if (!jsonBad.value) jsonText.value = v == null ? '' : JSON.stringify(v) }, { immediate: true })
function onJson(e: Event) {
  const t = (e.target as HTMLTextAreaElement).value
  jsonText.value = t
  if (t.trim() === '') { jsonBad.value = false; return emit('set', undefined) }
  try { const v = JSON.parse(t); jsonBad.value = false; emit('set', v) } catch { jsonBad.value = true }
}
</script>

<template>
  <!-- 数値 -->
  <div v-if="isNum" class="ed ed-num" :class="{ compact }">
    <span v-if="!compact && pd.min !== undefined && pd.max !== undefined" class="rangewrap">
      <input
        class="range" type="range" tabindex="-1" :style="{ '--fill': fillPct }"
        :min="bounds.min" :max="bounds.max" :step="bounds.step" :value="shown === '' ? bounds.min : shown"
        :aria-label="pd.label" @input="onRange"
      />
      <i v-if="defPct !== null" class="deftick" :style="{ '--p': defPct / 100 }" title="既定値" />
    </span>
    <input
      :id="inputId" class="num" type="number" :step="bounds.step" :value="shown" :placeholder="pd.def === undefined || pd.def === null ? '既定' : ''"
      :aria-label="pd.label" @input="onNum" @pointerdown="dragSingle"
    />
    <span v-if="angle" class="unit">°</span>
  </div>

  <!-- 真偽 -->
  <button
    v-else-if="pd.type === 'boolean'" :id="inputId" class="sw" :class="{ compact }" role="switch" type="button"
    :aria-checked="!!value" :aria-label="pd.label" @click.stop="emit('set', !value)"
  ><i /></button>

  <!-- 色 -->
  <div v-else-if="pd.type === 'color'" class="ed ed-color" :class="{ compact }">
    <input :id="inputId" class="swatch" type="color" :value="colorValue" :aria-label="pd.label" :data-unset="value === undefined || undefined" @input="emit('set', ($event.target as HTMLInputElement).value)" />
    <input v-if="!compact" class="hex" type="text" maxlength="7" spellcheck="false" :value="hexText" :placeholder="value === undefined ? '既定' : ''" @change="onHex" />
  </div>

  <!-- ベクトル / オイラー -->
  <div v-else-if="['vec2', 'vec3', 'vec4', 'euler'].includes(pd.type)" class="ed ed-vec" :class="{ compact }">
    <label v-for="(n, i) in vecNames" :key="n" :data-axis="n">
      <span>{{ n }}</span>
      <input class="num" type="number" :step="eul ? 1 : (pd.step ?? 0.01)" :value="vecAt(i)" :aria-label="`${pd.label} ${n}`" @input="onVec(i, $event)" @pointerdown="dragVec(i, $event)" />
    </label>
    <span v-if="eul" class="unit">°</span>
  </div>

  <!-- 選択 -->
  <select v-else-if="pd.type === 'enum'" :id="inputId" class="sel" :class="{ compact }" :value="optIndex" :aria-label="pd.label" @change="onEnum">
    <option v-if="optIndex < 0" value="-1" disabled>({{ String(value) }})</option>
    <option v-for="(o, i) in opts" :key="i" :value="i">{{ o.label }}</option>
  </select>

  <!-- テクスチャ -->
  <TextureEditor v-else-if="pd.type === 'texture'" :value="value" :pd="pd" @set="emit('set', $event)" />

  <!-- JSON -->
  <textarea
    v-else-if="pd.type === 'json'" :id="inputId" class="json" :class="{ bad: jsonBad }" rows="2" spellcheck="false"
    :value="jsonText" placeholder="JSON" :aria-label="pd.label" @input="onJson"
  />

  <!-- 文字列 -->
  <input
    v-else :id="inputId" class="txt" :class="{ compact }" type="text" :value="value ?? ''" :aria-label="pd.label"
    :placeholder="pd.def === undefined ? '既定' : ''" @input="emit('set', ($event.target as HTMLInputElement).value === '' ? undefined : ($event.target as HTMLInputElement).value)"
  />
</template>
