import { beforeEach, describe, expect, it } from 'vitest'
import { generate } from '../src/exportCode'
import { doc, newNode } from '../src/model/doc'
import { SAMPLES } from '../src/model/samples'

// 書き出されるコードは、このツールの成果物。意図しない変化に気づけるよう、サンプルの出力を保存して比べる
// (意図して変えたときは `npx vitest -u` で保存し直し、差分を見て確認する)

const files = (name = 'Scene.vue') => generate().files.find((f) => f.name === name)!

beforeEach(() => {
  doc.canvas = {}
  doc.children = []
})

describe('サンプルの書き出し', () => {
  for (const s of SAMPLES) {
    it(`${s.label}`, () => {
      const d = s.build()
      doc.canvas = d.canvas
      doc.children = d.children
      const g = generate()
      expect(g.install).toMatchSnapshot('install')
      for (const f of g.files) {
        // 確認用の印が文字に混ざっていないこと
        expect(f.code).not.toMatch(/[\u0001\u0002]/)
        expect(f.code).toMatchSnapshot(f.name)
      }
    })
  }
})

describe('動きの書き出し', () => {
  const withBehavior = (id: string, props: Record<string, any> = {}, meshProps = {}) => {
    const m = newNode('three:Mesh', meshProps, false)
    m.behaviors.push(newNode(id, props, false))
    doc.children.push(m)
  }

  it('回転は、0 の軸を書かず、位置と大きさには触れない', () => {
    withBehavior('bhv:spin', { speed: [0, 1.5, 0] })
    const code = files().code
    expect(code).toContain('rot[1] += 1.5 * elapsed')
    expect(code).not.toContain('rot[0] +=')
    expect(code).not.toContain('o.position.set')
    expect(code).not.toContain('o.scale.set')
  })

  it('ホバーだけのときは、大きさ以外の動かし方を書かない', () => {
    withBehavior('bhv:hover')
    const code = files().code
    expect(code).toContain('@pointer-enter')
    expect(code).toContain('o.scale.set')
    expect(code).not.toContain('o.rotation.set')
    expect(code).not.toContain('o.position.set')
  })

  it('動きごとに見出しのコメントが付く', () => {
    withBehavior('bhv:bob')
    expect(files().code).toContain(`// ${'上下にゆらす'}`)
  })

  it('ブロック名が英数字なら、変数名に使う。そうでなければ obj1 から', () => {
    withBehavior('bhv:spin', {}, { name: 'sun light' })
    withBehavior('bhv:spin', {}, { name: '太陽' })
    const code = files().code
    expect(code).toContain('const sunLightRef = shallowRef()')
    expect(code).toContain('const obj2 = shallowRef()')
  })
})

describe('ブロックとコードの行の対応', () => {
  it('印の範囲は、ファイルの行の内側にあり、シーン設定は App.vue に対応する', () => {
    const d = SAMPLES[0].build()
    doc.canvas = d.canvas
    doc.children = d.children
    const g = generate()
    for (const f of g.files) {
      const total = f.code.split('\n').length
      for (const m of f.marks ?? []) {
        expect(m.from).toBeGreaterThanOrEqual(0)
        expect(m.to).toBeGreaterThanOrEqual(m.from)
        expect(m.to).toBeLessThan(total)
      }
    }
    const app = g.files.find((f) => f.name === 'App.vue')!
    expect(app.marks?.some((m) => m.uid === 'canvas')).toBe(true)
    // ルートのブロックは、どれかのファイルに対応する行がある
    const scene = g.files.find((f) => f.name === 'Scene.vue')!
    const marked = new Set(scene.marks?.map((m) => m.uid))
    for (const n of doc.children) expect(marked.has(n.uid)).toBe(true)
  })
})

describe('空のコンポーザー', () => {
  it('エフェクトが無いコンポーザーは、書き出さない (画面が止まって見えるため)', () => {
    const c = newNode('post:Composer', {}, false)
    doc.children.push(c)
    let code = files().code
    expect(code).not.toContain('EffectComposerPmndrs')
    expect(code).toContain('コンポーザーは出力していません')
    c.children.push(newNode('post:BloomPmndrs', {}, false))
    code = files().code
    expect(code).toContain('<EffectComposerPmndrs')
    expect(code).toContain('<BloomPmndrs')
  })
})
