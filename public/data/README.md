# public/data

| ファイル | Git | 役割 |
|---|---|---|
| `masters.default.json` | 追跡 | 同梱デフォルト（PII なし・機種 ID 空・profiles 空） |
| `masters.sample.json` | 追跡 | **初回用 masters.json サンプル**（機種3種＋全選択肢群＋氏名/ID＋Tello hiddenKeys） |
| `masters.shortcuts.sample.json` | 追跡 | 薄い差分のみ（氏名・機体 ID） |
| `masters.customize.sample.json` | 追跡 | カスタム4点の薄い例（Tello 15 キー） |
| `settings.google.sample.json` / `settings.none.sample.json` | 追跡 | 設定サンプル |
| `log.json` / `pos.json` / `tmp.json` | **除外** | 開発用シード。**初回自動取込はしない** |
| `masters.json` / `settings.json` | **除外** | 個人用オーバーレイ。`settings.json` ではバックアップをオンにしない |

出し入れするファイル名:

- `log.json` / `pos.json` / `tmp.json` / `masters.json`
- 旧ショートカットの `log03.json` 等も取込可（中身互換）。ファイル名の Ver 数字は使わない
- 手動エクスポートに `settings.json` は出さない。Google へも送らない

## バックアップの保管先

Local のフォルダと Google のフォルダ（自動用と手動用）は、システム設定で端末に覚える。`settings.json` の `folderName` では開かない。データ登録のあと、Local自動バックアップがオンなら4ファイルをローカルフォルダへ書き、Google自動バックアップがオン（ログイン済みで自動用フォルダあり）なら同じ4ファイルをドライブへ送る。起動時と通信復帰の自動同期はしない。無いフォルダは作らない。

見本 `settings.google.sample.json` / `settings.none.sample.json` は古い接続設定の形です。いまの画面の手順はマニュアルの「7. システム設定」（`MANUAL.md` / `public/manual.html`）です。
