// ブロックの構成から TresJS の Vue SFC を生成する
import * as THREE from 'three'
import { REG, CANVAS_MAP, type BlockDef, type PropDef } from './schema'
import { doc, walk, type BNode } from './doc'
import { val, expandAttr } from './SceneNode'
import type { TexDesc } from './textures'
import texturesSource from './textures.ts?raw'
import customSource from './custom.ts?raw'

/** コードのうち、あるブロックに対応する行の範囲 (0 始まり、両端を含む)。uid が 'canvas' ならシーン設定 */
export interface Mark {
  uid: string
  from: number
  to: number
}
export interface GenFile {
  name: string
  lang: string
  code: string
  marks?: Mark[]
}

// ブロックとコード行の対応づけ。生成の途中では、行の頭・末尾に見えない目印を埋めておき、組み上がったあとで行番号に直す
const S = (id: string) => `\u0001s:${id}\u0002`
const E = (id: string) => `\u0001e:${id}\u0002`
function mark(id: string, lines: string[]): string[] {
  if (!lines.length) return lines
  const o = [...lines]
  o[0] = S(id) + o[0]
  o[o.length - 1] += E(id)
  return o
}
const MARK_RE = /\u0001([se]):([^\u0002]*)\u0002/g
function extract(code: string): { code: string; marks: Mark[] } {
  const marks: Mark[] = []
  const open: Mark[] = []
  const lines = code.split('\n').map((ln, i) =>
    ln.replace(MARK_RE, (_m, t: string, id: string) => {
      if (t === 's') {
        const m = { uid: id, from: i, to: i }
        open.push(m)
        marks.push(m)
      } else
        for (let k = open.length - 1; k >= 0; k--)
          if (open[k].uid === id) {
            open[k].to = i
            open.splice(k, 1)
            break
          }
      return ''
    }),
  )
  return { code: lines.join('\n'), marks }
}

const THREE_ENUM_RE: Record<string, RegExp> = {
  toneMapping: /ToneMapping$/,
  shadowMapType: /ShadowMap$/,
  side: /Side$/,
  shadowSide: /Side$/,
  blending: /Blending$/,
  depthFunc: /Depth$/,
  blendSrc: /Factor$/,
  blendDst: /Factor$/,
  blendSrcAlpha: /Factor$/,
  blendDstAlpha: /Factor$/,
  blendEquation: /Equation$/,
  blendEquationAlpha: /Equation$/,
  stencilFunc: /StencilFunc$/,
  stencilFail: /StencilOp$/,
  stencilZFail: /StencilOp$/,
  stencilZPass: /StencilOp$/,
  normalMapType: /NormalMap$/,
  combine: /Operation$/,
  frameBufferType: /Type$/,
}
const PP_ENUM: Record<string, string> = {
  blendFunction: 'BlendFunction',
  kernelSize: 'KernelSize',
  technique: 'VignetteTechnique',
}

const kebab = (k: string) =>
  k.includes('-') ? k : k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
const num = (n: number) => String(Math.round(n * 1e5) / 1e5)
const lit = (v: any): string => {
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`
  if (typeof v === 'number') return num(v)
  // テンプレートの属性 (ダブルクォート) の中に置くので、文字列はシングルクォートにする
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  return JSON.stringify(v)
}

interface Ctx {
  threeImports: Set<string>
  coreImports: Set<string>
  cientos: Set<string>
  post: Set<string>
  ppImports: Set<string>
  textures: { name: string; desc: TexDesc; key: string }[]
  refs: { name: string; node: BNode }[]
  usesCustom: boolean
}

function enumExpr(def: BlockDef | null, pd: PropDef, v: any, ctx: Ctx): string | null {
  if (typeof v !== 'number') return null
  const ppName =
    def?.id === 'post:ToneMappingPmndrs' && pd.key === 'mode'
      ? 'ToneMappingMode'
      : def?.id === 'post:GlitchPmndrs' && pd.key === 'mode'
        ? 'GlitchMode'
        : PP_ENUM[pd.key]
  if (ppName && def?.source === 'vue') {
    const opt = pd.options?.find((o) => o.value === v)
    if (opt) {
      ctx.ppImports.add(ppName)
      return `${ppName}.${opt.label}`
    }
  }
  const re = THREE_ENUM_RE[pd.key]
  if (re) {
    const name = Object.keys(THREE).find((k) => re.test(k) && (THREE as any)[k] === v)
    if (name) {
      ctx.threeImports.add(name)
      return name
    }
  }
  return null
}

function formatAttr(def: BlockDef | null, pd: PropDef, v: any, ctx: Ctx): string | null {
  const name = kebab(pd.key)
  if (pd.type === 'texture') {
    const t =
      ctx.textures.find((x) => x.desc === v) ??
      (() => {
        const e = { name: `tex${ctx.textures.length + 1}`, desc: v as TexDesc, key: pd.key }
        ctx.textures.push(e)
        return e
      })()
    return `:${name}="${t.name}"`
  }
  if (pd.type === 'boolean') return v ? name : `:${name}="false"`
  if (pd.type === 'enum') {
    const e = enumExpr(def, pd, v, ctx)
    if (e) return `:${name}="${e}"`
    return typeof v === 'string' ? `${name}="${v}"` : `:${name}="${lit(v)}"`
  }
  if (typeof v === 'string') return `${name}="${v.replace(/"/g, '&quot;')}"`
  if (typeof v === 'object' && v !== null && !Array.isArray(v))
    return `:${name}='${JSON.stringify(v)}'`
  return `:${name}="${lit(v)}"`
}

