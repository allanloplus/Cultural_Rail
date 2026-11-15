#!/usr/bin/env python3
"""產生 data/index.json 與 data/lines/<路線>.json。

讀取（只讀、不修改）：
  data/raw/tra-*.json                      臺鐵車站、路線、站序（tools/fetch_tra.py 抓的）
  ../Cultural_Atlas/data/sites.json        全臺有形文資主檔（時代已由創建年重算、同址已錯開）
  ../Cultural_Heritage、../Cultural_Heritage2 各縣市 data/ 的 images.json、sites-official.json、sites-content.json
可用環境變數 ATLAS_DIR、CH1_DIR、CH2_DIR 指定資料夾位置。

步行距離是推估：直線距離 × WALK_K，步行速度每分鐘 WALK_V 公尺。
"""
import collections, datetime, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
UP = os.path.dirname(ROOT)
ATLAS = os.environ.get("ATLAS_DIR", os.path.join(UP, "Cultural_Atlas"))
CH1 = os.environ.get("CH1_DIR", os.path.join(UP, "Cultural_Heritage"))
CH2 = os.environ.get("CH2_DIR", os.path.join(UP, "Cultural_Heritage2"))

WALK_K = 1.3      # 直線距離換算步行距離的係數
WALK_V = 80       # 步行速度（公尺／分）
WALK_MAX = 15     # 收錄到步行幾分鐘
WALKS = [5, 10, 15]

# 路線定義。seg：(PTX 路線代碼, 起站, 迄站)，依序相接；on：頁面是否已開放。
# 高鐵、捷運、林鐵日後要加：在 data/raw/ 放同格式的車站與站序檔，於此加一筆並指定來源即可。
LINES = [
    dict(id="north", name="縱貫線北段", kind="幹線", color="#b5483c", seg=[("WL", "基隆", "竹南")]),
    dict(id="mountain", name="山線", kind="幹線", color="#4f7f3a", seg=[("WL", "竹南", "彰化")]),
    dict(id="coast", name="海線", kind="幹線", color="#1f7a8c", seg=[("WL-C", "竹南", "彰化")], on=True,
         intro="1922 年全線通車的海岸線，為了避開山線的陡坡而建。一百多年過去，沿線還有好幾座當年的木造車站站在原地，照樣賣票、照樣有人等車。"),
    dict(id="south", name="縱貫線南段", kind="幹線", color="#c47a1e", seg=[("WL", "彰化", "高雄")]),
    dict(id="pingtung", name="屏東線", kind="幹線", color="#8a5aa8", seg=[("WL", "高雄", "屏東"), ("SL", "屏東", "枋寮")]),
    dict(id="southlink", name="南迴線", kind="幹線", color="#2b6cb0", seg=[("SL", "枋寮", "臺東")]),
    dict(id="taitung", name="臺東線", kind="幹線", color="#3d8f6f", seg=[("EL", "花蓮", "臺東")]),
    dict(id="northlink", name="北迴線", kind="幹線", color="#5b6b7a", seg=[("EL", "蘇澳新", "花蓮")]),
    dict(id="yilan", name="宜蘭線", kind="幹線", color="#c2567a", seg=[("EL", "八堵", "蘇澳新"), ("SU", "蘇澳新", "蘇澳")]),
    dict(id="pingxi", name="平溪線", kind="支線", color="#a8714a", seg=[("PX", "三貂嶺", "菁桐")]),
    dict(id="shenao", name="深澳線", kind="支線", color="#3b7bbf", seg=[("SA", "瑞芳", "八斗子")]),
    dict(id="neiwan", name="內灣線", kind="支線", color="#7a8f2a", seg=[("NW", "北新竹", "內灣")]),
    dict(id="liujia", name="六家線", kind="支線", color="#8c6bb1", seg=[("LJ", "竹中", "六家")]),
    dict(id="jiji", name="集集線", kind="支線", color="#2f7d6d", seg=[("JJ", "二水", "車埕")]),
    dict(id="shalun", name="沙崙線", kind="支線", color="#d08a2e", seg=[("SH", "中洲", "沙崙")]),
    dict(id="chengzhui", name="成追線", kind="支線", color="#6c6058", seg=[("CZ", "成功", "追分")]),
]

