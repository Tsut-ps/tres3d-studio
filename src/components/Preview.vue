<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { ui } from '../model/store'
import { doc, walk } from '../model/doc'
import { layout } from '../model/layout'
import { REG, CANVAS_PROPS } from '../blocks/schema'
import { SceneNode, SCENE_INFO, pointerState } from '../preview/SceneNode'
import StatsProbe, { perf } from '../preview/StatsProbe'
import HighlightLayer from '../preview/HighlightLayer'
import GizmoLayer from '../preview/GizmoLayer'
import ViewControls, { viewPose } from '../preview/ViewControls'
import Ico from './Ico.vue'
import { alignAxis, distributeAxis, dropToFloor, movableCount } from '../preview/align'
import { useDismiss } from '../composables/useInteraction'

const TOOLS = [
  { id: 'off', label: '選択のみ', key: 'Q', icon: 'cursor' },
  { id: 'translate', label: '移動', key: 'W', icon: 'move' },
  { id: 'rotate', label: '回転', key: 'E', icon: 'rotate' },
  { id: 'scale', label: '拡大', key: 'R', icon: 'scale' },
] as const

const showGrid = ref(true)
const showAxes = ref(false)
const showFps = ref(true)
const viewKey = ref(0)

const info = computed(() => {
  let cameraUid: string | null = null
  let hasControls = false
  walk(doc.children, (n) => {
    const d = REG[n.def]
    if (d.kind === 'camera' && !cameraUid && !n.off) cameraUid = n.uid
    if (d.kind === 'controls' && !n.off) hasControls = true
  })
  return { cameraUid, hasControls, useScene: ui.view === 'camera' && !!cameraUid }
})
// ブロックのカメラが無くなったら、自由視点へ戻す
watch(
  () => info.value.cameraUid,
  (v) => {
    if (!v && ui.view === 'camera') ui.view = 'free'
  },
)
function resetView() {
  viewPose.skip = true
  viewKey.value++
}

// 「整列」メニュー。選んだオブジェクトを、床に置く・軸ごとにそろえる・等間隔にする
const showAlign = ref(false)
const alignEl = ref<HTMLElement | null>(null)
const nMove = computed(() => movableCount())
const AXES = [
  { i: 0, k: 'x', name: 'X', lo: '最小', hi: '最大' },
  { i: 1, k: 'y', name: 'Y', lo: '最小', hi: '最大' },
  { i: 2, k: 'z', name: 'Z', lo: '最小', hi: '最大' },
] as const
useDismiss(showAlign, alignEl, () => (showAlign.value = false))

// 「表示」メニュー (グリッド・座標軸・FPS)。プレビュー専用で、書き出すコードには入らない
const showMenu = ref(false)
const menuEl = ref<HTMLElement | null>(null)
useDismiss(showMenu, menuEl, () => (showMenu.value = false))
provide(SCENE_INFO, info)

/** 明示的に設定されたものだけを渡す（書き出すコードと同じ条件にするため） */
const canvasProps = computed(() => {
  const o: Record<string, any> = {}
  for (const [k, v] of Object.entries(doc.canvas)) if (v !== '' && v !== undefined) o[k] = v
  return o
})
/** コンテキスト生成時にしか効かない設定は、変わったらキャンバスを作り直す */
const restartKey = computed(
  () =>
    JSON.stringify(CANVAS_PROPS.filter((p) => p.restart).map((p) => doc.canvas[p.key])) +
    viewKey.value +
    (info.value.useScene ? 'c' : 'f'),
)
const errors = computed(() => Object.entries(ui.errors))
// 動作確認用にコンテキストを公開する
function onReady(ctx: any) {
  if (new URLSearchParams(location.search).has('debug')) (window as any).__tres = ctx
}

// ドラッグ (視点の操作) とクリック (ブロックの選択) を区別する
let down: { x: number; y: number } | null = null
function onDown(e: PointerEvent) {
  down = { x: e.clientX, y: e.clientY }
  pointerState.moved = false
  pointerState.ctrl = e.ctrlKey || e.metaKey
  pointerState.shift = e.shiftKey
  pointerState.alt = e.altKey
}
function onMove(e: PointerEvent) {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) pointerState.moved = true
}
function onUp() {
  down = null
}
/** 何もない所をクリックしたら、シーン全体の設定に戻す */
function onMissed() {
  if (!pointerState.moved && !pointerState.alt && !pointerState.ctrl && !pointerState.shift)
    ui.selected = 'canvas'
}
</script>

