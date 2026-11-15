/* 搭火車逛文資 — 單頁程式
 * 路由：#/ 路線總覽　#/line/<路線>　#/line/<路線>/<站代碼>　#/trip/<路線>/<步行分鐘>/<站代碼.站代碼>　#/about
 * 資料：data/index.json（路線清單）、data/lines/<路線>.json（車站與文資），皆由 tools/build.py 產生。
 * 要加新的鐵道系統（高鐵、捷運、林鐵）：build.py 的 LINES 加一筆，這裡不必改。 */
(function () {
  "use strict";
  var app = document.getElementById("app");
  var tripbar = document.getElementById("tripbar");
  var IDX = null, LINES = {};
  var state = { walk: 15, cats: {}, eras: {}, expanded: {}, drawn: {} };
  var LV = ["國定古蹟", "市縣定古蹟", "歷史建築", "紀念建築", "聚落建築群", "文化景觀", "考古遺址"];
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 小工具 ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
  function loadLine(id) { return LINES[id] ? Promise.resolve(LINES[id]) : getJSON("data/lines/" + id + ".json").then(function (d) { LINES[id] = d; return d; }); }
  function yearText(o) { if (o.y == null) return "年代不詳"; return (o.y < 0 ? "西元前 " + (-o.y) : o.y) + " 年" + (o.e ? "（推估）" : ""); }
  function dur(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + " 小時" + (m ? " " + m + " 分" : "") : m + " 分鐘"; }
  function anyKey(o) { for (var k in o) if (o[k]) return true; return false; }
  function pick(st) {
    return st.sites.filter(function (o) {
      return o.m <= state.walk && (!anyKey(state.cats) || state.cats[o.k]) && (!anyKey(state.eras) || state.eras[o.r]);
    });
  }
  function rep(list) { /* 代表文資：有照片 → 車站本身 → 等級 → 距離 */
    return list.slice().sort(function (a, b) { return (a.p ? 0 : 1) - (b.p ? 0 : 1) || (a.st ? 0 : 1) - (b.st ? 0 : 1) || a.k - b.k || a.d - b.d; });
  }
  function ticket(o, cls) {
    return '<span class="tk lv' + o.k + " " + (cls || "") + '" aria-hidden="true"><b>' + (o.y == null ? "？" : Math.abs(o.y)) + "</b><i>" + esc(IDX.eras[o.r].name) + "</i></span>";
  }
  function img(o, size, cls) {
    if (!o.p) return ticket(o, cls);
    return '<img class="' + (cls || "") + '" src="' + esc(size === "l" ? o.p.l : o.p.s) + '" alt="" loading="lazy" decoding="async" data-fb="' + esc(JSON.stringify({ k: o.k, y: o.y, r: o.r })) + '">';
  }
  document.addEventListener("error", function (e) { /* 照片載入失敗 → 換成票卡樣式 */
    var t = e.target;
    if (t.tagName === "IMG" && t.dataset.fb) {
      var o = JSON.parse(t.dataset.fb), w = document.createElement("span");
      w.innerHTML = ticket(o, t.className);
      var fig = t.closest(".card-ph"); if (fig) { fig.classList.add("nophoto"); var fc = fig.querySelector("figcaption"); if (fc) fc.remove(); }
      t.replaceWith(w.firstChild);
    }
  }, true);
  var ICON_ST = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 11 12 4l9 7v1H3z" fill="currentColor"/><path d="M5 12h14v8H5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  /* ---------- 我的行程（存在瀏覽器） ---------- */
  var trip = {};
  try { trip = JSON.parse(localStorage.getItem("rail-trip") || "{}") || {}; } catch (e) { trip = {}; }
  function saveTrip() { try { localStorage.setItem("rail-trip", JSON.stringify(trip)); } catch (e) { /* 無法儲存時只留在本次瀏覽 */ } }
  function inTrip(lid, sid) { return (trip[lid] || []).indexOf(sid) >= 0; }
  function toggleTrip(lid, sid) {
    var a = trip[lid] || (trip[lid] = []), i = a.indexOf(sid);
    if (i >= 0) a.splice(i, 1); else a.push(sid);
    if (!a.length) delete trip[lid];
    saveTrip();
  }
  function tripHref(lid) {
    var line = LINES[lid], a = trip[lid] || [];
    var ids = line ? line.stations.filter(function (s) { return a.indexOf(s.id) >= 0; }).map(function (s) { return s.id; }) : a;
    return "#/trip/" + lid + "/" + state.walk + "/" + ids.join(".");
  }
  function renderTripbar(lid) {
    var a = lid && trip[lid], line = LINES[lid];
    if (!a || !a.length || !line) { tripbar.hidden = true; document.body.classList.remove("has-bar"); return; }
    var names = line.stations.filter(function (s) { return a.indexOf(s.id) >= 0; }).map(function (s) { return s.name; });
    tripbar.style.setProperty("--lc", line.color);
    tripbar.innerHTML = '<div class="wrap tripbar-in"><p><b>我的行程</b><span>' + esc(line.name) + "・" + names.length + " 站：" + esc(names.join(" → ")) +
      '</span></p><a class="btn btn-solid" href="' + tripHref(lid) + '">看行程摘要</a></div>';
    tripbar.hidden = false; document.body.classList.add("has-bar");
  }

  /* ---------- 路線總覽 ---------- */
  function strip(l) { /* 迷你路線圖：一站一點，大小代表文資數 */
    var n = l.dots.length, s = "";
    for (var i = 0; i < n; i++) {
      var c = l.dots[i], r = c ? Math.min(10, 3 + Math.sqrt(c) * 1.4) : 2.2;
      s += '<circle cx="' + (n > 1 ? 3 + i / (n - 1) * 94 : 50).toFixed(2) + '%" cy="14" r="' + r.toFixed(1) + '" class="' + (c ? "on" : "off") + (l.hs[i] ? " hs" : "") + '"/>';
    }
    return '<svg class="strip" aria-hidden="true"><line x1="3%" y1="14" x2="97%" y2="14"/>' + s + "</svg>";
  }
  function viewHome() {
    var m = IDX.meta;
    function row(l) {
      var inner = '<div class="ln-head"><h3>' + esc(l.name) + '</h3><span class="ln-route">' + esc(l.from) + "<i></i>" + esc(l.to) + "</span>" +
        (l.on ? '<span class="ln-go">進站 →</span>' : '<span class="ln-soon">整理中</span>') + "</div>" + strip(l) +
        '<p class="ln-stat"><b>' + l.n + "</b> 站・<b>" + l.nWith + "</b> 站有文資・<b>" + l.nSites + "</b> 處" + (l.nNat ? "・國定古蹟 <b>" + l.nNat + "</b> 處" : "") + "</p>" +
        (l.on && l.tease ? '<p class="ln-tease">' + esc(l.tease) + "</p>" : "");
      return l.on ? '<li><a class="ln on" style="--lc:' + l.color + '" href="#/line/' + l.id + '">' + inner + "</a></li>"
        : '<li><div class="ln" style="--lc:' + l.color + '">' + inner + "</div></li>";
    }
    function group(kind) { return IDX.lines.filter(function (l) { return l.kind === kind; }).map(row).join(""); }
    app.innerHTML = '<section class="home-hero"><div class="wrap">' +
      '<p class="kicker">臺鐵・' + m.stations + " 站・" + IDX.lines.length + " 條路線</p>" +
      "<h1>下一站，<br>走路就到的文資。</h1>" +
      '<p class="lede">全臺 ' + m.stations + " 個臺鐵車站裡，有 <b>" + m.stationsWith + "</b> 站出站走 " + m.walkMax + " 分鐘內就有古蹟或歷史建築，一共 <b>" + m.sitesReach + "</b> 處。挑一條線、選幾站，排一趟不用開車的小旅行。</p>" +
      "</div></section>" +
      '<section class="wrap home-lines"><h2>幹線</h2><ul class="ln-list">' + group("幹線") + '</ul><h2>支線</h2><ul class="ln-list">' + group("支線") + "</ul>" +
      '<p class="hint">每一點是一個車站，點越大代表步行 ' + m.walkMax + " 分鐘內的文資越多；紅圈是車站本身就是文資。</p></section>";
    renderTripbar(null);
  }

  /* ---------- 路線頁 ---------- */
  function chips(line) {
    var cs = {}, es = {};
    line.stations.forEach(function (s) { s.sites.forEach(function (o) { cs[o.k] = 1; es[o.r] = 1; }); });
    var h = '<div class="flt-g" role="group" aria-label="步行時間"><span class="flt-l">步行</span><div class="seg">';
    IDX.meta.walks.forEach(function (w) { h += '<button type="button" data-walk="' + w + '" aria-pressed="' + (state.walk === w) + '">' + w + " 分</button>"; });
    h += '</div></div><div class="flt-g" role="group" aria-label="等級"><span class="flt-l">等級</span>';
    LV.forEach(function (n, k) { if (cs[k]) h += '<button type="button" class="chip" data-cat="' + k + '" aria-pressed="' + !!state.cats[k] + '"><i class="lvd lv' + k + '"></i>' + n + "</button>"; });
    h += '</div><div class="flt-g" role="group" aria-label="時代"><span class="flt-l">時代</span>';
    IDX.eras.forEach(function (e, r) { if (es[r]) h += '<button type="button" class="chip" data-era="' + r + '" aria-pressed="' + !!state.eras[r] + '">' + esc(e.name) + "</button>"; });
    return h + "</div>";
  }
  function diagram(line) {
    var items = [], gap = null, last = line.stations.length - 1, total = 0, seen = {};
    line.stations.forEach(function (s, i) {
      var list = pick(s);
      list.forEach(function (o) { if (!seen[o.c + o.i]) { seen[o.c + o.i] = 1; total++; } });
      if (!list.length && i !== 0 && i !== last && !state.expanded[s.id]) {
        if (!gap) { gap = { gap: [] }; items.push(gap); }
        gap.gap.push(s);
      } else { gap = null; items.push({ s: s, list: list }); }
    });
    var h = "";
    items.forEach(function (it, i) {
      if (it.gap) {
        h += '<li class="st gap" style="--i:' + i + '"><button type="button" class="st-link" data-expand="' + it.gap.map(function (s) { return s.id; }).join(".") + '" title="' + esc(it.gap.map(function (s) { return s.name; }).join("、")) + '">' +
          '<span class="st-top"><span class="st-skip">經過 ' + it.gap.length + ' 站</span></span><span class="st-dotw"><span class="st-dot">⋯</span></span>' +
          '<span class="st-hang"><span class="st-skipn">' + esc(it.gap.map(function (s) { return s.name; }).join("・")) + "</span></span></button></li>";
        return;
      }
      var s = it.s, list = it.list, n = list.length, r = rep(list), hs = s.h && list.filter(function (o) { return o.st; })[0];
      var sz = n ? Math.min(54, Math.round(26 + Math.sqrt(n) * 5)) : 14, hang = "";
      if (n) {
        hang = '<span class="st-ph' + (n > 1 ? " multi" : "") + '">' + (n > 1 ? img(r[1], "s", "ph2") : "") + img(r[0], "s", "ph1") + "</span>" +
          '<span class="st-lv">' + list.slice().sort(function (a, b) { return a.k - b.k; }).slice(0, 8).map(function (o) { return '<i class="lvd lv' + o.k + '"></i>'; }).join("") + (n > 8 ? "<em>+" + (n - 8) + "</em>" : "") + "</span>" +
          '<span class="st-near">最近 ' + list[0].m + " 分</span>";
      } else hang = '<span class="st-none">' + (state.walk < 15 || anyKey(state.cats) || anyKey(state.eras) ? "此條件下沒有" : "步行範圍內沒有") + "</span>";
      h += '<li class="st ' + (n ? "has" : "empty") + (hs ? " hs lvc" + hs.k : "") + '" data-sid="' + s.id + '" style="--i:' + i + ";--sz:" + sz + 'px">' +
        '<a class="st-link" href="#/line/' + line.id + "/" + s.id + '" aria-label="' + esc(s.name) + "站，" + n + ' 處文資">' +
        '<span class="st-top"><span class="st-name">' + esc(s.name) + '</span><span class="st-en">' + esc(s.en) + "</span>" +
        "</span>" +
        '<span class="st-dotw"><span class="st-dot">' + (n || "") + "</span></span>" +
        '<span class="st-hang">' + hang + (hs ? '<span class="st-flag">' + ICON_ST + "車站是" + LV[hs.k] + "</span>" : "") + "</span></a>" +
        (n ? '<button type="button" class="st-add" data-trip="' + s.id + '" aria-pressed="' + inTrip(line.id, s.id) + '" aria-label="把' + esc(s.name) + '站加入我的行程"><span></span></button>' : "") + "</li>";
    });
    return { html: h, count: items.length, total: total };
  }
  function layout() { /* 蛇行排列＋畫路線 */
    var dg = document.getElementById("dg"); if (!dg) return;
    var grid = dg.querySelector(".dg-grid"), cells = grid.children, n = cells.length, W = grid.clientWidth;
    var cols = W < 600 ? 1 : Math.max(3, Math.min(9, Math.floor(W / 128)));
    if (cols > 1) { var rows = Math.ceil(n / cols); cols = Math.ceil(n / rows); }
    dg.classList.toggle("one", cols === 1);
    grid.style.setProperty("--cols", cols);
    for (var i = 0; i < n; i++) {
      var row = Math.floor(i / cols), pos = i % cols;
      cells[i].style.gridRow = row + 1;
      cells[i].style.gridColumn = cols === 1 ? 1 : (row % 2 ? cols - pos : pos + 1);
    }
    var box = dg.getBoundingClientRect(), pts = [];
    for (i = 0; i < n; i++) { var b = cells[i].querySelector(".st-dotw").getBoundingClientRect(); pts.push([b.left + b.width / 2 - box.left, b.top + b.height / 2 - box.top]); }
    var d = "";
    pts.forEach(function (p, i) {
      if (!i) { d = "M" + p[0].toFixed(1) + " " + p[1].toFixed(1); return; }
      var q = pts[i - 1];
      if (cols > 1 && Math.abs(p[1] - q[1]) > 4) { /* 換行：往外側繞一個彎 */
        var out = (Math.floor((i - 1) / cols) % 2 ? -1 : 1) * 78;
        d += "C" + (q[0] + out).toFixed(1) + " " + q[1].toFixed(1) + " " + (p[0] + out).toFixed(1) + " " + p[1].toFixed(1) + " " + p[0].toFixed(1) + " " + p[1].toFixed(1);
      } else d += "L" + p[0].toFixed(1) + " " + p[1].toFixed(1);
    });
    var svg = dg.querySelector("svg");
    svg.setAttribute("width", box.width); svg.setAttribute("height", dg.scrollHeight);
    var rail = svg.querySelector(".rail"), tie = svg.querySelector(".tie");
    rail.setAttribute("d", d); tie.setAttribute("d", d);
    if (dg.classList.contains("draw") && !reduce) {
      var len = rail.getTotalLength();
      rail.style.strokeDasharray = len; rail.style.strokeDashoffset = len;
      rail.getBoundingClientRect();
      rail.style.transition = "stroke-dashoffset 1.6s cubic-bezier(.5,.1,.2,1)"; rail.style.strokeDashoffset = 0;
      setTimeout(function () { rail.style.transition = ""; rail.style.strokeDasharray = ""; dg.classList.remove("draw"); }, 1900);
    } else dg.classList.remove("draw");
  }
  var ro = window.ResizeObserver ? new ResizeObserver(function () { layout(); }) : null;
  function paintLine(line, first) {
    var dg = document.getElementById("dg"), r = diagram(line);
    dg.querySelector(".dg-grid").innerHTML = r.html;
    if (first && !state.drawn[line.id]) { dg.classList.add("draw"); state.drawn[line.id] = 1; }
    document.getElementById("flt").innerHTML = chips(line);
    var on = line.stations.filter(function (s) { return pick(s).length; }).length;
    document.getElementById("dg-sum").innerHTML = "步行 " + state.walk + " 分鐘內：<b>" + on + "</b> 站有文資，共 <b>" + r.total + "</b> 處" +
      (anyKey(state.cats) || anyKey(state.eras) ? '　<button type="button" class="link" data-clear>清除篩選</button>' : "");
    layout();
  }
  function viewLine(line) {
    var f = line.facts.map(function (x, i) {
      return '<li><button type="button" class="fact" data-st="' + x.st.join(".") + '" style="--i:' + i + '"><span class="fact-k">' + esc(x.k) + '</span><span class="fact-big"><b>' + esc(x.big) + "</b><i>" + esc(x.unit) + '</i></span><span class="fact-t">' + esc(x.t) + "</span>" +
        (x.st.length ? '<span class="fact-go">在路線圖上看 ↓</span>' : "") + "</button></li>";
    }).join("");
    app.innerHTML = '<div class="line" style="--lc:' + line.color + '">' +
      '<section class="lhero"><div class="wrap"><a class="back" href="#/">← 所有路線</a>' +
      '<p class="kicker">臺鐵' + esc(line.kind) + "・" + line.stations.length + " 站・" + line.km + " 公里</p>" +
      '<h1><span>' + esc(line.name) + '</span><em class="plate">' + esc(line.from) + "<i></i>" + esc(line.to) + "</em></h1>" +
      (line.intro ? '<p class="lede">' + esc(line.intro) + "</p>" : "") +
      '<h2 class="sr-only">這條線上讓人意外的事</h2><ul class="facts">' + f + "</ul></div></section>" +
      '<div class="flt-bar"><div class="wrap flt" id="flt"></div></div>' +
      '<section class="wrap dg-sec"><div class="dg-headline"><h2>路線圖</h2><p id="dg-sum"></p></div>' +
      '<div class="dg" id="dg"><svg aria-hidden="true"><path class="rail"/><path class="tie"/></svg><ol class="dg-grid"></ol></div>' +
      '<p class="hint">圓點數字是步行範圍內的文資數；點車站看每一處的照片與走法，按右上角的 ＋ 加進「我的行程」。距離與時間皆為推估。</p></section></div>';
    paintLine(line, true);
    if (ro) { ro.disconnect(); ro.observe(document.querySelector(".dg-grid")); }
    renderTripbar(line.id);
  }

  /* ---------- 車站頁 ---------- */
  function radar(st, list) {
    var R = 150, C = 170, V = IDX.meta.walkV, s = "";
    IDX.meta.walks.forEach(function (w) {
      var r = w / IDX.meta.walkMax * R;
      s += '<circle cx="' + C + '" cy="' + C + '" r="' + r + '" class="ring' + (w === state.walk ? " cur" : "") + '"/><text x="' + C + '" y="' + (C + r - 5) + '" class="ring-t">' + w + " 分</text>";
    });
    list.forEach(function (o, i) {
      var r = o.d / (IDX.meta.walkMax * V) * R, a = (o.b - 90) * Math.PI / 180;
      s += '<g class="rd lv' + o.k + '" data-n="' + i + '"><circle cx="' + (C + r * Math.cos(a)).toFixed(1) + '" cy="' + (C + r * Math.sin(a)).toFixed(1) + '" r="10"/><text x="' + (C + r * Math.cos(a)).toFixed(1) + '" y="' + (C + r * Math.sin(a) + 4).toFixed(1) + '">' + (i + 1) + "</text></g>";
    });
    return '<svg class="radar" viewBox="0 0 340 340" role="img" aria-label="' + esc(st.name) + '站周邊文資的方位示意圖"><text x="' + C + '" y="14" class="north">北</text>' +
      '<rect x="' + (C - 7) + '" y="' + (C - 7) + '" width="14" height="14" rx="3" class="me"/>' + s + "</svg>";
  }
  function card(st, o, i) {
    var kb = IDX.counties[o.c].base + "#map/" + o.i;
    var nav = "https://www.google.com/maps/dir/?api=1&origin=" + st.lat + "," + st.lng + "&destination=" + o.la + "," + o.lo + "&travelmode=walking";
    var credit = o.p ? '<figcaption>攝影：' + (o.p.pg ? '<a href="' + esc(o.p.pg) + '" target="_blank" rel="noopener">' + esc(o.p.a || "Wikimedia Commons") + "</a>" : esc(o.p.a)) + "｜" +
      (o.p.lu ? '<a href="' + esc(o.p.lu) + '" target="_blank" rel="noopener">' + esc(o.p.li) + "</a>" : esc(o.p.li)) + "</figcaption>" : "";
    return '<li class="card lvc' + o.k + (o.st ? " is-st" : "") + '" data-n="' + i + '" style="--i:' + i + '">' +
      '<figure class="card-ph' + (o.p ? "" : " nophoto") + '">' + img(o, "l") + '<span class="card-no">' + (i + 1) + "</span>" + credit + "</figure>" +
      '<div class="card-b">' + (o.st ? '<p class="card-st">' + ICON_ST + "這就是車站本身</p>" : "") +
      '<p class="card-meta"><span class="lvt lv' + o.k + '">' + LV[o.k] + "</span><span>" + yearText(o) + "・" + esc(IDX.eras[o.r].name) + "</span></p>" +
      "<h3>" + esc(o.n) + "</h3><p class=\"card-s\">" + esc(o.s) + "</p>" +
      '<dl class="card-f"><div><dt>步行</dt><dd><b>' + o.m + "</b> 分<small>推估 " + o.d + " 公尺</small></dd></div><div><dt>建議停留</dt><dd><b>" + o.v + "</b> 分</dd></div></dl>" +
      '<p class="card-a"><a class="btn btn-solid" href="' + esc(kb) + '" target="_blank" rel="noopener">看完整介紹</a><a class="btn" href="' + nav + '" target="_blank" rel="noopener">步行導航</a></p></div></li>';
  }
  function viewStation(line, sid) {
    var i = -1; line.stations.forEach(function (s, k) { if (s.id === sid) i = k; });
    if (i < 0) { location.hash = "#/line/" + line.id; return; }
    var st = line.stations[i], prev = line.stations[i - 1], next = line.stations[i + 1], list = pick(st);
    var hs = list.filter(function (o) { return o.st; })[0];
    var visit = list.reduce(function (a, o) { return a + o.v; }, 0);
    function nb(s, dir) { return s ? '<a class="pl-nb ' + dir + '" href="#/line/' + line.id + "/" + s.id + '"><span>' + esc(s.name) + "</span><small>" + esc(s.en) + "</small></a>" : '<span class="pl-nb ' + dir + ' end"><span>終點</span></span>'; }
    var walkSeg = IDX.meta.walks.map(function (w) { return '<button type="button" data-walk="' + w + '" aria-pressed="' + (state.walk === w) + '">' + w + " 分</button>"; }).join("");
    app.innerHTML = '<div class="station" style="--lc:' + line.color + '"><div class="wrap">' +
      '<a class="back" href="#/line/' + line.id + '">← ' + esc(line.name) + "路線圖</a>" +
      '<div class="st-headrow"><div class="plate-big"><p class="pl-line">' + esc(line.name) + "・" + st.km + ' 公里</p><h1>' + esc(st.name) + '</h1><p class="pl-en">' + esc(st.en) + '</p><div class="pl-bar"><i></i></div><div class="pl-nbs">' + nb(prev, "prev") + nb(next, "next") + "</div></div>" +
      '<div class="st-sum">' +
      (hs ? '<p class="st-banner lvc' + hs.k + '">' + ICON_ST + "<span>這座車站本身就是<b>" + LV[hs.k] + "</b>，" + yearText(hs) + "落成。</span></p>" : "") +
      (list.length ? '<p class="st-big"><b>' + list.length + "</b> 處文資，走路 " + state.walk + " 分鐘內</p><p class=\"st-sub\">最近的只要 " + list[0].m + " 分鐘；全部看完的建議停留時間合計約 " + dur(visit) + "（不含走路）。</p>"
        : '<p class="st-big">步行 ' + state.walk + " 分鐘內沒有符合條件的文資</p><p class=\"st-sub\">把步行時間拉長，或回路線圖換一站。</p>") +
      '<div class="flt-g"><span class="flt-l">步行</span><div class="seg">' + walkSeg + "</div></div>" +
      '<p><button type="button" class="btn btn-trip" data-trip="' + st.id + '" aria-pressed="' + inTrip(line.id, st.id) + '"><span class="t-off">＋ 加入我的行程</span><span class="t-on">✓ 已在我的行程</span></button></p>' +
      "</div></div>" +
      (list.length ? '<div class="st-body"><aside class="st-map"><h2>方位示意</h2>' + radar(st, list) + '<p class="hint">中央方塊是車站，同心圓是步行 5、10、15 分鐘的推估範圍；號碼對應右邊的卡片。這不是地圖，實際路線請按卡片上的「步行導航」。</p></aside>' +
        '<ol class="cards">' + list.map(function (o, k) { return card(st, o, k); }).join("") + "</ol></div>" : "") +
      "</div></div>";
    renderTripbar(line.id);
  }

  /* ---------- 我的行程 ---------- */
  function viewTrip(parts) {
    var lid = parts[1];
    if (!lid) {
      var ks = Object.keys(trip);
      if (ks.length) { location.replace(tripHrefRaw(ks[0])); return; }
      app.innerHTML = '<section class="wrap empty-page"><h1>我的行程</h1><p>還沒有選車站。到路線圖上，按車站右上角的 ＋ 就能加入。</p><p><a class="btn btn-solid" href="#/">去選路線</a></p></section>';
      renderTripbar(null); return;
    }
    loadLine(lid).then(function (line) {
      var walk = +parts[2] || 15, ids = (parts[3] || "").split(".").filter(Boolean);
      state.walk = IDX.meta.walks.indexOf(walk) >= 0 ? walk : 15;
      var sts = line.stations.filter(function (s) { return ids.indexOf(s.id) >= 0; });
      var total = 0, nSites = 0;
      var rows = sts.map(function (s) {
        var list = s.sites.filter(function (o) { return o.m <= state.walk; });
        var top = list.slice().sort(function (a, b) { return (a.st ? 0 : 1) - (b.st ? 0 : 1) || a.k - b.k || a.d - b.d; }).slice(0, 3);
        var t = top.reduce(function (a, o) { return a + o.v; }, 0) + (top.length ? 2 * Math.max.apply(null, top.map(function (o) { return o.m; })) : 0);
        total += t; nSites += top.length;
        return '<li><a class="tp-st" href="#/line/' + line.id + "/" + s.id + '"><b>' + esc(s.name) + "</b><small>" + esc(s.en) + "・" + s.km + ' 公里</small></a><p class="tp-t">停留約 ' + dur(t) + "・範圍內共 " + list.length + ' 處</p><ul class="tp-sites">' +
          top.map(function (o) { return '<li><i class="lvd lv' + o.k + '"></i>' + esc(o.n) + "<small>走 " + o.m + " 分・看 " + o.v + " 分</small></li>"; }).join("") + "</ul></li>";
      }).join("");
      app.innerHTML = '<div class="trip" style="--lc:' + line.color + '"><div class="wrap"><a class="back" href="#/line/' + line.id + '">← ' + esc(line.name) + "路線圖</a>" +
        (sts.length ? '<article class="tp"><header><p class="kicker">搭火車逛文資・行程摘要</p><h1>' + esc(line.name) + "小旅行</h1><p class=\"tp-route\">" + sts.map(function (s) { return esc(s.name); }).join("<i></i>") + "</p>" +
          '<dl class="tp-nums"><div><dt>下車</dt><dd><b>' + sts.length + "</b> 站</dd></div><div><dt>文資</dt><dd><b>" + nSites + "</b> 處</dd></div><div><dt>站外時間</dt><dd><b>" + dur(total) + '</b></dd></div></dl></header><ol class="tp-list">' + rows + "</ol>" +
          '<footer><p>每站列出步行 ' + state.walk + " 分鐘內最值得看的 3 處。站外時間＝建議停留＋來回步行，皆為推估，不含候車與乘車；班次請查臺鐵時刻表。</p></footer></article>" +
          '<p class="tp-actions"><button type="button" class="btn btn-solid" data-share>複製分享網址</button><button type="button" class="btn" data-print>列印／存成 PDF</button><button type="button" class="btn" data-adopt>存成我的行程</button></p><p class="tp-msg" role="status" aria-live="polite"></p>'
          : '<section class="empty-page"><h1>我的行程</h1><p>這個網址裡沒有車站。</p></section>') + "</div></div>";
      app.dataset.trip = JSON.stringify({ lid: lid, ids: sts.map(function (s) { return s.id; }) });
      renderTripbar(null);
    });
  }
  function tripHrefRaw(lid) { return "#/trip/" + lid + "/" + state.walk + "/" + (trip[lid] || []).join("."); }

  /* ---------- 排行榜 ---------- */
  var RANK = null;
  function viewRank() {
    (RANK ? Promise.resolve(RANK) : getJSON("data/rank.json").then(function (d) { RANK = d; return d; })).then(function (d) {
      var color = {}; IDX.lines.forEach(function (l) { color[l.id] = l.color; });
      var h = d.boards.map(function (b) {
        var max = b.text ? 0 : Math.max.apply(null, b.rows.map(function (r) { return r.v; }));
        var rows = b.rows.map(function (r, i) {
          var w = b.text ? 0 : Math.max(6, (b.asc ? (max - r.v + 1) / max : r.v / max) * 100);
          return '<li style="--lc:' + color[r.line] + ";--w:" + w + '%"' + (r.k != null ? ' class="lvc' + r.k + '"' : "") + '><a href="#/line/' + r.line + "/" + r.id + '"><span class="rk-n">' + (i + 1) + '</span><span class="rk-m"><b>' + esc(r.name) + "</b>" +
            (r.note ? "<small>" + esc(r.note) + "</small>" : "") + (b.text ? "" : '<i class="rk-bar"></i>') + '</span><span class="rk-v"><b>' + esc(r.v) + "</b>" + esc(b.unit) + "</span></a></li>";
        }).join("");
        return '<section class="rk' + (b.all ? " rk-all" : "") + '" id="rk-' + b.id + '"><h2>' + esc(b.title) + '</h2><p class="hint">' + esc(b.sub) + '</p><ol>' + rows + "</ol></section>";
      }).join("");
      app.innerHTML = '<div class="rank"><section class="home-hero"><div class="wrap"><p class="kicker">全臺 ' + IDX.meta.stations + ' 個臺鐵車站</p><h1>哪一站，<br>下車就有文資？</h1>' +
        '<p class="lede">把每個車站走路 ' + IDX.meta.walkMax + " 分鐘內的文資全部算過一遍。點站名直接看那一站。距離與時間皆為推估。</p></div></section>" +
        '<div class="wrap rk-grid">' + h + "</div></div>";
    });
    renderTripbar(null);
  }

  /* ---------- 資料說明 ---------- */
  function viewAbout() {
    var m = IDX.meta;
    app.innerHTML = '<section class="wrap about"><h1>資料說明</h1>' +
      "<h2>車站</h2><p>臺鐵車站的站名、座標、所屬路線與站序，取自交通部公共運輸整合資訊流通服務平臺（PTX），由國營臺灣鐵路股份有限公司提供，資料時間 " + esc(m.stationDate) + "。此開放資料依政府資料開放授權條款（Open Government Data License）進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。<a href=\"https://data.gov.tw/license\" target=\"_blank\" rel=\"noopener\">政府資料開放授權條款</a></p>" +
      "<p>縱貫線北段、山線、海線、縱貫線南段、屏東線、南迴線等的分段，是本站依站序在竹南、彰化、高雄、枋寮、花蓮、蘇澳新切開的。</p>" +
      "<h2>文化資產</h2><p>全臺 " + m.sitesTotal + " 處有形文化資產的名稱、等級、座標與年代，來自文化部文化資產局國家文化資產網，經兩個文資知識網站整理；時代一律由創建年重新計算。</p>" +
      "<h2>步行距離與時間</h2><p>全部是<b>推估</b>：車站與文資的直線距離乘上 " + m.walkK + "，再以每分鐘 " + m.walkV + " 公尺換算。沒有考慮實際道路、出口位置、天橋地下道與鐵路阻隔，實際可能更遠。出發前請用卡片上的「步行導航」確認。</p>" +
      "<h2>照片</h2><p>照片來自 Wikimedia Commons，每張都在照片下方標示作者與授權條款，點作者可看原始檔案頁。沒有照片的文資以票卡樣式代替。</p>" +
      "<h2>車站本身是文資</h2><p>由文資名稱與車站位置比對判定，指的是站房（或舊站房）登錄為文資；部分舊站房已不作車站使用。</p>" +
      '<p class="hint">資料產生日期：' + esc(m.generated) + "</p></section>";
    renderTripbar(null);
  }

  /* ---------- 路由 ---------- */
  var lastKey = "";
  function route() {
    var parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean), key = parts.slice(0, 3).join("/");
    document.querySelectorAll("[data-nav]").forEach(function (a) { a.classList.toggle("cur", a.dataset.nav === (parts[0] === "line" ? "home" : parts[0] || "home")); });
    if (ro) ro.disconnect();
    var p;
    if (parts[0] === "line" && parts[1]) {
      var ok = IDX.lines.filter(function (l) { return l.id === parts[1] && l.on; })[0];
      if (!ok) { location.replace("#/"); return; }
      p = loadLine(parts[1]).then(function (line) { if (parts[2]) viewStation(line, parts[2]); else viewLine(line); document.title = (parts[2] ? "" : "") + line.name + "｜搭火車逛文資"; });
    } else if (parts[0] === "trip") { viewTrip(parts); document.title = "我的行程｜搭火車逛文資"; }
    else if (parts[0] === "rank") { viewRank(); document.title = "排行榜｜搭火車逛文資"; }
    else if (parts[0] === "about") { viewAbout(); document.title = "資料說明｜搭火車逛文資"; }
    else { viewHome(); document.title = "搭火車逛文資"; }
    Promise.resolve(p).then(function () { if (key !== lastKey) { window.scrollTo(0, 0); lastKey = key; } });
  }

  /* ---------- 事件 ---------- */
  function curLine() { var m = location.hash.match(/^#\/line\/([^/]+)(?:\/([^/]+))?/); return m ? { line: LINES[m[1]], sid: m[2] } : null; }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    var c = curLine(), d = t.dataset;
    if (d.walk && c) { state.walk = +d.walk; }
    else if (d.cat && c) { state.cats[d.cat] = !state.cats[d.cat]; }
    else if (d.era && c) { state.eras[d.era] = !state.eras[d.era]; }
    else if ("clear" in d) { state.cats = {}; state.eras = {}; }
    else if (d.expand) { d.expand.split(".").forEach(function (id) { state.expanded[id] = 1; }); }
    else if (d.trip && c) { toggleTrip(c.line.id, d.trip); }
    else if ("st" in d && c) {
      var ids = d.st.split(".").filter(Boolean); if (!ids.length) return;
      ids.forEach(function (id) { state.expanded[id] = 1; });
      if (state.walk !== 15 || anyKey(state.cats) || anyKey(state.eras)) { state.walk = 15; state.cats = {}; state.eras = {}; }
      paintLine(c.line);
      document.querySelectorAll(".st").forEach(function (li) { li.classList.toggle("hl", ids.indexOf(li.dataset.sid) >= 0); });
      document.getElementById("dg").classList.add("hl-on");
      document.querySelector(".dg-sec").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      return;
    }
    else if ("share" in d) {
      var msg = document.querySelector(".tp-msg"), url = location.href;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { msg.textContent = "已複製網址，貼給朋友就能看到同一份行程。"; },
        function () { msg.textContent = "請複製網址列的網址分享：" + url; });
      return;
    }
    else if ("print" in d) { window.print(); return; }
    else if ("adopt" in d) { var tp = JSON.parse(app.dataset.trip); trip[tp.lid] = tp.ids; saveTrip(); document.querySelector(".tp-msg").textContent = "已存在這個瀏覽器，回路線圖可以繼續增減車站。"; return; }
    else return;
    if (c.sid) viewStation(c.line, c.sid);
    else { document.getElementById("dg").classList.remove("hl-on"); paintLine(c.line); renderTripbar(c.line.id); }
  });
  function hov(e, on) { /* 方位圖與卡片互相對應 */
    var t = e.target.closest && e.target.closest("[data-n]"); if (!t) return;
    document.querySelectorAll('[data-n="' + t.dataset.n + '"]').forEach(function (x) { x.classList.toggle("hot", on); });
  }
  document.addEventListener("mouseover", function (e) { hov(e, true); });
  document.addEventListener("mouseout", function (e) { hov(e, false); });
  document.addEventListener("click", function (e) {
    var g = e.target.closest && e.target.closest(".rd"); if (!g) return;
    var cd = document.querySelector('.card[data-n="' + g.dataset.n + '"]'); if (cd) cd.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  });

  getJSON("data/index.json").then(function (d) { IDX = d; window.addEventListener("hashchange", route); route(); })
    .catch(function () { app.innerHTML = '<p class="loading wrap">資料載入失敗，請重新整理。</p>'; });
})();
