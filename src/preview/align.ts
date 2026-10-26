import * as THREE from 'three'
import { flash, topSelection, ui } from '../model/store'
import { find, propDefOf, setProp, type BNode } from '../model/doc'
import { REG } from '../blocks/schema'
import { sceneHandle } from './sceneHandle'

/**
 * プレビューのオブジェクトの「整列」と「吸着」。
 * 位置はブロックの position プロパティへ書き戻す。動き (上下・周回) の付いたブロックでも、動きの分を固定しないよう、
 * 「現在の見た目の位置」ではなく「動かした分」だけをプロパティに足す。
 */
const r4 = (n: number) => Math.round(n * 1e4) / 1e4
type Vec = [number, number, number]

/** ギズモ・整列の対象にできるブロックか (位置を持つ three のオブジェクト・ライト・カメラ) */
export function isMovable(id: string) {
  const n = find(id)?.node
  const d = n && REG[n.def]
  return (
    !!n &&
    !n.off &&
    !!d &&
    d.source === 'three' &&
    ['object', 'light', 'camera', 'helper'].includes(d.kind) &&
    !!d.propMap.position &&
    n.def !== 'three:AmbientLight'
  )
}

export function findObject(uid: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  sceneHandle.scene?.traverse((o) => {
    if (!found && !o.userData.__helper && o.userData.__uid === uid) found = o
  })
  return found
}

/** ワールド座標での外接ボックス。形が無い (ライトなど) ときは位置の 1 点 */
export function worldBox(o: THREE.Object3D, into = new THREE.Box3()): THREE.Box3 {
  o.updateWorldMatrix(true, true)
  into.makeEmpty()
  o.traverse((c) => {
    if (c.userData.__helper) return
    const g: any = (c as any).geometry
    if (g && (c as any).isMesh) {
      g.boundingBox ?? g.computeBoundingBox()
      if (g.boundingBox && !g.boundingBox.isEmpty())
        into.union(g.boundingBox.clone().applyMatrix4(c.matrixWorld))
    }
  })
  if (into.isEmpty()) {
    const p = o.getWorldPosition(new THREE.Vector3())
    into.set(p.clone(), p.clone())
  }
  return into
}

const getPos = (n: BNode): Vec =>
  Array.isArray(n.props.position)
    ? ([...n.props.position] as Vec)
    : ((REG[n.def]?.propMap.position?.def as Vec | undefined) ?? [0, 0, 0])

/** ワールド座標で d だけ動かす (親の変形を考慮して、position プロパティへ足す) */
export function moveWorld(uid: string, d: THREE.Vector3) {
  const o = findObject(uid)
  const f = find(uid)
  const pd = f && propDefOf(f.node, 'position')
  if (!o || !f || !pd) return
  const w0 = o.getWorldPosition(new THREE.Vector3())
  const w1 = w0.clone().add(d)
  const l0 = o.parent ? o.parent.worldToLocal(w0.clone()) : w0
  const l1 = o.parent ? o.parent.worldToLocal(w1.clone()) : w1
  const base = getPos(f.node)
  setProp(f.node.props, pd, [
    r4(base[0] + l1.x - l0.x),
    r4(base[1] + l1.y - l0.y),
    r4(base[2] + l1.z - l0.z),
  ])
}

interface Item {
  uid: string
  box: THREE.Box3
}
function targets(): Item[] {
  const out: Item[] = []
  for (const uid of topSelection().filter(isMovable)) {
    const o = findObject(uid)
    if (o) out.push({ uid, box: worldBox(o) })
  }
  return out
}
/** いま整列に使えるブロックの数 */
export const movableCount = () => topSelection().filter(isMovable).length

const delta = (axis: number, v: number) => {
  const d = new THREE.Vector3()
  d.setComponent(axis, v)
  return d
}

/** 軸 (0=x 1=y 2=z) に沿って、最小・中央・最大にそろえる */
export function alignAxis(axis: 0 | 1 | 2, mode: 'min' | 'mid' | 'max') {
  const t = targets()
  if (t.length < 2) return flash('2つ以上のオブジェクトを選ぶと、そろえられます')
  const lo = Math.min(...t.map((i) => i.box.min.getComponent(axis)))
  const hi = Math.max(...t.map((i) => i.box.max.getComponent(axis)))
  for (const i of t) {
    const a = i.box.min.getComponent(axis),
      b = i.box.max.getComponent(axis)
    const d = mode === 'min' ? lo - a : mode === 'max' ? hi - b : (lo + hi) / 2 - (a + b) / 2
    if (Math.abs(d) > 1e-6) moveWorld(i.uid, delta(axis, d))
  }
}

