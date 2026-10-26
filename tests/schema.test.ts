import { describe, expect, it } from 'vitest'
import { CATS, CANVAS_PROPS, REG, defsOfCat } from '../src/blocks/schema'

// ブロック定義は、ライブラリ (three.js・cientos・post-processing) から自動で作る。
// ライブラリを更新したとき、ブロックやプロパティが消えたり増えたりしたら、ここで気づく
// (意図した更新なら `npx vitest -u` で保存し直し、差分を確認する)

describe('ブロック定義', () => {
  it('ブロックの一覧 (id) が変わっていない', () => {
    expect(Object.keys(REG).sort()).toMatchSnapshot()
  })

  it('カテゴリごとのブロック数が変わっていない', () => {
    const counts = Object.fromEntries(CATS.map((c) => [c.id, defsOfCat(c.id).length]))
    expect(counts).toMatchSnapshot()
  })

  it('ブロックごとのプロパティ数が変わっていない', () => {
    const counts = Object.fromEntries(
      Object.entries(REG)
        .map(([id, d]) => [id, d.props.length])
        .sort(([a], [b]) => (a < b ? -1 : 1)),
    )
    expect(counts).toMatchSnapshot()
  })

  it('すべてのブロックに表示名があり、プロパティの key は重複しない', () => {
    for (const [id, d] of Object.entries(REG)) {
      expect(d.label, id).toBeTruthy()
      const keys = d.props.map((p) => p.key)
      expect(new Set(keys).size, `${id} の key が重複`).toBe(keys.length)
    }
  })

  it('シーン設定 (TresCanvas) のプロパティがある', () => {
    expect(CANVAS_PROPS.length).toBeGreaterThan(10)
  })
})
