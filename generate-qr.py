# -*- coding: utf-8 -*-
"""Generate tunnel QR image and qr-view.html for flight-pwa (served from public/)."""
from __future__ import annotations

import argparse
import html as htmlmod
import shutil
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--dir", required=True)
    parser.add_argument("--port", type=int, default=5173)
    args = parser.parse_args()

    app = Path(args.dir)
    public = app / "public"
    public.mkdir(parents=True, exist_ok=True)
    url = args.url.strip()
    port = args.port

    qr_path = public / "tunnel-qr.png"
    html_path = public / "qr-view.html"
    note_path = app / "現在のURL.md"

    import qrcode

    img = qrcode.make(url)
    img.save(qr_path)

    safe = htmlmod.escape(url)
    stamp = int(time.time())
    html_path.write_text(
        f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Flight PWA QR</title>
<style>
body{{margin:0;font-family:Segoe UI,sans-serif;background:#f4f7f9;color:#1a2a32;
display:flex;min-height:100vh;align-items:center;justify-content:center;}}
.box{{background:#fff;border:1px solid #d5e0e6;border-radius:16px;padding:1.5rem 1.75rem;
box-shadow:0 8px 24px rgb(26 42 50 / 8%);max-width:28rem;text-align:center;}}
h1{{font-size:1.25rem;margin:0 0 .5rem}}
p{{color:#5a6d78;font-size:.95rem;line-height:1.5}}
img{{width:min(280px,80vw);height:auto;margin:1rem 0;border:8px solid #fff;
outline:1px solid #d5e0e6;border-radius:8px;background:#fff}}
a{{color:#1e5a78;word-break:break-all;font-size:.9rem}}
.ok{{display:inline-block;margin-top:.75rem;padding:.4rem .8rem;background:#e7f6ee;
color:#1f6b4a;border-radius:999px;font-size:.85rem;font-weight:600}}
</style>
</head>
<body>
<div class="box">
<h1>Flight PWA — iPhone QR</h1>
<p>Camera app → open in Safari</p>
<img src="tunnel-qr.png?t={stamp}" alt="QR"/>
<p><a href="{safe}">{safe}</a></p>
<span class="ok">Tunnel is running</span>
<p style="margin-top:1rem;font-size:.8rem">PC app: <a href="http://127.0.0.1:{port}/">http://127.0.0.1:{port}/</a></p>
</div>
</body>
</html>
""",
        encoding="utf-8",
    )

    # Optional copy next to note for Obsidian embed from app folder
    note_qr = app / "tunnel-qr.png"
    shutil.copy2(qr_path, note_qr)

    from datetime import datetime

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    day = datetime.now().strftime("%Y-%m-%d")
    note_path.write_text(
        f"""---
title: 飛行記録PWA 現在のトンネルURL
date: {day}
tags:
  - drone
  - pwa
---

# 飛行記録 PWA — いまの URL

更新: **{now}**（起動のたびに変わります）

## iPhone

カメラで QR を読む（起動時にブラウザで QR ページも開きます）

{url}

![[tunnel-qr.png]]

PC QR: [http://127.0.0.1:{port}/qr-view.html](http://127.0.0.1:{port}/qr-view.html)  
PC アプリ: [http://127.0.0.1:{port}/](http://127.0.0.1:{port}/)

## 停止

デスクトップの **Flight-PWA-Stop**、または `Flight-PWA-Stop.bat`
""",
        encoding="utf-8",
    )

    print(qr_path)
    print(html_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
