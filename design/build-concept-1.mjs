/**
 * Concept 1 — "Ledger". A dense data desk in the spirit of Linear and Arc.
 *
 * Thesis: this is a working instrument, not a dashboard. Chrome is almost
 * absent, hairlines instead of cards, one accent colour, monospaced numerics so
 * columns align optically. A persistent left rail means the year and the record
 * type are always one click away and never a page you navigate "to".
 *
 * Generated as static HTML. No JS behaviour - the filter bars and menus are
 * rendered in a plausible state so the layout can be judged.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'concept-1');
mkdirSync(out, { recursive: true });

const CSS = `
:root{
  --bg:#0b0c0e; --panel:#0f1113; --rail:#0a0b0d;
  --line:#1c1f23; --line-strong:#2a2f35;
  --ink:#e6e8eb; --ink-dim:#9aa1a9; --ink-faint:#636b74;
  --accent:#5b8cff; --accent-dim:#2a3f6b;
  --pos:#3fb950; --neg:#f85149; --warn:#d29922;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  background:var(--bg); color:var(--ink);
  font:13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased;
}
a{color:inherit;text-decoration:none}
.app{display:grid;grid-template-columns:212px 1fr;min-height:100vh}

/* ---- left rail ---- */
.rail{background:var(--rail);border-right:1px solid var(--line);padding:14px 10px;display:flex;flex-direction:column;gap:18px;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:8px;padding:4px 8px 0}
.brand b{font-size:13px;letter-spacing:-.01em}
.dot{width:7px;height:7px;border-radius:2px;background:var(--accent)}
.yr{display:flex;gap:4px;padding:0 6px}
.yr a{flex:1;text-align:center;padding:5px 0;border-radius:5px;font:600 11px/1 var(--mono);color:var(--ink-faint);border:1px solid transparent}
.yr a.on{background:var(--accent-dim);color:#cfe0ff;border-color:#33507f}
.navgrp{display:flex;flex-direction:column;gap:1px}
.navgrp h6{font:600 10px/1 ui-sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-faint);padding:0 8px 6px}
.nav{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:6px;color:var(--ink-dim);font-size:12.5px}
.nav:hover{background:#14171a;color:var(--ink)}
.nav.on{background:#16191d;color:var(--ink);box-shadow:inset 2px 0 0 var(--accent)}
.nav .ic{width:14px;height:14px;opacity:.75;flex:none}
.nav .ct{margin-left:auto;font:500 10px var(--mono);color:var(--ink-faint)}
.railfoot{margin-top:auto;padding:8px;border-top:1px solid var(--line);color:var(--ink-faint);font-size:11px}

/* ---- main ---- */
.main{min-width:0;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:14px;padding:0 20px;height:46px;border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(11,12,14,.86);backdrop-filter:blur(8px);z-index:5}
.top h1{font-size:13px;font-weight:600;letter-spacing:-.01em}
.crumb{color:var(--ink-faint);font-size:12px}
.spacer{margin-left:auto}
.kbd{font:500 10px var(--mono);color:var(--ink-faint);border:1px solid var(--line-strong);border-radius:4px;padding:2px 5px}
.btn{font:500 12px ui-sans-serif;color:var(--ink-dim);border:1px solid var(--line-strong);background:#111417;padding:5px 10px;border-radius:6px;cursor:pointer}
.btn:hover{color:var(--ink);border-color:#3a4149}
.btn.pri{background:var(--accent);border-color:var(--accent);color:#04122e;font-weight:600}
.wrap{padding:18px 20px 56px;max-width:1420px}

/* ---- stat strip ---- */
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:18px}
.stat{padding:11px 14px;border-right:1px solid var(--line);background:var(--panel)}
.stat:last-child{border-right:0}
.stat .k{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:5px}
.stat .v{font:600 19px/1 var(--mono);letter-spacing:-.02em}
.stat .s{font-size:11px;color:var(--ink-faint);margin-top:4px}
.pos{color:var(--pos)} .neg{color:var(--neg)} .warn{color:var(--warn)}

/* ---- filter bar ---- */
.filters{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.search{flex:1;min-width:200px;position:relative}
.search input{width:100%;background:var(--panel);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:6px 10px 6px 28px;font-size:12.5px;outline:none}
.search svg{position:absolute;left:8px;top:7px;opacity:.5}
.sel{background:var(--panel);border:1px solid var(--line);border-radius:6px;color:var(--ink-dim);padding:6px 8px;font-size:12px}
.chipx{display:inline-flex;align-items:center;gap:6px;background:var(--accent-dim);border:1px solid #33507f;color:#cfe0ff;border-radius:5px;padding:4px 7px;font-size:11.5px}
.chipx b{font-weight:600}

/* ---- table ---- */
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.tblbox{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel)}
.tbl th{
  text-align:left;font:600 10.5px ui-sans-serif;letter-spacing:.07em;text-transform:uppercase;
  color:var(--ink-faint);padding:8px 12px;border-bottom:1px solid var(--line);white-space:nowrap;background:#0c0e10
}
.tbl th.n,.tbl td.n{text-align:right;font-family:var(--mono)}
.tbl td{padding:8px 12px;border-bottom:1px solid #15181b;vertical-align:middle}
.tbl tr:last-child td{border-bottom:0}
.tbl tbody tr:hover{background:#121518}
.tbl td.mono{font-family:var(--mono);color:var(--ink-dim)}
.tbl .name{font-weight:500}
.sortable::after{content:"";margin-left:5px;opacity:.35}
.sorted::after{content:"↓";opacity:.9;color:var(--accent)}
.tfoot td{background:#0c0e10;font-weight:600;font-family:var(--mono);border-top:1px solid var(--line-strong)}

/* ---- tags ---- */
.tag{display:inline-block;font:500 10.5px ui-sans-serif;padding:2px 6px;border-radius:4px;border:1px solid;white-space:nowrap}
.t-cap{color:#c9a6ff;border-color:#3d2d5c;background:#1c1526}
.t-rev{color:var(--warn);border-color:#4a3a12;background:#221b0c}
.t-job{color:#7fd3c1;border-color:#1f4a42;background:#0e211e}
.t-ok{color:var(--pos);border-color:#1c4523;background:#0e1f12}

/* ---- panels / detail ---- */
.cols{display:grid;grid-template-columns:1fr 340px;gap:16px;align-items:start}
.panel{border:1px solid var(--line);border-radius:8px;background:var(--panel)}
.panel h3{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-faint);padding:10px 14px;border-bottom:1px solid var(--line);font-weight:600}
.panel .body{padding:14px}
.kv{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #15181b;font-size:12.5px}
.kv:last-child{border-bottom:0}
.kv dt{color:var(--ink-faint)}
.kv dd{font-family:var(--mono)}
.big{font:600 30px/1 var(--mono);letter-spacing:-.025em;margin:2px 0 6px}
.sub{color:var(--ink-faint);font-size:12px}
.bar{height:4px;border-radius:2px;background:#1b1f23;overflow:hidden;margin:10px 0 6px;display:flex}
.bar i{display:block;height:100%}
.legend{display:flex;gap:14px;font-size:11.5px;color:var(--ink-dim);flex-wrap:wrap}
.legend i{display:inline-block;width:7px;height:7px;border-radius:2px;margin-right:5px}

/* ---- form ---- */
.form{display:grid;gap:12px;max-width:560px}
.f label{display:block;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:5px}
.f input,.f select,.f textarea{width:100%;background:#0c0e10;border:1px solid var(--line-strong);border-radius:6px;color:var(--ink);padding:8px 10px;font-size:13px;outline:none;font-family:inherit}
.f input:focus{border-color:var(--accent)}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.hint{font-size:11.5px;color:var(--ink-faint);margin-top:5px}
.seg{display:inline-flex;border:1px solid var(--line-strong);border-radius:6px;overflow:hidden}
.seg a{padding:6px 11px;font-size:12px;color:var(--ink-dim);border-right:1px solid var(--line-strong)}
.seg a:last-child{border-right:0}
.seg a.on{background:#16191d;color:var(--ink)}
.note{border-left:2px solid var(--accent);background:#0e1319;padding:9px 12px;border-radius:0 6px 6px 0;font-size:12px;color:var(--ink-dim);margin:12px 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
h2.sec{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);margin:22px 0 9px;font-weight:600}
@media(max-width:960px){.app{grid-template-columns:1fr}.rail{position:static;height:auto;flex-direction:row;overflow-x:auto;align-items:center}.navgrp{flex-direction:row}.navgrp h6,.railfoot,.nav .ct{display:none}.cols,.grid2,.grid3{grid-template-columns:1fr}}
`;

const ico = {
  home: '<path d="M2 6.5 7 2l5 4.5V12a1 1 0 0 1-1 1H8V9.5H6V13H3a1 1 0 0 1-1-1z"/>',
  rows: '<path d="M1.5 3h11M1.5 7h11M1.5 11h7"/>',
  home2: '<path d="M2 12V5l5-3 5 3v7"/><path d="M5.5 12V8h3v4"/>',
  doc: '<path d="M3 1.5h5l3 3V12a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 3 12z"/><path d="M8 1.5V5h3"/>',
  cal: '<rect x="2" y="3" width="10" height="9.5" rx="1"/><path d="M2 6h10M5 1.5v3M9 1.5v3"/>',
  users: '<circle cx="5" cy="5" r="2"/><path d="M1.5 12c0-2 1.6-3.2 3.5-3.2S8.5 10 8.5 12"/><circle cx="10.5" cy="5.5" r="1.6"/>',
  tag: '<path d="M2 2h4.5L12 7.5 7.5 12 2 6.5z"/><circle cx="4.5" cy="4.5" r=".8"/>',
  gear: '<circle cx="7" cy="7" r="2.2"/><path d="M7 1v1.6M7 11.4V13M13 7h-1.6M2.6 7H1M11.2 2.8l-1.1 1.1M3.9 10.1l-1.1 1.1M11.2 11.2l-1.1-1.1M3.9 3.9 2.8 2.8"/>',
  plus: '<path d="M7 2.5v9M2.5 7h9"/>',
};

const svg = (d) =>
  `<svg class="ic" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const NAV = [
  { g: 'Review', items: [
    ['index.html', 'Overview', ico.home, ''],
    ['entries.html', 'Expenses', ico.rows, '78'],
    ['income.html', 'Rent', ico.doc, '13'],
    ['time.html', 'Time', ico.cal, '0'],
    ['trips.html', 'Mileage', ico.tag, '5'],
  ]},
  { g: 'Records', items: [
    ['properties.html', 'Properties', ico.home2, '4'],
    ['jobs.html', 'Jobs', ico.tag, '2'],
    ['people.html', 'People', ico.users, '6'],
  ]},
  { g: 'Year end', items: [
    ['year-end.html', 'Close 2025', ico.cal, ''],
    ['reports.html', 'Reports', ico.doc, '12'],
    ['settings.html', 'Settings', ico.gear, ''],
  ]},
];

const rail = (active) => `
<aside class="rail">
  <div class="brand"><span class="dot"></span><b>Ledger</b></div>
  <div class="yr">
    <a href="#" class="on">2025</a><a href="#">2024</a><a href="#">2023</a>
  </div>
  ${NAV.map((grp) => `
  <nav class="navgrp">
    <h6>${grp.g}</h6>
    ${grp.items.map(([href, label, icon, ct]) => `
    <a class="nav${href === active ? ' on' : ''}" href="${href}">${svg(icon)}<span>${label}</span>${ct ? `<span class="ct">${ct}</span>` : ''}</a>`).join('')}
  </nav>`).join('')}
  <div class="railfoot">Amit Gandhi · Residential portfolio</div>
</aside>`;

const page = (file, title, crumb, body, actions = '') => {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Ledger</title><style>${CSS}</style>
</head><body>
<div class="app">
${rail(file)}
<div class="main">
  <header class="top">
    <h1>${title}</h1>
    ${crumb ? `<span class="crumb">${crumb}</span>` : ''}
    <span class="spacer"></span>
    ${actions || '<span class="kbd">⌘K</span>'}
  </header>
  <div class="wrap">${body}</div>
</div>
</div></body></html>`;
  writeFileSync(resolve(out, file), html, 'utf8');
};

/* ---------------- pages ---------------- */

page('index.html', 'Overview', '2025 · cash basis', `
<div class="strip">
  <div class="stat"><div class="k">Rent received</div><div class="v">$66,127.00</div><div class="s">13 receipts · 4 properties</div></div>
  <div class="stat"><div class="k">Deductible</div><div class="v">$55,085.53</div><div class="s">78 expenses paid</div></div>
  <div class="stat"><div class="k">Net</div><div class="v pos">+$11,041.47</div><div class="s">before depreciation</div></div>
  <div class="stat"><div class="k">Capital additions</div><div class="v">$20,869.57</div><div class="s">not deducted</div></div>
  <div class="stat"><div class="k">Hours logged</div><div class="v warn">0.0</div><div class="s">of 250 target</div></div>
</div>

<div class="cols">
  <div>
    <h2 class="sec">Per property</h2>
    <div class="tblbox">
      <table class="tbl">
        <thead><tr><th>Property</th><th>Available</th><th class="n">Rent</th><th class="n">Deductible</th><th class="n">Net</th><th class="n">Capital</th></tr></thead>
        <tbody>
          <tr><td class="name">Kettlewell</td><td class="mono">2019-10-01</td><td class="n">$25,400.00</td><td class="n">$12,576.00</td><td class="n pos">+$12,824.00</td><td class="n">—</td></tr>
          <tr><td class="name">Westmill</td><td class="mono">2023-02-01</td><td class="n">$26,489.00</td><td class="n">$21,966.47</td><td class="n pos">+$4,522.53</td><td class="n">$970.00</td></tr>
          <tr><td class="name">Arbordale</td><td class="mono">2025-01-28</td><td class="n">$14,238.00</td><td class="n">$14,897.52</td><td class="n neg">−$659.52</td><td class="n">$10,775.57</td></tr>
          <tr><td class="name">Creedmore</td><td class="mono">2025-12-02</td><td class="n">$0.00</td><td class="n">$5,645.54</td><td class="n neg">−$5,645.54</td><td class="n">$9,124.00</td></tr>
        </tbody>
        <tfoot class="tfoot"><tr><td colspan="2">Portfolio</td><td class="n">$66,127.00</td><td class="n">$55,085.53</td><td class="n pos">+$11,041.47</td><td class="n">$20,869.57</td></tr></tfoot>
      </table>
    </div>

    <h2 class="sec">Needs a decision</h2>
    <div class="tblbox">
      <table class="tbl">
        <tbody>
          <tr><td><span class="tag t-rev">Review</span></td><td class="name">3 expenses on physical work</td><td class="mono">no repair-or-improvement answer</td><td class="n"><a class="btn" href="entries.html">Resolve</a></td></tr>
          <tr><td><span class="tag t-rev">W-9</span></td><td class="name">4 payments over $600</td><td class="mono">no contractor named</td><td class="n"><a class="btn" href="people.html">Resolve</a></td></tr>
          <tr><td><span class="tag t-cap">Scheduled</span></td><td class="name">$5,744.00 due 2026-01-15</td><td class="mono">Big Alz · INV011307</td><td class="n"><a class="btn" href="expense.html">Open</a></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div>
    <div class="panel">
      <h3>Cash in the year</h3>
      <div class="body">
        <div class="big pos">+$11,041.47</div>
        <div class="sub">Rent banked less what actually left the bank</div>
        <div class="bar">
          <i style="width:44%;background:#3fb950"></i><i style="width:31%;background:#5b8cff"></i><i style="width:25%;background:#8957e5"></i>
        </div>
        <div class="legend">
          <span><i style="background:#3fb950"></i>Ledger 55%</span>
          <span><i style="background:#5b8cff"></i>1098 31%</span>
          <span><i style="background:#8957e5"></i>Capital 25%</span>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h3>Year-end checklist</h3>
      <div class="body">
        <dl>
          <div class="kv"><dt>1098s entered</dt><dd class="pos">4 / 4</dd></div>
          <div class="kv"><dt>Rent vs 1099</dt><dd class="pos">2 / 2 square</dd></div>
          <div class="kv"><dt>Scheduled payments</dt><dd class="warn">1 open</dd></div>
          <div class="kv"><dt>CPA figures</dt><dd class="sub">not yet</dd></div>
        </dl>
        <a class="btn pri" style="display:block;text-align:center;margin-top:12px" href="year-end.html">Open year-end</a>
      </div>
    </div>
  </div>
</div>`, '<a class="btn pri" href="log.html">+ Log</a>');

const expenseRows = [
  ['2025-01-01', 'Sulekha Roommates', 'Kettlewell', 'Advertising', '$89.10', '$89.10', ''],
  ['2025-01-06', 'Cleaning services', 'Westmill', 'Cleaning', '$430.00', '$430.00', ''],
  ['2025-01-21', 'Big Alz Handyman', 'Kettlewell', 'Repairs', '$740.00', '$740.00', ''],
  ['2025-01-27', 'Big Alz Handyman', 'Westmill', 'Repairs', '$6,510.53', '$6,510.53', '<span class="tag t-job">Job</span>'],
  ['2025-04-28', 'Facebook — Refrigerator', 'Westmill', 'Other', '$480.00', '$480.00', '<span class="tag t-cap">Capital</span>'],
  ['2025-05-20', 'Facebook — Furniture', 'Arbordale', 'Other', '$6,500.00', '$6,500.00', '<span class="tag t-cap">Capital</span>'],
  ['2025-11-18', 'Closing — hazard insurance', 'Creedmore', 'Insurance', '$1,072.56', '$1,072.56', ''],
  ['2025-11-26', 'The Home Depot — LVP', 'Creedmore', 'Other', '$6,959.53', '$6,959.53', '<span class="tag t-cap">Capital</span>'],
  ['2025-11-28', 'Big Alz Handyman', 'Creedmore', 'Repairs', '$8,244.00', '$2,500.00', '<span class="tag t-rev">Part paid</span>'],
  ['2025-12-07', 'Sherwin-Williams', 'Creedmore', 'Other', '$2,164.47', '$2,164.47', '<span class="tag t-cap">Capital</span>'],
  ['2025-12-31', 'Mileage — operating', 'Arbordale', 'Other', '$568.47', '$568.47', ''],
  ['2025-12-31', 'Mileage — acquisition', 'Creedmore', 'Other', '$181.72', '$181.72', '<span class="tag t-cap">Basis</span>'],
];

page('entries.html', 'Expenses', '78 records · 2025', `
<div class="filters">
  <div class="search">
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="4.2"/><path d="M9.2 9.2 12.5 12.5"/></svg>
    <input placeholder="Search vendor, note, category…" value="">
  </div>
  <select class="sel"><option>All properties</option><option>Kettlewell</option><option>Westmill</option><option>Arbordale</option><option>Creedmore</option></select>
  <select class="sel"><option>All lines</option><option>Repairs</option><option>Supplies</option><option>Other</option></select>
  <select class="sel"><option>Any status</option><option>Needs review</option><option>Capital</option><option>Part paid</option></select>
  <span class="chipx"><b>78</b> shown</span>
</div>

<div class="strip" style="margin-bottom:12px">
  <div class="stat"><div class="k">Rows</div><div class="v">78</div></div>
  <div class="stat"><div class="k">Invoiced</div><div class="v">$61,050.20</div></div>
  <div class="stat"><div class="k">Paid in 2025</div><div class="v">$55,306.20</div></div>
  <div class="stat"><div class="k">Capital of that</div><div class="v">$20,869.57</div></div>
</div>

<div class="tblbox">
  <table class="tbl">
    <thead><tr>
      <th class="sortable sorted">Date</th><th class="sortable">Vendor</th><th class="sortable">Property</th>
      <th class="sortable">Line</th><th class="n sortable">Invoiced</th><th class="n sortable">Paid</th><th>Flags</th><th></th>
    </tr></thead>
    <tbody>
      ${expenseRows.map((r) => `<tr>
        <td class="mono">${r[0]}</td>
        <td class="name"><a href="expense.html">${r[1]}</a></td>
        <td>${r[2]}</td><td>${r[3]}</td>
        <td class="n">${r[4]}</td>
        <td class="n${r[4] !== r[5] ? ' warn' : ''}">${r[5]}</td>
        <td>${r[6]}</td>
        <td class="n"><a class="btn" href="expense.html">Open</a></td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>
<p class="hint" style="margin-top:10px">Showing 12 of 78 · totals above follow the filter</p>`,
'<a class="btn" href="reports.html">Export CSV</a> <a class="btn pri" href="log.html">+ Expense</a>');

page('expense.html', 'Big Alz Handyman', 'Expense · 2025-11-28', `
<div class="cols">
  <div>
    <div class="panel">
      <h3>Invoice</h3>
      <div class="body">
        <div class="big">$8,244.00</div>
        <div class="sub">INV011307 · Painting + LVP flooring · Creedmore ct</div>
        <div class="bar" style="margin-top:16px">
          <i style="width:30.3%;background:#3fb950"></i><i style="width:69.7%;background:#d29922"></i>
        </div>
        <div class="legend">
          <span><i style="background:#3fb950"></i>$2,500.00 paid in 2025</span>
          <span><i style="background:#d29922"></i>$5,744.00 scheduled 2026</span>
        </div>
        <div class="note">The ledger only ever recorded the $2,500 payment, so the invoice total was invisible in it. 2025 deducts $2,500 — not $8,244.</div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h3>Payments</h3>
      <table class="tbl">
        <thead><tr><th>Date</th><th>Status</th><th>Method</th><th class="n">Amount</th><th></th></tr></thead>
        <tbody>
          <tr><td class="mono">2025-11-28</td><td><span class="tag t-ok">Paid</span></td><td>Check</td><td class="n">$2,500.00</td><td class="n"><a class="btn">Correct</a></td></tr>
          <tr><td class="mono">2026-01-15</td><td><span class="tag t-rev">Scheduled</span></td><td>—</td><td class="n">$5,744.00</td><td class="n"><a class="btn">Confirm</a></td></tr>
        </tbody>
        <tfoot class="tfoot"><tr><td colspan="3">Accounted for</td><td class="n">$8,244.00</td><td></td></tr></tfoot>
      </table>
    </div>
  </div>

  <div>
    <div class="panel">
      <h3>Record</h3>
      <div class="body"><dl>
        <div class="kv"><dt>Property</dt><dd>Creedmore ct</dd></div>
        <div class="kv"><dt>Schedule E line</dt><dd>14 · Repairs</dd></div>
        <div class="kv"><dt>Classification</dt><dd class="warn">Needs review</dd></div>
        <div class="kv"><dt>Cost treatment</dt><dd>Acquisition</dd></div>
        <div class="kv"><dt>Contractor</dt><dd>Big Alz</dd></div>
        <div class="kv"><dt>Receipt</dt><dd class="pos">On file</dd></div>
        <div class="kv"><dt>Entered</dt><dd class="sub">Logged later</dd></div>
      </dl>
      <div class="note" style="margin-bottom:0">Spent before the property was available to rent on 2 December. Your CPA decides what happens to it.</div>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <h3>Related</h3>
      <div class="body">
        <p class="sub" style="margin-bottom:10px">Part of no job yet.</p>
        <div class="seg"><a href="#">+ Time</a><a href="#">+ Trip</a><a href="#">+ Expense</a></div>
      </div>
    </div>
  </div>
</div>`, '<a class="btn">Edit</a> <a class="btn">Delete</a>');

page('properties.html', 'Properties', '4 records', `
<div class="tblbox">
  <table class="tbl">
    <thead><tr><th>Property</th><th>Address</th><th>Acquired</th><th>Listed / available</th><th>First tenant</th><th>Managed by</th><th class="n">Basis</th></tr></thead>
    <tbody>
      <tr><td class="name"><a href="property.html">Kettlewell</a></td><td class="sub">16824 Kettlewell Lane, Charlotte NC</td><td class="mono">2018-05-10</td><td class="mono">2019-10-01</td><td class="mono sub">—</td><td>JKN Realty</td><td class="n sub">—</td></tr>
      <tr><td class="name"><a href="property.html">Westmill</a></td><td class="sub">17334 Westmill Ln, Charlotte NC</td><td class="mono">2019-09-11</td><td class="mono">2023-02-01</td><td class="mono sub">—</td><td>JKN Realty</td><td class="n sub">—</td></tr>
      <tr><td class="name"><a href="property.html">Arbordale</a></td><td class="sub">5120 Arbordale Way, Mt Holly NC</td><td class="mono sub">—</td><td class="mono">2025-01-28</td><td class="mono sub">—</td><td>Self-managed</td><td class="n sub">—</td></tr>
      <tr><td class="name"><a href="property.html">Creedmore</a></td><td class="sub">1109 Creedmore Ct, Charlotte NC</td><td class="mono sub">—</td><td class="mono">2025-12-02</td><td class="mono sub">—</td><td>JKN Realty</td><td class="n sub">—</td></tr>
    </tbody>
  </table>
</div>
<div class="note">A blank cell is the point: it is the fastest way to see which property is still missing the date depreciation starts from.</div>`,
'<a class="btn pri">+ Property</a>');

page('property.html', 'Creedmore ct', '1109 Creedmore Ct, Charlotte NC 28215', `
<div class="strip">
  <div class="stat"><div class="k">Acquired</div><div class="v" style="font-size:15px">—</div></div>
  <div class="stat"><div class="k">Listed / available</div><div class="v" style="font-size:15px">2025-12-02</div></div>
  <div class="stat"><div class="k">Purchase price</div><div class="v" style="font-size:15px">$378,500</div></div>
  <div class="stat"><div class="k">Land value</div><div class="v" style="font-size:15px">—</div></div>
  <div class="stat"><div class="k">Rent 2025</div><div class="v" style="font-size:15px">$0.00</div></div>
</div>
<div class="cols">
  <div>
    <div class="panel">
      <h3>Facts for the CPA</h3>
      <div class="body"><dl>
        <div class="kv"><dt>Closing costs</dt><dd>$5,204.57</dd></div>
        <div class="kv"><dt>Unadjusted basis</dt><dd class="sub">not set — CPA fills this</dd></div>
        <div class="kv"><dt>In-service evidence</dt><dd class="sub">not recorded</dd></div>
        <div class="kv"><dt>Was a personal residence</dt><dd>No</dd></div>
        <div class="kv"><dt>§469 activity</dt><dd class="sub">ungrouped</dd></div>
        <div class="kv"><dt>Ownership</dt><dd>100%</dd></div>
      </dl></div>
    </div>
    <div class="panel" style="margin-top:16px">
      <h3>Management history</h3>
      <table class="tbl">
        <tbody><tr><td>JKN Realty</td><td class="mono">2025-01-01 → now</td><td><span class="tag t-ok">Current</span></td></tr></tbody>
      </table>
    </div>
  </div>
  <div class="panel">
    <h3>2025 at a glance</h3>
    <div class="body"><dl>
      <div class="kv"><dt>Deductible</dt><dd>$5,645.54</dd></div>
      <div class="kv"><dt>Capital additions</dt><dd>$9,124.00</dd></div>
      <div class="kv"><dt>Mortgage interest</dt><dd>$631.82</dd></div>
      <div class="kv"><dt>Mileage</dt><dd>259.6 mi</dd></div>
      <div class="kv"><dt>Net</dt><dd class="neg">−$5,645.54</dd></div>
    </dl></div>
  </div>
</div>`, '<a class="btn">Edit details</a>');

page('year-end.html', 'Close 2025', 'four things, once a year', `
<h2 class="sec">1 · Mortgage &amp; escrow, from the 1098s</h2>
<div class="grid2">
  ${[['Kettlewell','Rocket Mortgage LLC','$4,919.11','$3,317.92','$886.50'],
     ['Westmill','JPMorgan Chase Bank, N.A.','$4,215.52','$4,097.75','$1,176.67'],
     ['Arbordale','Freedom Mortgage','$6,446.90','$3,312.30','$905.02'],
     ['Creedmore','loanDepot.com LLC','$631.82','—','—']]
    .map(([p,l,i,t,ins]) => `
  <div class="panel">
    <h3>${p}<span style="float:right;font-weight:400;text-transform:none;letter-spacing:0">1 lender</span></h3>
    <div class="body">
      <div class="sub" style="margin-bottom:10px">${l}</div>
      <dl>
        <div class="kv"><dt>Interest · box 1</dt><dd>${i}</dd></div>
        <div class="kv"><dt>Property tax · box 10</dt><dd>${t}</dd></div>
        <div class="kv"><dt>Insurance from escrow</dt><dd>${ins}</dd></div>
      </dl>
      <div class="note" style="font-size:11.5px">Box 10 was blank. Read from the supplemental block below the numbered boxes.</div>
      <a class="btn" style="margin-top:4px">Edit</a> <a class="btn">+ Add lender</a>
    </div>
  </div>`).join('')}
</div>

<h2 class="sec">2 · Rent banked vs the 1099</h2>
<div class="tblbox">
  <table class="tbl">
    <thead><tr><th>Property</th><th class="n">Banked</th><th class="n">1099 box 1</th><th class="n">Explained</th><th class="n">Residual</th><th>Status</th></tr></thead>
    <tbody>
      <tr><td class="name">Kettlewell</td><td class="n">$25,400.00</td><td class="n">$26,240.00</td><td class="n">$840.00</td><td class="n">$0.00</td><td><span class="tag t-ok">Squares</span></td></tr>
      <tr><td class="name">Westmill</td><td class="n">$26,489.00</td><td class="n">$27,910.00</td><td class="n">$1,421.00</td><td class="n">$0.00</td><td><span class="tag t-ok">Squares</span></td></tr>
      <tr><td class="name">Arbordale</td><td class="n">$14,238.00</td><td class="n sub">—</td><td class="n sub">—</td><td class="n sub">—</td><td><span class="tag t-job">Self-managed</span></td></tr>
    </tbody>
  </table>
</div>

<h2 class="sec">3 · Payments still only planned</h2>
<div class="tblbox">
  <table class="tbl">
    <thead><tr><th>Due</th><th>Vendor</th><th>Invoice</th><th class="n">Amount</th><th></th></tr></thead>
    <tbody><tr><td class="mono">2026-01-15</td><td class="name">Big Alz Handyman</td><td class="sub">INV011307 · $8,244.00 total</td><td class="n">$5,744.00</td><td class="n"><a class="btn pri">It went out</a></td></tr></tbody>
  </table>
</div>

<h2 class="sec">4 · Figures from your CPA</h2>
<div class="panel"><div class="body">
  <p class="sub">Nothing entered for 2025 yet. Depreciation, a suspended loss carried forward, a component schedule — whatever came back goes here rather than being worked out.</p>
  <a class="btn pri" style="margin-top:10px">+ Add a figure</a>
</div></div>`);

page('reports.html', 'Reports', 'Schedule E · 2025', `
<div class="tblbox">
  <table class="tbl">
    <thead><tr><th>Property</th><th class="n">Rent</th><th class="n">Ledger</th><th class="n">1098</th><th class="n">CPA</th><th class="n">Net</th><th class="n">Capital</th></tr></thead>
    <tbody>
      <tr><td class="name">Kettlewell</td><td class="n">$25,400.00</td><td class="n">$3,452.47</td><td class="n">$9,123.53</td><td class="n sub">—</td><td class="n pos">+$12,824.00</td><td class="n sub">—</td></tr>
      <tr><td class="name">Westmill</td><td class="n">$26,489.00</td><td class="n">$12,476.53</td><td class="n">$9,489.94</td><td class="n sub">—</td><td class="n pos">+$4,522.53</td><td class="n">$970.00</td></tr>
      <tr><td class="name">Arbordale</td><td class="n">$14,238.00</td><td class="n">$4,233.30</td><td class="n">$10,664.22</td><td class="n sub">—</td><td class="n neg">−$659.52</td><td class="n">$10,775.57</td></tr>
      <tr><td class="name">Creedmore</td><td class="n">$0.00</td><td class="n">$5,013.72</td><td class="n">$631.82</td><td class="n sub">—</td><td class="n neg">−$5,645.54</td><td class="n">$9,124.00</td></tr>
    </tbody>
    <tfoot class="tfoot"><tr><td>Portfolio</td><td class="n">$66,127.00</td><td class="n">$25,176.02</td><td class="n">$29,909.51</td><td class="n">—</td><td class="n pos">+$11,041.47</td><td class="n">$20,869.57</td></tr></tfoot>
  </table>
</div>
<div class="note">Amounts are what actually left the bank in 2025, not what was invoiced. Capital sits outside the net — it reaches it only as your CPA's depreciation figure on line 18.</div>

<h2 class="sec">Download for your CPA</h2>
<div class="grid3">
${['Schedule E summary','Every expense','Every payment','Rent received','Rent vs 1099','Time log','Mileage log','Jobs rolled up','Contractors &amp; W-9','Mortgage &amp; escrow','CPA figures','Property facts']
  .map((n,i) => `<a class="panel" href="#" style="display:block"><div class="body"><div style="font-weight:500">${n}</div><div class="sub" style="font-family:var(--mono);margin-top:3px">2025-${['schedule-e','expense-detail','payments','income-detail','rent-reconciliation','time-log','mileage-log','jobs','contractors','loan-years','cpa-figures','property-facts'][i]}.csv</div></div></a>`).join('')}
</div>`);

page('jobs.html', 'Jobs', 'time, miles and money on one task', `
<div class="tblbox">
  <table class="tbl">
    <thead><tr><th>Job</th><th>Property</th><th class="n">Records</th><th class="n">Hours</th><th class="n">Miles</th><th class="n">Paid</th></tr></thead>
    <tbody>
      <tr><td class="name"><a href="#">Laptop for rental bookkeeping</a></td><td>Portfolio</td><td class="n">5</td><td class="n">2.00</td><td class="n">18.4</td><td class="n">$1,429.00</td></tr>
      <tr><td class="name"><a href="#">Creedmore make-ready</a></td><td>Creedmore ct</td><td class="n">7</td><td class="n">0.00</td><td class="n">259.6</td><td class="n">$9,124.00</td></tr>
    </tbody>
  </table>
</div>
<div class="note">A job is never created empty. It is born from a record you already saved, and deleting it leaves every record standing.</div>`);

page('log.html', 'Log an expense', 'five fields', `
<div class="seg" style="margin-bottom:18px"><a href="#" class="on">Expense</a><a href="#">Time</a><a href="#">Trip</a><a href="#">Rent</a></div>
<form class="form">
  <div class="f"><label>How much</label><input value="124.99" style="font-family:var(--mono);font-size:20px;padding:12px"></div>
  <div class="f"><label>Paid to</label><input placeholder="Home Depot"></div>
  <div class="f"><label>Which Schedule E line</label>
    <select><option>Choose…</option><option>5 · Advertising</option><option>14 · Repairs</option><option selected>15 · Supplies</option></select>
    <p class="hint">Materials, parts, consumables.</p>
  </div>
  <div class="f"><label>Which property</label>
    <div class="seg"><a href="#">Kettlewell</a><a href="#">Westmill</a><a href="#" class="on">Arbordale</a><a href="#">Creedmore</a></div>
  </div>
  <div class="row2">
    <div class="f"><label>When</label><input type="date" value="2025-12-31"></div>
    <div class="f"><label>Contractor (optional)</label><select><option>Not a contractor</option><option>Big Alz</option></select></div>
  </div>
  <div class="note">Spend on physical work needs a repair-or-improvement answer before year end. It will sit in the review list until then.</div>
  <button class="btn pri" style="padding:10px">Save expense</button>
</form>`);

page('income.html', 'Rent received', '13 records · 2025', `
<div class="filters">
  <div class="search"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="4.2"/><path d="M9.2 9.2 12.5 12.5"/></svg><input placeholder="Property, source, note…"></div>
  <select class="sel"><option>All properties</option></select>
  <select class="sel"><option>All sources</option><option>Property manager</option><option>Direct from tenant</option></select>
</div>
<div class="strip" style="margin-bottom:12px">
  <div class="stat"><div class="k">Rows</div><div class="v">13</div></div>
  <div class="stat"><div class="k">Received in 2025</div><div class="v">$66,127.00</div></div>
</div>
<div class="tblbox"><table class="tbl">
  <thead><tr><th class="sortable sorted">Date</th><th>Property</th><th>Source</th><th>Note</th><th class="n">Amount</th></tr></thead>
  <tbody>
    <tr><td class="mono">2025-05-06</td><td>Arbordale</td><td>Direct from tenant</td><td class="sub">Rent</td><td class="n">$1,860.00</td></tr>
    <tr><td class="mono">2025-06-30</td><td>Arbordale</td><td>Other</td><td class="sub">One-time</td><td class="n">$496.00</td></tr>
    <tr><td class="mono">2025-07-02</td><td>Arbordale</td><td>Direct from tenant</td><td class="sub">Prorated first month</td><td class="n">$1,197.00</td></tr>
    <tr><td class="mono">2025-12-31</td><td>Kettlewell</td><td>Property manager</td><td class="sub">Year total disbursed by JKN Realty</td><td class="n">$25,400.00</td></tr>
    <tr><td class="mono">2025-12-31</td><td>Westmill</td><td>Property manager</td><td class="sub">Year total disbursed by JKN Realty</td><td class="n">$26,489.00</td></tr>
  </tbody>
</table></div>`, '<a class="btn pri" href="log.html">+ Rent</a>');

page('time.html', 'Time', '0 entries · 2025', `
<div class="panel"><div class="body" style="text-align:center;padding:56px 20px">
  <div class="big warn" style="font-size:38px">0.0</div>
  <p class="sub" style="max-width:440px;margin:6px auto 0">No time logged in 2025. The spreadsheet never captured any, which is the single biggest gap this app exists to close — the 250-hour safe harbour needs a contemporaneous log, and a reconstruction after the fact is weaker evidence.</p>
  <a class="btn pri" style="margin-top:18px;display:inline-block" href="log.html">Log time</a>
</div></div>`);

page('trips.html', 'Mileage', '5 records · 1,252.5 miles', `
<div class="strip" style="margin-bottom:12px">
  <div class="stat"><div class="k">Trips</div><div class="v">5</div></div>
  <div class="stat"><div class="k">Miles</div><div class="v">1,252.5</div></div>
  <div class="stat"><div class="k">Operating</div><div class="v">992.9</div></div>
  <div class="stat"><div class="k">Acquisition side</div><div class="v warn">259.6</div></div>
</div>
<div class="tblbox"><table class="tbl">
  <thead><tr><th>Date</th><th>Route</th><th>Purpose</th><th>Property</th><th>Side</th><th class="n">Miles</th></tr></thead>
  <tbody>
    <tr><td class="mono">2025-12-31</td><td>Various → Various</td><td class="sub">Year total, 37 trips</td><td>Arbordale</td><td><span class="tag t-ok">Operating</span></td><td class="n">812.1</td></tr>
    <tr><td class="mono">2025-12-31</td><td>Various → Various</td><td class="sub">Year total, 27 trips</td><td>Westmill</td><td><span class="tag t-ok">Operating</span></td><td class="n">103.3</td></tr>
    <tr><td class="mono">2025-12-31</td><td>Various → Various</td><td class="sub">Year total, 9 trips</td><td>Kettlewell</td><td><span class="tag t-ok">Operating</span></td><td class="n">58.6</td></tr>
    <tr><td class="mono">2025-12-31</td><td>Various → Various</td><td class="sub">iPad purchase, 2 trips</td><td>Portfolio</td><td><span class="tag t-ok">Operating</span></td><td class="n">18.9</td></tr>
    <tr><td class="mono">2025-12-31</td><td>Various → Various</td><td class="sub">Due diligence, showings</td><td>Creedmore</td><td><span class="tag t-cap">Acquisition</span></td><td class="n">259.6</td></tr>
  </tbody>
</table></div>
<div class="note">Aggregated from the 2025 MileIQ log, not single journeys. Next year they get captured as they happen.</div>`);

page('people.html', 'People', 'household and contractors', `
<h2 class="sec">Household</h2>
<div class="tblbox"><table class="tbl">
  <tbody><tr><td class="name">Amit Gandhi</td><td>Owner</td><td class="sub">amitgandhi23@gmail.com</td><td class="n"><a class="btn">Edit</a></td></tr></tbody>
</table></div>

<h2 class="sec">Contractors &amp; managers</h2>
<div class="tblbox"><table class="tbl">
  <thead><tr><th>Name</th><th>Type</th><th class="n">Paid in 2025</th><th>W-9</th><th>Tax ID</th><th></th></tr></thead>
  <tbody>
    <tr><td class="name">JKN Realty</td><td>Property manager</td><td class="n sub">—</td><td><span class="tag t-ok">On file</span></td><td><span class="tag t-ok">Yes</span></td><td class="n"><a class="btn">Edit</a></td></tr>
    <tr><td class="name">Big Alz Moving n Handyman</td><td>Contractor</td><td class="n">$10,744.53</td><td><span class="tag t-rev">Missing</span></td><td><span class="tag t-rev">No</span></td><td class="n"><a class="btn">Edit</a></td></tr>
    <tr><td class="name">Community Unity Connections</td><td>Contractor</td><td class="n">$195.00</td><td><span class="tag t-ok">On file</span></td><td><span class="tag t-ok">Yes</span></td><td class="n"><a class="btn">Edit</a></td></tr>
  </tbody>
</table></div>
<div class="note">2025 threshold is $600. From 2026 it is $2,000 under OBBBA — the same payment answers differently depending on the year.</div>`);

page('settings.html', 'Settings', '', `
<div class="grid2">
  <div class="panel"><h3>Enterprise</h3><div class="body"><dl>
    <div class="kv"><dt>Name</dt><dd>Residential portfolio</dd></div>
    <div class="kv"><dt>Type</dt><dd>Residential</dd></div>
    <div class="kv"><dt>Active tax year</dt><dd>2026</dd></div>
    <div class="kv"><dt>Time zone</dt><dd>America/New_York</dd></div>
  </dl></div></div>
  <div class="panel"><h3>Rules in force for 2025</h3><div class="body"><dl>
    <div class="kv"><dt>1099 reporting threshold</dt><dd>$600.00</dd></div>
    <div class="kv"><dt>Safe harbour target</dt><dd>250 hours</dd></div>
    <div class="kv"><dt>De minimis invoice</dt><dd>$2,500.00</dd></div>
    <div class="kv"><dt>Rules version</dt><dd>2026.1</dd></div>
  </dl>
  <div class="note" style="margin-bottom:0">Every figure is keyed to the tax year. 2026 raises the 1099 threshold to $2,000 under OBBBA, and the app applies whichever year you are looking at.</div>
  </div></div>
</div>
<h2 class="sec">Data</h2>
<div class="panel"><div class="body">
  <dl>
    <div class="kv"><dt>Integrity check</dt><dd class="pos">No errors · 3 warnings</dd></div>
    <div class="kv"><dt>2025 import</dt><dd class="sub">78 expenses, 13 receipts, 5 mileage rows</dd></div>
  </dl>
  <a class="btn" style="margin-top:10px">Run integrity check</a> <a class="btn">Export everything</a>
</div></div>`);

console.log('concept-1 written to', out);
