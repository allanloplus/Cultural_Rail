# 搭火車逛文資

以鐵道路線為主軸，呈現每個車站步行可達的文化資產，是「Allan Lo 和你逛文化」的第四個姊妹站。

- 網址：https://cultural-rail.123hi.org/
- 規劃設計：Allan Lo，https://www.123hi.org，2026年11月

| 網站 | 內容 | Repo |
|---|---|---|
| https://cultural.123hi.org/ | 文資知識網站第一站（13 縣市＋共用程式） | allanloplus/Cultural_Heritage |
| https://cultural2.123hi.org/ | 文資知識網站第二站（9 縣市） | allanloplus/Cultural_Heritage2 |
| https://cultural-visit.123hi.org/ | 文資達人訪查 | allanloplus/Cultural_Heritage_Master |
| https://cultural-atlas.123hi.org/ | 文資地圖集 | allanloplus/Cultural_Atlas |
| https://cultural-rail.123hi.org/ | 搭火車逛文資（本 repo） | allanloplus/Cultural_Rail |

## 目前的進度

臺鐵 16 條路線（幹線 9 條、支線 7 條，共 242 站）與排行榜都已開放。高鐵、捷運、阿里山林業鐵路尚未製作。

## 內容

- **路線總覽**（`#/`）：每條線一張卡，卡上的迷你路線圖一站一點，點的大小代表步行 15 分鐘內的文資數。
- **路線頁**（`#/line/coast`）：開頭是從資料算出的幾則事實（按一下會在路線圖上標出相關車站）；主畫面是蛇行的示意路線圖，不是地圖。可依步行 5／10／15 分鐘、等級、時代篩選；沒有文資的車站收合成「經過 N 站」，點一下展開。
- **車站頁**（`#/line/coast/2220`）：站名牌、方位示意圖、依距離排序的文資卡片。卡片連回知識網站的 `<縣市網址>/#map/<景點 id>`，並提供 Google 地圖步行導航連結。車站本身是文資時特別標示。
- **排行榜**（`#/rank`）：下車 5 分鐘內文資最多的車站、15 分鐘內最多的車站、一站跨最多時代、最短的路看國定古蹟、走路就到的最老文資、車站本身就是文資的全名單。
- **我的行程**（`#/trip/coast/15/2110.2220.3360`）：在路線圖上按車站的 ＋ 勾選，產生行程摘要。行程只存在瀏覽器（localStorage）與網址裡。

## 架構

純靜態網站，沒有後台與資料庫，也沒有使用地圖引擎或其他外部函式庫（字型與知識網站相同，取自 Google Fonts）。所有計算在建置時用 Python 完成。

```
index.html               唯一的頁面
assets/css/rail.css      樣式（配色、深色模式沿用知識網站 site.css 的變數）
assets/js/rail.js        路由與畫面
data/raw/                抓一次就存檔的臺鐵原始資料
data/index.json          路線清單與全站統計
data/lines/<路線>.json   各線的車站、步行範圍內的文資、開頭的事實
data/rank.json           排行榜
tools/fetch_tra.py       抓臺鐵車站、路線、站序 → data/raw/
tools/build.py           產生 data/index.json、data/lines/、data/rank.json
```

### 更新資料

知識網站或文資地圖集的資料有變動後，重新建置並提交（只用 Python 標準函式庫）：

```bash
python3 tools/build.py
```

腳本會找本 repo 旁邊的 `Cultural_Atlas`、`Cultural_Heritage`、`Cultural_Heritage2` 三個資料夾（或用環境變數 `ATLAS_DIR`、`CH1_DIR`、`CH2_DIR` 指定），只讀取、不修改。文資主檔直接用文資地圖集的 `data/sites.json`，所以要先在 Cultural_Atlas 執行 `python3 tools/build_sites.py`；時代由創建年重算、同址錯開等整理規則都沿用那邊的結果。

臺鐵有新站或改站名時才需要重抓車站：

```bash
python3 tools/fetch_tra.py
```

### 建置時的規則

