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

## settings.json

接続先だけを書く。氏名、機体の登録記号、メールアドレス、パスワード、OAuth トークンは置かない。共有する例では個人情報を一般形にする（メール `pilot@example.com`、フォルダ `flight-log`、利用者名 `example-user`、`folderId` は空）。見本 `settings.google.sample.json` の既定フォルダ名は `drone`。

同期がオンになるのは `sync.enabled: true` かつ `active: "google"`。送受信するのは log / pos / tmp / masters。`settings.json` 自体は Drive へ送らない。`onLaunch` / `onOnline` が自動の双方向同期を決める。`sync.mode` は表示用。`onEdit` は保存されるだけで、編集ごとの同期はしない。`webdav` と `s3compatible` は予約。

項目の表と取り込む例文は、マニュアルの「settings.json」と「Google ドライブを使うとき」（`MANUAL.md` / `public/manual.html`）と同じです。機能仕様は `MainVault/DroneLog/飛行記録_PWA機能仕様.md` の §4。
