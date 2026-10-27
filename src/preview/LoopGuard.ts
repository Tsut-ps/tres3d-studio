import { defineComponent, onBeforeUnmount, onMounted } from 'vue'
import { useLoop } from '@tresjs/core'
import { doc } from '../model/doc'
import { flash, ui } from '../model/store'

const CHECK_MS = 1000
/** この時間、1 フレームも進まなければ「止まった」とみなす */
const STALL_MS = 3000
/** 続けて止まったら、原因が残っているとみなして、画面にエラーを出す */
const GIVE_UP_AFTER = 2
/** 止まったあと、この回数の確認の間ずっと動けていたら、直ったとみなす */
const HEALTHY_CHECKS = 3

/**
 * 描画ループを見張る。
 *
 * TresJS の描画ループは、1 フレームの途中で例外が出ると、次のフレームを予約しないまま
 * 終わってしまう。以後は何も起きず、画面は固まったまま、エラーも見えない。
 * そこで、フレームが進まなくなったら検知して、ループを動かし直す。
 */
export default defineComponent({
  name: 'LoopGuard',
  setup() {
    const { onRender, stop, start } = useLoop()
    let frames = 0
    let seen = 0
    let last = performance.now()
    let lastError = ''
    let stalls = 0
    let healthy = 0
    let timer = 0

    // 描画が最後まで終わったときだけ呼ばれる (途中で例外が出たフレームでは呼ばれない)
    onRender(() => {
      frames++
    })

    const onError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const m =
        'reason' in e ? (e.reason?.message ?? String(e.reason)) : (e.error?.message ?? e.message)
      if (m) lastError = m
    }

    const check = () => {
      const now = performance.now()
      // 非表示のタブや、「変化時のみ」「手動」の描画では、止まって見えるのが正常
      if (document.hidden || (doc.canvas.renderMode && doc.canvas.renderMode !== 'always')) {
        last = now
        seen = frames
        return
      }
      if (frames !== seen) {
        seen = frames
        last = now
        if (stalls && ++healthy >= HEALTHY_CHECKS) {
          stalls = 0
          healthy = 0
          delete ui.errors.canvas
        }
        return
      }
      if (now - last < STALL_MS) return

      healthy = 0
      stalls++
      if (stalls >= GIVE_UP_AFTER) {
        const why = lastError ? `: ${lastError}` : ''
        ui.errors.canvas = `プレビューの描画が止まり、再開しても止まります${why}。直前の変更を元に戻してください`
      } else flash('プレビューの描画が止まったので、再開しました')
      lastError = ''
      stop()
      start()
      last = now
    }

    onMounted(() => {
      window.addEventListener('error', onError)
      window.addEventListener('unhandledrejection', onError)
      timer = window.setInterval(check, CHECK_MS)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onError)
      clearInterval(timer)
    })
    return () => null
  },
})
