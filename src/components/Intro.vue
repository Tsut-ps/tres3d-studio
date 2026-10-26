<script setup lang="ts">
import { computed } from 'vue'
import { addFromPalette, doc, flash, ui, walk } from '../store'
import { REG } from '../schema'
import Ico from './Ico.vue'

const KEY = 'tres-blocks:intro'
const has = (kind: string) => {
  let f = false
  walk(doc.children, (n) => {
    if (REG[n.def]?.kind === kind && !n.off) f = true
  })
  return f
}
const hasMesh = computed(
  () =>
    has('object') &&
    (() => {
      let f = false
      walk(doc.children, (n) => {
        if (n.def === 'three:Mesh') f = true
      })
      return f
    })(),
)
const hasLight = computed(() => has('light'))

function add(def: string) {
  addFromPalette(def)
}
function openCode() {
  ui.showCode = true
}
function close(remember: boolean) {
  ui.intro = false
  if (remember) {
    try {
      localStorage.setItem(KEY, 'done')
    } catch {
      /* 保存できなくても動く */
    }
    flash('右上の ? から、いつでも開けます')
  }
}
</script>

<template>
  <section v-if="ui.intro" class="intro" aria-labelledby="intro-title" @click.stop>
    <header>
      <h2 id="intro-title">はじめに</h2>
      <span class="grow" />
      <button class="btn ghost" type="button" @click="close(true)"><Ico name="x" /> 閉じる</button>
    </header>
    <p class="intro-lead">
      ブロックを積むと、右のプレビューにすぐ映ります。まず「メッシュ」と「ライト」を置いてみましょう。
    </p>
    <ol>
      <li>
        <b>ブロックを置く</b>
        <span>「パレット」からドラッグ（クリックでも）。</span>
        <span class="intro-acts">
          <button class="btn" type="button" @click="add('three:Mesh')">
            <Ico :name="hasMesh ? 'check' : 'plus'" :size="14" /> メッシュ
          </button>
          <button class="btn" type="button" @click="add('three:DirectionalLight')">
            <Ico :name="hasLight ? 'check' : 'plus'" :size="14" /> ライト
          </button>
        </span>
      </li>
      <li>
        <b>形状・素材・動きを入れる</b>
        <span
          >ブロックの中の「＋
          動き」などを押すと、パレットが合う種類に移ります。合うものだけ入ります。</span
        >
      </li>
      <li>
        <b>動かして確かめる</b>
        <span
          >プレビューのものを押して選び、W / E / R
          で移動・回転・拡大。数値の欄は、左右にドラッグでも変えられます。</span
        >
      </li>
      <li>
        <b>コードにする</b>
        <span>「コード」で画面の下にコードが出ます。ブロックを選ぶと、対応する行が光ります。</span>
        <span class="intro-acts"
          ><button class="btn" type="button" @click="openCode">
            <Ico name="code" :size="14" /> コードを見る
          </button></span
        >
      </li>
    </ol>
    <footer>
      <button class="btn ghost" type="button" @click="close(false)">あとで</button>
      <button class="btn primary" type="button" @click="close(true)">
        わかった（もう出さない）
      </button>
    </footer>
  </section>
</template>