function attrsOf(n: BNode, def: BlockDef, ctx: Ctx, extra: string[] = []): string[] {
  const out: string[] = []
  if (def.argKeys) {
    const changed = def.argKeys.some((k) => n.props[k] !== undefined)
    if (changed) out.push(`:args="${lit(def.argKeys.map((k) => val(n, k)))}"`)
  }
  if (def.attach) out.push(`attach="${def.attach}"`)
  for (const [key, v] of Object.entries(n.props)) {
    const pd = def.propMap[key]
    if (!pd || def.argKeys?.includes(key)) continue
    if (key.includes('-') && Array.isArray(v)) {
      for (const [k, x] of expandAttr(key, v)) out.push(`:${k}="${lit(x)}"`)
      continue
    }
    const a = formatAttr(def, pd, v, ctx)
    if (a) out.push(a)
  }
  return [...out, ...extra]
}

function tagOf(def: BlockDef, ctx: Ctx) {
  if (def.source === 'vue') {
    if (def.importFrom === '@tresjs/cientos') ctx.cientos.add(def.tag)
    else ctx.post.add(def.tag)
  }
  if (def.source === 'custom') ctx.usesCustom = true
  return def.tag
}

function openTag(tag: string, attrs: string[], pad: string, selfClose: boolean) {
  const end = selfClose ? ' />' : '>'
  if (!attrs.length) return `${pad}<${tag}${end}`
  const one = `${pad}<${tag} ${attrs.join(' ')}${end}`
  if (one.length <= 100) return one
  return [`${pad}<${tag}`, ...attrs.map((a) => `${pad}  ${a}`), `${pad}${end.trim()}`].join('\n')
}

/**
 * 動きブロックから、毎フレーム呼ばれる処理 (onBeforeRender) を作る。
 * 動くものだけを書き出す: 位置を変える動きが無ければ position は触らない、など。
 */
