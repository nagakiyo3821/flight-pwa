# public/data

| ファイル | Git | 役割 |
|---|---|---|
| `masters.default.json` | 追跡 | 同梱デフォルト（PII なし・機種 ID 空・profiles 空） |
| `masters.sample.json` | 追跡 | **初回用 masters.json サンプル**（機種3種＋全選択肢群＋氏名/ID＋Tello hiddenKeys） |
| `masters.shortcuts.sample.json` | 追跡 | 薄い差分のみ（氏名・機体 ID） |
| `masters.customize.sample.json` | 追跡 | カスタム4点の薄い例（Tello 15 キー） |
| `settings.google.sample.json` / `settings.none.sample.json` | 追跡 | 設定サンプル |
| `log.json` / `pos.json` / `tmp.json` | **除外** | 開発用シード。**初回自動取込はしない** |
| `masters.json` / `settings.json` | **除外** | 個人用。`settings.json` は端末の管理データ（フォルダ名、Google のフォルダ ID、Local の動作／停止） |

出し入れするファイルは 5 つです。

- `log.json` / `pos.json` / `tmp.json` / `masters.json` は飛行の記録です。データ登録の自動書き出しは、この 4 つです
- `settings.json` は端末のフォルダ記憶です。手動入出力と PWA初期化で選べ、初期状態はオフです。データ登録では書きません。中身と読み書きのタイミングはマニュアルの「2. 準備するデータ」です
- 旧ショートカットの `log03.json` 等も取込可（中身互換）。ファイル名の Ver 数字は使わない

## バックアップの保管先

Local のフォルダと Google のフォルダ（自動用と手動用）は、システム設定で端末に覚える。同じ内容を `settings.json` にし、設定が変わったときに自動バックアップする。ログインのトークンは入れない。取り込みでフォルダ名とフォルダ ID と Local の動作／停止は戻る。書き込み許可と Google のログインは戻らない。

データ登録のあと、Google自動バックアップが動作中なら log / pos / tmp / mst をドライブへ、その時刻の新しいファイルとして送る。Local自動バックアップはない。手動は、その場で選んだ iPhone/iCloud、Android、パソコン、または GoogleDrive のフォルダへ出す。名前は `log_20261014201245.json` の形。起動時と通信復帰の自動同期はしない。無いフォルダは作らない。

記録が残っていれば再起動は前回の続きです。起動時にフォルダ選択は出ません。起動時に `settings.json` は自動では読みません。

`tmp.json` は作業の進みで、データ登録の 4 ファイルに含めます。`settings.json` はフォルダを変えたときに書く端末の管理データです。更新のタイミングが違うので、1つのファイルにはまとめません。

PWA初期化では `settings.json` も選べます。選ぶと端末内のフォルダ名、Google のフォルダ ID、Local の動作／停止を未設定に戻します。外のファイルとログインは残ります。初期のフォルダ選択に戻すときは `log.json` と `pos.json` も一緒に初期化します。ホーム画面のアイコン専用の保存領域は、Safari の履歴とWebサイトデータの消去では消えません。消すときはアイコンを削除して、もう一度追加します。

見本 `settings.google.sample.json` / `settings.none.sample.json` は古い接続設定の形です。いまの画面の手順はマニュアルの「7. システム設定」（`MANUAL.md` / `public/manual.html`）です。
