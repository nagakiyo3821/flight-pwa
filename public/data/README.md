# public/data

| ファイル | Git | 役割 |
|---|---|---|
| `masters.default.json` | 追跡 | 同梱デフォルト（PII なし・機種 ID 空・profiles 空） |
| `masters.sample.json` | 追跡 | **初回用 masters.json サンプル**（機種3種＋全選択肢群＋氏名/ID＋Tello hiddenKeys） |
| `masters.shortcuts.sample.json` | 追跡 | 薄い差分のみ（氏名・機体 ID） |
| `masters.customize.sample.json` | 追跡 | カスタム4点の薄い例（Tello 15 キー） |
| `settings.google.sample.json` / `settings.none.sample.json` | 追跡 | 設定サンプル |
| `log.json` / `pos.json` / `tmp.json` | **除外** | 開発用シード。**初回自動取込はしない**（手動／サーバー） |
| `masters.json` / `settings.json` | **除外** | 個人用オーバーレイ |

既定の手動／同期ファイル名:

- `log.json` / `pos.json` / `tmp.json` / `masters.json` / `settings.json`
- 旧ショートカットの `log03.json` 等も取込可（中身互換）。ファイル名の Ver 数字は使わない
