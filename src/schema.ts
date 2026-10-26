/**
 * ブロック定義レジストリ。
 * three.js のクラスはインスタンスの既定値から、Vue コンポーネント (cientos / post-processing) は
 * props 定義から、プロパティ一覧・型・既定値を実行時に自動抽出する。
 * → three / TresJS のバージョンを上げても、新しいプロパティが自動で現れる。
 */
import * as THREE from 'three'
import * as PP from 'postprocessing'
import {
  OrbitControls, MapControls, Sky, Stars, ContactShadows, SoftShadows, Sparkles, Smoke, Precipitation,
  Backdrop, Grid, Levioso, Billboard, Edges, RoundedBox, Superformula, MeshWobbleMaterial,
  MeshTransmissionMaterial, MeshReflectionMaterial, HolographicMaterial, Lensflare,
} from '@tresjs/cientos'
import * as Post from '@tresjs/post-processing'
import { ENUM_BY_KEY, ENUM_BY_DEF, CANVAS_ENUMS, type Opt } from './enums'
import { LABELS } from './labels'
import { StudioEnv } from './custom'

// ───────── 型 ─────────
export type PType =
  | 'number' | 'int' | 'angle' | 'boolean' | 'string' | 'text' | 'color'
  | 'vec2' | 'vec3' | 'vec4' | 'euler' | 'enum' | 'texture' | 'json'
export type Kind =
  | 'camera' | 'controls' | 'light' | 'object' | 'helper' | 'staging' | 'world'
  | 'geometry' | 'material' | 'behavior' | 'composer' | 'effect'
export type CatId = 'camera' | 'light' | 'object' | 'geometry' | 'material' | 'motion' | 'world' | 'effect' | 'helper'
export type MatFor = 'mesh' | 'points' | 'line' | 'sprite'

export interface PropDef {
  key: string
  type: PType
  def: any
  group: string
  label: string
  options?: Opt[]
  min?: number
  max?: number
  step?: number
  /** WebGL コンテキスト生成時の設定。変更するとキャンバスを作り直す */
  restart?: boolean
  /** three.js の内部で別のプロパティと値が連動する (power と intensity など) */
  linked?: boolean
  hint?: string
}

export interface BlockDef {
  id: string
  label: string
  kind: Kind
  cat: CatId
  source: 'three' | 'vue' | 'custom'
  /** three: TresMesh など / vue: コンポーネント名 */
  tag: string
  comp?: any
  importFrom?: string
  slots?: { geometry?: boolean; material?: MatFor; children?: boolean }
  childKinds?: Kind[]
  matFor?: MatFor
  attach?: string
  argKeys?: string[]
  props: PropDef[]
  propMap: Record<string, PropDef>
  primary: string[]
  init?: Record<string, any>
  auto?: { geometry?: string; material?: string }
  desc?: string
  /** 使う前に知っておくべき制限。インスペクタに常に表示する */
  warn?: string
  /** 検索用の別名 */
  aka?: string
}

export const CATS: { id: CatId; label: string }[] = [
  { id: 'object', label: 'オブジェクト' },
  { id: 'geometry', label: '形状' },
  { id: 'material', label: '素材' },
  { id: 'light', label: 'ライト' },
  { id: 'camera', label: 'カメラ' },
  { id: 'motion', label: '動き' },
  { id: 'world', label: '背景・環境' },
  { id: 'effect', label: 'エフェクト' },
  { id: 'helper', label: '補助' },
]

// ───────── 共通ヘルパー ─────────
const OBJECT_CHILD_KINDS: Kind[] = ['object', 'light', 'camera', 'helper', 'staging']

const RANGES: Record<string, [number, number, number]> = {
  opacity: [0, 1, 0.01], roughness: [0, 1, 0.01], metalness: [0, 1, 0.01], alphaTest: [0, 1, 0.01],
  reflectivity: [0, 1, 0.01], clearcoat: [0, 1, 0.01], clearcoatRoughness: [0, 1, 0.01], sheen: [0, 1, 0.01],
  sheenRoughness: [0, 1, 0.01], transmission: [0, 1, 0.01], iridescence: [0, 1, 0.01], anisotropy: [0, 1, 0.01],
  penumbra: [0, 1, 0.01], specularIntensity: [0, 1, 0.01], shininess: [0, 200, 1], intensity: [0, 20, 0.05],
  distance: [0, 100, 0.1], decay: [0, 5, 0.05], fov: [1, 170, 1], near: [0.01, 20, 0.01], far: [1, 2000, 1],
  zoom: [0.1, 5, 0.01], aspect: [0.2, 4, 0.01], emissiveIntensity: [0, 10, 0.05], envMapIntensity: [0, 5, 0.05],
  bumpScale: [-5, 5, 0.01], displacementScale: [0, 5, 0.01], displacementBias: [-2, 2, 0.01], ior: [1, 2.333, 0.001],
  thickness: [0, 10, 0.01], attenuationDistance: [0, 100, 0.1], dispersion: [0, 5, 0.01], size: [0, 10, 0.01],
  linewidth: [1, 10, 1], dashSize: [0, 5, 0.01], gapSize: [0, 5, 0.01], aoMapIntensity: [0, 5, 0.01],
  lightMapIntensity: [0, 5, 0.01], iridescenceIOR: [1, 2.333, 0.001], anisotropyRotation: [-3.1416, 3.1416, 0.01],
  'shadow-bias': [-0.01, 0.01, 0.0001], 'shadow-normalBias': [0, 0.5, 0.001], 'shadow-radius': [0, 20, 0.1],
  'shadow-intensity': [0, 1, 0.01], 'shadow-blurSamples': [1, 32, 1], toneMappingExposure: [0, 5, 0.01],
  clearAlpha: [0, 1, 0.01], renderOrder: [-10, 10, 1], polygonOffsetFactor: [-10, 10, 0.1], polygonOffsetUnits: [-10, 10, 0.1],
  dpr: [0.5, 3, 0.1], focus: [0, 100, 0.1], filmGauge: [1, 100, 1], filmOffset: [-50, 50, 0.1],
}
const INT_RE = /Segments$|^segments$|^detail$|^renderOrder$|^stencil(Ref|WriteMask|FuncMask)$|^samples$|^count$|^p$|^q$|^blurSamples$/
const ANGLE_KEYS = new Set(['thetaStart', 'thetaLength', 'phiStart', 'phiLength', 'arc', 'angle', 'anisotropyRotation'])
const TEXTURE_KEYS = new Set(['matcap', 'gradientMap'])
const ARGS_PRIORITY = ['position', 'rotation', 'scale', 'color', 'intensity', 'opacity', 'roughness', 'metalness']

