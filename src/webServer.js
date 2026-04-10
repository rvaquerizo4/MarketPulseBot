const http = require("node:http");
const { config } = require("./config");
const { logger } = require("./utils/logger");

function safePercent(value) {
  if (!Number.isFinite(value)) return "N/D";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function buildDashboardData(state) {
  const priceHistory = state.priceHistory || {};
  const rawEntries = Object.values(state.previousSnapshot || {});

  // Enrich each entry with sparkline prices (last 20 points)
  const entries = rawEntries.map((item) => ({
    ...item,
    sparkPrices: (priceHistory[item.key] || []).slice(-20).map((p) => p.price),
  }));

  const withChange = entries.filter((item) => Number.isFinite(item.change24hPct));

  const avg24h =
    withChange.length > 0
      ? withChange.reduce((acc, item) => acc + item.change24hPct, 0) / withChange.length
      : null;

  const topGainers = [...withChange]
    .filter((item) => item.change24hPct > 0)
    .sort((a, b) => b.change24hPct - a.change24hPct)
    .slice(0, 5);

  const topLosers = [...withChange]
    .filter((item) => item.change24hPct < 0)
    .sort((a, b) => a.change24hPct - b.change24hPct)
    .slice(0, 5);

  const byCategory = entries.reduce((acc, item) => {
    const category = item.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  for (const list of Object.values(byCategory)) {
    list.sort((a, b) => {
      const av = Number.isFinite(a.change24hPct) ? a.change24hPct : -Infinity;
      const bv = Number.isFinite(b.change24hPct) ? b.change24hPct : -Infinity;
      return bv - av;
    });
  }

  return {
    now: new Date().toISOString(),
    lastCheckAt: state.lastCheckAt || null,
    trackedAssets: entries.length,
    avg24h,
    avg24hLabel: safePercent(avg24h),
    topGainers,
    topLosers,
    categories: byCategory,
    recentEvents: state.recentEvents || [],
  };
}

function htmlPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MarketPulseBot Dashboard</title>
  <style>
    :root {
      --bg: #f3f7f6;
      --card: #ffffff;
      --text: #132033;
      --muted: #5d7289;
      --ok: #0f7d49;
      --bad: #ba2f2f;
      --warn: #956200;
      --line: #d7e2ea;
      --accent: #156ea8;
      --soft-accent: #e7f2fa;
      --radius: 14px;
      --shadow: 0 8px 24px rgba(15, 36, 56, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Noto Sans", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 12% 0%, #dcecf7 0, transparent 42%),
        radial-gradient(circle at 88% 0%, #def4e6 0, transparent 36%),
        var(--bg);
    }
    .wrap { max-width: 1160px; margin: 0 auto; padding: 22px; }
    .top {
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
      margin-bottom: 16px;
    }
    .title { font-size: 1.45rem; font-weight: 750; letter-spacing: 0.2px; }
    .meta { color: var(--muted); font-size: 0.95rem; }
    .meta strong { color: var(--text); }
    .chip-group { display: flex; align-items: center; gap: 8px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-bottom: 14px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 14px;
      box-shadow: var(--shadow);
    }
    .kpi { font-size: 1.35rem; font-weight: 760; margin-top: 4px; }
    .ok { color: var(--ok); }
    .bad { color: var(--bad); }
    .warn { color: var(--warn); }
    h3 { margin: 2px 0 8px; font-size: 1rem; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 6px 0; }
    .section-title {
      margin: 18px 0 8px;
      font-size: 1.02rem;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: 0.2px;
    }
    .table-wrap {
      overflow-x: auto;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      margin-bottom: 12px;
      box-shadow: var(--shadow);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 560px;
      font-size: 0.92rem;
      table-layout: fixed;
    }
    col.col-symbol { width: 10%; }
    col.col-name { width: 22%; }
    col.col-category { width: 14%; }
    col.col-price { width: 16%; }
    col.col-change { width: 12%; }
    col.col-spark { width: 10%; }
    col.col-freshness { width: 16%; }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 11px;
      text-align: left;
      vertical-align: middle;
    }
    th {
      background: #f7fbfd;
      font-weight: 650;
      color: #254055;
      text-transform: uppercase;
      font-size: 0.74rem;
      letter-spacing: 0.65px;
    }
    tr:last-child td { border-bottom: none; }
    tbody tr:nth-child(2n) { background: #fbfeff; }
    td, th {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .name-cell {
      color: var(--muted);
    }
    .price-cell, .freshness-cell {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .change-cell {
      text-align: center;
    }
    .spark-cell {
      text-align: center;
      padding: 4px 8px;
      white-space: nowrap;
    }
    .symbol-cell {
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .pill.ok {
      color: #0f7d49;
      background: #e6f8ef;
      border-color: #b7ebcd;
    }
    .pill.bad {
      color: #ba2f2f;
      background: #fdeaea;
      border-color: #f5bcbc;
    }
    .pill.warn {
      color: #956200;
      background: #fff6e2;
      border-color: #f4dea8;
    }
    .section-title {
      display: flex;
      align-items: center;
      margin: 18px 0 8px;
    }
    .section-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 0.86rem;
      font-weight: 700;
      border: 1px solid transparent;
      letter-spacing: 0.2px;
    }
    .tone-crypto { color: #004f3a; background: #e2fbf1; border-color: #9ce6c7; }
    .tone-etf { color: #00506e; background: #e3f5ff; border-color: #a9d8ef; }
    .tone-index { color: #2f4a00; background: #f2f9e3; border-color: #cce3a0; }
    .tone-stocks { color: #6a3900; background: #fff0e0; border-color: #f1c58f; }
    .tone-other { color: #3f4450; background: #eff2f6; border-color: #d5dbe5; }
    .category-chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 650;
      border: 1px solid transparent;
    }
    .tag {
      display: inline-block;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 0.8rem;
      color: var(--muted);
      background: #fff;
    }
    .fresh { color: var(--ok); }
    .stale { color: var(--warn); }
    .closed { color: var(--muted); }
    .pill.market-closed {
      color: #3f4450;
      background: #eff2f6;
      border-color: #d5dbe5;
    }
    .footer {
      margin-top: 8px;
      color: var(--muted);
      font-size: 0.84rem;
      text-align: right;
    }
    @media (max-width: 720px) {
      .wrap { padding: 14px; }
      .top { align-items: flex-start; flex-direction: column; }
      .chip-group { width: 100%; justify-content: flex-start; }
      .card { padding: 12px; }
      .footer { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">MarketPulseBot Dashboard</div>
        <div id="meta" class="meta">Loading...</div>
      </div>
      <div class="chip-group">
        <span class="tag">Live Panel</span>
        <span class="tag">Port 1903</span>
      </div>
    </div>

    <div class="grid">
      <div class="card"><div class="meta">Tracked Assets</div><div id="tracked" class="kpi">-</div></div>
      <div class="card"><div class="meta">Average 24h Bias</div><div id="avg" class="kpi">-</div></div>
      <div class="card"><div class="meta">Top Gainers</div><ul id="gainers"></ul></div>
      <div class="card"><div class="meta">Top Losers</div><ul id="losers"></ul></div>
    </div>

    <div id="tables"></div>

    <div class="card">
      <h3>Recent Events</h3>
      <ul id="events"></ul>
    </div>

    <div class="footer">Auto refresh every 30 seconds.</div>
  </div>

<script>
  function fmtPct(value) {
    if (!Number.isFinite(value)) return "N/D";
    const sign = value > 0 ? "+" : "";
    return sign + value.toFixed(2) + "%";
  }

  function clsPct(value) {
    if (!Number.isFinite(value)) return "";
    if (value > 0) return "ok";
    if (value < 0) return "bad";
    return "warn";
  }

  function setList(el, rows, emptyText) {
    el.innerHTML = "";
    if (!rows || rows.length === 0) {
      const li = document.createElement("li");
      li.textContent = emptyText;
      el.appendChild(li);
      return;
    }

    for (const item of rows) {
      const li = document.createElement("li");
      const pctClass = clsPct(item.change24hPct);
      li.innerHTML = "<strong>" + (item.symbol || "-") + "</strong> " +
        "<span class='pill " + (pctClass || "warn") + "'>" + fmtPct(item.change24hPct) + "</span>";
      li.className = clsPct(item.change24hPct);
      el.appendChild(li);
    }
  }

  function renderCategoryTable(category, rows) {
    const meta = getCategoryMeta(category);
    const section = document.createElement("section");
    const title = document.createElement("div");
    title.className = "section-title";
    title.innerHTML = "<span class='section-badge " + meta.tone + "'>" + meta.icon + " " + meta.label + "</span>";
    section.appendChild(title);

    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");
    table.innerHTML = "<colgroup>" +
      "<col class='col-symbol' />" +
      "<col class='col-name' />" +
      "<col class='col-category' />" +
      "<col class='col-price' />" +
      "<col class='col-change' />" +
      "<col class='col-spark' />" +
      "<col class='col-freshness' />" +
      "</colgroup>" +
      "<thead>" +
      "<tr>" +
      "<th>Symbol</th>" +
      "<th>Name</th>" +
      "<th>Category</th>" +
      "<th style='text-align:right'>Price</th>" +
      "<th style='text-align:center'>24h</th>" +
      "<th style='text-align:center'>Trend</th>" +
      "<th style='text-align:right'>Status</th>" +
      "</tr>" +
      "</thead>" +
      "<tbody></tbody>";
    const body = table.querySelector("tbody");

    for (const item of rows) {
      const tr = document.createElement("tr");
      const fi = getFreshnessInfo(item);
      const pctClass = clsPct(item.change24hPct) || "warn";
      const rowMeta = getCategoryMeta(item.category || category);
      tr.innerHTML = "<td class='symbol-cell'>" + (item.symbol || "-") + "</td>" +
        "<td class='name-cell'>" + (item.name || "-") + "</td>" +
        "<td><span class='category-chip " + rowMeta.tone + "'>" + rowMeta.label + "</span></td>" +
        "<td class='price-cell'>" + (Number.isFinite(item.price) ? item.price.toLocaleString() : "N/D") + " " + (item.currency || "") + "</td>" +
        "<td class='change-cell'><span class='pill " + pctClass + "'>" + fmtPct(item.change24hPct) + "</span></td>" +
        "<td class='spark-cell'>" + renderSparkline(item.sparkPrices, item.change24hPct) + "</td>" +
        "<td class='freshness-cell " + fi.cls + "'>" + fi.text + "</td>";
      body.appendChild(tr);
    }

    wrap.appendChild(table);
    section.appendChild(wrap);
    return section;
  }

  async function refresh() {
    const res = await fetch("/api/dashboard");
    if (!res.ok) return;
    const data = await res.json();

    const checkedAt = data.lastCheckAt ? new Date(data.lastCheckAt).toLocaleString() : "N/D";
    const now = data.now ? new Date(data.now).toLocaleString() : "N/D";

    document.getElementById("meta").textContent = "Last bot check: " + checkedAt + " | Panel refresh: " + now;
    document.getElementById("tracked").textContent = String(data.trackedAssets || 0);

    const avgEl = document.getElementById("avg");
    avgEl.textContent = data.avg24hLabel || "N/D";
    avgEl.className = "kpi " + clsPct(data.avg24h);

    setList(document.getElementById("gainers"), data.topGainers, "No positive movers");
    setList(document.getElementById("losers"), data.topLosers, "No negative movers");

    const tables = document.getElementById("tables");
    tables.innerHTML = "";
    const categories = data.categories || {};
    const preferredOrder = ["Crypto", "ETF", "Index Fund", "Stocks"];
    for (const category of preferredOrder) {
      if (Array.isArray(categories[category])) {
        tables.appendChild(renderCategoryTable(category, categories[category]));
      }
    }
    for (const [category, rows] of Object.entries(categories)) {
      if (!preferredOrder.includes(category)) {
        tables.appendChild(renderCategoryTable(category, rows));
      }
    }

    const events = document.getElementById("events");
    events.innerHTML = "";
    const recent = Array.isArray(data.recentEvents) ? data.recentEvents.slice(0, 8) : [];
    if (recent.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No recent events";
      events.appendChild(li);
    } else {
      for (const ev of recent) {
        const li = document.createElement("li");
        const eventAt = ev.at || ev.ts || null;
        const when = eventAt ? new Date(eventAt).toLocaleString() : "N/D";
        li.textContent = "[" + when + "] " + (ev.message || ev.type || "event");
        events.appendChild(li);
      }
    }
  }

  refresh().catch(() => {});
  setInterval(() => refresh().catch(() => {}), 30000);

  function getCategoryMeta(category) {
    if (category === "Crypto") return { label: "Crypto", icon: "🪙", tone: "tone-crypto" };
    if (category === "ETF") return { label: "ETF", icon: "📈", tone: "tone-etf" };
    if (category === "Index Fund") return { label: "Index Fund", icon: "📊", tone: "tone-index" };
    if (category === "Stocks") return { label: "Stocks", icon: "🏢", tone: "tone-stocks" };
    return { label: category || "Other", icon: "📌", tone: "tone-other" };
  }

  function getFreshnessInfo(item) {
    var ms = item.marketState ? String(item.marketState).toUpperCase() : "";
    var isCrypto = item.category === "Crypto";

    function fmtLastTrade() {
      if (!item.lastTradeAt) return "";
      var d = new Date(item.lastTradeAt);
      var now = new Date();
      var timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (d.toDateString() !== now.toDateString()) {
        var dateStr = d.toLocaleDateString([], { month: "short", day: "numeric" });
        return " " + dateStr + " " + timeStr;
      }
      return " " + timeStr;
    }

    // Crypto or market actively REGULAR → use classic fresh/stale
    if (isCrypto || ms === "REGULAR") {
      if (item.isStale) {
        var age = Number.isFinite(item.ageMinutes) ? " (" + item.ageMinutes.toFixed(0) + "m)" : "";
        return { cls: "stale", text: "stale" + age };
      }
      return { cls: "fresh", text: "fresh" };
    }

    // Explicit closed / pre / post
    if (ms === "CLOSED" || ms === "PRE" || ms === "POST") {
      var label = ms === "PRE" ? "pre-market" : ms === "POST" ? "after-hours" : "closed";
      return { cls: "closed", text: label + fmtLastTrade() };
    }

    // marketState unknown but non-crypto and stale → infer closed
    if (item.isStale) {
      return { cls: "closed", text: "closed" + fmtLastTrade() };
    }

    return { cls: "fresh", text: "fresh" };
  }

  function renderSparkline(prices, change24hPct) {
    if (!Array.isArray(prices) || prices.length < 2) {
      return "<span style='color:#ccc;font-size:0.8rem'>—</span>";
    }
    var W = 72, H = 26, PAD = 2;
    var min = prices[0], max = prices[0];
    for (var i = 1; i < prices.length; i++) {
      if (prices[i] < min) min = prices[i];
      if (prices[i] > max) max = prices[i];
    }
    var range = max - min || 1;
    var pts = "";
    for (var j = 0; j < prices.length; j++) {
      var x = (PAD + (j / (prices.length - 1)) * (W - PAD * 2)).toFixed(1);
      var y = (PAD + (1 - (prices[j] - min) / range) * (H - PAD * 2)).toFixed(1);
      pts += (j > 0 ? " " : "") + x + "," + y;
    }
    var color = change24hPct > 0 ? "#0f7d49" : change24hPct < 0 ? "#ba2f2f" : "#5d7289";
    return "<svg width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "' xmlns='http://www.w3.org/2000/svg'>" +
      "<polyline points='" + pts + "' fill='none' stroke='" + color + "' stroke-width='1.5' stroke-linejoin='round' stroke-linecap='round'/>" +
      "</svg>";
  }
</script>
</body>
</html>`;
}

function startWebServer(state) {
  const server = http.createServer((req, res) => {
    const url = req.url || "/";

    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url === "/api/dashboard") {
      const data = buildDashboardData(state);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
      return;
    }

    if (url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPage());
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(config.webPort, () => {
    logger.info(`Web dashboard available at http://localhost:${config.webPort}`);
  });

  return server;
}

module.exports = {
  startWebServer,
};
