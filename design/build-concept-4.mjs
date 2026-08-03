/**
 * Concept 4 — "Soft". The Habit-Tracker design language, translated to dark.
 *
 * Taken from C:\\Repos\\Habit-Tracker: rounded-2xl cards, a violet accent,
 * generous padding, soft borders instead of hard rules, and pastel-tinted
 * status pills that carry meaning by hue rather than by weight. In that app the
 * palette is light slate on white; here the same shapes sit on a deep neutral,
 * with the tints kept low-saturation so they read as calm rather than neon.
 *
 * Thesis: warmth. The other three are instruments; this one is meant to feel
 * pleasant to open on a Tuesday, which matters for a tool whose whole risk is
 * being abandoned.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), 'concept-4');
mkdirSync(out, { recursive: true });

const CSS = `
:root{
  --bg:#0e0e13; --card:#17171f; --card2:#1e1e28; --line:#26263230;
  --border:#272733; --ink:#eceaf3; --dim:#9b98ad; --faint:#6c6a7e;
  --violet:#a78bfa; --violet-bg:#2a2140; --violet-br:#3d3060;
  --green:#6ee7a8; --green-bg:#12301f;
  --amber:#fcd34d; --amber-bg:#332608;
  --rose:#fda4af; --rose-bg:#3a1620;
  --sky:#7dd3fc; --sky-bg:#0c2a38;
  --r:18px;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:var(--bg);color:var(--ink);font:14.5px/1.6 ui-rounded,-apple-system,"SF Pro Rounded","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:92px}
a{color:inherit;text-decoration:none}
.wrap{max-width:560px;margin:0 auto;padding:0 18px}
@media(min-width:980px){.wrap{max-width:1080px}}

/* header */
.top{display:flex;align-items:center;gap:12px;padding:22px 0 8px}
.top .av{width:40px;height:40px;border-radius:14px;background:linear-gradient(140deg,#a78bfa,#f0abfc);display:grid;place-items:center;font:700 14px/1 sans-serif;color:#2a1140}
.top h1{font-size:21px;font-weight:700;letter-spacing:-.02em}
.top p{font-size:13.5px;color:var(--faint);margin-top:1px}
.top .sp{margin-left:auto}
.yrbtn{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:9px 15px;font-weight:600;font-size:13.5px;color:var(--violet)}

/* cards */
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,.3)}
.card.pad0{padding:0;overflow:hidden}
.card h2{font-size:15px;font-weight:700;margin-bottom:4px;letter-spacing:-.01em}
.card .cap{font-size:13px;color:var(--faint);margin-bottom:16px;line-height:1.5}
.grid{display:grid;gap:14px}
@media(min-width:980px){.grid.two{grid-template-columns:1fr 1fr}.grid.three{grid-template-columns:repeat(3,1fr)}.grid.side{grid-template-columns:1fr 360px;align-items:start}}

/* hero number */
.hero{text-align:center;padding:12px 0 6px}
.hero .n{font:700 42px/1 ui-rounded,sans-serif;letter-spacing:-.035em}
.hero .l{font-size:13.5px;color:var(--faint);margin-top:9px}
.ring{width:132px;height:132px;margin:0 auto 6px;border-radius:50%;display:grid;place-items:center;
  background:conic-gradient(var(--violet) 0turn,var(--violet) .0turn,var(--card2) 0turn)}
.ring.p0{background:conic-gradient(var(--amber) 0 .004turn,var(--card2) 0)}
.ring .in{width:112px;height:112px;border-radius:50%;background:var(--card);display:grid;place-items:center;text-align:center}
.ring b{display:block;font:700 26px/1 sans-serif;letter-spacing:-.02em}
.ring span{font-size:11.5px;color:var(--faint)}

/* stat tiles */
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(min-width:980px){.tiles{grid-template-columns:repeat(4,1fr)}}
.tile{background:var(--card2);border-radius:15px;padding:15px}
.tile .k{font-size:12.5px;color:var(--faint)}
.tile .v{font:700 21px/1.2 sans-serif;margin-top:6px;letter-spacing:-.02em}

