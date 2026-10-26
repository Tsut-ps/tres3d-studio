<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { PropDef } from '../schema'
import { DEFAULT_TEX, TEX_PRESETS, drawThumb, type TexDesc } from '../textures'
import { flash } from '../store'
const props = defineProps<{ value: TexDesc | null | undefined; pd: PropDef }>()
const emit = defineEmits<{ (e: 'set', v: TexDesc | undefined): void }>()

const kind = computed(() => (props.value ? props.value.kind : 'none'))
const d = computed<TexDesc>(() => props.value ?? DEFAULT_TEX)
const thumb = ref<HTMLCanvasElement | null>(null)

function paint() {
  if (thumb.value && props.value) drawThumb(thumb.value, props.value)
}
onMounted(paint)
watch(() => JSON.stringify(props.value), paint, { flush: 'post' })

function patch(p: Partial<TexDesc>) {
  emit('set', { ...d.value, ...p })
}
function setKind(k: string) {
  if (k === 'none') return emit('set', undefined)
  if (k === 'preset')
    return emit('set', { ...DEFAULT_TEX, ...(props.value?.kind === 'preset' ? props.value : {}) })
  emit('set', {
    kind: k as any,
    src: k === 'url' ? (props.value?.src ?? '') : '',
    repeat: d.value.repeat ?? [1, 1],
    wrap: d.value.wrap ?? 'repeat',
  })
}

/** 画像ファイルを読み込み、長辺 1024px に縮小して dataURL にする（保存容量を抑える） */
function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 1024 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * s)
      c.height = Math.round(img.height * s)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      patch({ kind: 'upload', src: c.toDataURL('image/jpeg', 0.88) })
    }
    img.onerror = () => flash('画像を読み込めませんでした')
    img.src = String(reader.result)
  }
  reader.readAsDataURL(f)
}
const rep = (i: number) => d.value.repeat?.[i] ?? 1
function setRep(i: number, e: Event) {
  const r: [number, number] = [rep(0), rep(1)]
  const n = Number((e.target as HTMLInputElement).value)
  if (!Number.isNaN(n)) r[i] = n
  patch({ repeat: r })
}
</script>

<template>
  <div class="tex">
    <div class="tex-top">
      <canvas v-show="value" ref="thumb" class="thumb" width="64" height="64" />
      <select
        class="sel"
        :value="kind"
        aria-label="テクスチャの種類"
        @change="setKind(($event.target as HTMLSelectElement).value)"
      >
        <option value="none">なし</option>
        <option value="preset">内蔵パターン</option>
        <option value="upload">画像ファイル</option>
        <option value="url">画像のURL</option>
      </select>
    </div>

    <template v-if="value">
      <template v-if="value.kind === 'preset'">
        <select
          class="sel"
          :value="d.preset"
          aria-label="パターン"
          @change="patch({ preset: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="p in TEX_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
        <div class="tex-row">
          <label
            >色1
            <input
              class="swatch"
              type="color"
              :value="d.c1"
              @input="patch({ c1: ($event.target as HTMLInputElement).value })"
          /></label>
          <label
            >色2
            <input
              class="swatch"
              type="color"
              :value="d.c2"
              @input="patch({ c2: ($event.target as HTMLInputElement).value })"
          /></label>
          <label
            >細かさ
            <input
              class="num"
              type="number"
              min="1"
              max="64"
              step="1"
              :value="d.scale"
              @input="patch({ scale: Number(($event.target as HTMLInputElement).value) })"
          /></label>
        </div>
      </template>
      <template v-else-if="value.kind === 'upload'">
        <input type="file" accept="image/*" class="file" @change="onFile" />
      </template>
      <template v-else>
        <input
          class="txt"
          type="url"
          placeholder="https://…/image.png"
          :value="d.src"
          @change="patch({ src: ($event.target as HTMLInputElement).value })"
        />
        <p class="note">
          公開ページの設定によっては外部画像を読み込めません。その場合は「画像ファイル」を使ってください。
        </p>
      </template>
      <div class="tex-row">
        <label
          >繰り返し
          <input class="num" type="number" step="0.5" :value="rep(0)" @input="setRep(0, $event)" />
          × <input class="num" type="number" step="0.5" :value="rep(1)" @input="setRep(1, $event)"
        /></label>
        <select
          class="sel compact"
          :value="d.wrap ?? 'repeat'"
          aria-label="端の扱い"
          @change="patch({ wrap: ($event.target as HTMLSelectElement).value as any })"
        >
          <option value="repeat">繰り返す</option>
          <option value="mirror">折り返す</option>
          <option value="clamp">端を伸ばす</option>
        </select>
      </div>
    </template>
    <template v-else-if="kind === 'none' && pd.key === 'envMap'"
      ><p class="note">等距円筒図法の画像として扱います。</p></template
    >
  </div>
</template>