<template>
  <div class="prev">
    <div
      class="prev-canvas"
      @pointerdown.capture="onDown"
      @pointermove.capture="onMove"
      @pointerup.capture="onUp"
      @pointercancel.capture="onUp"
    >
      <TresCanvas :key="restartKey" v-bind="canvasProps" @ready="onReady" @pointermissed="onMissed">
        <TresPerspectiveCamera
          v-if="!info.useScene"
          make-default
          :position="[6, 5, 8]"
          :look-at="[0, 0, 0]"
        />
        <OrbitControls v-if="!info.hasControls && !info.useScene" make-default />
        <SceneNode v-for="n in doc.children" :key="n.uid" :node="n" />
        <TresGridHelper v-if="showGrid" :args="[20, 20, '#5a6178', '#39405a']" />
        <TresAxesHelper v-if="showAxes" :args="[3]" />
        <StatsProbe v-if="showFps" />
        <HighlightLayer />
        <GizmoLayer />
        <ViewControls />
      </TresCanvas>
    </div>
    <div class="tools" role="toolbar" aria-label="ツール">
      <button
        v-for="t in TOOLS"
        :key="t.id"
        class="tool"
        type="button"
        :aria-pressed="ui.gizmo === t.id"
        :title="`${t.label} (${t.key})`"
        :aria-label="t.label"
        @click="ui.gizmo = t.id"
      >
        <Ico :name="t.icon" :size="16" />
      </button>
      <span class="tool-sep" />
      <button
        class="tool txt"
        type="button"
        :title="
          ui.space === 'world'
            ? 'ワールド座標で動かす。押すとローカル座標に切り替え'
            : 'ローカル座標で動かす。押すとワールド座標に切り替え'
        "
        :aria-pressed="ui.space === 'local'"
        @click="ui.space = ui.space === 'world' ? 'local' : 'world'"
      >
        {{ ui.space === 'world' ? 'ワールド' : 'ローカル' }}
      </button>
      <button
        class="tool"
        type="button"
        :aria-pressed="ui.snapObj"
        title="吸着: 動かすとき、ほかの物の面・中心・床にそろいます (Ctrl を押すあいだはグリッドに吸着)"
        aria-label="吸着"
        @click="ui.snapObj = !ui.snapObj"
      >
        <Ico name="magnet" :size="16" />
      </button>
      <div ref="alignEl" class="tool-wrap">
        <button
          class="tool"
          type="button"
          aria-haspopup="true"
          :aria-expanded="showAlign"
          title="整列: 床に置く・そろえる・等間隔"
          aria-label="整列"
          @click="showAlign = !showAlign"
        >
          <Ico name="align" :size="16" />
        </button>
        <div v-if="showAlign" class="amenu" role="group" aria-label="整列">
          <button class="btn" type="button" :disabled="!nMove" @click="dropToFloor()">
            床に置く
          </button>
          <p v-if="nMove < 2">2つ以上選ぶと、軸ごとにそろえられます（Ctrl+クリックで追加）</p>
          <template v-else>
            <div v-for="a in AXES" :key="a.k" class="arow">
              <b :data-axis="a.k">{{ a.name }}</b>
              <button
                class="btn"
                type="button"
                :title="`${a.name} が最小の物にそろえる`"
                @click="alignAxis(a.i, 'min')"
              >
                {{ a.lo }}
              </button>
              <button
                class="btn"
                type="button"
                :title="`${a.name} の中央にそろえる`"
                @click="alignAxis(a.i, 'mid')"
              >
                中央
              </button>
              <button
                class="btn"
                type="button"
                :title="`${a.name} が最大の物にそろえる`"
                @click="alignAxis(a.i, 'max')"
              >
                {{ a.hi }}
              </button>
              <button
                class="btn"
                type="button"
                :disabled="nMove < 3"
                :title="nMove < 3 ? '3つ以上で使えます' : `${a.name} に沿って、すき間を等しくする`"
                @click="distributeAxis(a.i)"
              >
                等間隔
              </button>
            </div>
          </template>
        </div>
      </div>
      <button
        class="tool"
        type="button"
        title="選択したブロックに寄る (F)"
        aria-label="選択したブロックに寄る"
        @click="ui.frameReq++"
      >
        <Ico name="crosshair" :size="16" />
      </button>
    </div>
    <div v-if="ui.busy" class="busy" role="status">
      <i class="spin" /><span>{{ ui.busy }}</span>
    </div>
    <div class="prev-bar">
      <div ref="menuEl" class="vmenu-wrap">
        <button
          class="btn ghost"
          type="button"
          aria-haspopup="true"
          :aria-expanded="showMenu"
          title="プレビューに出す補助の表示"
          @click="showMenu = !showMenu"
        >
          <Ico name="eye" /> 表示
        </button>
        <div v-if="showMenu" class="vmenu" role="group" aria-label="表示">
          <p>プレビューだけの表示です。書き出すコードには入りません。</p>
          <label><input v-model="showGrid" type="checkbox" /> グリッド</label>
          <label><input v-model="showAxes" type="checkbox" /> 座標軸</label>
          <label><input v-model="showFps" type="checkbox" /> FPS</label>
        </div>
      </div>
      <span class="grow" />
      <div class="vseg" role="group" aria-label="視点">
        <button
          type="button"
          :aria-pressed="ui.view === 'free'"
          title="作業用のカメラで自由に見る"
          @click="ui.view = 'free'"
        >
          自由視点
        </button>
        <button
          type="button"
          :aria-pressed="ui.view === 'camera'"
          :disabled="!info.cameraUid"
          :title="
            info.cameraUid
              ? 'ブロックのカメラから見た絵 (書き出したコードの画面)'
              : 'カメラのブロックを置くと選べます'
          "
          @click="ui.view = 'camera'"
        >
          カメラ視点
        </button>
      </div>
      <button
        v-if="ui.view === 'free'"
        class="btn ghost"
        type="button"
        title="視点を初期状態に戻す"
        aria-label="視点を初期状態に戻す"
        @click="resetView"
      >
        <Ico name="reset" />
      </button>
      <span class="grow" />
      <button
        class="btn ghost wide-btn"
        type="button"
        :aria-pressed="layout.wide"
        :title="layout.wide ? 'プレビューを元の大きさに戻す' : 'プレビューを大きくする'"
        @click="layout.wide = !layout.wide"
      >
        <Ico :name="layout.wide ? 'shrink' : 'expand'" /> {{ layout.wide ? '縮小' : '拡大' }}
      </button>
    </div>
    <div v-if="showFps" class="fps" aria-live="off">{{ perf.fps }} fps</div>
    <ul v-if="errors.length" class="errs" role="alert">
      <li v-for="[id, msg] in errors" :key="id" @click="ui.selected = id">{{ msg }}</li>
    </ul>
  </div>
</template>