const SKIP_KEYS = new Set([
  'id', 'uuid', 'type', 'parent', 'children', 'geometry', 'material', 'quaternion', 'matrix', 'matrixWorld',
  'matrixWorldInverse', 'projectionMatrix', 'projectionMatrixInverse', 'modelViewMatrix', 'normalMatrix',
  'matrixWorldNeedsUpdate', 'animations', 'layers', 'target', 'shadow', 'view', 'version', 'defines', 'uniforms',
  'extensions', 'clippingPlanes', 'customDepthMaterial', 'customDistanceMaterial', 'morphTargetDictionary',
  'morphTargetInfluences', 'coordinateSystem', 'reversedDepth', 'pivot', 'count', 'biasNode', 'blendAlpha',
])

export function groupOf(key: string, kind: Kind): string {
  if (kind === 'geometry') return 'geom'
  if (['position', 'rotation', 'scale', 'up', 'lookAt'].includes(key)) return 'transform'
  if (/Map$|^map$|^matcap$|^gradientMap$|^normalScale$|^bumpScale$|^displacement(Scale|Bias)$|^(ao|lightMap|envMap)(Intensity|Rotation)$|^envMapRotation$/.test(key)) return 'maps'
  if (/^(clearcoat|sheen|transmission|ior|iridescence|thickness|attenuation|specular|anisotropy|reflectivity|dispersion|roughness|metalness)/.test(key)) return 'pbr'
  if (/^(castShadow|receiveShadow|shadow)/.test(key)) return 'shadow'
  if (/^(blend|depth|stencil|alphaTest|alphaHash|alphaToCoverage|polygon|colorWrite|clip|dithering|premultiplied|toneMapped|forceSinglePass|precision|allowOverride|side$|fog$|vertexColors|flatShading|visible|frustumCulled|renderOrder|matrix|static)/.test(key)) return 'render'
  if (kind === 'light' && /^(color|intensity|distance|decay|angle|penumbra|groundColor|power|width|height)$/.test(key)) return 'light'
  if (kind === 'camera' && /^(fov|near|far|zoom|aspect|focus|film|left|right|top|bottom)/.test(key)) return 'camera'
  if (key === 'name' || key === 'userData') return 'other'
  if (kind === 'material') return 'look'
  return 'main'
}

function labelOf(key: string) {
  return LABELS[key] ?? (key.includes('-') ? LABELS[key.split('-').pop()!] ?? key : key)
}

const hex = (c: THREE.Color) => '#' + c.getHexString()

function numberDef(key: string, v: number, kind: Kind, extra: Partial<PropDef> = {}): PropDef {
  const isAngle = ANGLE_KEYS.has(key)
  const isInt = INT_RE.test(key)
  const r = RANGES[key]
  const p: PropDef = {
    key, def: v, label: labelOf(key), group: groupOf(key, kind),
    type: isAngle ? 'angle' : isInt ? 'int' : 'number', ...extra,
  }
  if (r) [p.min, p.max, p.step] = r
  else if (isAngle) [p.min, p.max, p.step] = [0, Math.PI * 2, 0.01]
  else if (isInt) { p.min = 0; p.max = Math.max(32, v * 4); p.step = 1 }
  else {
    const m = Math.abs(v)
    p.min = v < 0 ? -Math.max(10, m * 4) : 0
    p.max = Math.max(10, m * 4)
    p.step = m >= 100 ? 1 : 0.01
  }
  return p
}

/** three.js インスタンスの値から PropDef を作る（作れないものは null） */
function classify(key: string, v: any, kind: Kind, defId = ''): PropDef | null {
  if (SKIP_KEYS.has(key) || key.startsWith('_') || /^is[A-Z]/.test(key)) return null
  const base = { key, label: labelOf(key), group: groupOf(key, kind) }
  const en = ENUM_BY_DEF[defId]?.[key] ?? ENUM_BY_KEY[key]
  if (en && (typeof v === 'number' || typeof v === 'string' || v === null)) return { ...base, type: 'enum', def: v, options: en }
  if (typeof v === 'boolean') return { ...base, type: 'boolean', def: v }
  if (typeof v === 'number') return Number.isFinite(v) ? numberDef(key, v, kind) : { ...numberDef(key, 0, kind), def: undefined, hint: '未設定なら制限なし' }
  if (typeof v === 'string') return { ...base, type: 'string', def: v }
  if (v?.isColor) return { ...base, type: 'color', def: hex(v) }
  if (v?.isVector2) return { ...base, type: 'vec2', def: [v.x, v.y], min: -10, max: 10, step: 0.01 }
  if (v?.isVector3) return { ...base, type: 'vec3', def: [v.x, v.y, v.z], min: -10, max: 10, step: 0.01 }
  if (v?.isVector4) return { ...base, type: 'vec4', def: [v.x, v.y, v.z, v.w], min: -10, max: 10, step: 0.01 }
  if (v?.isEuler) return { ...base, type: 'euler', def: [v.x, v.y, v.z] }
  if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')) return { ...base, type: 'vec2', def: [...v], min: 0, max: 1000, step: 1 }
  if (v === null && (/Map$/.test(key) || /^map$/.test(key) || TEXTURE_KEYS.has(key))) return { ...base, type: 'texture', def: null }
  if (key === 'userData') return { ...base, type: 'json', def: {} }
  return null
}

function collectKeys(inst: any): string[] {
  const keys = new Set<string>()
  let o = inst
  while (o && o !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(o)) {
      if (k === 'constructor') continue
      const d = Object.getOwnPropertyDescriptor(o, k)!
      if ('value' in d) { if (typeof d.value === 'function') continue }
      else if (!(d.get && d.set)) continue
      keys.add(k)
    }
    o = Object.getPrototypeOf(o)
  }
  return [...keys]
}

/** three.js 内部で互いに値を書き換え合うプロパティ。気づけるよう注記する */
const LINKED: Record<string, string> = {
  power: '明るさ(intensity)と連動。どちらか一方だけを使う',
  reflectivity: '屈折率(ior)と連動。どちらか一方だけを使う',
  ior: '反射率(reflectivity)と連動。どちらか一方だけを使う',
}

