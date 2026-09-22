# -*- coding: utf-8 -*-
"""Write stopped-state note for flight-pwa (UTF-8 path safe)."""
from datetime import datetime
from pathlib import Path

app = Path(__file__).resolve().parent
now = datetime.now().strftime("%Y-%m-%d %H:%M")
day = datetime.now().strftime("%Y-%m-%d")
note = app / "現在のURL.md"
note.write_text(
    f"""---
title: 飛行記録PWA 現在のトンネルURL
date: {day}
tags:
  - drone
  - pwa
---

# 飛行記録 PWA — いまの URL

**停止中**（{now}）

再開するときはデスクトップの **Flight-PWA-Start** を実行し、ブラウザに出る新しい QR を使ってください。
""",
    encoding="utf-8",
)
print(note)
