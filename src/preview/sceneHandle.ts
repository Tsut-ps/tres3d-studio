import type * as THREE from 'three'

/** プレビューの three シーンへの入り口。GizmoLayer が毎フレーム更新し、整列などの操作が読む (シーンはキャンバスの作り直しで変わるため) */
export const sceneHandle: {
  scene: THREE.Scene | null
  camera: THREE.Camera | null
  dom: HTMLElement | null
} = { scene: null, camera: null, dom: null }
