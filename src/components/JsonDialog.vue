<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { flash, ui } from '../model/store'
import { doc } from '../model/doc'
import { resetDoc } from '../model/history'
import Ico from './Ico.vue'

const dlg = ref<HTMLDialogElement | null>(null)
const text = ref('')
const bad = ref('')

const current = computed(() =>
  JSON.stringify({ app: 'tres-blocks', v: 1, canvas: doc.canvas, children: doc.children }, null, 2),
)
watch(
  () => ui.showJson,
  (v) => {
    if (v) {
      text.value = current.value
      bad.value = ''
      dlg.value?.showModal()
    } else if (dlg.value?.open) dlg.value.close()
  },
)

function load() {
  try {
    const d = JSON.parse(text.value)
    if (!d || typeof d !== 'object' || !Array.isArray(d.children))
      throw new Error('children がありません')
    resetDoc({ canvas: d.canvas ?? {}, children: d.children })
    ui.showJson = false
    flash('読み込みました')
  } catch (e: any) {
    bad.value = `読み込めません: ${e.message}`
  }
}
function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const r = new FileReader()
  r.onload = () => {
    text.value = String(r.result)
    bad.value = ''
  }
  r.readAsText(f)
}
async function copy() {
  try {
    await navigator.clipboard.writeText(text.value)
    flash('JSONをコピーしました')
  } catch {
    flash('コピーできませんでした。テキストを選択してコピーしてください')
  }
}
</script>

<template>
  <dialog
    ref="dlg"
    class="dlg json"
    aria-labelledby="json-title"
    @close="ui.showJson = false"
    @click.self="ui.showJson = false"
  >
    <div v-if="ui.showJson" class="dlg-in">
      <header class="dlg-head">
        <h2 id="json-title">保存・読み込み (JSON)</h2>
        <span class="grow" />
        <button class="btn ghost" type="button" @click="ui.showJson = false">
          <Ico name="x" /> 閉じる
        </button>
      </header>
      <p class="dlg-note">
        いまの内容は自動でこのブラウザに保存されています。別の環境へ移すときは、JSONをコピーして保存し、あとで貼り付けて読み込みます。
      </p>
      <textarea v-model="text" class="jsonarea" spellcheck="false" aria-label="シーンのJSON" />
      <p v-if="bad" class="insp-err">{{ bad }}</p>
      <div class="dlg-foot">
        <label class="btn ghost filebtn"
          >ファイルから選ぶ<input type="file" accept=".json,application/json" @change="onFile"
        /></label>
        <span class="grow" />
        <button class="btn ghost" type="button" @click="text = current">
          <Ico name="reset" /> 現在の内容に戻す
        </button>
        <button class="btn ghost" type="button" @click="copy"><Ico name="copy" /> コピー</button>
        <button class="btn primary" type="button" @click="load">この内容を読み込む</button>
      </div>
    </div>
  </dialog>
</template>
