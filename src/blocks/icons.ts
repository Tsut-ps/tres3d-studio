import type { BlockDef, CatId } from './schema'

/** 種類ごとのアイコン名 (Ico.vue の定義と対応) */
export const CAT_ICON: Record<CatId, string> = {
  object: 'cube',
  geometry: 'shapes',
  material: 'palette',
  light: 'bulb',
  camera: 'camera',
  motion: 'rotate',
  world: 'globe',
  effect: 'sparkles',
  helper: 'grid',
}

const BY_ID: Record<string, string> = {
  'three:Mesh': 'cube',
  'three:Group': 'group',
  'three:Points': 'dots',
  'three:Line': 'line',
  'three:LineSegments': 'segments',
  'three:Sprite': 'star',
}
const BY_KIND: Record<string, string> = {
  camera: 'camera',
  light: 'bulb',
  geometry: 'shapes',
  material: 'palette',
  behavior: 'rotate',
  world: 'globe',
  effect: 'sparkles',
  composer: 'sparkles',
  helper: 'grid',
  controls: 'move',
  staging: 'cloud',
}

export function iconOf(def: BlockDef): string {
  return BY_ID[def.id] ?? BY_KIND[def.kind] ?? CAT_ICON[def.cat] ?? 'cube'
}
