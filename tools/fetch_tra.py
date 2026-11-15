#!/usr/bin/env python3
"""抓臺鐵車站、路線、各線站序，存到 data/raw/（只在需要更新時手動執行）。

來源：交通部「公共運輸整合資訊流通服務平臺」PTX 舊端點（免金鑰，內容由臺鐵公司提供）。
PTX 已由 TDX（https://tdx.transportdata.tw/）取代，舊端點可能隨時關閉；
屆時請到 TDX 註冊免費會員取得金鑰，改抓 /api/basic/v3/Rail/TRA/ 底下同名的資料，
欄位格式相同，存成一樣的檔名即可，build.py 不必改。
"""
import json, os, time, urllib.request

BASE = "https://ptx.transportdata.tw/MOTC/v3/Rail/TRA/%s?$format=JSON"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw")
FILES = {"Station": "tra-station.json", "Line": "tra-line.json", "StationOfLine": "tra-station-of-line.json"}

for name, fn in FILES.items():
    req = urllib.request.Request(BASE % name, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    key = [k for k in data if isinstance(data[k], list)][0]
    with open(os.path.join(OUT, fn), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{fn}: {len(data[key])} 筆，資料時間 {data.get('UpdateTime')}")
    time.sleep(2)