function behaviorScript(n: BNode, refName: string): string {
  const bs = n.behaviors.filter((b) => !b.off)
  const base = (k: string, d: number[]) => val(n, k, d) as number[]
  const P = (b: BNode, k: string) => val(b, k)
  const AX: Record<string, number> = { x: 0, y: 1, z: 2 }
  const lines: string[] = []
  // 動きが書き換える項目 (これだけを最後にセットする)
  let movesPos = false,
    movesRot = false,
    movesScale = false

  for (const b of bs) {
    const code: string[] = []
    switch (b.def) {
      case 'bhv:spin': {
        // 0 の軸は書かない
        const speed = P(b, 'speed') as number[]
        speed.forEach((v, i) => {
          if (v) code.push(`rot[${i}] += ${num(v)} * elapsed`)
        })
        movesRot = true
        break
      }
      case 'bhv:bob':
        code.push(
          `pos[${AX[P(b, 'axis')]}] += ${num(P(b, 'amplitude'))} * Math.sin(elapsed * Math.PI * 2 * ${num(P(b, 'frequency'))} + ${num(P(b, 'phase'))})`,
        )
        movesPos = true
        break
      case 'bhv:orbit': {
        const [i, j] = P(b, 'plane') === 'xz' ? [0, 2] : P(b, 'plane') === 'xy' ? [0, 1] : [1, 2]
        const c = P(b, 'center') as number[]
        code.push(
          `const a = elapsed * ${num(P(b, 'speed'))} + ${num(P(b, 'phase'))}`,
          `pos[0] = ${num(c[0])}; pos[1] = ${num(c[1])}; pos[2] = ${num(c[2])}`,
          `pos[${i}] += Math.cos(a) * ${num(P(b, 'radius'))}`,
          `pos[${j}] += Math.sin(a) * ${num(P(b, 'radius'))}`,
        )
        movesPos = true
        break
      }
      case 'bhv:pulse':
        code.push(
          `k *= 1 + ${num(P(b, 'amount'))} * Math.sin(elapsed * Math.PI * 2 * ${num(P(b, 'frequency'))})`,
        )
        movesScale = true
        break
      case 'bhv:colorCycle':
        code.push(
          `o.material?.color?.setHSL((elapsed * ${num(P(b, 'speed'))}) % 1, ${num(P(b, 'saturation'))}, ${num(P(b, 'lightness'))})`,
        )
        break
      case 'bhv:hover':
        code.push(`if (${refName}Hover.value) k *= ${num(P(b, 'scale'))}`)
        movesScale = true
        break
      case 'bhv:click':
        if (P(b, 'action') === 'toggleScale') {
          code.push(`if (${refName}Toggled.value) k *= ${num(P(b, 'scale'))}`)
          movesScale = true
        }
        break
    }
    if (!code.length) continue
    // 動きごとに見出しのコメントを付け、ブロックの範囲を示す印で囲む
    // (orbit のように複数行になるものは { } で囲み、変数 a が他と重ならないようにする)
    const body =
      code.length > 1 && code[0].startsWith('const ')
        ? ['{', ...code.map((c) => '  ' + c), '}']
        : code
    const chunk = [`// ${REG[b.def].label}`, ...body].map((l) => '  ' + l)
    chunk[0] = S(b.uid) + chunk[0]
    chunk[chunk.length - 1] += E(b.uid)
    lines.push(...chunk)
  }

  if (!lines.length) return '' // ホバーやジャンプなど、毎フレームの処理が要らないもの
  const setup: string[] = []
  if (movesPos) setup.push(`  const pos = ${lit(base('position', [0, 0, 0]))}`)
  if (movesRot) setup.push(`  const rot = ${lit(base('rotation', [0, 0, 0]))}`)
  if (movesScale) setup.push(`  let k = 1`)
  const apply: string[] = []
  if (movesPos) apply.push(`  o.position.set(pos[0], pos[1], pos[2])`)
  if (movesRot) apply.push(`  o.rotation.set(rot[0], rot[1], rot[2])`)
  if (movesScale) {
    const sc = base('scale', [1, 1, 1])
    apply.push(`  o.scale.set(${sc.map((v) => `${num(v)} * k`).join(', ')})`)
  }
  return [
    `onBeforeRender(({ elapsed }) => {`,
    `  const o = ${refName}.value`,
    `  if (!o) return`,
    ...setup,
    ...lines,
    ...apply,
    `})`,
  ].join('\n')
}

/** ブロックの名前が英数字ならそれを変数名に使う (sun → sunRef)。そうでなければ obj1, obj2… */
function refNameOf(n: BNode, ctx: Ctx): string {
  const words = String(n.props.name ?? '').match(/[A-Za-z0-9]+/g)
  const taken = new Set(ctx.refs.map((r) => r.name))
  if (words && /^[A-Za-z]/.test(words[0])) {
    const camel = words
      .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1)))
      .join('')
    for (let i = 0; ; i++) {
      const name = `${camel}Ref${i ? i + 1 : ''}`
      if (!taken.has(name)) return name
    }
  }
  return `obj${ctx.refs.length + 1}`
}

