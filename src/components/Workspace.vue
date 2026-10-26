<script setup lang="ts">
import { computed } from 'vue'
import { CANVAS_MAP } from '../blocks/schema'
import { ui } from '../model/store'
import { doc, setProp, walk } from '../model/doc'
import BlockView from './BlockView.vue'
import DropZone from './DropZone.vue'
import PropEditor from './PropEditor.vue'
import Ico from './Ico.vue'
import Intro from './Intro.vue'

const pills = ['clearColor', 'shadows'].map((k) => CANVAS_MAP[k])
const rootLabel: Record<string, string> = { clearColor: '背景', shadows: '影' }
const cv = (k: string) => doc.canvas[k] ?? CANVAS_MAP[k].def
const empty = computed(() => doc.children.length === 0)

function setAll(collapsed: boolean) {
  walk(doc.children, (n) => {
    n.collapsed = collapsed || undefined
  })
}
</script>

<template>
  <div class="ws-wrap">
    <div class="ws-bar">
      <h2>ブロック</h2>
      <span class="grow" />
      <button class="btn ghost" type="button" title="すべて閉じる" @click="setAll(true)">
        <Ico name="fold" /> 閉じる
      </button>
      <button class="btn ghost" type="button" title="すべて開く" @click="setAll(false)">
        <Ico name="unfold" /> 開く
      </button>
    </div>
    <div
      class="ws"
      @click="ui.selected = 'canvas'"
      @contextmenu.prevent="ui.menu = { x: $event.clientX, y: $event.clientY, uid: '' }"
      @mouseleave="ui.hover = ''"
    >
      <Intro />
      <div
        class="blk root"
        :class="{ 'blk-sel': ui.selected === 'canvas' }"
        style="--c: var(--c-root); --ink: var(--ink-root)"
        @click.stop="ui.selected = 'canvas'"
        @contextmenu.prevent.stop="ui.menu = { x: $event.clientX, y: $event.clientY, uid: '' }"
        @mouseover="ui.hover = ''"
      >
        <div class="blk-head">
          <span class="grab nodrag"><span class="blk-title">シーン</span></span>
          <span class="pills">
            <label v-for="pd in pills" :key="pd.key" class="pill" @click.stop>
              <span>{{ rootLabel[pd.key] ?? pd.label }}</span>
              <PropEditor
                compact
                :pd="pd"
                :value="cv(pd.key)"
                @set="setProp(doc.canvas, pd, $event)"
              />
            </label>
          </span>
          <span class="grow" />
          <span v-if="Object.keys(doc.canvas).length" class="badge" title="変更したシーン設定の数"
            >変更<b>{{ Object.keys(doc.canvas).length }}</b></span
          >
        </div>
        <div class="blk-body">
          <div class="kids">
            <template v-for="(c, i) in doc.children" :key="c.uid">
              <DropZone gap :parent="null" at="children" :index="i" />
              <BlockView :node="c" :parent="null" at="children" />
            </template>
            <DropZone
              :pick="!empty"
              :parent="null"
              at="children"
              :label="empty ? '' : '＋ ここに追加'"
              class="dz-quiet"
            />
          </div>
          <div v-if="empty" class="empty-state">
            <svg class="empty-art" viewBox="0 0 220 90" aria-hidden="true">
              <rect class="ea-area" x="96" y="14" width="118" height="62" rx="9" />
              <g class="ea-block">
                <rect x="0" y="0" width="76" height="26" rx="8" />
                <circle cx="13" cy="13" r="4.5" />
                <rect x="24" y="9" width="40" height="8" rx="4" />
              </g>
            </svg>
            <strong>まだ何もありません</strong>
            <p>左のブロックを、ここへドラッグ。<br />「メッシュ」と「ライト」を置くと見えます。</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