/* rows */
.item{display:flex;align-items:center;gap:14px;padding:15px 20px;border-bottom:1px solid var(--border)}
.item:last-child{border:0}
.item .ic{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;font-size:17px;flex:none}
.item .tx{flex:1;min-width:0}
.item .tx b{display:block;font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item .tx span{font-size:13px;color:var(--faint);display:block;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item .rt{text-align:right;flex:none}
.item .rt b{font-weight:700;font-size:14.5px;font-variant-numeric:tabular-nums}
.item .rt span{font-size:12px;color:var(--faint);display:block;margin-top:2px}

/* pills */
.pill{display:inline-block;font-size:12px;font-weight:600;padding:4px 11px;border-radius:100px}
.p-v{background:var(--violet-bg);color:var(--violet)}
.p-g{background:var(--green-bg);color:var(--green)}
.p-a{background:var(--amber-bg);color:var(--amber)}
.p-r{background:var(--rose-bg);color:var(--rose)}
.p-s{background:var(--sky-bg);color:var(--sky)}
.p-d{background:var(--card2);color:var(--dim)}

/* segmented */
.segs{display:flex;gap:8px;overflow-x:auto;padding:6px 0 16px;scrollbar-width:none}
.segs::-webkit-scrollbar{display:none}
.segs a{flex:none;padding:9px 16px;border-radius:100px;background:var(--card);border:1px solid var(--border);font-size:13.5px;font-weight:600;color:var(--dim);white-space:nowrap}
.segs a.on{background:var(--violet);border-color:var(--violet);color:#25123f}

/* progress */
.pr{height:10px;border-radius:100px;background:var(--card2);overflow:hidden;display:flex;margin:16px 0 10px}
.pr i{height:100%}
.leg{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--dim)}
.leg i{width:10px;height:10px;border-radius:4px;display:inline-block;margin-right:7px}

/* note */
.note{background:var(--violet-bg);border:1px solid var(--violet-br);border-radius:15px;padding:14px 16px;font-size:13.5px;color:#d6ccf5;line-height:1.6;margin:14px 0}
.note.amber{background:var(--amber-bg);border-color:#4a3810;color:#f3ddaa}
.note.green{background:var(--green-bg);border-color:#1c4a30;color:#b6ecd0}
.note b{color:#fff;font-weight:700}

/* table */
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-size:12px;font-weight:600;color:var(--faint);padding:14px 20px 10px}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}
td{padding:13px 20px;border-top:1px solid var(--border)}

/* form */
.f{margin-bottom:14px}
.f label{display:block;font-size:13px;font-weight:600;color:var(--dim);margin-bottom:7px}
.f input,.f select{width:100%;background:var(--card2);border:1px solid var(--border);border-radius:14px;color:var(--ink);padding:13px 15px;font-size:15px;outline:none;font-family:inherit}
.f input:focus{border-color:var(--violet)}
.big-in{font:700 34px/1 sans-serif !important;text-align:center;padding:20px !important;letter-spacing:-.03em}
.btn{display:block;width:100%;background:var(--violet);color:#25123f;border:0;border-radius:16px;padding:15px;font:700 15.5px ui-rounded,sans-serif;cursor:pointer;margin-top:6px}
.btn.ghost{background:var(--card2);color:var(--ink);border:1px solid var(--border)}
.btn.sm{width:auto;padding:9px 16px;font-size:13.5px;border-radius:12px;display:inline-block}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}

/* tabbar */
.tabs{position:fixed;left:0;right:0;bottom:0;z-index:30;background:rgba(14,14,19,.92);backdrop-filter:blur(18px);border-top:1px solid var(--border);display:flex;padding:10px 6px 26px}
.tabs a{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--faint)}
.tabs a.on{color:var(--violet)}
.tabs .box{width:44px;height:30px;border-radius:11px;display:grid;place-items:center}
.tabs a.on .box{background:var(--violet-bg)}
.tabs svg{width:21px;height:21px}
h3.sec{font-size:16px;font-weight:700;letter-spacing:-.01em;margin:24px 0 12px}
`;

const TABS = [
  ['index.html', 'Home', '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
  ['entries.html', 'Records', '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M7 9h10M7 13h10M7 17h6"/>'],
  ['log.html', 'Add', '<circle cx="12" cy="12" r="9"/><path d="M12 8.5v7M8.5 12h7"/>'],
  ['year-end.html', 'Close', '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
  ['reports.html', 'More', '<circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/>'],
];

const page = (file, body, active = file) =>
  writeFileSync(resolve(out, file), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Soft</title><style>${CSS}</style></head><body>
<div class="wrap">${body}</div>
<nav class="tabs">${TABS.map(([h, l, d]) => `<a href="${h}" class="${h === active ? 'on' : ''}"><span class="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>${l}</a>`).join('')}</nav>
</body></html>`, 'utf8');

const top = (h, s, right = '<a class="yrbtn" href="#">2025 ▾</a>') =>
  `<header class="top"><span class="av">AG</span><div><h1>${h}</h1>${s ? `<p>${s}</p>` : ''}</div><span class="sp"></span>${right}</header>`;

page('index.html', `
${top('Hello, Amit', 'Residential portfolio · 4 properties')}

<div class="card">
  <div class="hero">
    <div class="n" style="color:var(--green)">+$11,041.47</div>
    <div class="l">Net for 2025, before your CPA's depreciation</div>
  </div>
  <div class="pr">
    <i style="width:46%;background:var(--violet)"></i>
    <i style="width:31%;background:var(--sky)"></i>
    <i style="width:23%;background:var(--rose)"></i>
  </div>
  <div class="leg">
    <span><i style="background:var(--violet)"></i>Ledger $25,176</span>
    <span><i style="background:var(--sky)"></i>1098 $29,910</span>
    <span><i style="background:var(--rose)"></i>Capital $20,870</span>
  </div>
</div>

<div class="tiles">
  <div class="tile"><div class="k">Rent in</div><div class="v">$66,127</div></div>
  <div class="tile"><div class="k">Deductible</div><div class="v">$55,086</div></div>
  <div class="tile"><div class="k">Capital added</div><div class="v">$20,870</div></div>
  <div class="tile"><div class="k">Hours logged</div><div class="v" style="color:var(--amber)">0.0</div></div>
</div>

<h3 class="sec">Your properties</h3>
<div class="card pad0">
  ${[['🏠','Kettlewell','Available since Oct 2019','+$12,824.00','p-g'],
     ['🏡','Westmill','Available since Feb 2023','+$4,522.53','p-g'],
     ['🏘','Arbordale way','Available since Jan 2025','−$659.52','p-r'],
     ['🏚','Creedmore ct','Available since Dec 2025','−$5,645.54','p-r']]
   .map(([e,n,s,v,c]) => `<a class="item" href="property.html"><span class="ic" style="background:var(--violet-bg)">${e}</span><span class="tx"><b>${n}</b><span>${s}</span></span><span class="rt"><span class="pill ${c}">${v}</span></span></a>`).join('')}
</div>

<h3 class="sec">Three things to look at</h3>
<div class="card pad0">
  <a class="item" href="entries.html"><span class="ic" style="background:var(--amber-bg)">📝</span><span class="tx"><b>3 expenses need an answer</b><span>Repair or improvement, before year end</span></span><span class="pill p-a">Review</span></a>
  <a class="item" href="expense.html"><span class="ic" style="background:var(--violet-bg)">📅</span><span class="tx"><b>$5,744.00 is scheduled</b><span>Big Alz · due 15 January 2026</span></span><span class="pill p-v">Planned</span></a>
  <a class="item" href="people.html"><span class="ic" style="background:var(--rose-bg)">📄</span><span class="tx"><b>A W-9 is missing</b><span>Big Alz · $10,744.53 paid this year</span></span><span class="pill p-r">Chase</span></a>
</div>

<div class="note">You have logged <b>no hours</b> in 2025. That is the one gap a spreadsheet could never close for you — the 250-hour safe harbour wants a log written on the day, not reconstructed in April.</div>
`);

page('entries.html', `
${top('Records', '78 expenses · 13 rent · 5 mileage')}
<div class="segs"><a class="on">Expenses</a><a href="income.html">Rent</a><a href="time.html">Time</a><a href="trips.html">Miles</a></div>

<div class="card">
  <div class="f" style="margin:0"><input placeholder="🔍  Search vendor, note or category"></div>
</div>
<div class="segs"><a class="on">All</a><a>Kettlewell</a><a>Westmill</a><a>Arbordale</a><a>Creedmore</a></div>

<div class="tiles" style="margin-bottom:16px">
  <div class="tile"><div class="k">Showing</div><div class="v">78</div></div>
  <div class="tile"><div class="k">Invoiced</div><div class="v">$61,050</div></div>
  <div class="tile"><div class="k">Paid in 2025</div><div class="v">$55,306</div></div>
  <div class="tile"><div class="k">Of that, capital</div><div class="v">$20,870</div></div>
</div>

<div class="card pad0">
  ${[['🔨','Big Alz Handyman','28 Nov · Creedmore · Repairs','$8,244.00','$2,500 paid','p-a'],
     ['🪵','The Home Depot','26 Nov · Creedmore · LVP flooring','$6,959.53','Capital','p-v'],
     ['🛋','Facebook — Furniture','20 May · Arbordale','$6,500.00','Capital','p-v'],
     ['🔨','Big Alz Handyman','27 Jan · Westmill · Repairs','$6,510.53','Paid','p-g'],
     ['🎨','Sherwin-Williams','7 Dec · Creedmore · Rehab paint','$2,164.47','Capital','p-v'],
     ['🛡','Closing — hazard insurance','18 Nov · Creedmore','$1,072.56','Paid','p-g'],
     ['🚗','Mileage — operating','31 Dec · Arbordale · 812.1 mi','$568.47','Paid','p-g'],
     ['🧹','Cleaning services','6 Jan · Westmill','$430.00','Paid','p-g']]
   .map(([e,n,s,a,t,c]) => `<a class="item" href="expense.html"><span class="ic" style="background:var(--card2)">${e}</span><span class="tx"><b>${n}</b><span>${s}</span></span><span class="rt"><b>${a}</b><span class="pill ${c}" style="margin-top:4px">${t}</span></span></a>`).join('')}
</div>
<p style="text-align:center;color:var(--faint);font-size:13px;padding:8px 0 4px">Showing 8 of 78 · totals follow your filters</p>
`);

page('expense.html', `
${top('Expense', 'INV011307', '<a class="yrbtn" href="entries.html">Close</a>')}
<div class="card">
  <div class="hero">
    <div class="n">$8,244.00</div>
    <div class="l">Big Alz Moving n Handyman · 28 November 2025</div>
  </div>
  <div class="pr"><i style="width:30.3%;background:var(--green)"></i><i style="width:69.7%;background:var(--amber)"></i></div>
  <div class="leg"><span><i style="background:var(--green)"></i>$2,500.00 paid</span><span><i style="background:var(--amber)"></i>$5,744.00 scheduled</span></div>
</div>

<div class="note amber">Only <b>$2,500.00</b> counts toward 2025. The rest is deductible in the year it is actually paid — the invoice total on its own would have overstated this year by $5,744.</div>

<h3 class="sec">Payments</h3>
<div class="card pad0">
  <div class="item"><span class="ic" style="background:var(--green-bg)">✓</span><span class="tx"><b>Paid by check</b><span>28 November 2025</span></span><span class="rt"><b>$2,500.00</b></span></div>
  <div class="item"><span class="ic" style="background:var(--amber-bg)">🕓</span><span class="tx"><b>Scheduled</b><span>15 January 2026 · not deducted yet</span></span><span class="rt"><b style="color:var(--amber)">$5,744.00</b></span></div>
</div>
<button class="btn">It went out — confirm</button>

<h3 class="sec">The record</h3>
<div class="card pad0">
  <div class="item"><span class="tx"><span>Property</span><b>Creedmore ct</b></span></div>
  <div class="item"><span class="tx"><span>Schedule E line</span><b>14 · Repairs</b></span></div>
  <div class="item"><span class="tx"><span>Repair or improvement</span><b>Not answered</b></span><span class="pill p-a">Review</span></div>
  <div class="item"><span class="tx"><span>Cost treatment</span><b>Acquisition side</b></span><span class="pill p-v">Basis</span></div>
  <div class="item"><span class="tx"><span>Receipt</span><b>On file</b></span><span class="pill p-g">✓</span></div>
</div>
<div class="note">Spent before Creedmore was available to rent on <b>2 December</b>. The app sorts it onto that side of the line and stops there — what happens next is your CPA's call.</div>
<button class="btn ghost">Edit this expense</button>
`, 'entries.html');

page('property.html', `
${top('Creedmore ct', '1109 Creedmore Ct, Charlotte NC', '<a class="yrbtn" href="index.html">Close</a>')}
<div class="card">
  <div class="hero"><div class="n" style="color:var(--rose)">−$5,645.54</div><div class="l">Net for 2025 · no rent yet</div></div>
</div>
<div class="tiles">
  <div class="tile"><div class="k">Purchase price</div><div class="v">$378,500</div></div>
  <div class="tile"><div class="k">Closing costs</div><div class="v">$5,205</div></div>
  <div class="tile"><div class="k">Capital added</div><div class="v">$9,124</div></div>
  <div class="tile"><div class="k">Miles driven</div><div class="v">259.6</div></div>
</div>

<h3 class="sec">Key dates</h3>
<div class="card pad0">
  <div class="item"><span class="ic" style="background:var(--card2)">📅</span><span class="tx"><b>Acquired</b><span>Not recorded yet</span></span><span class="pill p-a">Add</span></div>
  <div class="item"><span class="ic" style="background:var(--green-bg)">🔑</span><span class="tx"><b>Listed / available</b><span>2 December 2025</span></span><span class="pill p-g">Set</span></div>
  <div class="item"><span class="ic" style="background:var(--card2)">👤</span><span class="tx"><b>First tenant</b><span>Not recorded yet</span></span><span class="pill p-d">Optional</span></div>
  <div class="item"><span class="ic" style="background:var(--violet-bg)">🏢</span><span class="tx"><b>Managed by</b><span>JKN Realty since Jan 2025</span></span></div>
</div>
<div class="note">Listed / available is where depreciation starts. It is not the day you bought it and not the day a tenant moved in — and everything spent before it lands on the other side of the line.</div>
<button class="btn ghost">Edit details</button>
`, 'index.html');

page('properties.html', `
${top('Properties', '4 in the portfolio')}
<div class="card pad0">
  ${[['🏠','Kettlewell','Acquired May 2018 · available Oct 2019','JKN Realty','p-s'],
     ['🏡','Westmill','Acquired Sep 2019 · available Feb 2023','JKN Realty','p-s'],
     ['🏘','Arbordale way','Acquired — · available Jan 2025','Self-managed','p-v'],
     ['🏚','Creedmore ct','Acquired — · available Dec 2025','JKN Realty','p-s']]
   .map(([e,n,s,m,c]) => `<a class="item" href="property.html"><span class="ic" style="background:var(--violet-bg)">${e}</span><span class="tx"><b>${n}</b><span>${s}</span></span><span class="pill ${c}">${m}</span></a>`).join('')}
</div>
<div class="note amber">Two properties have no acquisition date. Not urgent — but it is the first thing a CPA asks for, so it is worth five minutes with the closing folder.</div>
<button class="btn ghost">Add a property</button>
`, 'reports.html');

page('year-end.html', `
${top('Close 2025', 'Four things, once a year')}
<div class="card">
  <div class="ring"><div class="in"><b>3 / 4</b><span>done</span></div></div>
</div>
<div class="card pad0">
  <div class="item"><span class="ic" style="background:var(--green-bg)">🏦</span><span class="tx"><b>The 1098s</b><span>4 lenders · $16,213.35 interest</span></span><span class="pill p-g">Done</span></div>
  <div class="item"><span class="ic" style="background:var(--green-bg)">🧾</span><span class="tx"><b>Rent against the 1099</b><span>Both managed properties square exactly</span></span><span class="pill p-g">Done</span></div>
  <div class="item"><span class="ic" style="background:var(--amber-bg)">🕓</span><span class="tx"><b>Payments still planned</b><span>$5,744.00 due 15 January</span></span><span class="pill p-a">1 open</span></div>
  <div class="item"><span class="ic" style="background:var(--card2)">📊</span><span class="tx"><b>Figures from your CPA</b><span>Depreciation, carryforwards</span></span><span class="pill p-d">Waiting</span></div>
</div>

<h3 class="sec">Mortgage &amp; escrow, by property</h3>
${[['Kettlewell','Rocket Mortgage LLC','$4,919.11','$3,317.92','$886.50'],
   ['Westmill','JPMorgan Chase Bank, N.A.','$4,215.52','$4,097.75','$1,176.67'],
   ['Arbordale way','Freedom Mortgage','$6,446.90','$3,312.30','$905.02'],
   ['Creedmore ct','loanDepot.com LLC','$631.82','—','—']]
 .map(([p,l,i,t,ins]) => `
<div class="card">
  <h2>${p}</h2>
  <div class="cap">${l} · 1 lender</div>
  <div class="tiles" style="grid-template-columns:repeat(3,1fr)">
    <div class="tile"><div class="k">Interest</div><div class="v" style="font-size:17px">${i}</div></div>
    <div class="tile"><div class="k">Property tax</div><div class="v" style="font-size:17px">${t}</div></div>
    <div class="tile"><div class="k">Insurance</div><div class="v" style="font-size:17px">${ins}</div></div>
  </div>
  <button class="btn ghost sm" style="margin-top:14px">Edit</button>
  <button class="btn ghost sm" style="margin-top:14px">+ Another lender</button>
</div>`).join('')}
<div class="note">Grouped by property, not by bank. Servicing transfers mid-year all the time, and two 1098s on one house is normal — you should never have to hold that mapping in your head.</div>

<h3 class="sec">Rent against the 1099</h3>
<div class="card pad0">
  <div class="item"><span class="tx"><b>Kettlewell</b><span>$25,400 banked + $840 explained</span></span><span class="rt"><b style="color:var(--green)">$0.00</b><span>residual</span></span></div>
  <div class="item"><span class="tx"><b>Westmill</b><span>$26,489 banked + $1,421 explained</span></span><span class="rt"><b style="color:var(--green)">$0.00</b><span>residual</span></span></div>
  <div class="item"><span class="tx"><b>Arbordale way</b><span>Self-managed — no 1099 is issued</span></span><span class="pill p-d">n/a</span></div>
</div>
`);

page('reports.html', `
${top('Reports', 'Schedule E · 2025')}
<div class="card">
  <div class="hero"><div class="n" style="color:var(--green)">+$11,041.47</div><div class="l">Net across four properties</div></div>
  <div class="note" style="margin-bottom:0">$20,869.57 of capital sits <b>outside</b> this figure. It reaches your return as depreciation, which your CPA calculates — not this app.</div>
</div>

<div class="card pad0">
  <table>
    <thead><tr><th>Property</th><th class="n">Rent</th><th class="n">Net</th><th class="n">Capital</th></tr></thead>
    <tbody>
      <tr><td>Kettlewell</td><td class="n">$25,400</td><td class="n" style="color:var(--green)">+$12,824</td><td class="n" style="color:var(--faint)">—</td></tr>
      <tr><td>Westmill</td><td class="n">$26,489</td><td class="n" style="color:var(--green)">+$4,523</td><td class="n">$970</td></tr>
      <tr><td>Arbordale</td><td class="n">$14,238</td><td class="n" style="color:var(--rose)">−$660</td><td class="n">$10,776</td></tr>
      <tr><td>Creedmore</td><td class="n">$0</td><td class="n" style="color:var(--rose)">−$5,646</td><td class="n">$9,124</td></tr>
    </tbody>
  </table>
</div>

<h3 class="sec">Send to your CPA</h3>
<div class="card pad0">
  ${['Schedule E summary','Every expense','Every payment','Rent received','Rent vs the 1099','Time log','Mileage log','Jobs rolled up','Contractors &amp; W-9','Mortgage &amp; escrow','CPA figures','Property facts']
    .map((n) => `<a class="item"><span class="ic" style="background:var(--sky-bg)">↓</span><span class="tx"><b>${n}</b><span>CSV</span></span></a>`).join('')}
</div>
<button class="btn">Download all twelve</button>

<h3 class="sec">Elsewhere</h3>
<div class="card pad0">
  <a class="item" href="properties.html"><span class="ic" style="background:var(--violet-bg)">🏠</span><span class="tx"><b>Properties</b></span></a>
  <a class="item" href="people.html"><span class="ic" style="background:var(--violet-bg)">👥</span><span class="tx"><b>People &amp; contractors</b></span></a>
  <a class="item" href="jobs.html"><span class="ic" style="background:var(--violet-bg)">🔗</span><span class="tx"><b>Jobs</b></span></a>
  <a class="item" href="settings.html"><span class="ic" style="background:var(--violet-bg)">⚙️</span><span class="tx"><b>Settings</b></span></a>
</div>
`);

page('log.html', `
${top('Add an expense', 'Five fields, nothing else', '<a class="yrbtn" href="index.html">Cancel</a>')}
<div class="card">
  <div class="f"><label>How much did it cost?</label><input class="big-in" value="$124.99"></div>
</div>
<div class="card">
  <div class="f"><label>Who did you pay?</label><input placeholder="Home Depot"></div>
  <div class="f"><label>Which Schedule E line?</label><select><option>15 · Supplies</option><option>14 · Repairs</option><option>5 · Advertising</option></select></div>
  <div class="f"><label>Which property?</label>
    <div class="segs" style="padding:0"><a>Kettlewell</a><a>Westmill</a><a class="on">Arbordale</a><a>Creedmore</a></div>
  </div>
  <div class="g2">
    <div class="f"><label>When?</label><input type="date" value="2025-12-31"></div>
    <div class="f"><label>Receipt</label><input placeholder="Add photo"></div>
  </div>
</div>
<div class="note amber">Supplies is spend on physical work, so it will need a repair-or-improvement answer before year end. It will wait in your review list — nothing is lost.</div>
<button class="btn">Save expense</button>
<button class="btn ghost">Save and add another</button>
<div class="segs" style="justify-content:center;margin-top:20px"><a class="on">Expense</a><a>Time</a><a>Trip</a><a>Rent</a></div>
`);

page('income.html', `
${top('Rent received', '$66,127.00 banked in 2025')}
<div class="segs"><a href="entries.html">Expenses</a><a class="on">Rent</a><a href="time.html">Time</a><a href="trips.html">Miles</a></div>
<div class="card pad0">
  ${[['🏡','Westmill','31 Dec · year total from JKN Realty','$26,489.00'],
     ['🏠','Kettlewell','31 Dec · year total from JKN Realty','$25,400.00'],
     ['🏘','Arbordale','6 May · direct from tenant','$1,860.00'],
     ['🏘','Arbordale','2 Jul · prorated first month','$1,197.00'],
     ['🏘','Arbordale','30 Jun · one-time','$496.00']]
   .map(([e,p,s,a]) => `<div class="item"><span class="ic" style="background:var(--green-bg)">${e}</span><span class="tx"><b>${p}</b><span>${s}</span></span><span class="rt"><b>${a}</b></span></div>`).join('')}
</div>
<div class="note green">Every figure here is what actually <b>reached your bank</b>. The manager collects the gross and keeps their fee, so the gross is never money you received — that difference is squared off on the year-end screen.</div>
`, 'entries.html');

page('time.html', `
${top('Time', 'Toward the 250-hour safe harbour')}
<div class="segs"><a href="entries.html">Expenses</a><a href="income.html">Rent</a><a class="on">Time</a><a href="trips.html">Miles</a></div>
<div class="card">
  <div class="ring p0"><div class="in"><b style="color:var(--amber)">0.0</b><span>of 250 hours</span></div></div>
</div>
<div class="note amber">The spreadsheet never captured a single hour, and this is the one thing it could never have done well. The safe harbour wants a log written <b>on the day</b> — a reconstruction in April is weaker evidence, however honest it is.</div>
<button class="btn">Log time</button>
<button class="btn ghost">Start a timer</button>
`, 'entries.html');

page('trips.html', `
${top('Mileage', '1,252.5 miles in 2025')}
<div class="segs"><a href="entries.html">Expenses</a><a href="income.html">Rent</a><a href="time.html">Time</a><a class="on">Miles</a></div>
<div class="card">
  <div class="pr"><i style="width:79%;background:var(--green)"></i><i style="width:21%;background:var(--violet)"></i></div>
  <div class="leg"><span><i style="background:var(--green)"></i>992.9 operating</span><span><i style="background:var(--violet)"></i>259.6 acquisition</span></div>
</div>
<div class="card pad0">
  ${[['🏘','Arbordale','37 trips · year total','812.1 mi','p-g'],
     ['🏚','Creedmore','Due diligence, showings','259.6 mi','p-v'],
     ['🏡','Westmill','27 trips · year total','103.3 mi','p-g'],
     ['🏠','Kettlewell','9 trips · year total','58.6 mi','p-g'],
     ['💻','Portfolio','iPad purchase · 2 trips','18.9 mi','p-g']]
   .map(([e,p,s,m,c]) => `<div class="item"><span class="ic" style="background:var(--card2)">${e}</span><span class="tx"><b>${p}</b><span>${s}</span></span><span class="rt"><b>${m}</b><span class="pill ${c}" style="margin-top:4px">${c === 'p-v' ? 'Basis' : 'Operating'}</span></span></div>`).join('')}
</div>
<div class="note">These are year totals from your MileIQ log, not single journeys — recorded honestly as reconstructions. From 2026 each trip gets captured as it happens.</div>
`, 'entries.html');

page('jobs.html', `
${top('Jobs', 'One task, all its pieces')}
<div class="card pad0">
  <a class="item"><span class="ic" style="background:var(--violet-bg)">💻</span><span class="tx"><b>Laptop for rental bookkeeping</b><span>5 records · 2.0 h · 18.4 mi</span></span><span class="rt"><b>$1,429.00</b></span></a>
  <a class="item"><span class="ic" style="background:var(--violet-bg)">🔨</span><span class="tx"><b>Creedmore make-ready</b><span>7 records · 259.6 mi</span></span><span class="rt"><b>$9,124.00</b></span></a>
</div>
<div class="card">
  <h2>Laptop for rental bookkeeping</h2>
  <div class="cap">Monday's search, Tuesday's drive, and the invoice — one thing, five records.</div>
  <div class="tiles" style="grid-template-columns:repeat(3,1fr)">
    <div class="tile"><div class="k">Time</div><div class="v" style="font-size:17px">2.00 h</div></div>
    <div class="tile"><div class="k">Counting</div><div class="v" style="font-size:17px">1.33 h</div></div>
    <div class="tile"><div class="k">Miles</div><div class="v" style="font-size:17px">18.4</div></div>
  </div>
  <div class="note" style="margin-bottom:0">Nothing here is stored. Ask for 2026 and the same records answer differently — the job holds no figures of its own, which is exactly what makes that possible.</div>
</div>
<div class="note green">A job is never created empty. It is born from a record you already saved, and deleting one leaves every record standing.</div>
`, 'reports.html');

page('people.html', `
${top('People', 'Household and contractors')}
<div class="card pad0">
  <div class="item"><span class="ic" style="background:var(--violet-bg)">👤</span><span class="tx"><b>Amit Gandhi</b><span>Owner</span></span></div>
</div>
<h3 class="sec">Contractors &amp; managers</h3>
<div class="card pad0">
  <a class="item"><span class="ic" style="background:var(--rose-bg)">🔨</span><span class="tx"><b>Big Alz Moving n Handyman</b><span>$10,744.53 paid in 2025</span></span><span class="pill p-r">W-9 missing</span></a>
  <a class="item"><span class="ic" style="background:var(--green-bg)">🏢</span><span class="tx"><b>JKN Realty</b><span>Property manager</span></span><span class="pill p-g">On file</span></a>
  <a class="item"><span class="ic" style="background:var(--green-bg)">🧹</span><span class="tx"><b>Community Unity Connections</b><span>$195.00 paid in 2025</span></span><span class="pill p-g">On file</span></a>
</div>
<div class="note amber">2025 reports anyone paid <b>$600</b> or more. From 2026 that threshold is <b>$2,000</b> under OBBBA — so the same payment is reportable in one year and not the next, and the app always uses the rule for the year the money moved.</div>
<button class="btn ghost">Add someone</button>
`, 'reports.html');

page('settings.html', `
${top('Settings', 'Residential portfolio')}
<div class="card pad0">
  <div class="item"><span class="tx"><span>Enterprise</span><b>Residential portfolio</b></span></div>
  <div class="item"><span class="tx"><span>Active tax year</span><b>2026</b></span><span class="pill p-v">Viewing 2025</span></div>
  <div class="item"><span class="tx"><span>Time zone</span><b>America/New_York</b></span></div>
</div>
<h3 class="sec">Rules in force</h3>
<div class="card pad0">
  <table>
    <thead><tr><th>Rule</th><th class="n">2025</th><th class="n">2026</th></tr></thead>
    <tbody>
      <tr><td>1099 threshold</td><td class="n">$600</td><td class="n" style="color:var(--amber)">$2,000</td></tr>
      <tr><td>Safe harbour target</td><td class="n">250 h</td><td class="n">250 h</td></tr>
      <tr><td>De minimis invoice</td><td class="n">$2,500</td><td class="n">$2,500</td></tr>
    </tbody>
  </table>
</div>
<div class="note">Every figure is stored per tax year rather than as one constant. That is why a $1,400 contractor is reportable in 2025 and not in 2026 — the app never applies this year's rule to last year's money.</div>
<h3 class="sec">Health</h3>
<div class="card pad0">
  <div class="item"><span class="ic" style="background:var(--green-bg)">✓</span><span class="tx"><b>Integrity check</b><span>No errors · 3 warnings</span></span><span class="pill p-g">Good</span></div>
</div>
<button class="btn ghost">Run it now</button>
`, 'reports.html');

console.log('concept-4 written to', out);
