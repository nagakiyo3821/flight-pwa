# public/data

| ファイル | Git | 役割 |
|---|---|---|
| `masters.default.json` | 追跡 | 同梱デフォルト（PII なし・機種 ID 空・profiles 空） |
| `masters.sample.json` | 追跡 | **初回用 masters.json サンプル**（機種3種＋全選択肢群＋氏名/ID＋Tello hiddenKeys） |
| `masters.shortcuts.sample.json` | 追跡 | 薄い差分のみ（氏名・機体 ID） |
| `masters.customize.sample.json` | 追跡 | カスタム4点の薄い例（Tello 15 キー） |
| `settings.google.sample.json` / `settings.none.sample.json` | 追跡 | 設定サンプル |
| `log.json` / `pos.json` / `tmp.json` | **除外** | 開発用シード。**初回自動取込はしない** |
| `masters.json` / `settings.json` | **除外** | 個人用。自動フォルダは `tmp.json` の `googleAuto`。古い `settings.json` は見本だけ残す |

出し入れするファイルは 4 つです。

- `log.json` / `pos.json` / `tmp.json` / `masters.json` は飛行の記録です。データ登録の自動書き出しは、この 4 つです
- GoogleDrive自動バックアップのフォルダは `tmp.json` の `googleAuto` です。フォルダを変えたときも `tmp.json` を書きます。ログインのトークンは入れません
- 旧ショートカットの `log03.json` 等も取込可（中身互換）。ファイル名の Ver 数字は使わない

## バックアップの保管先

GoogleDrive自動バックアップのフォルダは端末に覚え、同じ内容を `tmp.json` の `googleAuto` に出す。フォルダを変えたときにその `tmp.json` を自動で書く。ログインのトークンは入れない。`tmp` の取り込みでフォルダ名とフォルダ ID は戻る。書き込み許可と Google のログインは戻らない。手動フォルダは毎回指定するのでファイルには残さない。

データ登録のあと、GoogleDrive自動バックアップが動作中なら log / pos / tmp / mst をドライブへ、その時刻の新しいファイルとして送る。Local自動バックアップはない。手動は、書き出しと取り込みのたびに iPhone/iCloud、Android、パソコン、または GoogleDrive の場所を選び直す。前回の場所は使わない。名前は `log_20261014201245.json` の形。起動時と通信復帰の自動同期はしない。無いフォルダは作らない。

記録が残っていれば再起動は前回の続きです。起動時にフォルダ選択は出ません。起動時に `settings.json` は自動では読みません。

`tmp.json` は作業の進みと `googleAuto` です。データ登録の 4 ファイルに含め、自動フォルダを変えたときも書きます。

PWA初期化で `tmp` を選ぶと、作業の進みと GoogleDrive自動バックアップのフォルダを未設定に戻します。外のファイルとログインは残ります。ホーム画面のアイコン専用の保存領域は、Safari の履歴とWebサイトデータの消去では消えません。消すときはアイコンを削除して、もう一度追加します。

見本 `settings.google.sample.json` / `settings.none.sample.json` は古い接続設定の形です。いまの画面の手順はマニュアルの「7. システム設定」（`MANUAL.md` / `public/manual.html`）です。