function emit(n: BNode, ctx: Ctx, depth: number, firstCamera: string | null): string[] {
  const def = REG[n.def]
  if (!def || n.off) return []
  const pad = '  '.repeat(depth)
  const tag = tagOf(def, ctx)
  const extra: string[] = []
  const bs = n.behaviors.filter((b) => !b.off)
  let refName = ''
  if (bs.length) {
    refName = refNameOf(n, ctx)
    ctx.refs.push({ name: refName, node: n })
    extra.push(`ref="${refName}"`)
    if (bs.some((b) => b.def === 'bhv:hover'))
      extra.push(
        `@pointer-enter="${refName}Hover = true"`,
        `@pointer-leave="${refName}Hover = false"`,
      )
    const click = bs.find((b) => b.def === 'bhv:click')
    if (click) extra.push(`@click="${refName}Click"`)
  }
  if (def.kind === 'camera' && firstCamera === n.uid) extra.unshift('make-default')
  if (def.kind === 'controls' && n.props.makeDefault === undefined) extra.unshift('make-default')

  const kids: string[] = []
  if (def.slots?.geometry && n.geometry) kids.push(...emit(n.geometry, ctx, depth + 1, null))
  if (def.slots?.material && n.material) kids.push(...emit(n.material, ctx, depth + 1, null))
  for (const c of n.children) kids.push(...emit(c, ctx, depth + 1, firstCamera))
  const attrs = attrsOf(n, def, ctx, extra)

  if (def.kind === 'composer') {
    return mark(n.uid, [
      `${pad}<Suspense>`,
      ...(kids.length
        ? [openTag(tag, attrs, pad + '  ', false), ...kids.map((k) => k), `${pad}  </${tag}>`]
        : [openTag(tag, attrs, pad + '  ', true)]),
      `${pad}</Suspense>`,
    ])
  }
  if (!kids.length) return mark(n.uid, [openTag(tag, attrs, pad, true)])
  return mark(n.uid, [openTag(tag, attrs, pad, false), ...kids, `${pad}</${tag}>`])
}