# 「車站本身是文資」的判定：名稱含站名與「車站／火車站／驛」，且不是下列附屬設施；另可用清單強制加入或排除。
STATION_WORD = re.compile("車站|火車站|驛")
NOT_STATION = re.compile("鐵道宿舍|倉庫|派出所|給水塔|防空|車庫|站長|員工宿舍|周圍|醫院|糧倉|舊檔案|辦公")
STATION_FORCE = {}          # {"站代碼": "文資 id"}
STATION_EXCLUDE = set()     # {"文資 id"}


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def hav(a, b, c, d):
    p = math.radians
    x = math.sin(p(c - a) / 2) ** 2 + math.cos(p(a)) * math.cos(p(c)) * math.sin(p(d - b) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(x))


def bearing(a, b, c, d):
    p = math.radians
    y = math.sin(p(d - b)) * math.cos(p(c))
    x = math.cos(p(a)) * math.sin(p(c)) - math.sin(p(a)) * math.cos(p(c)) * math.cos(p(d - b))
    return round((math.degrees(math.atan2(y, x)) + 360) % 360)


def fmt_year(y):
    return f"西元前 {-y} 年" if y < 0 else f"{y} 年"


def join(names):
    return "、".join(names)


# ---------- 讀資料 ----------
atlas = load(os.path.join(ATLAS, "data", "sites.json"))
F = atlas["meta"]["fields"]
COUNTIES, ERAS, CATS = atlas["counties"], atlas["eras"], atlas["cats"]
sites = [dict(zip(F, r)) for r in atlas["sites"]]

extra = {}
for ci, c in enumerate(COUNTIES):
    repo = CH2 if "cultural2." in c["base"] else CH1
    d = os.path.join(repo, c["slug"], "data")
    for k, v in load(os.path.join(d, "images.json")).items():
        if v:
            extra.setdefault((ci, k), {})["img"] = v[0]
    for o in load(os.path.join(d, "sites-official.json")):
        extra.setdefault((ci, o["id"]), {})["types"] = o.get("types") or []
    for o in load(os.path.join(d, "sites-content.json")):
        extra.setdefault((ci, o["id"]), {})["visit"] = o.get("visitMin")

ST = {s["StationID"]: s for s in load(os.path.join(ROOT, "data", "raw", "tra-station.json"))["Stations"]}
SOL = {x["LineID"]: x["Stations"] for x in load(os.path.join(ROOT, "data", "raw", "tra-station-of-line.json"))["StationOfLines"]}
SRC_TIME = load(os.path.join(ROOT, "data", "raw", "tra-station.json")).get("UpdateTime", "")[:10]


def photo(ci, im):
    base = COUNTIES[ci]["base"]
    p = {"a": im.get("artist") or "", "li": im.get("license") or "", "lu": im.get("licenseUrl") or "", "pg": im.get("page") or ""}
    if im.get("local"):
        p["l"] = base + im["local"]
        p["s"] = base + (im.get("small") or im["local"])
    else:
        p["l"] = p["s"] = im["thumb"]
    return p


# ---------- 每站步行範圍內的文資 ----------
def station_sites(sid):
    s = ST[sid]
    la, lo = s["StationPosition"]["PositionLat"], s["StationPosition"]["PositionLon"]
    name = s["StationName"]["Zh_tw"]
    out = []
    for x in sites:
        if abs(x["lat"] - la) > 0.012:
            continue
        d = hav(la, lo, x["lat"], x["lng"]) * WALK_K
        if d > WALK_MAX * WALK_V:
            continue
        ex = extra.get((x["county"], x["id"]), {})
        o = {"i": x["id"], "c": x["county"], "n": x["name"], "k": x["cat"], "y": x["year"], "e": x["estimated"],
             "yt": x["yearText"], "r": x["era"], "s": x["summary"], "d": int(round(d)), "m": max(1, math.ceil(d / WALK_V)),
             "b": bearing(la, lo, x["lat"], x["lng"]), "v": ex.get("visit") or 20, "la": x["lat"], "lo": x["lng"]}
        if ex.get("img"):
            o["p"] = photo(x["county"], ex["img"])
        is_st = (STATION_WORD.search(x["name"]) and name in x["name"] and not NOT_STATION.search(x["name"]) and d <= 300)
        if STATION_FORCE.get(sid) == x["id"]:
            is_st = True
        if x["id"] in STATION_EXCLUDE:
            is_st = False
        if is_st:
            o["st"] = 1
        out.append(o)
    out.sort(key=lambda o: o["d"])
    return out


CACHE = {}