- **步行距離是推估**：車站與文資的直線距離 × 1.3，步行速度每分鐘 80 公尺，收錄到 15 分鐘（推估 1,200 公尺）為止。三個數字是 `build.py` 開頭的常數。頁面上都標示「推估」。
- **路線分段**：來源只分西部幹線、東部幹線、南迴線與各支線；縱貫線北段、山線、海線、縱貫線南段、屏東線、南迴線、臺東線、北迴線、宜蘭線是在 `LINES` 依站序切開的（切點：竹南、彰化、高雄、枋寮、花蓮、蘇澳新）。端點站會同時出現在相鄰兩條線。來源中重複的「臺北-環島」已剔除。
- **車站本身是文資**：文資名稱含站名與「車站／火車站／驛」、推估距離 300 公尺內，且不是倉庫、宿舍、給水塔等附屬設施。判定有誤時用 `STATION_FORCE`、`STATION_EXCLUDE` 修正；建置時會印出「車站即文資」名單，資料更新後請看一眼。名單包含已不作車站使用的舊站房（例如高雄、關山、三塊厝）。
- **照片**：優先用知識網站已有的本機 webp（路線圖用小圖、卡片用大圖），沒有本機檔的才連 Wikimedia Commons。沒有照片或載入失敗時顯示票卡樣式。
- **每條線的引言**：`LINES` 裡的 `intro` 是手寫的，其中引用的數字（例如臺北站 92 處、宜蘭站 5 分鐘內 13 處）在資料大幅變動後要對照建置結果修改。
- **開頭的事實**：由 `facts()` 依資料產生（車站即文資、文資最多的一站、最短的路看國定古蹟、最老的一處、跨越的時代、下車 5 分鐘就有），資料更新後會自動重算。

### 加入其他鐵道系統

高鐵、捷運、阿里山林業鐵路目前沒有做。要加時：把車站與站序整理成與 `data/raw/tra-*.json` 相同的格式，在 `build.py` 讀進來，並在 `LINES` 加一筆；網頁程式不必改。

## 本機預覽

```bash
python3 -m http.server 8000
```

開啟 http://localhost:8000/ 。字型與照片需要連網。

## 部署

GitHub Pages：Settings → Pages → Deploy from a branch，選 `main` 與 `/ (root)`。自訂網域寫在 `CNAME`（`cultural-rail.123hi.org`），DNS 需要一筆 CNAME 記錄指向 `allanloplus.github.io`。開發在工作分支進行，合併到 `main` 才上線。

## 資料來源與授權

- 臺鐵車站、路線、站序：交通部公共運輸整合資訊流通服務平臺（PTX）`https://ptx.transportdata.tw/MOTC/v3/Rail/TRA/` 的 Station、Line、StationOfLine，由國營臺灣鐵路股份有限公司提供，2026-11-15 抓取（資料時間 2026-11-15）。此開放資料依政府資料開放授權條款（Open Government Data License）進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。政府資料開放授權條款：https://data.gov.tw/license
  - 授權依據：政府資料開放平臺上臺鐵公司的「臺鐵車站基本資料集」（資料集 33425）標示為政府資料開放授權條款第 1 版。PTX／TDX 平臺本身的授權頁尚未逐字核對，上線前請確認。
  - PTX 已由 TDX（https://tdx.transportdata.tw/）取代，舊端點可能關閉。屆時到 TDX 註冊免費會員取得金鑰，改抓同名資料存成相同檔名即可；或在臺灣的網路下抓臺鐵 ODS（`ods.railway.gov.tw`，境外連不上）。
- 文化資產清單、座標、年代：文化部文化資產局國家文化資產網，經兩個知識網站與文資地圖集整理。
- 照片：Wikimedia Commons，各張的作者與授權條款標示在卡片照片下方，資料取自知識網站各縣市的 `images.json`。
- 步行導航：連到 Google 地圖，本站不呼叫任何路線服務。

---

Copyright © 2026 Allan Lo. 文字內容與程式碼版權所有；第三方資料依各自授權。