export function generate(): { files: GenFile[]; install: string } {
  const ctx: Ctx = {
    threeImports: new Set(),
    coreImports: new Set(['TresCanvas']),
    cientos: new Set(),
    post: new Set(),
    ppImports: new Set(),
    textures: [],
    refs: [],
    usesCustom: false,
  }
  let firstCamera: string | null = null
  let hasControls = false,
    hasComposer = false
  walk(doc.children, (n) => {
    const d = REG[n.def]
    if (d.kind === 'camera' && !firstCamera && !n.off) firstCamera = n.uid
    if (d.kind === 'controls') hasControls = true
    if (d.kind === 'composer') hasComposer = true
  })

  // ── Scene.vue のテンプレート
  const body: string[] = []
  if (!firstCamera)
    body.push(
      '    <TresPerspectiveCamera make-default :position="[6, 5, 8]" :look-at="[0, 0, 0]" />',
    )
  if (!hasControls) {
    ctx.cientos.add('OrbitControls')
    body.push('    <OrbitControls make-default />')
  }
  const nodes = doc.children.flatMap((n) => emit(n, ctx, 1, firstCamera))
  body.push(...nodes)

  // ── スクリプト
  const behaviorNodes = ctx.refs
  const script: string[] = []
  const vueImports = new Set<string>()
  if (behaviorNodes.length) {
    vueImports.add('shallowRef')
    ctx.coreImports.clear()
    ctx.coreImports.add('useLoop')
  }
  const lines: string[] = []
  if (vueImports.size) lines.push(`import { ${[...vueImports].sort().join(', ')} } from 'vue'`)
  const coreList = [...ctx.coreImports].filter((x) => x !== 'TresCanvas')
  if (coreList.length) lines.push(`import { ${coreList.join(', ')} } from '@tresjs/core'`)
  if (ctx.cientos.size)
    lines.push(`import { ${[...ctx.cientos].sort().join(', ')} } from '@tresjs/cientos'`)
  if (ctx.post.size || hasComposer) {
    ctx.post.add('EffectComposerPmndrs')
    lines.push(`import { ${[...ctx.post].sort().join(', ')} } from '@tresjs/post-processing'`)
  }
  if (ctx.ppImports.size)
    lines.push(`import { ${[...ctx.ppImports].sort().join(', ')} } from 'postprocessing'`)
  if (ctx.threeImports.size)
    lines.push(`import { ${[...ctx.threeImports].sort().join(', ')} } from 'three'`)
  if (ctx.textures.length) lines.push(`import { makeTexture } from './textures'`)
  if (ctx.usesCustom) lines.push(`import StudioEnv from './StudioEnv'`)
  script.push(...lines)
  if (ctx.textures.length) {
    script.push('')
    for (const t of ctx.textures) {
      const d = { ...t.desc }
      if (d.kind === 'upload') {
        d.kind = 'url'
        d.src = '/path/to/image.png'
      } // 画像ファイルは別途用意する
      script.push(`const ${t.name} = makeTexture(${JSON.stringify(d)}, '${t.key}')`)
    }
  }
  if (behaviorNodes.length) {
    script.push('', 'const { onBeforeRender } = useLoop()')
    for (const r of behaviorNodes) {
      script.push('', S(r.node.uid) + `const ${r.name} = shallowRef()`)
      const bs = r.node.behaviors.filter((b) => !b.off)
      if (bs.some((b) => b.def === 'bhv:hover')) {
        script.splice(script.length, 0, `const ${r.name}Hover = shallowRef(false)`)
      }
      if (bs.some((b) => b.def === 'bhv:click')) {
        const click = bs.find((b) => b.def === 'bhv:click')!
        const act = val(click, 'action')
        if (act === 'toggleScale')
          script.push(
            `const ${r.name}Toggled = shallowRef(false)`,
            `const ${r.name}Click = () => { ${r.name}Toggled.value = !${r.name}Toggled.value }`,
          )
        else if (act === 'randomColor')
          script.push(
            `const ${r.name}Click = () => ${r.name}.value?.material?.color?.setHSL(Math.random(), 0.7, 0.55)`,
          )
        else
          script.push(
            `const ${r.name}Click = () => { const o = ${r.name}.value; if (o) { o.position.y += 1; setTimeout(() => (o.position.y -= 1), 350) } }`,
          )
      }
      const frameFn = behaviorScript(r.node, r.name)
      if (frameFn) script.push(frameFn + E(r.node.uid))
      else script[script.length - 1] += E(r.node.uid)
    }
  }

  const scene = [
    '<script setup lang="ts">',
    ...script,
    '</script>',
    '',
    '<template>',
    ...body,
    '</template>',
    '',
  ].join('\n')

  // ── App.vue (TresCanvas)
  const cAttrs: string[] = []
  const cctx: Ctx = { ...ctx, threeImports: new Set(), ppImports: new Set(), textures: [] }
  for (const [key, v] of Object.entries(doc.canvas)) {
    const pd = CANVAS_MAP[key]
    if (!pd || v === '' || v === undefined) continue
    const a = formatAttr(null, pd, v, cctx)
    if (a) cAttrs.push(a)
  }
  const appImports = [
    "import { TresCanvas } from '@tresjs/core'",
    "import Scene from './Scene.vue'",
  ]
  if (cctx.threeImports.size)
    appImports.push(`import { ${[...cctx.threeImports].sort().join(', ')} } from 'three'`)
  const app = [
    '<script setup lang="ts">',
    ...appImports,
    '</script>',
    '',
    '<template>',
    S('canvas') + openTag('TresCanvas', ['window-size', ...cAttrs], '  ', false),
    '    <Scene />',
    '  </TresCanvas>' + E('canvas'),
    '</template>',
    '',
  ].join('\n')

  const files: GenFile[] = [
    { name: 'App.vue', lang: 'vue', ...extract(app) },
    { name: 'Scene.vue', lang: 'vue', ...extract(scene) },
  ]
  if (ctx.textures.length) files.push({ name: 'textures.ts', lang: 'ts', code: texturesSource })
  if (ctx.usesCustom)
    files.push({
      name: 'StudioEnv.ts',
      lang: 'ts',
      code:
        customSource.replace('export const StudioEnv', 'const StudioEnv') +
        '\nexport default StudioEnv\n',
    })

  files.push({
    name: 'vite.config.ts',
    lang: 'ts',
    code: [
      "import { defineConfig } from 'vite'",
      "import vue from '@vitejs/plugin-vue'",
      "import templateCompilerOptions from '@tresjs/core/template-compiler-options'",
      '',
      '// <TresMesh> などをカスタム要素として扱うための設定',
      'export default defineConfig({',
      '  plugins: [vue({ ...templateCompilerOptions })],',
      '})',
      '',
    ].join('\n'),
  })

  const pkgs = ['three', '@tresjs/core']
  if (ctx.cientos.size) pkgs.push('@tresjs/cientos')
  if (ctx.post.size) pkgs.push('@tresjs/post-processing', 'postprocessing')
  return { files, install: `pnpm add ${pkgs.join(' ')}` }
}