/** 軸に沿って、両端を動かさずにすき間を等しくする */
export function distributeAxis(axis: 0 | 1 | 2) {
  const t = targets()
  if (t.length < 3) return flash('3つ以上のオブジェクトを選ぶと、等間隔にできます')
  t.sort(
    (p, q) =>
      p.box.min.getComponent(axis) +
      p.box.max.getComponent(axis) -
      q.box.min.getComponent(axis) -
      q.box.max.getComponent(axis),
  )
  const first = t[0].box.min.getComponent(axis),
    last = t[t.length - 1].box.max.getComponent(axis)
  const size = t.reduce(
    (s, i) => s + (i.box.max.getComponent(axis) - i.box.min.getComponent(axis)),
    0,
  )
  const gap = (last - first - size) / (t.length - 1)
  let cur = first
  for (const i of t) {
    const a = i.box.min.getComponent(axis),
      b = i.box.max.getComponent(axis)
    const d = cur - a
    if (Math.abs(d) > 1e-6) moveWorld(i.uid, delta(axis, d))
    cur += b - a + gap
  }
}

/** 選んだものを、床 (y=0) の上に置く */
export function dropToFloor() {
  const t = targets()
  if (!t.length) return flash('オブジェクトを選んでください')
  for (const i of t) {
    const d = -i.box.min.y
    if (Math.abs(d) > 1e-6) moveWorld(i.uid, delta(1, d))
  }
}

// ───────── 吸着 (ギズモで動かしているあいだ) ─────────
export interface SnapPlanes {
  v: [number[], number[], number[]]
  boxes: [THREE.Box3[], THREE.Box3[], THREE.Box3[]]
}

/** ほかのオブジェクトの面・中心・床を、吸着先として集める (ドラッグを始めたとき 1 回) */
export function collectPlanes(self: THREE.Object3D, skip: Set<string>): SnapPlanes {
  const v: SnapPlanes['v'] = [[], [], []]
  const boxes: SnapPlanes['boxes'] = [[], [], []]
  sceneHandle.scene?.traverse((o) => {
    if (o.userData.__helper || !o.userData.__uid || o === self || skip.has(o.userData.__uid)) return
    // 自分の親 (自分を含む入れ物) や、自分の子は、吸着先にしない
    for (let p: THREE.Object3D | null = self; p; p = p.parent) if (p === o) return
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === self) return
    if (!o.visible) return
    const b = worldBox(o)
    for (let a = 0; a < 3; a++) {
      const lo = b.min.getComponent(a),
        hi = b.max.getComponent(a)
      for (const x of lo === hi ? [lo] : [lo, (lo + hi) / 2, hi]) {
        v[a].push(x)
        boxes[a].push(b)
      }
    }
  })
  v[1].push(0)
  boxes[1].push(new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 0, 3))) // 床
  return { v, boxes }
}

export interface SnapHit {
  axis: number
  target: number
  mine: THREE.Vector3
  theirs: THREE.Vector3
}

/** 動かしているオブジェクトを、近くの面・中心にそろえる。そろえた軸の情報を返す (ガイド線用) */
export function snapObject(obj: THREE.Object3D, planes: SnapPlanes, threshold: number): SnapHit[] {
  const b = worldBox(obj)
  const c = b.getCenter(new THREE.Vector3())
  const hits: SnapHit[] = []
  const shift = new THREE.Vector3()
  for (let a = 0; a < 3; a++) {
    let best: { d: number; at: number; k: number } | null = null
    for (const m of [b.min.getComponent(a), c.getComponent(a), b.max.getComponent(a)]) {
      planes.v[a].forEach((pv, k) => {
        const d = pv - m
        if (Math.abs(d) < threshold && (!best || Math.abs(d) < Math.abs(best.d)))
          best = { d, at: m, k }
      })
    }
    if (best) {
      const bb = best as { d: number; at: number; k: number }
      shift.setComponent(a, bb.d)
      const floor = a === 1 && bb.k === planes.v[1].length - 1
      const them = floor ? c.clone().setY(0) : planes.boxes[a][bb.k].getCenter(new THREE.Vector3())
      hits.push({
        axis: a,
        target: bb.at + bb.d,
        mine: c.clone().setComponent(a, bb.at + bb.d),
        theirs: them.setComponent(a, bb.at + bb.d),
      })
    }
  }
  if (hits.length) {
    const w = obj.getWorldPosition(new THREE.Vector3()).add(shift)
    obj.position.copy(obj.parent ? obj.parent.worldToLocal(w) : w)
    obj.updateMatrixWorld(true)
    for (const h of hits) {
      h.mine.add(shift.clone().setComponent(h.axis, 0))
    }
  }
  return hits
}
