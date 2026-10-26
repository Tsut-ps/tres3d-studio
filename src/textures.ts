// プリセットテクスチャの生成。プレビューとコード書き出しの両方で同じものを使う。
import * as THREE from 'three'

export interface TexDesc {
  kind: 'preset' | 'upload' | 'url'
  preset?: string
  c1?: string
  c2?: string
  /** 模様の細かさ */
  scale?: number
  repeat?: [number, number]
  wrap?: 'repeat' | 'clamp' | 'mirror'
  /** upload: 画像データ(dataURL) / url: アドレス */
  src?: string
  flipY?: boolean
}

export const TEX_PRESETS: { id: string; label: string }[] = [
  { id: 'checker', label: 'チェッカー' },
  { id: 'grid', label: '格子' },
  { id: 'stripes', label: 'ストライプ' },
  { id: 'dots', label: '水玉' },
  { id: 'gradient', label: 'グラデーション (縦)' },
  { id: 'radial', label: '放射グラデーション' },
  { id: 'noise', label: 'ノイズ' },
  { id: 'bricks', label: 'レンガ' },
  { id: 'uv', label: 'UV確認用' },
]

export const DEFAULT_TEX: TexDesc = { kind: 'preset', preset: 'checker', c1: '#ffffff', c2: '#333344', scale: 8, repeat: [1, 1], wrap: 'repeat' }

/** sRGB で解釈するマップ（色を持つもの）。他は数値データ扱い。 */
const SRGB_KEYS = /^(map|emissiveMap|specularColorMap|sheenColorMap|matcap|lightMap)$/

export function drawPreset(ctx: CanvasRenderingContext2D, n: number, d: TexDesc) {
  const c1 = d.c1 ?? '#ffffff', c2 = d.c2 ?? '#333344', s = Math.max(1, Math.round(d.scale ?? 8))
  ctx.fillStyle = c1
  ctx.fillRect(0, 0, n, n)
  const cell = n / s
  switch (d.preset) {
    case 'checker':
      ctx.fillStyle = c2
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if ((x + y) % 2) ctx.fillRect(x * cell, y * cell, cell, cell)
      break
    case 'grid':
      ctx.strokeStyle = c2
      ctx.lineWidth = Math.max(1, n / 128)
      for (let i = 0; i <= s; i++) {
        ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, n); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(n, i * cell); ctx.stroke()
      }
      break
    case 'stripes':
      ctx.fillStyle = c2
      for (let i = 0; i < s; i += 2) ctx.fillRect(i * cell, 0, cell, n)
      break
    case 'dots':
      ctx.fillStyle = c2
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        ctx.beginPath(); ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, cell * 0.3, 0, Math.PI * 2); ctx.fill()
      }
      break
    case 'gradient': {
      const g = ctx.createLinearGradient(0, 0, 0, n)
      g.addColorStop(0, c1); g.addColorStop(1, c2)
      ctx.fillStyle = g; ctx.fillRect(0, 0, n, n)
      break
    }
    case 'radial': {
      const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
      g.addColorStop(0, c1); g.addColorStop(1, c2)
      ctx.fillStyle = g; ctx.fillRect(0, 0, n, n)
      break
    }
    case 'noise': {
      const img = ctx.getImageData(0, 0, n, n)
      const a = new THREE.Color(c1), b = new THREE.Color(c2)
      let seed = 1234567
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
      const blocks = Math.max(1, Math.round(n / s / 2))
      const grid: number[] = []
      for (let i = 0; i < blocks * blocks; i++) grid.push(rnd())
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const t = grid[Math.floor((y / n) * blocks) * blocks + Math.floor((x / n) * blocks)] * 0.6 + rnd() * 0.4
        const o = (y * n + x) * 4
        img.data[o] = (a.r + (b.r - a.r) * t) * 255
        img.data[o + 1] = (a.g + (b.g - a.g) * t) * 255
        img.data[o + 2] = (a.b + (b.b - a.b) * t) * 255
        img.data[o + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
      break
    }
    case 'bricks': {
      ctx.fillStyle = c2
      const rows = s, rh = n / rows, bw = n / Math.max(1, Math.round(s / 2))
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? bw / 2 : 0
        for (let x = -bw; x < n + bw; x += bw) ctx.fillRect(x + off + 2, r * rh + 2, bw - 4, rh - 4)
      }
      break
    }
    case 'uv': {
      const g = ctx.createLinearGradient(0, 0, n, n)
      g.addColorStop(0, '#ff3b30'); g.addColorStop(0.5, '#34c759'); g.addColorStop(1, '#0a84ff')
      ctx.fillStyle = g; ctx.fillRect(0, 0, n, n)
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath(); ctx.moveTo((i * n) / 8, 0); ctx.lineTo((i * n) / 8, n); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, (i * n) / 8); ctx.lineTo(n, (i * n) / 8); ctx.stroke()
      }
      ctx.fillStyle = '#fff'; ctx.font = `bold ${n / 8}px sans-serif`; ctx.fillText('UV', n * 0.08, n * 0.2)
      break
    }
  }
}

const WRAP = { repeat: THREE.RepeatWrapping, clamp: THREE.ClampToEdgeWrapping, mirror: THREE.MirroredRepeatWrapping } as const
const cache = new Map<string, THREE.Texture>()

/** 変更されたら呼び直してもらうためのコールバック（画像の読み込み完了時に再描画） */
export let onTextureLoaded: () => void = () => {}
export function setTextureLoadedHandler(fn: () => void) { onTextureLoaded = fn }

/**
 * 記述 (TexDesc) から THREE.Texture を作る。同じ記述は同じインスタンスを返す。
 * key はプロパティ名。envMap は等距円筒マッピング、色を持つマップは sRGB にする。
 */
export function makeTexture(desc: TexDesc, key = 'map'): THREE.Texture | null {
  if (!desc) return null
  const id = JSON.stringify([desc, key])
  const hit = cache.get(id)
  if (hit) return hit
  let tex: THREE.Texture
  if (desc.kind === 'preset') {
    const n = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = n
    drawPreset(canvas.getContext('2d')!, n, desc)
    tex = new THREE.CanvasTexture(canvas)
  } else if (desc.src) {
    tex = new THREE.TextureLoader().load(desc.src, () => { tex.needsUpdate = true; onTextureLoaded() })
    tex.flipY = desc.flipY ?? true
  } else return null
  tex.wrapS = tex.wrapT = WRAP[desc.wrap ?? 'repeat']
  tex.repeat.set(desc.repeat?.[0] ?? 1, desc.repeat?.[1] ?? 1)
  tex.colorSpace = SRGB_KEYS.test(key) || key === 'envMap' ? THREE.SRGBColorSpace : THREE.NoColorSpace
  if (key === 'envMap') tex.mapping = THREE.EquirectangularReflectionMapping
  tex.anisotropy = 8
  tex.needsUpdate = true
  cache.set(id, tex)
  return tex
}

/** サムネイル用に、プリセットを小さな canvas に描く */
export function drawThumb(canvas: HTMLCanvasElement, desc: TexDesc) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const n = canvas.width
  if (desc.kind === 'preset') { drawPreset(ctx, n, desc); return }
  if (!desc.src) { ctx.clearRect(0, 0, n, n); return }
  const img = new Image()
  img.onload = () => { ctx.clearRect(0, 0, n, n); ctx.drawImage(img, 0, 0, n, n) }
  img.src = desc.src
}
