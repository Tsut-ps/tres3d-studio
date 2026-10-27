import { beforeEach, describe, expect, it } from 'vitest'
import { REG } from '../src/blocks/schema'
import {
  canDrop,
  cloneNode,
  composerActive,
  doc,
  find,
  hostUid,
  isDescendant,
  newNode,
  walk,
  type BNode,
} from '../src/model/doc'
import {
  addFromPalette,
  copySelected,
  moveNode,
  pasteClip,
  removeNode,
  selectBlock,
  ui,
} from '../src/model/store'

// ブロックの木の規則と編集操作。壊れると、保存した文書そのものが壊れる

const mesh = () => newNode('three:Mesh', {}, false)
const group = () => newNode('three:Group', {}, false)
const roots = () => doc.children.map((n) => n.uid)

beforeEach(() => {
  doc.canvas = {}
  doc.children = []
  ui.selected = 'canvas'
  ui.sel = []
  ui.addTo = null
  ui.toast = ''
})

describe('canDrop (置ける場所の規則)', () => {
  it('形状はメッシュの形状の受け口にだけ入る', () => {
    const m = mesh()
    const box = REG['three:BoxGeometry']
    expect(canDrop(box, m, 'geometry')).toBe(true)
    expect(canDrop(box, m, 'material')).toBe(false)
    expect(canDrop(box, null, 'children')).toBe(false)
  })

  it('素材は、対応する種類 (メッシュ用・点用) の受け口にだけ入る', () => {
    const standard = REG['three:MeshStandardMaterial']
    expect(canDrop(standard, mesh(), 'material')).toBe(true)
    expect(canDrop(standard, newNode('three:Points', {}, false), 'material')).toBe(false)
  })

  it('動きは、動かせるブロックにだけ入る', () => {
    const spin = REG['bhv:spin']
    expect(canDrop(spin, mesh(), 'behaviors')).toBe(true)
    expect(canDrop(spin, newNode('three:BoxGeometry', {}, false), 'behaviors')).toBe(false)
  })

  it('最上位に置けるのは、ライト・カメラ・オブジェクトなど。形状やエフェクトは置けない', () => {
    expect(canDrop(REG['three:PointLight'], null, 'children')).toBe(true)
    expect(canDrop(REG['three:PerspectiveCamera'], null, 'children')).toBe(true)
    expect(canDrop(REG['three:BoxGeometry'], null, 'children')).toBe(false)
    expect(canDrop(REG['post:BloomPmndrs'], null, 'children')).toBe(false)
  })

  it('エフェクトは、コンポーザーの中にだけ入る', () => {
    const bloom = REG['post:BloomPmndrs']
    expect(canDrop(bloom, newNode('post:Composer', {}, false), 'children')).toBe(true)
    expect(canDrop(bloom, group(), 'children')).toBe(false)
  })
})

describe('newNode / cloneNode', () => {
  it('メッシュは、形状と素材つきで作られる (自動付与をしないときは空)', () => {
    const withAuto = newNode('three:Mesh')
    expect(withAuto.geometry).not.toBeNull()
    expect(withAuto.material).not.toBeNull()
    const bare = newNode('three:Mesh', {}, false)
    expect(bare.geometry).toBeNull()
    expect(bare.material).toBeNull()
  })

  it('複製は、すべての uid が新しくなり、元とは独立している', () => {
    const m = newNode('three:Mesh')
    m.behaviors.push(newNode('bhv:spin', {}, false))
    const c = cloneNode(m)
    const ids = (n: BNode) => {
      const out: string[] = []
      walk([n], (x) => out.push(x.uid))
      return out
    }
    const a = ids(m)
    const b = ids(c)
    expect(b).toHaveLength(a.length)
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length)
    c.props.testOnly = 1
    expect(m.props.testOnly).toBeUndefined()
  })
})