function sortProps(list: PropDef[]) {
  for (const p of list) if (LINKED[p.key]) { p.linked = true; if (!p.hint) p.hint = LINKED[p.key] }
  return list.sort((a, b) => {
    const ia = ARGS_PRIORITY.indexOf(a.key), ib = ARGS_PRIORITY.indexOf(b.key)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
}

function threeProps(inst: any, kind: Kind, defId: string): PropDef[] {
  const out: PropDef[] = []
  for (const key of collectKeys(inst)) {
    let v: any
    try { v = inst[key] } catch { continue }
    const p = classify(key, v, kind, defId)
    if (p) out.push(p)
  }
  // ライトの影（ネストしたプロパティは shadow-xxx のパス形式で指定する）
  if (inst.shadow) {
    const sh = inst.shadow
    const add = (k: string, v: any, extra: Partial<PropDef> = {}) => {
      const p = classify(k, v, kind, defId)
      if (p) out.push({ ...p, key: `shadow-${k}`, group: 'shadow', label: `影: ${labelOf(k)}`, ...(RANGES[`shadow-${k}`] ? { min: RANGES[`shadow-${k}`][0], max: RANGES[`shadow-${k}`][1], step: RANGES[`shadow-${k}`][2] } : {}), ...extra })
    }
    for (const k of ['bias', 'normalBias', 'radius', 'blurSamples', 'intensity']) if (typeof sh[k] === 'number') add(k, sh[k])
    if (sh.mapSize) out.push({ key: 'shadow-mapSize', type: 'vec2', def: [sh.mapSize.x, sh.mapSize.y], group: 'shadow', label: '影: 解像度', min: 128, max: 4096, step: 128 })
    if (sh.camera) {
      const cam = sh.camera
      for (const k of ['near', 'far', 'left', 'right', 'top', 'bottom', 'fov']) {
        if (typeof cam[k] === 'number') {
          const p = numberDef(k, cam[k], 'camera')
          out.push({ ...p, key: `shadow-camera-${k}`, group: 'shadow', label: `影カメラ: ${labelOf(k)}` })
        }
      }
    }
  }
  return sortProps(out)
}

/** lookAt など three のインスタンスには無いが TresJS が受け付けるプロパティ */
const LOOKAT: PropDef = { key: 'lookAt', type: 'vec3', def: null, group: 'transform', label: labelOf('lookAt'), min: -20, max: 20, step: 0.1, hint: '指定した点を向く（設定すると回転より優先）' }

// ───────── Vue コンポーネントの props からの抽出 ─────────
const VUE_SKIP = new Set([
  'camera', 'domElement', 'geometry', 'material', 'portal', 'calculatePosition', 'as', 'buffer', 'background', 'keys',
  'touches', 'mouseButtons', 'files', 'path', 'outlinedObjects', 'lightSource', 'distortionMap', 'perturbationMap',
  'patternTexture', 'asciiTexture', 'elements', 'seedProps', 'directionalLight', 'wrapperClass', 'occlude', 'align',
  'lighting', 'environment', 'transmissionSampler', 'text', 'font', 'texture', 'waterNormals', 'map',
  'dtSize', 'depthBuffer', 'stencilBuffer', 'resolutionScale', 'enabled', 'disableNormalPass', 'autoClear', 'multisampling',
])
const VUE_RANGES: Record<string, [number, number, number]> = {
  intensity: [0, 10, 0.01], opacity: [0, 1, 0.01], blur: [0, 10, 0.01], count: [1, 20000, 1], size: [0, 10, 0.01],
  speed: [0, 5, 0.01], elevation: [-5, 90, 0.1], azimuth: [0, 360, 1], turbidity: [0, 20, 0.1], rayleigh: [0, 10, 0.1],
  mieCoefficient: [0, 0.1, 0.001], mieDirectionalG: [0, 1, 0.01], darkness: [0, 1, 0.01], offset: [0, 1, 0.01],
  luminanceThreshold: [0, 2, 0.01], luminanceSmoothing: [0, 1, 0.001], radius: [0, 2, 0.01], granularity: [0, 100, 1],
  saturation: [-1, 1, 0.01], hue: [-3.1416, 3.1416, 0.01], dampingFactor: [0, 1, 0.01], autoRotateSpeed: [-20, 20, 0.1],
  zoomSpeed: [0, 5, 0.01], rotateSpeed: [0, 5, 0.01], minDistance: [0, 100, 0.1], maxDistance: [0, 500, 0.1],
  minPolarAngle: [0, Math.PI, 0.01], maxPolarAngle: [0, Math.PI, 0.01], density: [0, 5, 0.01], scale: [0, 50, 0.1],
  samples: [1, 32, 1], resolution: [64, 2048, 64], thickness: [0, 5, 0.01], roughness: [0, 1, 0.01], chromaticAberration: [0, 1, 0.01],
  distortion: [0, 5, 0.01], distortionScale: [0, 5, 0.01], ior: [1, 2.333, 0.001], factor: [0, 5, 0.01],
}
const VUE_INT = /^(count|samples|resolution|segments|kernelSize|cellSize|granularity|multisampling|aoSamples|denoiseSamples|dtSize)$/

function typeNames(t: any): string[] {
  if (t == null) return ['any']
  if (Array.isArray(t)) return t.flatMap(typeNames)
  return [t.name ?? String(t)]
}

function vueProps(defId: string, comp: any, effectDefaults: Record<string, any> = {}, overrides: Record<string, Partial<PropDef> | null> = {}): PropDef[] {
  const props = comp?.props
  if (!props) return []
  const out: PropDef[] = []
  for (const key of Object.keys(props)) {
    if (key in overrides && overrides[key] === null) continue
    if (VUE_SKIP.has(key) && !overrides[key]) continue
    const d = props[key]
    const types = typeNames(d && typeof d === 'object' && 'type' in d ? d.type : d)
    if (types.includes('Function')) continue
    let def = d?.default
    if (typeof def === 'function') { try { def = def() } catch { def = undefined } }
    if (def === undefined && key in effectDefaults) def = effectDefaults[key]
    const unbounded = typeof def === 'number' && !Number.isFinite(def)
    if (unbounded) def = undefined
    const ov = overrides[key] ?? {}
    const en = ENUM_BY_DEF[defId]?.[key] ?? ENUM_BY_KEY[key]
    const base = { key, label: labelOf(key), group: /^(mix|sequence)/.test(key) ? 'advanced' : 'main' }
    let p: PropDef | null = null
    if (en && (types.includes('Number') || types.includes('String') || types.includes('any'))) {
      p = { ...base, type: 'enum', def, options: en }
    } else if (types.includes('Boolean') && !types.includes('String') && !types.includes('Array')) {
      p = { ...base, type: 'boolean', def: def ?? false }
    } else if (/color$/i.test(key) || (typeof def === 'string' && /^#[0-9a-f]{3,8}$/i.test(def)) || (/^(color|tint)$/i.test(key))) {
      const c = typeof def === 'number' ? '#' + new THREE.Color(def).getHexString() : typeof def === 'string' ? safeColor(def) : '#ffffff'
      p = { ...base, type: 'color', def: def === undefined ? undefined : c }
    } else if (types.includes('Number') && !types.includes('Array')) {
      const v = typeof def === 'number' ? def : undefined
      const np = numberDef(key, v ?? 0, 'main')
      np.def = v
      const r = VUE_RANGES[key]
      if (r) [np.min, np.max, np.step] = r
      if (VUE_INT.test(key)) { np.type = 'int'; np.step = 1 }
      p = { ...np, group: base.group }
    } else if (types.includes('String') && !types.includes('Object')) {
      p = { ...base, type: 'string', def }
    } else if (/map$/i.test(key) && (types.includes('Object') || types.includes('any'))) {
      p = { ...base, type: 'texture', def: null }
    } else if (Array.isArray(def) && def.length >= 2 && def.length <= 4 && def.every((n: any) => typeof n === 'number')) {
      p = { ...base, type: (`vec${def.length}`) as PType, def: [...def], min: -20, max: 20, step: 0.01 }
    } else if (def && typeof def === 'object' && !Array.isArray(def) && 'x' in def && 'y' in def) {
      const arr = 'z' in def ? [def.x, def.y, def.z] : [def.x, def.y]
      p = { ...base, type: (`vec${arr.length}`) as PType, def: arr, min: -20, max: 20, step: 0.01 }
    } else if (types.includes('Array') || types.includes('Object')) {
      p = { ...base, type: 'json', def: def ?? null }
    } else if (def !== undefined && typeof def === 'number') {
      p = { ...numberDef(key, def, 'main'), group: base.group }
    }
    if (!p) continue
    if (unbounded || (def === null && p.type === 'number')) p.hint = '未設定なら制限なし'
    out.push({ ...p, ...ov })
  }
  return out
}

function safeColor(s: string) {
  try { return '#' + new THREE.Color(s as any).getHexString() } catch { return '#ffffff' }
}

// ───────── レジストリ構築 ─────────
export const REG: Record<string, BlockDef> = {}

function register(d: Omit<BlockDef, 'propMap' | 'primary'> & { primary?: string[] }) {
  const propMap: Record<string, PropDef> = {}
  for (const p of d.props) propMap[p.key] = p
  const primary = (d.primary ?? defaultPrimary(d as any)).filter((k) => propMap[k])
  REG[d.id] = { ...d, propMap, primary } as BlockDef
}

function defaultPrimary(d: BlockDef): string[] {
  switch (d.kind) {
    case 'camera': return ['position', 'fov']
    case 'light': return ['color', 'intensity']
    case 'object': case 'helper': return ['position']
    case 'geometry': return d.props.filter((p) => !/Segments$|^detail$|Start$|Length$|^arc$|openEnded|^segments$/.test(p.key)).slice(0, 3).map((p) => p.key)
    case 'material': return ['color', 'opacity']
    default: return d.props.filter((p) => ['number', 'int', 'color', 'boolean', 'angle'].includes(p.type)).slice(0, 2).map((p) => p.key)
  }
}

const jp = (s: string) => s

function addThreeObject(cls: string, label: string, extra: Partial<BlockDef> & { kind: Kind; cat: CatId }, ctor?: () => any) {
  const inst = ctor ? ctor() : new (THREE as any)[cls]()
  let props = threeProps(inst, extra.kind, `three:${cls}`)
  // 影を作れないライトに castShadow を出すと three.js が警告を出し続けるので隠す
  if (cls === 'AmbientLight' || cls === 'HemisphereLight') props = props.filter((p) => p.key !== 'castShadow')
  if (['object', 'light', 'camera'].includes(extra.kind) && !props.find((p) => p.key === 'lookAt')) props.push({ ...LOOKAT })
  register({ id: `three:${cls}`, label, source: 'three', tag: `Tres${cls}`, props, ...extra } as any)
}

// ── カメラ
addThreeObject('PerspectiveCamera', jp('パースカメラ'), {
  kind: 'camera', cat: 'camera', init: { position: [6, 5, 8], lookAt: [0, 0, 0] }, aka: 'camera perspective',
  desc: '遠近感のある標準的なカメラ',
})
addThreeObject('OrthographicCamera', jp('平行投影カメラ'), {
  kind: 'camera', cat: 'camera', init: { position: [6, 5, 8], lookAt: [0, 0, 0], zoom: 80 }, aka: 'camera orthographic',
  desc: '遠近感のないカメラ',
})
// OrthographicCamera の zoom の範囲を広げる
if (REG['three:OrthographicCamera'].propMap.zoom) Object.assign(REG['three:OrthographicCamera'].propMap.zoom, { min: 1, max: 300, step: 1 })

// ── ライト
addThreeObject('AmbientLight', jp('環境光'), { kind: 'light', cat: 'light', init: { intensity: 0.6 }, aka: 'ambient light' })
addThreeObject('DirectionalLight', jp('平行光源'), {
  kind: 'light', cat: 'light', init: { position: [5, 8, 4], intensity: 2.5, castShadow: true }, aka: 'directional sun light',
})
addThreeObject('PointLight', jp('点光源'), { kind: 'light', cat: 'light', init: { position: [0, 4, 0], intensity: 60, distance: 0, decay: 2 }, aka: 'point light' })
addThreeObject('SpotLight', jp('スポットライト'), {
  kind: 'light', cat: 'light', init: { position: [3, 6, 3], intensity: 150, angle: 0.5, penumbra: 0.4, castShadow: true, lookAt: [0, 0, 0] }, aka: 'spot light',
})
addThreeObject('HemisphereLight', jp('半球ライト'), { kind: 'light', cat: 'light', init: { color: '#bcd7ff', groundColor: '#3a2a1a', intensity: 1 }, aka: 'hemisphere light sky' })
// HemisphereLight の color は空の色
// ── オブジェクト
const MESHLIKE = { geometry: true, children: true }
addThreeObject('Mesh', jp('メッシュ'), {
  kind: 'object', cat: 'object', slots: { ...MESHLIKE, material: 'mesh' }, childKinds: OBJECT_CHILD_KINDS,
  auto: { geometry: 'three:BoxGeometry', material: 'three:MeshStandardMaterial' }, init: { position: [0, 0.5, 0], castShadow: true, receiveShadow: true },
  aka: 'mesh 立体 box',
})
addThreeObject('Group', jp('グループ'), { kind: 'object', cat: 'object', slots: { children: true }, childKinds: OBJECT_CHILD_KINDS, aka: 'group まとめる' })
addThreeObject('Points', jp('点群'), {
  kind: 'object', cat: 'object', slots: { ...MESHLIKE, material: 'points' }, childKinds: OBJECT_CHILD_KINDS,
  auto: { geometry: 'three:SphereGeometry', material: 'three:PointsMaterial' }, aka: 'points particles',
})
addThreeObject('Line', jp('線'), {
  kind: 'object', cat: 'object', slots: { ...MESHLIKE, material: 'line' }, childKinds: OBJECT_CHILD_KINDS,
  auto: { geometry: 'three:CircleGeometry', material: 'three:LineBasicMaterial' }, aka: 'line',
})
addThreeObject('LineSegments', jp('線分'), {
  kind: 'object', cat: 'object', slots: { ...MESHLIKE, material: 'line' }, childKinds: OBJECT_CHILD_KINDS,
  auto: { geometry: 'three:BoxGeometry', material: 'three:LineBasicMaterial' }, aka: 'line segments wire',
})
addThreeObject('Sprite', jp('スプライト'), {
  kind: 'object', cat: 'object', slots: { material: 'sprite', children: true }, childKinds: OBJECT_CHILD_KINDS,
  auto: { material: 'three:SpriteMaterial' }, init: { position: [0, 1, 0] }, aka: 'sprite billboard',
})

// ── 補助 (args で作るヘルパー)
function addHelper(cls: string, label: string, args: PropDef[]) {
  const base = threeProps(new THREE.Object3D(), 'helper', `three:${cls}`).filter((p) => ['position', 'rotation', 'scale', 'visible', 'renderOrder', 'name'].includes(p.key))
  register({
    id: `three:${cls}`, label, source: 'three', tag: `Tres${cls}`, kind: 'helper', cat: 'helper',
    argKeys: args.map((a) => a.key), props: [...args, ...base], aka: 'helper',
  } as any)
}
const gp = (key: string, def: any, type: PType, extra: Partial<PropDef> = {}): PropDef => ({ key, def, type, group: 'geom', label: labelOf(key), ...extra })
addHelper('AxesHelper', jp('座標軸'), [gp('size', 5, 'number', { min: 0.1, max: 50, step: 0.1 })])
addHelper('GridHelper', jp('グリッド'), [
  gp('size', 10, 'number', { min: 1, max: 100, step: 1 }), gp('divisions', 10, 'int', { min: 1, max: 100, step: 1, label: '分割数' }),
  gp('color1', '#444444', 'color', { label: '中心線の色' }), gp('color2', '#888888', 'color', { label: '線の色' }),
])
addHelper('PolarGridHelper', jp('円形グリッド'), [
  gp('radius', 10, 'number', { min: 1, max: 100, step: 1 }), gp('sectors', 16, 'int', { min: 1, max: 64, step: 1, label: '放射線の数' }),
  gp('rings', 8, 'int', { min: 1, max: 64, step: 1, label: '輪の数' }), gp('divisions', 64, 'int', { min: 3, max: 256, step: 1, label: '円の分割数' }),
  gp('color1', '#444444', 'color', { label: '中心線の色' }), gp('color2', '#888888', 'color', { label: '線の色' }),
])

// ── 形状 (parameters の並び順がそのままコンストラクタ引数の順)
const GEOMETRIES: [string, string][] = [
  ['BoxGeometry', '直方体'], ['SphereGeometry', '球'], ['CylinderGeometry', '円柱'], ['ConeGeometry', '円錐'],
  ['TorusGeometry', 'トーラス'], ['TorusKnotGeometry', 'トーラスノット'], ['PlaneGeometry', '平面'],
  ['CircleGeometry', '円'], ['RingGeometry', 'リング'], ['CapsuleGeometry', 'カプセル'],
  ['TetrahedronGeometry', '正四面体'], ['OctahedronGeometry', '正八面体'], ['DodecahedronGeometry', '正十二面体'],
  ['IcosahedronGeometry', '正二十面体'],
]
for (const [cls, label] of GEOMETRIES) {
  const inst = new (THREE as any)[cls]()
  const params: Record<string, any> = inst.parameters
  const props: PropDef[] = Object.entries(params).map(([k, v]) => {
    if (typeof v === 'boolean') return { key: k, type: 'boolean', def: v, group: 'geom', label: labelOf(k) } as PropDef
    return { ...numberDef(k, v as number, 'geometry'), group: 'geom' }
  })
  register({
    id: `three:${cls}`, label, source: 'three', tag: `Tres${cls}`, kind: 'geometry', cat: 'geometry',
    argKeys: Object.keys(params), props, aka: cls,
  } as any)
}

// ── 素材
const MATERIALS: [string, string, MatFor, string?][] = [
  ['MeshStandardMaterial', '標準 (PBR)', 'mesh', 'standard pbr'],
  ['MeshPhysicalMaterial', '物理 (ガラス等)', 'mesh', 'physical glass'],
  ['MeshBasicMaterial', 'ベーシック', 'mesh', 'basic unlit'],
  ['MeshLambertMaterial', 'ランバート', 'mesh', 'lambert'],
  ['MeshPhongMaterial', 'フォン', 'mesh', 'phong'],
  ['MeshToonMaterial', 'トゥーン', 'mesh', 'toon cel'],
  ['MeshNormalMaterial', '法線', 'mesh', 'normal'],
  ['MeshDepthMaterial', '深度', 'mesh', 'depth'],
  ['MeshMatcapMaterial', 'マットキャップ', 'mesh', 'matcap'],
  ['ShadowMaterial', '影だけ', 'mesh', 'shadow catcher'],
  ['PointsMaterial', '点', 'points', 'points'],
  ['LineBasicMaterial', '線', 'line', 'line'],
  ['LineDashedMaterial', '破線', 'line', 'dashed'],
  ['SpriteMaterial', 'スプライト', 'sprite', 'sprite'],
]
for (const [cls, label, matFor, aka] of MATERIALS) {
  const inst = new (THREE as any)[cls]()
  const props = threeProps(inst, 'material', `three:${cls}`).filter((p) => p.key !== 'name' || true)
  register({
    id: `three:${cls}`, label, source: 'three', tag: `Tres${cls}`, kind: 'material', cat: 'material', matFor, props, aka,
  } as any)
}
// MeshStandardMaterial 系の物理量を、見た目のグループの先頭に出す
for (const id of ['three:MeshStandardMaterial', 'three:MeshPhysicalMaterial']) {
  const d = REG[id]
  d.props.sort((a, b) => (a.group === 'look' ? -1 : 0) - (b.group === 'look' ? -1 : 0))
}

// ── シーン全体に付く設定 (fog / 背景)
function addWorld(cls: string, label: string, args: PropDef[], attach: string, aka = '') {
  register({ id: `three:${cls}`, label, source: 'three', tag: `Tres${cls}`, kind: 'world', cat: 'world', attach, argKeys: args.map((a) => a.key), props: args, aka } as any)
}
addWorld('Fog', 'フォグ (直線)', [
  gp('color', '#c9d6e8', 'color'), gp('near', 5, 'number', { min: 0, max: 200, step: 0.5, label: '開始距離' }), gp('far', 40, 'number', { min: 1, max: 500, step: 0.5, label: '終了距離' }),
], 'fog', 'fog 霧')
addWorld('FogExp2', 'フォグ (指数)', [
  gp('color', '#c9d6e8', 'color'), gp('density', 0.04, 'number', { min: 0, max: 0.5, step: 0.001, label: '密度' }),
], 'fog', 'fog 霧')
addWorld('Color', '背景色', [gp('color', '#1b2233', 'color')], 'background', 'background')

// ── cientos / post-processing / custom
function vueDef(opts: {
  id: string; label: string; kind: Kind; cat: CatId; comp: any; importFrom: string; tag: string
  slots?: BlockDef['slots']; childKinds?: Kind[]; matFor?: MatFor; init?: Record<string, any>; aka?: string; desc?: string; warn?: string
  overrides?: Record<string, Partial<PropDef> | null>; defaults?: Record<string, any>; withTransform?: boolean; primary?: string[]
}) {
  let props = vueProps(opts.id, opts.comp, opts.defaults ?? {}, opts.overrides ?? {})
  if (opts.withTransform) {
    props = [...threeProps(new THREE.Object3D(), 'object', opts.id).filter((p) => ['position', 'rotation', 'scale', 'visible'].includes(p.key)), ...props]
  }
  register({ ...opts, source: 'vue', props } as any)
}

vueDef({ id: 'vue:OrbitControls', primary: ['autoRotate', 'enableDamping'], label: 'オービットコントロール', kind: 'controls', cat: 'camera', comp: OrbitControls, importFrom: '@tresjs/cientos', tag: 'OrbitControls', init: { makeDefault: true }, aka: 'orbit controls マウス操作', desc: 'ドラッグで回り込み、ホイールで拡大縮小', overrides: { target: { type: 'vec3' } } })
vueDef({ id: 'vue:MapControls', primary: ['enableDamping'], label: 'マップコントロール', kind: 'controls', cat: 'camera', comp: MapControls, importFrom: '@tresjs/cientos', tag: 'MapControls', init: { makeDefault: true }, aka: 'map controls', overrides: { target: { type: 'vec3' } } })

vueDef({ id: 'vue:Sky', primary: ['elevation', 'azimuth'], label: '空 (Sky)', kind: 'staging', cat: 'world', comp: Sky, importFrom: '@tresjs/cientos', tag: 'Sky', aka: 'sky 空 太陽' })
vueDef({ id: 'vue:Stars', primary: ['count', 'size'], label: '星空', kind: 'staging', cat: 'world', comp: Stars, importFrom: '@tresjs/cientos', tag: 'Stars', aka: 'stars 星' })
vueDef({ id: 'vue:ContactShadows', primary: ['opacity', 'blur'], label: 'コンタクトシャドウ', kind: 'staging', cat: 'world', comp: ContactShadows, importFrom: '@tresjs/cientos', tag: 'ContactShadows', init: { opacity: 0.6, blur: 2, scale: 10 }, aka: 'contact shadows 接地影', withTransform: true })
vueDef({ id: 'vue:SoftShadows', primary: ['size'], label: 'ソフトシャドウ', kind: 'staging', cat: 'world', comp: SoftShadows, importFrom: '@tresjs/cientos', tag: 'SoftShadows', aka: 'soft shadows',
  desc: '影の縁をやわらかくする', warn: 'samples・focus は three r186 との相性が悪く、シェーダーが壊れるため非対応です', overrides: { samples: null, focus: null } })
vueDef({ id: 'vue:Sparkles', primary: ['size', 'alpha'], label: 'きらめき', kind: 'staging', cat: 'world', comp: Sparkles, importFrom: '@tresjs/cientos', tag: 'Sparkles', aka: 'sparkles', withTransform: true, overrides: { map: null } })
vueDef({ id: 'vue:Smoke', primary: ['color', 'opacity'], label: '煙', kind: 'staging', cat: 'world', comp: Smoke, importFrom: '@tresjs/cientos', tag: 'Smoke', aka: 'smoke', withTransform: true })
vueDef({ id: 'vue:Precipitation', primary: ['count', 'speed'], label: '雨・雪', kind: 'staging', cat: 'world', comp: Precipitation, importFrom: '@tresjs/cientos', tag: 'Precipitation', aka: 'rain snow precipitation', withTransform: true })
vueDef({ id: 'vue:Backdrop', primary: ['floor'], label: 'バックドロップ', kind: 'staging', cat: 'world', comp: Backdrop, importFrom: '@tresjs/cientos', tag: 'Backdrop', slots: { material: 'mesh' }, childKinds: [], aka: 'backdrop 背景壁', withTransform: true })
vueDef({ id: 'vue:Grid', primary: ['cellSize', 'sectionSize'], label: '無限グリッド', kind: 'staging', cat: 'helper', comp: Grid, importFrom: '@tresjs/cientos', tag: 'Grid', aka: 'grid', withTransform: true, overrides: { args: null } })
vueDef({ id: 'vue:Lensflare', primary: ['scale'], label: 'レンズフレア', kind: 'staging', cat: 'world', comp: Lensflare, importFrom: '@tresjs/cientos', tag: 'Lensflare', aka: 'lens flare', withTransform: true, overrides: { elements: null, seed: null } })
vueDef({ id: 'vue:Levioso', primary: ['speed', 'floatFactor'], label: 'ふわふわ浮かせる', kind: 'object', cat: 'motion', comp: Levioso, importFrom: '@tresjs/cientos', tag: 'Levioso', slots: { children: true }, childKinds: OBJECT_CHILD_KINDS, aka: 'levioso float 浮遊', withTransform: true, desc: '中に入れた物をゆらゆら浮かせる' })
vueDef({ id: 'vue:Billboard', primary: ['lockY'], label: '常にカメラ目線', kind: 'object', cat: 'motion', comp: Billboard, importFrom: '@tresjs/cientos', tag: 'Billboard', slots: { children: true }, childKinds: OBJECT_CHILD_KINDS, aka: 'billboard', withTransform: true })
vueDef({ id: 'vue:Edges', primary: ['color', 'threshold'], label: '輪郭線', kind: 'object', cat: 'object', comp: Edges, importFrom: '@tresjs/cientos', tag: 'Edges', aka: 'edges outline', desc: 'メッシュの子として入れると輪郭線が付く' })
vueDef({ id: 'vue:RoundedBox', primary: ['position'], label: '角丸の箱', kind: 'object', cat: 'object', comp: RoundedBox, importFrom: '@tresjs/cientos', tag: 'RoundedBox', slots: { material: 'mesh' }, childKinds: [], aka: 'rounded box', withTransform: true, init: { position: [0, 0.5, 0] }, overrides: { args: { type: 'json', label: '引数 [幅,高さ,奥行,分割,丸み]' } } })
vueDef({ id: 'vue:Superformula', primary: ['color'], label: 'スーパーフォーミュラ', kind: 'object', cat: 'object', comp: Superformula, importFrom: '@tresjs/cientos', tag: 'Superformula', aka: 'superformula', withTransform: true })

vueDef({ id: 'vue:MeshWobbleMaterial', primary: ['speed', 'factor'], label: 'ぷるぷる', kind: 'material', cat: 'material', matFor: 'mesh', comp: MeshWobbleMaterial, importFrom: '@tresjs/cientos', tag: 'MeshWobbleMaterial', aka: 'wobble' })
vueDef({ id: 'vue:MeshTransmissionMaterial', primary: ['transmission', 'thickness'], label: '透過ガラス', kind: 'material', cat: 'material', matFor: 'mesh', comp: MeshTransmissionMaterial, importFrom: '@tresjs/cientos', tag: 'MeshTransmissionMaterial', aka: 'transmission glass', overrides: { buffer: null } })
vueDef({ id: 'vue:MeshReflectionMaterial', primary: ['color', 'mix'], label: '床の反射', kind: 'material', cat: 'material', matFor: 'mesh', comp: MeshReflectionMaterial, importFrom: '@tresjs/cientos', tag: 'MeshReflectionMaterial', aka: 'reflection mirror' })
vueDef({ id: 'vue:HolographicMaterial', primary: ['hologramColor', 'hologramOpacity'], label: 'ホログラム', kind: 'material', cat: 'material', matFor: 'mesh', comp: HolographicMaterial, importFrom: '@tresjs/cientos', tag: 'HolographicMaterial', aka: 'hologram' })

// 自作: ネットワーク不要のスタジオ環境光
register({
  id: 'custom:StudioEnv', label: 'スタジオ環境光', kind: 'staging', cat: 'world', source: 'custom', tag: 'StudioEnv', comp: StudioEnv,
  aka: 'environment studio 環境マップ ibl', desc: '映り込み用の室内環境。通信不要',
  props: [
    { key: 'intensity', type: 'number', def: 1, group: 'main', label: '環境光の強さ', min: 0, max: 5, step: 0.01 },
    { key: 'background', type: 'boolean', def: false, group: 'main', label: '背景にも使う' },
    { key: 'blurriness', type: 'number', def: 0, group: 'main', label: '背景のぼかし', min: 0, max: 1, step: 0.01 },
    { key: 'backgroundIntensity', type: 'number', def: 1, group: 'main', label: '背景の明るさ', min: 0, max: 5, step: 0.01 },
  ],
} as any)

// ── エフェクト
const EFFECT_SKIP = new Set(['EffectComposerPmndrs', 'DepthPickingPassPmndrs', 'GodRaysPmndrs', 'OutlinePmndrs', 'ShockWavePmndrs', 'TexturePmndrs', 'ASCIIPmndrs'])
const EFFECT_LABELS: Record<string, string> = {
  BloomPmndrs: 'ブルーム (発光)', VignettePmndrs: 'ビネット', NoisePmndrs: 'ノイズ', PixelationPmndrs: 'ピクセル化',
  GlitchPmndrs: 'グリッチ', DepthOfFieldPmndrs: '被写界深度', ChromaticAberrationPmndrs: '色収差', ToneMappingPmndrs: 'トーンマッピング',
  SepiaPmndrs: 'セピア', HueSaturationPmndrs: '色相・彩度', ScanlinePmndrs: '走査線', N8AOPmndrs: '環境遮蔽 (N8AO)',
  TiltShiftPmndrs: 'ティルトシフト', BrightnessContrastPmndrs: '明るさ・コントラスト', ColorDepthPmndrs: '減色',
  DotScreenPmndrs: 'ドットスクリーン', FXAAPmndrs: 'FXAA', FishEyePmndrs: '魚眼', GridPmndrs: 'グリッド模様',
  LensDistortionPmndrs: 'レンズ歪み', BarrelBlurPmndrs: 'バレルぼかし', ColorAveragePmndrs: '色の平均化',
  KuwaharaPmndrs: '油絵風', LinocutPmndrs: '木版画風', SMAAPmndrs: 'SMAA',
}
const GLITCH_OVR = { delay: { type: 'vec2', def: [1.5, 3.5], min: 0, max: 20, step: 0.1 }, duration: { type: 'vec2', def: [0.6, 1], min: 0, max: 5, step: 0.05 }, strength: { type: 'vec2', def: [0.3, 1], min: 0, max: 2, step: 0.05 }, chromaticAberrationOffset: { type: 'vec2', def: [0.001, 0.0005], min: 0, max: 0.02, step: 0.0001 } } as any
const CHROMA_OVR = { offset: { type: 'vec2', def: [0.001, 0.0005], min: 0, max: 0.02, step: 0.0001 } } as any

function effectDefaults(name: string): Record<string, any> {
  const base = name.replace('Pmndrs', '')
  const Cls = (PP as any)[`${base}Effect`]
  const out: Record<string, any> = {}
  if (!Cls) return out
  let inst: any
  try { inst = new Cls() } catch { return out }
  const props = (Post as any)[name]?.props ?? {}
  for (const key of Object.keys(props)) {
    try {
      let v = inst[key]
      if (key === 'blendFunction') v = inst.blendMode?.blendFunction
      if (v === undefined) v = inst.uniforms?.get?.(key)?.value
      if (v !== undefined && (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string')) out[key] = v
      else if (v?.isColor) out[key] = '#' + v.getHexString()
      else if (v?.isVector2) out[key] = [v.x, v.y]
    } catch { /* 既定値が読めないものは未設定のまま */ }
  }
  return out
}

{
  const comp = (Post as any).EffectComposerPmndrs
  const picked = ['enabled', 'multisampling', 'disableNormalPass', 'autoClear', 'depthBuffer', 'stencilBuffer', 'resolutionScale', 'frameBufferType']
  const props = vueProps('post:Composer', comp, {}, Object.fromEntries(picked.map((k) => [k, {}])) as any).filter((p) => picked.includes(p.key))
  const fix: Record<string, Partial<PropDef>> = {
    enabled: { def: true }, multisampling: { type: 'int', min: 0, max: 16, step: 1, def: 0 }, resolutionScale: { min: 0.1, max: 2, step: 0.05 },
  }
  for (const p of props) Object.assign(p, fix[p.key] ?? {}, { group: 'main' })
  register({
    id: 'post:Composer', label: 'エフェクトコンポーザー', kind: 'composer', cat: 'effect', source: 'vue', tag: 'EffectComposerPmndrs',
    comp, importFrom: '@tresjs/post-processing', childKinds: ['effect'], slots: { children: true }, props, primary: ['multisampling'],
    aka: 'effect composer postprocessing', desc: 'エフェクトをまとめる入れ物。エフェクトを中に入れる',
  } as any)
}

for (const name of Object.keys(Post)) {
  if (!name.endsWith('Pmndrs') || EFFECT_SKIP.has(name)) continue
  const comp = (Post as any)[name]
  if (!comp?.props) continue
  const ovr = name === 'GlitchPmndrs' ? GLITCH_OVR : name === 'ChromaticAberrationPmndrs' ? CHROMA_OVR : {}
  vueDef({
    id: `post:${name}`, label: EFFECT_LABELS[name] ?? name.replace('Pmndrs', ''), kind: 'effect', cat: 'effect', comp, importFrom: '@tresjs/post-processing',
    tag: name, defaults: effectDefaults(name), overrides: ovr, aka: name,
  })
}
// 追加直後に効果が分かる初期値
if (REG['post:BloomPmndrs']) REG['post:BloomPmndrs'].init = { intensity: 1.2, luminanceThreshold: 0.6, mipmapBlur: true }
if (REG['post:VignettePmndrs']) REG['post:VignettePmndrs'].init = { darkness: 0.6, offset: 0.3 }

// ── 動き（挙動）ブロック
const bp = (key: string, type: PType, def: any, label: string, extra: Partial<PropDef> = {}): PropDef => ({ key, type, def, label, group: 'main', ...extra })
const AXIS: Opt[] = [{ label: 'X', value: 'x' }, { label: 'Y', value: 'y' }, { label: 'Z', value: 'z' }]
function behavior(id: string, label: string, props: PropDef[], desc: string, init?: Record<string, any>) {
  register({ id: `bhv:${id}`, label, kind: 'behavior', cat: 'motion', source: 'custom', tag: id, props, desc, init, primary: props.slice(0, 2).map((p) => p.key) } as any)
}
behavior('spin', 'くるくる回す', [bp('speed', 'vec3', [0, 1, 0], '回転の速さ (rad/秒)', { min: -10, max: 10, step: 0.05 })], '毎フレーム、指定の速さで回転する', {})
behavior('bob', '上下にゆらす', [
  bp('axis', 'enum', 'y', '動く軸', { options: AXIS }), bp('amplitude', 'number', 0.5, '振れ幅', { min: 0, max: 5, step: 0.01 }),
  bp('frequency', 'number', 0.5, '周波数 (Hz)', { min: 0, max: 5, step: 0.01 }), bp('phase', 'number', 0, '位相', { min: 0, max: 6.283, step: 0.01 }),
], 'サイン波でゆらゆら動く')
behavior('orbit', 'まわりを周回する', [
  bp('radius', 'number', 3, '半径', { min: 0, max: 30, step: 0.1 }), bp('speed', 'number', 0.5, '速さ (rad/秒)', { min: -5, max: 5, step: 0.01 }),
  bp('plane', 'enum', 'xz', '周回する面', { options: [{ label: 'XZ (水平)', value: 'xz' }, { label: 'XY', value: 'xy' }, { label: 'YZ', value: 'yz' }] }),
  bp('center', 'vec3', [0, 0, 0], '中心', { min: -20, max: 20, step: 0.1 }), bp('phase', 'number', 0, '開始位置', { min: 0, max: 6.283, step: 0.01 }),
], '中心のまわりを円運動する')
behavior('pulse', '拡大縮小をくり返す', [
  bp('amount', 'number', 0.2, '変化量', { min: 0, max: 2, step: 0.01 }), bp('frequency', 'number', 1, '周波数 (Hz)', { min: 0, max: 5, step: 0.01 }),
], 'ドクンドクンと脈打つ')
behavior('colorCycle', '色を変え続ける', [
  bp('speed', 'number', 0.2, '色相の速さ (周/秒)', { min: -2, max: 2, step: 0.01 }), bp('saturation', 'number', 0.8, '彩度', { min: 0, max: 1, step: 0.01 }), bp('lightness', 'number', 0.55, '明るさ', { min: 0, max: 1, step: 0.01 }),
], '素材の色を虹色に変化させる')
behavior('hover', 'マウスが乗ると大きくなる', [bp('scale', 'number', 1.25, '倍率', { min: 0.1, max: 4, step: 0.01 })], 'ポインタを乗せると拡大する')
behavior('click', 'クリックしたら…', [
  bp('action', 'enum', 'randomColor', 'すること', { options: [{ label: '色をランダムに', value: 'randomColor' }, { label: '大きさを切り替え', value: 'toggleScale' }, { label: 'ジャンプ', value: 'jump' }] }),
  bp('scale', 'number', 1.5, '倍率 (大きさ切替)', { min: 0.1, max: 4, step: 0.01 }),
], 'クリックで反応する')

// ── 動きブロックをつけられる種類
export const BEHAVIOR_HOSTS: Kind[] = ['object', 'light', 'camera', 'helper', 'staging']

// ───────── TresCanvas の設定ブロック ─────────
const cp = (key: string, type: PType, def: any, group: string, extra: Partial<PropDef> = {}): PropDef => ({
  key, type, def, group, label: labelOf(key), ...(CANVAS_ENUMS[key] ? { options: CANVAS_ENUMS[key] } : {}), ...extra,
})
// TresCanvas の既定値は @tresjs/core 5.10 の props 定義に合わせる（書き出したコードとプレビューを一致させるため）
export const CANVAS_PROPS: PropDef[] = [
  cp('clearColor', 'color', '#000000', 'main'),
  cp('clearAlpha', 'number', 1, 'main', { min: 0, max: 1, step: 0.01 }),
  cp('shadows', 'boolean', false, 'main'),
  cp('shadowMapType', 'enum', THREE.PCFSoftShadowMap, 'main'),
  cp('toneMapping', 'enum', THREE.ACESFilmicToneMapping, 'main'),
  cp('toneMappingExposure', 'number', 1, 'main', { min: 0, max: 5, step: 0.01 }),
  cp('outputColorSpace', 'enum', 'srgb', 'main'),
  cp('dpr', 'number', undefined, 'render', { min: 0.5, max: 3, step: 0.1, hint: '未設定なら端末の解像度に合わせる。2 で高精細' }),
  cp('fpsLimit', 'int', undefined, 'render', { min: 1, max: 240, step: 1, hint: '描画の上限フレームレート' }),
  cp('renderMode', 'enum', 'always', 'render', { hint: '「変化時のみ」にすると動きブロックは止まります' }),
  cp('preset', 'enum', '', 'render', { options: [{ label: '指定なし', value: '' }, { label: 'realistic', value: 'realistic' }, { label: 'flat', value: 'flat' }], hint: 'realistic は影・ACES・露出をまとめて設定' }),
  cp('alpha', 'boolean', false, 'advanced', { restart: true, hint: '変更するとキャンバスを作り直します' }),
  cp('antialias', 'boolean', true, 'advanced', { restart: true, hint: '変更するとキャンバスを作り直します' }),
  cp('depth', 'boolean', true, 'advanced', { restart: true }),
  cp('stencil', 'boolean', false, 'advanced', { restart: true }),
  cp('premultipliedAlpha', 'boolean', true, 'advanced', { restart: true }),
  cp('preserveDrawingBuffer', 'boolean', false, 'advanced', { restart: true }),
  cp('logarithmicDepthBuffer', 'boolean', false, 'advanced', { restart: true }),
  cp('failIfMajorPerformanceCaveat', 'boolean', false, 'advanced', { restart: true }),
  cp('powerPreference', 'enum', 'default', 'advanced', { restart: true }),
]
export const CANVAS_MAP: Record<string, PropDef> = Object.fromEntries(CANVAS_PROPS.map((p) => [p.key, p]))

// ───────── 検索・一覧 ─────────
export const ALL_DEFS = () => Object.values(REG)
export function defsOfCat(cat: CatId) {
  return ALL_DEFS().filter((d) => d.cat === cat)
}
export function propCount(defId: string) {
  return REG[defId]?.props.length ?? 0
}