def station(sid):
    if sid not in CACHE:
        s = ST[sid]
        CACHE[sid] = {"id": sid, "name": s["StationName"]["Zh_tw"], "en": s["StationName"]["En"],
                      "lat": s["StationPosition"]["PositionLat"], "lng": s["StationPosition"]["PositionLon"],
                      "sites": station_sites(sid)}
    return CACHE[sid]


def line_stations(L):
    ids, km, base = [], [], 0.0
    for code, a, b in L["seg"]:
        rows = SOL[code]
        names = [r["StationName"]["Zh_tw"] for r in rows]
        i, j = names.index(a), names.index(b)
        k0 = rows[i]["CumulativeDistance"]
        for r in rows[i:j + 1]:
            if r["StationName"]["Zh_tw"].endswith("-環島") or (ids and ids[-1] == r["StationID"]):
                continue
            ids.append(r["StationID"])
            km.append(round(base + r["CumulativeDistance"] - k0, 1))
        base = km[-1]
    return ids, km


# ---------- 路線開頭的「意外事實」 ----------
def facts(L, sts):
    out = []
    uniq = {}
    for s in sts:
        for o in s["sites"]:
            uniq.setdefault((o["c"], o["i"]), (o, s))
    total = len(uniq)
    if not total:
        return out
    with_sites = [s for s in sts if s["sites"]]

    # 1. 車站本身是文資
    hs = [(s, o) for s in sts for o in s["sites"] if o.get("st")]
    seen, hs2 = set(), []
    for s, o in hs:
        if s["id"] not in seen:
            seen.add(s["id"]); hs2.append((s, o))
    if hs2:
        by_year = collections.Counter(o["y"] for _, o in hs2)
        y, n = by_year.most_common(1)[0]
        names = [s["name"] for s, o in hs2 if o["y"] == y]
        if n >= 3:
            rest = [s["name"] for s, o in hs2 if o["y"] != y]
            t = f"{join(names)}，{n} 座車站都在 {y} 年落成，本身就是文資，至今仍在營運。"
            if rest:
                t += f"再加上{join(rest)}，全線共 {len(hs2)} 座。"
            out.append({"k": "車站就是文資", "big": str(n), "unit": f"座 {y} 年的車站", "t": t, "st": [s["id"] for s, _ in hs2]})
        else:
            t = f"{join([s['name'] for s, _ in hs2])}，站房本身就登錄為文資，不用出站就開始逛。"
            out.append({"k": "車站就是文資", "big": str(len(hs2)), "unit": "座車站", "t": t, "st": [s["id"] for s, _ in hs2]})

    # 2. 文資最多的一站
    top = max(sts, key=lambda s: len(s["sites"]))
    n = len(top["sites"])
    if n >= 3:
        n5 = sum(1 for o in top["sites"] if o["m"] <= 5)
        t = f"{top['name']}站步行 {WALK_MAX} 分鐘內有 {n} 處文資，全線 {total} 處裡它一站就佔了 {round(n / total * 100)}%"
        t += f"；其中 {n5} 處出站 5 分鐘就到。" if n5 else "。"
        out.append({"k": "文資最多的一站", "big": str(n), "unit": f"處・{top['name']}", "t": t, "st": [top["id"]]})

    # 3. 最短的路看到國定古蹟
    nat = [(o, s) for s in sts for o in s["sites"] if o["k"] == 0]
    if nat:
        o, s = min(nat, key=lambda x: x[0]["d"])
        nn = len({(o["c"], o["i"]) for o, _ in nat})
        t = f"全線 {nn} 處國定古蹟，最近的是{s['name']}站到「{o['n']}」，推估 {o['d']} 公尺、走 {o['m']} 分鐘。"
        out.append({"k": "最短的路看國定古蹟", "big": str(o["m"]), "unit": f"分鐘・{s['name']}", "t": t, "st": [s["id"]]})

    # 4. 最老的一處
    dated = [(o, s) for o, s in uniq.values() if o["y"] is not None]
    if dated:
        o, s = min(dated, key=lambda x: x[0]["y"])
        best = min(((o2, s2) for s2 in sts for o2 in s2["sites"] if o2["i"] == o["i"] and o2["c"] == o["c"]), key=lambda x: x[0]["d"])
        o, s = best
        t = f"「{o['n']}」，{fmt_year(o['y'])}{'（推估）' if o['e'] else ''}。從{s['name']}站走 {o['m']} 分鐘。"
        out.append({"k": "最老的一處", "big": str(abs(o["y"])), "unit": ("年前・西元前" if o["y"] < 0 else "年・" + ERAS[o["r"]]["name"]), "t": t, "st": [s["id"]]})

        # 5. 跨越幾個時代
        eras = sorted({o["r"] for o, _ in uniq.values()})
        ec = collections.Counter(o["r"] for o, _ in uniq.values())
        main, mn = ec.most_common(1)[0]
        if len(eras) >= 2:
            newest = max(dated, key=lambda x: x[0]["y"])[0]
            t = (f"從{ERAS[eras[0]]['name']}到{ERAS[eras[-1]]['name']}，最老與最新的相差 {newest['y'] - o['y']} 年。"
                 f"其中{ERAS[main]['name']}時期就有 {mn} 處，佔 {round(mn / total * 100)}%。")
            out.append({"k": "一條線跨越的時代", "big": str(len(eras)), "unit": "個時代", "t": t, "st": []})

    # 6. 下車 5 分鐘
    five = [s for s in sts if any(o["m"] <= 5 for o in s["sites"])]
    if five and len(sts) >= 5:
        t = f"全線 {len(sts)} 站，有 {len(with_sites)} 站走 {WALK_MAX} 分鐘內看得到文資；其中 {len(five)} 站出站 5 分鐘內就有。"
        out.append({"k": "下車 5 分鐘就有", "big": str(len(five)), "unit": f"站／共 {len(sts)} 站", "t": t, "st": [s["id"] for s in five]})
    return out


