---
title: 飛行記録 PWA（本番 Phase 1）
date: 2026-09-07
tags:
  - drone
  - pwa
status: wip
---

# 飛行記録 PWA（本番 Phase 1）

フォルダ: `MainVault/DroneLog/flight-pwa/`

学習用の [[pwa-demo/README|pwa-demo]] とは別。**現行ショートカット互換の JSON**（log / pos / tmp）を端末内（IndexedDB）で扱い、ファイルとして出し入れする本番向け第1弾。

アーキテクチャ対応（4 本ショートカット → 1 SPA）は [[ドローン飛行記録#PWA 構成（4 本 → 1 アプリ）]] と [[@DroneLog#PWA（flight-pwa）構成]]。

**機能の正本:** [[飛行記録_PWA機能仕様]]（初回／手動 I/O／settings／種別初期化）

## Phase 1 の範囲

| 含む | まだ含まない |
|---|---|
| メインメニュー＋FLAG 工程ロック | Excel / Sheets 側の本変更（Sheets は将来） |
| 離陸前／着陸後などの項目編集（1〜63） | クリップボード地図 URL 取込 |
| 離着陸の GPS／手動＋場所照合・マップ・登録選択 | `#データ同期`（DJI/AIRDATA） |
| 飛行時間↔離着陸日時の 3 値同期、日付・時刻ピッカー | 旧ショートカットの廃止 |
| 8.場所データ管理（一覧・現在地検索・マップ新規登録・1〜7編集） | |
| 7.登録データ管理（レコード一覧→FREE 編集） | |
| **9.システムデータ管理**（settings／JSON 入出力／Drive 同期） | **GitHub Pages 固定 URL（Phase 2c）** |
| Google Drive pull/push（端末優先マージ・要 OAuth） | |
| 種別ごとの端末初期化（確認付き） | サーバー空上書き |
| セット／リセットタイマー（T・2h／24h） | |
| PWA（オフラインキャッシュ） | |

旧 iOS ショートカットは **並行利用**のまま。

## 起動（いちばん簡単）

デスクトップに次を置いてあります（見本の `PWA-Demo-*` と同じ型）。

| ショートカット | 動作 |
|---|---|
| **Flight-PWA-Start** | Vite（`:5173`）＋ HTTPS トンネル → QR をブラウザ表示 |
| **Flight-PWA-Stop** | Vite とトンネルを停止 |

実体: `Flight-PWA-Start.bat` / `Flight-PWA-Stop.bat`（中で `start-iphone.ps1` / `stop-iphone.ps1`）。

必要: Node.js（npm）、Python + `qrcode[pil]`、cloudflared（見本と同じパス）。  
トンネル経由時は Vite の `server.allowedHosts` に `.trycloudflare.com` を許可済み。

### メニュー上の注意

| 項目 | 内容 |
|---|---|
| タイトル SR／SS／**T** | T＝直近 **データセット** 日時からの経過秒。セットでほぼ 0 |
| **2 時間**経過 | メニュー表示時に気象の再セットを要求 |
| **24 時間**経過 | リセット＋セットを要求 |
| **9.データ入出力** | log / pos / tmp / masters / settings の出入・種別初期化 |
| **10.終了(手動でタブを閉じる)** | 案内のみ（ロック色）。ブラウザ／PWA を脚本では閉じられない |
| 通信 | 常時オンライン表示は無し。気象・住所・標高の失敗時だけメッセージ |

### PC だけで開発

```powershell
cd "c:\Users\owner\iCloudDrive\iCloud~md~obsidian\Vault\MainVault\DroneLog\flight-pwa"
npm run dev
```

`http://127.0.0.1:5173/` を開く。

## データファイルの置き場

本番の正本（ショートカット／Excel と同じ）:

`C:\Users\owner\iCloudDrive\drone\` … `log.json` / `pos.json` / `tmp.json`（旧 `log03.json` 等も手動取込可）

PWA 開発用コピー（任意。手動取込用。場所は空から開始）:

`flight-pwa/public/data/` … 上記と同じ3ファイル（自動取込はしない）

Vault 資料用: `MainVault/DroneLog/` にも同名ファイルを同期済み。

## 初回の使い方

1. **7.登録データ管理** → レコードを選んで編集（一覧は最新順・NEW 系先頭）
2. メニューで「離陸前チェック」などを入力
3. 「離陸登録」「着陸登録」で位置・場所を確定
4. 「データ登録」で本登録
5. **9.データ入出力** から log / pos / tmp をダウンロード → iCloud Drive の `drone/` へ置けば従来の Excel クエリ経路に載せられる

### NEW キーの動き（登録データ管理）

| 操作 | キー |
|---|---|
| リセット直後 | `NEW`（全項目空）。既存 NEW 系は削除して置き換え。`tmp.TIME` は空 |
| セット直後 | 作業中の `NEW`／`NEW`＋日時はキーそのまま更新。無ければ `NEW` 追加。**`tmp.TIME`＝セット実行時刻**（セットではプレーン `NEW` を日時付きにしない） |
| 離陸日時を入れる | `NEW` → `NEW`＋その日時（旧削除） |
| 離陸日時を変える | `NEW`＋旧日時 → `NEW`＋新日時（旧削除） |
| 離陸日時を消す | `NEW`＋日時 → `NEW`（旧削除） |
| 本登録キーの離陸日時変更 | 旧キー残し、新 `A_DATE` キーを追加（同日時があれば置換） |
| 本登録 | キー＝`A_DATE`。作業側に空寄りの `NEW` |

### tmp.TIME（T タイマー）

| ルール | 内容 |
|---|---|
| 意味 | **データセット実行時刻**（離陸日時 `A_DATE` やレコードキーではない） |
| T 表示 | `TIME` からの経過秒。セットでほぼ 0 |
| 維持 | レコード切替・項目保存・本登録後も **上書きしない** |
| 更新 | `#データセット` 成功時に現在時刻／リセット時に空 |
| 期限 | 2h 超→再セット要求、24h 超→リセット＋セット要求（メニュー）。**TIME 無しでは催促しない** |

### レコード一覧の並び

最新順。`NEW` 系を先頭（プレーン `NEW` → `NEW`＋日時の新しい順）、その後は本登録キーの新しい順。

## 技術構成

| レイヤ | 内容 |
|---|---|
| UI フロー | `src/main.ts`（view: menu / newa / newb / records / places …） |
| 永続化 | Dexie（`flights` / `places` / `meta` ※meta に masters） |
| 項目・マスタ | `fields.ts`（optionsKey）/ `catalog.ts` / `public/data/masters.default.json` |
| FLAG | `flag.ts` |
| 住所・標高 | `geo.ts`（HeartRails / Nominatim / 国土地理院） |
| 飛行時間同期 | `flight-time.ts` |
| 気象セット | `weather.ts`（Open-Meteo） |
| セット／リセット期限 | `session-timers.ts`（2h／24h） |
| ビルド | Vite + TypeScript + vite-plugin-pwa |
| アプリ Ver | `package.json` / `src/version.ts`（現状 **0.x.x**。正式スタート時 **1.0.0**。履歴は Git） |

個人の氏名・機体 ID・機種別項目取捨は `public/data/masters.json`（gitignore）または **9.データ入出力** で管理。  
初回用の完成サンプル: `public/data/masters.sample.json`（機種 Mavic2Pro/Tello/Other＋選択肢群＋Tello hiddenKeys）。項目差の正本は [[飛行記録_PWA選択肢マトリクス#6. Mavic2Pro と Tello の項目差（ショートカット実運用）]]。
JSON 種と例: [[飛行記録_PWAデータJSON]]

仕様の正本: [[飛行記録_仕様書]] ／ 実装解説: [[飛行記録_詳細説明書]] ／ 移行トピック: [[ドローン飛行記録]] ／ **構造説明: [[飛行記録_PWA構造説明]]**
---
