import { onBeforeUnmount, onMounted, type Ref } from 'vue'

// 操作まわりの小さな共通処理 (ドラッグの追跡・window のイベント・メニューを閉じる)

/**
 * ポインターのドラッグを追う。離す・キャンセルされるまで move を呼び、最後に end を 1 回呼ぶ。
 * target は window か、setPointerCapture した要素。
 */
export function trackPointer(
  target: EventTarget,
  handlers: { move: (e: PointerEvent) => void; end?: () => void },
) {
  const move = (e: Event) => handlers.move(e as PointerEvent)
  const stop = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', stop)
    target.removeEventListener('pointercancel', stop)
    handlers.end?.()
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', stop)
  target.addEventListener('pointercancel', stop)
}

/** window のイベントを、マウント時に付け、アンマウント時に必ず外す */
export function useWindowListener<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
) {
  onMounted(() => window.addEventListener(type, handler, options))
  onBeforeUnmount(() => window.removeEventListener(type, handler, options))
}

/**
 * メニューやポップアップを、外側のクリックか Esc で閉じる。
 * open が false のあいだは何もしない。Esc は他の処理 (選択の解除など) に渡さない。
 */
export function useDismiss(
  open: Ref<boolean> | (() => boolean),
  root: Ref<HTMLElement | null>,
  close: () => void,
) {
  const isOpen = () => (typeof open === 'function' ? open() : open.value)
  useWindowListener(
    'pointerdown',
    (e) => {
      if (isOpen() && !root.value?.contains(e.target as Node)) close()
    },
    true,
  )
  useWindowListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !isOpen()) return
      e.preventDefault()
      e.stopPropagation()
      close()
    },
    true,
  )
}
