import { reactive, watch } from 'vue'

/** 画面の分割位置。右の列の幅 (px) と、プレビューの高さ (右の列に占める % ではなく作業領域全体の %) */
const KEY = 'tres-blocks:layout'
export const DEFAULT_RIGHT_W = 440
export const DEFAULT_PREV_H = 46
export const LIMITS = { rightMin: 300, rightMaxRatio: 0.62, prevMin: 20, prevMax: 80 }

export const layout = reactive({
  rightW: DEFAULT_RIGHT_W,
  prevH: DEFAULT_PREV_H,
  /** プレビュー拡大。位置は保存しない (一時的な表示) */
  wide: false,
  /** 画面の下に並べたコードの高さ (px) */
  codeH: 300,
})

try {
  const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  if (s && Number.isFinite(s.rightW) && Number.isFinite(s.prevH)) {
    layout.rightW = Math.max(LIMITS.rightMin, Math.min(1200, s.rightW))
    layout.prevH = Math.max(LIMITS.prevMin, Math.min(LIMITS.prevMax, s.prevH))
  }
} catch {
  /* 保存値が読めなければ既定の配置 */
}

watch(
  () => [layout.rightW, layout.prevH],
  () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ rightW: layout.rightW, prevH: layout.prevH }))
    } catch {
      /* 保存できなくても動く */
    }
  },
)

export function resetLayout() {
  layout.rightW = DEFAULT_RIGHT_W
  layout.prevH = DEFAULT_PREV_H
  layout.wide = false
}