describe('find / isDescendant / hostUid', () => {
  it('入れ子の形状・素材・動きも、持ち主つきで見つかる', () => {
    const m = newNode('three:Mesh')
    const spin = newNode('bhv:spin', {}, false)
    m.behaviors.push(spin)
    doc.children.push(m)
    expect(find(m.geometry!.uid)).toMatchObject({ slot: 'geometry' })
    expect(find(m.material!.uid)?.parent?.uid).toBe(m.uid)
    expect(find(spin.uid)).toMatchObject({ slot: 'behaviors' })
    expect(hostUid(m.geometry!.uid)).toBe(m.uid)
    expect(hostUid(m.uid)).toBe(m.uid)
    expect(hostUid('none')).toBe('')
  })

  it('isDescendant は、中のブロックだけを子孫とみなす', () => {
    const g = group()
    const m = mesh()
    g.children.push(m)
    doc.children.push(g)
    expect(isDescendant(g, m.uid)).toBe(true)
    expect(isDescendant(m, g.uid)).toBe(false)
  })
})

describe('編集操作 (store)', () => {
  it('moveNode: 同じ一覧の中で後ろへ動かすとき、取り除いた分だけ位置がずれない', () => {
    const [a, b, c] = [mesh(), mesh(), mesh()]
    doc.children.push(a, b, c)
    moveNode(a.uid, null, 'children', 2) // c の手前へ
    expect(roots()).toEqual([b.uid, a.uid, c.uid])
    moveNode(a.uid, null, 'children', 3) // 末尾へ
    expect(roots()).toEqual([b.uid, c.uid, a.uid])
    moveNode(a.uid, null, 'children', 0) // 先頭へ
    expect(roots()).toEqual([a.uid, b.uid, c.uid])
  })

  it('moveNode: 自分の中や、置けない場所へは動かせない', () => {
    const outer = group()
    const inner = group()
    outer.children.push(inner)
    const m = newNode('three:Mesh')
    doc.children.push(outer, m)
    moveNode(outer.uid, inner, 'children')
    expect(doc.children[0].uid).toBe(outer.uid)
    expect(ui.toast).toBe('自分の中には移動できません')
    moveNode(m.material!.uid, null, 'children')
    expect(m.material).not.toBeNull()
    expect(ui.toast).toBe('ここには置けません')
  })

  it('removeNode: 消したあと、選択は親に移る (親がなければシーン設定)', () => {
    const g = group()
    const m = mesh()
    g.children.push(m)
    doc.children.push(g)
    selectBlock(m.uid)
    removeNode(m.uid)
    expect(g.children).toHaveLength(0)
    expect(ui.selected).toBe(g.uid)
    removeNode(g.uid)
    expect(ui.selected).toBe('canvas')
  })

  it('addFromPalette: エフェクトは、コンポーザーが無ければ作って、その中に入る', () => {
    const fx = addFromPalette('post:BloomPmndrs')
    const composer = doc.children.find((n) => REG[n.def].kind === 'composer')
    expect(composer).toBeDefined()
    expect(composer!.children[0].uid).toBe(fx.uid)
  })

  it('コピーと貼り付け: 選択したブロックの直後に、別の uid で入り、貼ったものが選ばれる', () => {
    const [a, b] = [mesh(), mesh()]
    doc.children.push(a, b)
    selectBlock(a.uid)
    expect(copySelected()).toBe(true)
    pasteClip()
    expect(doc.children).toHaveLength(3)
    expect(doc.children[0].uid).toBe(a.uid)
    expect(doc.children[1].uid).not.toBe(a.uid)
    expect(doc.children[2].uid).toBe(b.uid)
    expect(ui.selected).toBe(doc.children[1].uid)
  })
})

describe('composerActive (画面に加わるコンポーザーか)', () => {
  it('エフェクトが空、全部オフ、enabled が false のものは、加わらない', () => {
    const c = newNode('post:Composer', {}, false)
    expect(composerActive(c)).toBe(false)
    const fx = newNode('post:BloomPmndrs', {}, false)
    c.children.push(fx)
    expect(composerActive(c)).toBe(true)
    fx.off = true
    expect(composerActive(c)).toBe(false)
    fx.off = false
    c.props.enabled = false
    expect(composerActive(c)).toBe(false)
  })
})
