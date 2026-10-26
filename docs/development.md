# 開発

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | `dist/` に出力。どこに置いても動くよう、相対パスで読み込む |
| `npm run build:single` | `dist/index.html` の 1 ファイルにまとめる（単体で配るとき用） |
| `npm run format` | Prettier で整形（設定は `.prettierrc.json`） |
| `npm run typecheck` | 型の確認 |
| `npm test` | 単体テスト（数秒で終わる） |

URL に `?debug` を付けると、確認用に内部のモジュールが `window.__app` に出ます。

## ソースの構成

```
src/
  main.ts, App.vue, styles.css   入口
  exportCode.ts                  コードの書き出し（行とブロックの対応の印も付ける）
  model/        ブロックの木と画面の状態
    doc.ts        木の型・検索・作成・ドロップ規則・挿入と取り外し（画面には触れない）
    store.ts      画面の状態 ui・選択・追加先・編集コマンド・通知
    history.ts    取り消し/やり直し・自動保存・文書の入れ替え
    layout.ts     パネルの大きさ
    samples.ts    サンプル
  blocks/       ブロックの定義
    schema.ts     ライブラリから作るブロック定義 (REG)・カテゴリ
    enums.ts, labels.ts, icons.ts   列挙値・日本語ラベル・アイコン
    textures.ts, custom.ts          テクスチャ・スタジオ環境光（書き出しコードにも使う）
  preview/      プレビュー（TresCanvas の中）
    SceneNode.ts  ブロック → TresJS の描画、動きの実行
    GizmoLayer.ts, HighlightLayer.ts, ViewControls.ts, StatsProbe.ts
    align.ts      整列・等間隔・床に置く
    previewOnly.ts, sceneHandle.ts
  composables/  使い回す処理
    useInteraction.ts   ドラッグの追跡・window のイベント・外クリックで閉じる
    useShortcuts.ts     キーボードショートカット
  components/   画面の部品 (.vue)
```

依存は一方向です。`blocks/` は何にも依存せず、`model/` は `blocks/` を使い、`preview/`・`composables/`・`components/` は `model/` と `blocks/` を使います（逆向きの import はしません）。

## プロパティを自動で取り出す仕組み

プロパティ一覧は手書きせず、起動時にライブラリのクラスを実際に生成して取り出しています。

- three.js: インスタンスのプロパティをプロトタイプを遡って列挙し、型（数値・角度・色・ベクトル・列挙・テクスチャなど）に分類。形状の引数は `.parameters` の並び順から取得
- cientos / post-processing: Vue コンポーネントの `props`（型と既定値）から取得
- ライブラリを更新すると、新しいプロパティも自動で現れる

インスペクタには、検索、変更済みだけの絞り込み、グループの折りたたみ、1 項目ごとの戻すボタンがあります。変更したものだけを保持し、既定値と同じになれば自動で外れます。

## テスト

`tests/` に vitest の単体テストがあります。画面を使う確認は含めません。

| ファイル | 見ているもの |
| --- | --- |
| `doc.test.ts` | ブロックの置ける場所の規則、複製、移動・削除・貼り付け |
| `exportCode.test.ts` | サンプルの書き出しコード（スナップショット）、動きのコードの形 |
| `schema.test.ts` | ライブラリから作ったブロック定義の一覧と項目数（スナップショット） |

スナップショットが変わったら差分を見て、意図したものなら `npx vitest run -u` で保存し直します。
