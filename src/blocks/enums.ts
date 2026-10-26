import * as THREE from 'three'
import {
  BlendFunction,
  KernelSize,
  ToneMappingMode,
  VignetteTechnique,
  GlitchMode,
} from 'postprocessing'

export interface Opt {
  label: string
  value: any
}

const T = (names: string[]): Opt[] =>
  names.map((n) => ({ label: n, value: (THREE as any)[n] })).filter((o) => o.value !== undefined)

/** postprocessing の enum（実行時はオブジェクト）を選択肢にする */
function fromEnum(obj: Record<string, any>): Opt[] {
  return Object.entries(obj)
    .filter(([k, v]) => typeof v === 'number' && Number.isNaN(Number(k)))
    .map(([k, v]) => ({ label: k, value: v as number }))
    .sort((a, b) => a.value - b.value)
}

const SIDE = [
  { label: '表面 FrontSide', value: THREE.FrontSide },
  { label: '裏面 BackSide', value: THREE.BackSide },
  { label: '両面 DoubleSide', value: THREE.DoubleSide },
]
const DEPTH_FUNC = T([
  'NeverDepth',
  'AlwaysDepth',
  'LessDepth',
  'LessEqualDepth',
  'EqualDepth',
  'GreaterEqualDepth',
  'GreaterDepth',
  'NotEqualDepth',
])
const BLEND_FACTOR = T([
  'ZeroFactor',
  'OneFactor',
  'SrcColorFactor',
  'OneMinusSrcColorFactor',
  'SrcAlphaFactor',
  'OneMinusSrcAlphaFactor',
  'DstAlphaFactor',
  'OneMinusDstAlphaFactor',
  'DstColorFactor',
  'OneMinusDstColorFactor',
  'SrcAlphaSaturateFactor',
  'ConstantColorFactor',
  'OneMinusConstantColorFactor',
  'ConstantAlphaFactor',
  'OneMinusConstantAlphaFactor',
])
const BLEND_EQ = T([
  'AddEquation',
  'SubtractEquation',
  'ReverseSubtractEquation',
  'MinEquation',
  'MaxEquation',
])
const STENCIL_FUNC = T([
  'NeverStencilFunc',
  'LessStencilFunc',
  'EqualStencilFunc',
  'LessEqualStencilFunc',
  'GreaterStencilFunc',
  'NotEqualStencilFunc',
  'GreaterEqualStencilFunc',
  'AlwaysStencilFunc',
])
const STENCIL_OP = T([
  'ZeroStencilOp',
  'KeepStencilOp',
  'ReplaceStencilOp',
  'IncrementStencilOp',
  'DecrementStencilOp',
  'IncrementWrapStencilOp',
  'DecrementWrapStencilOp',
  'InvertStencilOp',
])

/** プロパティ名で引く選択肢（three.js の整数定数）。 */
export const ENUM_BY_KEY: Record<string, Opt[]> = {
  side: SIDE,
  shadowSide: [{ label: '自動 (sideと同じ)', value: null }, ...SIDE],
  blending: T([
    'NoBlending',
    'NormalBlending',
    'AdditiveBlending',
    'SubtractiveBlending',
    'MultiplyBlending',
    'CustomBlending',
  ]),
  depthFunc: DEPTH_FUNC,
  blendEquation: BLEND_EQ,
  blendEquationAlpha: [{ label: '自動 (blendEquationと同じ)', value: null }, ...BLEND_EQ],
  blendSrc: BLEND_FACTOR,
  blendDst: BLEND_FACTOR,
  blendSrcAlpha: [{ label: '自動', value: null }, ...BLEND_FACTOR],
  blendDstAlpha: [{ label: '自動', value: null }, ...BLEND_FACTOR],
  stencilFunc: STENCIL_FUNC,
  stencilFail: STENCIL_OP,
  stencilZFail: STENCIL_OP,
  stencilZPass: STENCIL_OP,
  // MeshDepthMaterial のシェーダーが対応するのは Basic / RGBA のみ（RGB・RG は未対応でコンパイルに失敗する）
  depthPacking: T(['BasicDepthPacking', 'RGBADepthPacking']),
  normalMapType: T(['TangentSpaceNormalMap', 'ObjectSpaceNormalMap']),
  combine: T(['MultiplyOperation', 'MixOperation', 'AddOperation']),
  precision: [
    { label: '自動', value: null },
    { label: 'highp', value: 'highp' },
    { label: 'mediump', value: 'mediump' },
    { label: 'lowp', value: 'lowp' },
  ],
  // postprocessing 共通
  // SKIP は「効果を外す」と同じ。Grid などで Tres 内部が失敗するので選択肢から除く（ブロックの無効化で代替できる）
  blendFunction: fromEnum(BlendFunction as any).filter((o) => o.label !== 'SKIP'),
  kernelSize: fromEnum(KernelSize as any),
  technique: fromEnum(VignetteTechnique as any),
  frameBufferType: T(['UnsignedByteType', 'HalfFloatType', 'FloatType']),
}

/** ブロックごとに上書きする選択肢（キー名が同じで意味が違うもの） */
export const ENUM_BY_DEF: Record<string, Record<string, Opt[]>> = {
  'post:ToneMappingPmndrs': { mode: fromEnum(ToneMappingMode as any) },
  'post:GlitchPmndrs': { mode: fromEnum(GlitchMode as any) },
}

/** TresCanvas の選択式プロパティ */
export const CANVAS_ENUMS: Record<string, Opt[]> = {
  toneMapping: [
    { label: 'なし NoToneMapping', value: THREE.NoToneMapping },
    { label: 'Linear', value: THREE.LinearToneMapping },
    { label: 'Reinhard', value: THREE.ReinhardToneMapping },
    { label: 'Cineon', value: THREE.CineonToneMapping },
    { label: 'ACESFilmic', value: THREE.ACESFilmicToneMapping },
    { label: 'AgX', value: (THREE as any).AgXToneMapping },
    { label: 'Neutral', value: (THREE as any).NeutralToneMapping },
  ].filter((o) => o.value !== undefined),
  shadowMapType: [
    { label: 'Basic', value: THREE.BasicShadowMap },
    { label: 'PCF', value: THREE.PCFShadowMap },
    { label: 'PCFSoft', value: THREE.PCFSoftShadowMap },
    { label: 'VSM', value: THREE.VSMShadowMap },
  ],
  outputColorSpace: [
    { label: 'sRGB', value: 'srgb' },
    { label: 'sRGB (linear)', value: 'srgb-linear' },
    { label: 'Display P3', value: 'display-p3' },
  ],
  renderMode: [
    { label: '常に描画 always', value: 'always' },
    { label: '変化時のみ on-demand', value: 'on-demand' },
    { label: '手動 manual', value: 'manual' },
  ],
  preset: [
    { label: '指定なし', value: undefined },
    { label: 'realistic', value: 'realistic' },
    { label: 'flat', value: 'flat' },
  ],
  powerPreference: [
    { label: 'default', value: 'default' },
    { label: 'high-performance', value: 'high-performance' },
    { label: 'low-power', value: 'low-power' },
  ],
}