# ---------- 輸出 ----------
os.makedirs(os.path.join(ROOT, "data", "lines"), exist_ok=True)
today = datetime.date.today().isoformat()
index_lines, all_ids, reach = [], set(), set()
for L in LINES:
    ids, km = line_stations(L)
    sts = []
    for sid, k in zip(ids, km):
        s = dict(station(sid)); s["km"] = k
        h = [o for o in s["sites"] if o.get("st")]
        if h:
            s["h"] = h[0]["i"]
        sts.append(s)
    all_ids.update(ids)
    uniq = {(o["c"], o["i"]): o for s in sts for o in s["sites"]}
    reach.update(uniq)
    fx = facts(L, sts)
    doc = {"id": L["id"], "name": L["name"], "kind": L["kind"], "color": L["color"], "intro": L.get("intro", ""),
           "from": sts[0]["name"], "to": sts[-1]["name"], "km": km[-1], "facts": fx, "stations": sts}
    with open(os.path.join(ROOT, "data", "lines", L["id"] + ".json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    index_lines.append({"id": L["id"], "name": L["name"], "kind": L["kind"], "color": L["color"], "on": bool(L.get("on")),
                        "from": sts[0]["name"], "to": sts[-1]["name"], "km": km[-1], "n": len(sts),
                        "nWith": sum(1 for s in sts if s["sites"]), "nSites": len(uniq),
                        "nNat": sum(1 for o in uniq.values() if o["k"] == 0),
                        "dots": [len(s["sites"]) for s in sts], "hs": [1 if s.get("h") else 0 for s in sts],
                        "tease": (fx[0]["t"] if fx else "")})
    ph = sum(1 for o in uniq.values() if "p" in o)
    print(f"{L['name']}: {len(sts)} 站、{len(uniq)} 處文資、照片 {ph} 處、事實 {len(fx)} 則")
    for s in sts:
        if s.get("h"):
            o = [o for o in s["sites"] if o.get("st")][0]
            print(f"    車站即文資：{s['name']} ← {o['n']}（{CATS[o['k']]['name']}，{o['y']}，{o['d']} 公尺）")

index = {"meta": {"generated": today, "stationSource": "交通部 PTX／臺鐵公司", "stationDate": SRC_TIME,
                  "walkK": WALK_K, "walkV": WALK_V, "walkMax": WALK_MAX, "walks": WALKS,
                  "stations": len(all_ids), "stationsWith": sum(1 for i in all_ids if station(i)["sites"]),
                  "sitesReach": len(reach), "sitesTotal": len(sites)},
         "eras": ERAS, "cats": CATS, "counties": [{"name": c["name"], "base": c["base"]} for c in COUNTIES], "lines": index_lines}
with open(os.path.join(ROOT, "data", "index.json"), "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
print("完成：", index["meta"])
