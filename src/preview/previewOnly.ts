import { defineComponent, h, nextTick, ref, watch } from 'vue'
import * as THREE from 'three'
import { SoftShadows } from '@tresjs/cientos'

// プレビュー専用 (書き出しコードには含めない)

/** 誰も書き換える前 (モジュール読み込み時) のシェーダー */
const PRISTINE_SHADOW_CHUNK = THREE.ShaderChunk.shadowmap_pars_fragment

/**
 * プレビュー専用の SoftShadows。cientos 版は three のシェーダーを直接書き換えて、
 * アンマウント時に元へ戻す。作り直す際に「新しい側の初期化 → 古い側の後片付け」の順になり、
 * 二重に注入されてコンパイルに失敗する。値が変わったら、いったん外して後片付けを終えてから付け直す。
 */
export const SafeSoftShadows = defineComponent({
  name: 'SafeSoftShadows',
  inheritAttrs: false,
  props: { sig: { type: String, default: '' } },
  setup(props, { attrs }) {
    const on = ref(true)
    let token = 0
    watch(
      () => props.sig,
      async () => {
        const mine = ++token
        on.value = false
        await nextTick()
        await new Promise((r) => setTimeout(r, 0))
        if (mine !== token) return // 連続変更時は、最後の 1 回だけ付け直す
        // 内側のコンポーネントが「元のシェーダー」として控えるのは、マウント時点の値。必ず素の状態に戻してから付け直す
        THREE.ShaderChunk.shadowmap_pars_fragment = PRISTINE_SHADOW_CHUNK
        on.value = true
      },
    )
    return () => (on.value ? h(SoftShadows as any, attrs) : null)
  },
})
