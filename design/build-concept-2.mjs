/**
 * Concept 2 — "Statement". A consumer finance app in the spirit of Robinhood,
 * Wealthfront and Revolut.
 *
 * Thesis: the opposite bet to concept 1. One number dominates every screen and
 * everything else is subordinate to it. Generous space, a single column that
 * works identically on a phone and a laptop, a bottom tab bar, and colour used
 * only for direction - green up, red down, amber waiting. Tables exist but they
 * are quiet; the headline is the product.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), 'concept-2');
mkdirSync(out, { recursive: true });

const CSS = `
:root{
  --bg:#000; --card:#101012; --card2:#161619; --line:#232327;
  --ink:#fff; --dim:#8e8e93; --faint:#5a5a5f;
  --up:#32d74b; --down:#ff453a; --wait:#ffd60a; --brand:#0a84ff; --violet:#bf5af2;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;padding-bottom:78px;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.shell{max-width:520px;margin:0 auto;padding:0 18px}
@media(min-width:900px){.shell{max-width:940px}}

/* header */
.hdr{display:flex;align-items:center;gap:12px;padding:18px 0 6px}
.hdr .av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#0a84ff,#bf5af2);display:grid;place-items:center;font:600 12px/1 sans-serif}
.hdr h1{font-size:17px;font-weight:600;letter-spacing:-.02em}
.hdr .sp{margin-left:auto}
.pill{border:1px solid var(--line);border-radius:100px;padding:6px 13px;font-size:13px;color:var(--dim)}
.pill.on{background:#fff;color:#000;border-color:#fff;font-weight:600}

/* hero */
.hero{padding:26px 0 22px}
.hero .lbl{font-size:14px;color:var(--dim);margin-bottom:8px}
.hero .num{font:600 46px/1 -apple-system,sans-serif;letter-spacing:-.035em}
.hero .num.sm{font-size:34px}
.hero .delta{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-size:14px;font-weight:500}
.up{color:var(--up)} .down{color:var(--down)} .wait{color:var(--wait)} .dimc{color:var(--dim)}

/* chart */
.chart{height:112px;margin:8px 0 4px;display:flex;align-items:flex-end;gap:5px}
.chart i{flex:1;border-radius:3px 3px 0 0;background:linear-gradient(180deg,rgba(50,215,75,.85),rgba(50,215,75,.12));display:block}
.chart i.n{background:linear-gradient(180deg,rgba(255,69,58,.85),rgba(255,69,58,.12))}
.months{display:flex;gap:5px;margin-top:8px}
.months span{flex:1;text-align:center;font-size:10px;color:var(--faint)}

/* segmented */
.seg{display:flex;gap:6px;overflow-x:auto;padding:4px 0 14px;scrollbar-width:none}
.seg::-webkit-scrollbar{display:none}
.seg a{flex:none;padding:7px 14px;border-radius:100px;font-size:13.5px;color:var(--dim);background:var(--card);white-space:nowrap}
.seg a.on{background:#fff;color:#000;font-weight:600}

/* cards */
.card{background:var(--card);border-radius:18px;padding:18px;margin-bottom:12px}
.card h3{font-size:13px;color:var(--dim);font-weight:500;margin-bottom:14px;letter-spacing:.01em}
.card.tight{padding:0;overflow:hidden}
.grid{display:grid;gap:12px}
@media(min-width:900px){.grid.two{grid-template-columns:1fr 1fr}.grid.three{grid-template-columns:repeat(3,1fr)}}

/* list rows */
.row{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.row .ic{width:38px;height:38px;border-radius:11px;background:var(--card2);display:grid;place-items:center;flex:none;font-size:15px}
.row .tx{min-width:0;flex:1}
.row .t1{font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .t2{font-size:13px;color:var(--dim);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .amt{text-align:right;flex:none}
.row .a1{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.row .a2{font-size:12px;color:var(--dim);margin-top:2px;font-variant-numeric:tabular-nums}

/* stat pair */
.pair{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border-radius:14px;overflow:hidden}
.pair>div{background:var(--card);padding:15px 16px}
.pair .k{font-size:12.5px;color:var(--dim)}
.pair .v{font-size:20px;font-weight:600;margin-top:5px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}

/* progress */
.prog{height:8px;border-radius:100px;background:var(--card2);overflow:hidden;display:flex;margin:14px 0 10px}
.prog i{height:100%}
.leg{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--dim)}
.leg i{width:9px;height:9px;border-radius:3px;display:inline-block;margin-right:7px}

/* badge */
.b{display:inline-block;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:100px}
.b-up{background:rgba(50,215,75,.16);color:var(--up)}
.b-wait{background:rgba(255,214,10,.16);color:var(--wait)}
.b-v{background:rgba(191,90,242,.16);color:var(--violet)}
.b-d{background:rgba(142,142,147,.16);color:var(--dim)}

/* table */
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-size:12px;color:var(--dim);font-weight:500;padding:0 18px 10px}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}
td{padding:13px 18px;border-top:1px solid var(--line)}
tbody tr:first-child td{border-top:1px solid var(--line)}

/* form */
.amtbox{text-align:center;padding:34px 0 22px}
.amtbox input{background:none;border:0;color:#fff;font:600 52px/1 -apple-system,sans-serif;text-align:center;width:100%;outline:none;letter-spacing:-.04em}
.field{background:var(--card);border-radius:14px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px}
.field label{font-size:13px;color:var(--dim);flex:none;min-width:96px}
.field input,.field select{background:none;border:0;color:#fff;font-size:15px;outline:none;flex:1;text-align:right;font-family:inherit}
.cta{display:block;width:100%;background:#fff;color:#000;border:0;border-radius:100px;padding:16px;font:600 16px sans-serif;margin-top:20px;cursor:pointer}
.cta.ghost{background:var(--card);color:#fff}
.note{font-size:13px;color:var(--dim);line-height:1.55;padding:14px 16px;background:var(--card);border-radius:14px;margin:12px 0}
.note b{color:#fff;font-weight:600}

/* tabbar */
.tabs{position:fixed;left:0;right:0;bottom:0;background:rgba(0,0,0,.82);backdrop-filter:blur(20px);border-top:1px solid var(--line);display:flex;padding:9px 0 22px;z-index:20}
.tabs a{flex:1;text-align:center;color:var(--faint);font-size:10.5px;display:flex;flex-direction:column;align-items:center;gap:4px}
.tabs a.on{color:#fff}
.tabs svg{width:23px;height:23px}
h2{font-size:20px;font-weight:600;letter-spacing:-.02em;margin:24px 0 12px}
.sub{font-size:13.5px;color:var(--dim);margin-top:-6px;margin-bottom:14px;line-height:1.5}
`;

const TABS = [
  ['index.html', 'Home', '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
  ['entries.html', 'Activity', '<path d="M3 6h18M3 12h18M3 18h11"/>'],
  ['log.html', 'Add', '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'],
  ['year-end.html', 'Year end', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
  ['reports.html', 'More', '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'],
];

const page = (file, body, active = file) => {
  writeFileSync(resolve(out, file), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Statement</title><style>${CSS}</style></head><body>
<div class="shell">${body}</div>
<nav class="tabs">${TABS.map(([h, l, d]) => `<a href="${h}" class="${h === active ? 'on' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>${l}</a>`).join('')}</nav>
</body></html>`, 'utf8');
};

const hdr = (title, right = '<a class="pill on" href="#">2025</a>') =>
  `<header class="hdr"><span class="av">AG</span><h1>${title}</h1><span class="sp"></span>${right}</header>`;

const bars = [42, 58, 51, 66, 49, 71, 63, 78, 55, 69, 74, 88];

page('index.html', `
${hdr('Portfolio')}
<section class="hero">
  <div class="lbl">Net for 2025, before depreciation</div>
  <div class="num">$11,041.47</div>
  <div class="delta up">▲ $66,127.00 in &nbsp;·&nbsp; $55,085.53 out</div>
</section>
<div class="chart">${bars.map((h, i) => `<i class="${i === 4 ? 'n' : ''}" style="height:${h}%"></i>`).join('')}</div>
<div class="months">${['J','F','M','A','M','J','J','A','S','O','N','D'].map((m) => `<span>${m}</span>`).join('')}</div>

<div class="seg" style="margin-top:18px"><a class="on">All</a><a>Kettlewell</a><a>Westmill</a><a>Arbordale</a><a>Creedmore</a></div>

<div class="pair">
  <div><div class="k">Rent received</div><div class="v">$66,127</div></div>
  <div><div class="k">Deductible</div><div class="v">$55,086</div></div>
  <div><div class="k">Capital added</div><div class="v">$20,870</div></div>
  <div><div class="k">Hours logged</div><div class="v wait">0.0</div></div>
</div>

<h2>Properties</h2>
<div class="card tight">
  ${[['Kettlewell','Available Oct 2019','$25,400.00','+$12,824.00','up','🏠'],
     ['Westmill','Available Feb 2023','$26,489.00','+$4,522.53','up','🏡'],
     ['Arbordale','Available Jan 2025','$14,238.00','−$659.52','down','🏘'],
     ['Creedmore','Available Dec 2025','$0.00','−$5,645.54','down','🏚']]
   .map(([n,s,r,d,c,e]) => `<a class="row" href="property.html"><span class="ic">${e}</span><span class="tx"><span class="t1">${n}</span><span class="t2">${s}</span></span><span class="amt"><span class="a1">${r}</span><span class="a2 ${c}">${d}</span></span></a>`).join('')}
</div>

<h2>Needs you</h2>
<div class="card tight">
  <a class="row" href="entries.html"><span class="ic">⚠️</span><span class="tx"><span class="t1">3 expenses need an answer</span><span class="t2">Repair or improvement, before year end</span></span><span class="b b-wait">Review</span></a>
  <a class="row" href="expense.html"><span class="ic">📅</span><span class="tx"><span class="t1">$5,744.00 scheduled</span><span class="t2">Big Alz · due 15 Jan 2026</span></span><span class="b b-v">Planned</span></a>
  <a class="row" href="people.html"><span class="ic">📄</span><span class="tx"><span class="t1">W-9 missing</span><span class="t2">Big Alz · $10,744.53 paid in 2025</span></span><span class="b b-wait">Chase</span></a>
</div>
`);

page('entries.html', `
${hdr('Activity')}
<div class="seg"><a class="on">Expenses</a><a href="income.html">Rent</a><a href="time.html">Time</a><a href="trips.html">Miles</a></div>

<section class="hero" style="padding:6px 0 18px">
  <div class="lbl">Paid in 2025 across 78 expenses</div>
  <div class="num sm">$55,306.20</div>
  <div class="delta dimc">$61,050.20 invoiced · $5,744.00 still scheduled</div>
</section>

<div class="field"><label>Search</label><input placeholder="Vendor, note, category…" style="text-align:left"></div>
<div class="seg"><a class="on">All</a><a>Repairs</a><a>Supplies</a><a>Capital</a><a>Needs review</a></div>

<div class="card tight">
  ${[['Big Alz Handyman','28 Nov · Creedmore · Repairs','$8,244.00','$2,500.00 paid','wait'],
     ['The Home Depot','26 Nov · Creedmore · LVP flooring','$6,959.53','Capital','v'],
     ['Facebook — Furniture','20 May · Arbordale','$6,500.00','Capital','v'],
     ['Big Alz Handyman','27 Jan · Westmill · Repairs','$6,510.53','Paid in full','up'],
     ['Sherwin-Williams','7 Dec · Creedmore · Rehab paint','$2,164.47','Capital','v'],
     ['Closing — hazard insurance','18 Nov · Creedmore','$1,072.56','Paid in full','up'],
     ['Mileage — operating','31 Dec · Arbordale','$568.47','812.1 mi','d'],
     ['Cleaning services','6 Jan · Westmill','$430.00','Paid in full','up']]
   .map(([n,s,a,t,c]) => `<a class="row" href="expense.html"><span class="tx"><span class="t1">${n}</span><span class="t2">${s}</span></span><span class="amt"><span class="a1">${a}</span><span class="a2"><span class="b b-${c}">${t}</span></span></span></a>`).join('')}
</div>
<p class="sub" style="margin-top:12px">Showing 8 of 78 · totals follow the filter</p>
`);

page('expense.html', `
${hdr('Expense', '<a class="pill" href="entries.html">Close</a>')}
<section class="hero">
  <div class="lbl">Big Alz Moving n Handyman · INV011307</div>
  <div class="num">$8,244.00</div>
  <div class="delta wait">$2,500.00 paid in 2025 · $5,744.00 waiting</div>
</section>

<div class="prog"><i style="width:30.3%;background:var(--up)"></i><i style="width:69.7%;background:var(--wait)"></i></div>
<div class="leg"><span><i style="background:var(--up)"></i>Paid</span><span><i style="background:var(--wait)"></i>Scheduled</span></div>

<div class="note" style="margin-top:18px">Only <b>$2,500.00</b> reaches your 2025 return. The rest is deductible in the year it is actually paid — that is what cash basis means, and it is why the invoice total alone would have been wrong.</div>

<h2>Payments</h2>
<div class="card tight">
  <div class="row"><span class="ic">✓</span><span class="tx"><span class="t1">Paid by check</span><span class="t2">28 November 2025</span></span><span class="amt"><span class="a1">$2,500.00</span></span></div>
  <div class="row"><span class="ic">🕓</span><span class="tx"><span class="t1">Scheduled</span><span class="t2">15 January 2026 · not deducted yet</span></span><span class="amt"><span class="a1 wait">$5,744.00</span></span></div>
</div>
<button class="cta">Confirm the January payment</button>

<h2>Details</h2>
<div class="card tight">
  <div class="row"><span class="tx"><span class="t2">Property</span><span class="t1">Creedmore ct</span></span></div>
  <div class="row"><span class="tx"><span class="t2">Schedule E line</span><span class="t1">14 · Repairs</span></span></div>
  <div class="row"><span class="tx"><span class="t2">Repair or improvement</span><span class="t1 wait">Not answered</span></span><span class="b b-wait">Review</span></div>
  <div class="row"><span class="tx"><span class="t2">Cost treatment</span><span class="t1">Acquisition side</span></span></div>
</div>
<div class="note">Spent before the property was available to rent on <b>2 December</b>. Your CPA decides whether that adds to basis — the app only sorts it.</div>
<button class="cta ghost">Edit this expense</button>
`, 'entries.html');

page('property.html', `
${hdr('Creedmore ct', '<a class="pill" href="index.html">Close</a>')}
<section class="hero">
  <div class="lbl">Net for 2025</div>
  <div class="num down">−$5,645.54</div>
  <div class="delta dimc">$0.00 rent · available from 2 December</div>
</section>
<div class="pair">
  <div><div class="k">Purchase price</div><div class="v">$378,500</div></div>
  <div><div class="k">Closing costs</div><div class="v">$5,204.57</div></div>
  <div><div class="k">Capital added</div><div class="v">$9,124.00</div></div>
  <div><div class="k">Mileage</div><div class="v">259.6 mi</div></div>
</div>
<h2>Key dates</h2>
<div class="card tight">
  <div class="row"><span class="tx"><span class="t2">Acquired</span><span class="t1 dimc">Not recorded</span></span><span class="b b-wait">Add</span></div>
  <div class="row"><span class="tx"><span class="t2">Listed / available</span><span class="t1">2 December 2025</span></span><span class="b b-up">Set</span></div>
  <div class="row"><span class="tx"><span class="t2">First tenant</span><span class="t1 dimc">Not recorded</span></span><span class="b b-d">Optional</span></div>
  <div class="row"><span class="tx"><span class="t2">Managed by</span><span class="t1">JKN Realty</span></span></div>
</div>
<div class="note">Listed / available is where depreciation starts. Every cost before it falls on the other side of the line — for Creedmore that is <b>$9,124.00</b> and <b>259.6 miles</b>.</div>
<button class="cta ghost">Edit property</button>
`, 'index.html');

page('properties.html', `
${hdr('Properties')}
<div class="card tight">
  ${[['Kettlewell','Acquired May 2018 · available Oct 2019','JKN Realty'],
     ['Westmill','Acquired Sep 2019 · available Feb 2023','JKN Realty'],
     ['Arbordale','Acquired — · available Jan 2025','Self-managed'],
     ['Creedmore','Acquired — · available Dec 2025','JKN Realty']]
   .map(([n,s,m]) => `<a class="row" href="property.html"><span class="tx"><span class="t1">${n}</span><span class="t2">${s}</span></span><span class="b b-d">${m}</span></a>`).join('')}
</div>
<div class="note">Two properties have no acquisition date. It is not urgent, but the CPA will ask.</div>
<button class="cta ghost">Add a property</button>
`, 'reports.html');

page('year-end.html', `
${hdr('Close 2025')}
<section class="hero" style="padding:14px 0 18px">
  <div class="lbl">Four things, once a year</div>
  <div class="num sm">3 of 4 done</div>
</section>
<div class="prog"><i style="width:75%;background:var(--up)"></i><i style="width:25%;background:var(--card2)"></i></div>

<div class="card tight" style="margin-top:20px">
  <a class="row"><span class="ic">🏦</span><span class="tx"><span class="t1">The 1098s</span><span class="t2">4 lenders · $16,213.35 interest</span></span><span class="b b-up">Done</span></a>
  <a class="row"><span class="ic">🧾</span><span class="tx"><span class="t1">Rent vs the 1099</span><span class="t2">Both managed properties square exactly</span></span><span class="b b-up">Done</span></a>
  <a class="row"><span class="ic">🕓</span><span class="tx"><span class="t1">Payments still planned</span><span class="t2">$5,744.00 due 15 Jan 2026</span></span><span class="b b-wait">1 open</span></a>
  <a class="row"><span class="ic">📊</span><span class="tx"><span class="t1">Figures from your CPA</span><span class="t2">Depreciation, carryforwards</span></span><span class="b b-d">Waiting</span></a>
</div>

<h2>Mortgage &amp; escrow</h2>
${[['Kettlewell','Rocket Mortgage LLC','$4,919.11','$3,317.92'],
   ['Westmill','JPMorgan Chase Bank','$4,215.52','$4,097.75'],
   ['Arbordale','Freedom Mortgage','$6,446.90','$3,312.30'],
   ['Creedmore','loanDepot.com LLC','$631.82','—']]
 .map(([p,l,i,t]) => `<div class="card"><h3>${p}</h3>
   <div class="row" style="padding:0 0 12px;border:0"><span class="tx"><span class="t1">${l}</span><span class="t2">1 lender · servicing may transfer</span></span></div>
   <div class="pair"><div><div class="k">Interest</div><div class="v">${i}</div></div><div><div class="k">Property tax</div><div class="v">${t}</div></div></div>
 </div>`).join('')}

<h2>Rent vs the 1099</h2>
<div class="card tight">
  <div class="row"><span class="tx"><span class="t1">Kettlewell</span><span class="t2">$25,400 banked + $840 explained</span></span><span class="amt"><span class="a1 up">$0.00</span><span class="a2">residual</span></span></div>
  <div class="row"><span class="tx"><span class="t1">Westmill</span><span class="t2">$26,489 banked + $1,421 explained</span></span><span class="amt"><span class="a1 up">$0.00</span><span class="a2">residual</span></span></div>
  <div class="row"><span class="tx"><span class="t1">Arbordale</span><span class="t2">Self-managed — no 1099 is issued</span></span><span class="b b-d">n/a</span></div>
</div>
`);

page('reports.html', `
${hdr('Reports')}
<section class="hero" style="padding:14px 0 18px">
  <div class="lbl">Schedule E net for 2025</div>
  <div class="num">$11,041.47</div>
  <div class="delta dimc">$20,869.57 of capital sits outside this</div>
</section>
<div class="prog"><i style="width:46%;background:var(--brand)"></i><i style="width:54%;background:var(--violet)"></i></div>
<div class="leg"><span><i style="background:var(--brand)"></i>Ledger $25,176</span><span><i style="background:var(--violet)"></i>1098 $29,910</span></div>

<h2>By property</h2>
<div class="card tight">
  <table>
    <thead><tr><th>Property</th><th class="n">Rent</th><th class="n">Net</th></tr></thead>
    <tbody>
      <tr><td>Kettlewell</td><td class="n">$25,400</td><td class="n up">+$12,824</td></tr>
      <tr><td>Westmill</td><td class="n">$26,489</td><td class="n up">+$4,523</td></tr>
      <tr><td>Arbordale</td><td class="n">$14,238</td><td class="n down">−$660</td></tr>
      <tr><td>Creedmore</td><td class="n">$0</td><td class="n down">−$5,646</td></tr>
    </tbody>
  </table>
</div>

<h2>Send to your CPA</h2>
<div class="card tight">
  ${['Schedule E summary','Every expense','Every payment','Rent received','Rent vs 1099','Time log','Mileage log','Jobs','Contractors &amp; W-9','Mortgage &amp; escrow','CPA figures','Property facts']
    .map((n) => `<a class="row"><span class="ic">↓</span><span class="tx"><span class="t1">${n}</span><span class="t2">CSV</span></span></a>`).join('')}
</div>
<button class="cta">Download all twelve</button>
<h2>More</h2>
<div class="card tight">
  <a class="row" href="properties.html"><span class="ic">🏠</span><span class="tx"><span class="t1">Properties</span></span></a>
  <a class="row" href="people.html"><span class="ic">👥</span><span class="tx"><span class="t1">People &amp; contractors</span></span></a>
  <a class="row" href="jobs.html"><span class="ic">🔗</span><span class="tx"><span class="t1">Jobs</span></span></a>
  <a class="row" href="settings.html"><span class="ic">⚙️</span><span class="tx"><span class="t1">Settings</span></span></a>
</div>
`);

page('log.html', `
${hdr('New expense', '<a class="pill" href="index.html">Cancel</a>')}
<div class="amtbox"><input value="$124.99"></div>
<div class="field"><label>Paid to</label><input placeholder="Home Depot"></div>
<div class="field"><label>Line</label><select><option>Supplies</option><option>Repairs</option><option>Advertising</option></select></div>
<div class="field"><label>Property</label><select><option>Arbordale</option><option>Kettlewell</option><option>Westmill</option><option>Creedmore</option></select></div>
<div class="field"><label>Date</label><input type="date" value="2025-12-31"></div>
<div class="field"><label>Receipt</label><input placeholder="Add a photo" ></div>
<div class="note">Supplies is spend on physical work, so it needs a repair-or-improvement answer before year end. It will sit in your review list until then.</div>
<button class="cta">Save expense</button>
<div class="seg" style="justify-content:center;margin-top:20px"><a class="on">Expense</a><a>Time</a><a>Trip</a><a>Rent</a></div>
`);

page('income.html', `
${hdr('Rent received')}
<div class="seg"><a href="entries.html">Expenses</a><a class="on">Rent</a><a href="time.html">Time</a><a href="trips.html">Miles</a></div>
<section class="hero" style="padding:6px 0 18px">
  <div class="lbl">Banked in 2025</div>
  <div class="num sm">$66,127.00</div>
  <div class="delta dimc">13 receipts across 4 properties</div>
</section>
<div class="card tight">
  ${[['Westmill','31 Dec · JKN Realty year total','$26,489.00'],
     ['Kettlewell','31 Dec · JKN Realty year total','$25,400.00'],
     ['Arbordale','6 May · direct from tenant','$1,860.00'],
     ['Arbordale','2 Jul · prorated first month','$1,197.00'],
     ['Arbordale','30 Jun · one-time','$496.00']]
   .map(([p,s,a]) => `<div class="row"><span class="tx"><span class="t1">${p}</span><span class="t2">${s}</span></span><span class="amt"><span class="a1">${a}</span></span></div>`).join('')}
</div>
`, 'entries.html');

page('time.html', `
${hdr('Time')}
<div class="seg"><a href="entries.html">Expenses</a><a href="income.html">Rent</a><a class="on">Time</a><a href="trips.html">Miles</a></div>
<section class="hero" style="text-align:center;padding:52px 0 20px">
  <div class="num wait">0.0</div>
  <div class="lbl" style="margin-top:12px">hours logged in 2025, of a 250 target</div>
</section>
<div class="prog"><i style="width:0.5%;background:var(--wait)"></i></div>
<div class="note">The spreadsheet never captured a single hour. That is the biggest gap of the year: the safe harbour needs a contemporaneous log, and one written afterwards is weaker evidence than one written on the day.</div>
<button class="cta">Log time now</button>
`, 'entries.html');

page('trips.html', `
${hdr('Mileage')}
<div class="seg"><a href="entries.html">Expenses</a><a href="income.html">Rent</a><a href="time.html">Time</a><a class="on">Miles</a></div>
<section class="hero" style="padding:6px 0 18px">
  <div class="lbl">Driven in 2025</div>
  <div class="num sm">1,252.5 mi</div>
  <div class="delta dimc">992.9 operating · 259.6 acquisition side</div>
</section>
<div class="prog"><i style="width:79%;background:var(--up)"></i><i style="width:21%;background:var(--violet)"></i></div>
<div class="leg"><span><i style="background:var(--up)"></i>Operating</span><span><i style="background:var(--violet)"></i>Acquisition</span></div>
<div class="card tight" style="margin-top:18px">
  ${[['Arbordale','37 trips · year total','812.1 mi'],['Westmill','27 trips','103.3 mi'],['Creedmore','due diligence, showings','259.6 mi'],['Kettlewell','9 trips','58.6 mi'],['Portfolio','iPad purchase','18.9 mi']]
   .map(([p,s,m]) => `<div class="row"><span class="tx"><span class="t1">${p}</span><span class="t2">${s}</span></span><span class="amt"><span class="a1">${m}</span></span></div>`).join('')}
</div>
`, 'entries.html');

page('jobs.html', `
${hdr('Jobs')}
<p class="sub">One task, with the time, miles and money that went into it.</p>
<div class="card tight">
  <a class="row"><span class="ic">💻</span><span class="tx"><span class="t1">Laptop for rental bookkeeping</span><span class="t2">5 records · 2.0 h · 18.4 mi</span></span><span class="amt"><span class="a1">$1,429.00</span></span></a>
  <a class="row"><span class="ic">🔨</span><span class="tx"><span class="t1">Creedmore make-ready</span><span class="t2">7 records · 259.6 mi</span></span><span class="amt"><span class="a1">$9,124.00</span></span></a>
</div>
<div class="note">A job is never created empty — it is born from a record you already saved. Deleting one leaves every record standing.</div>
`, 'reports.html');

page('people.html', `
${hdr('People')}
<div class="card tight">
  <div class="row"><span class="ic">👤</span><span class="tx"><span class="t1">Amit Gandhi</span><span class="t2">Owner</span></span></div>
</div>
<h2>Contractors</h2>
<div class="card tight">
  <a class="row"><span class="ic">🔨</span><span class="tx"><span class="t1">Big Alz Moving n Handyman</span><span class="t2">$10,744.53 paid in 2025</span></span><span class="b b-wait">W-9 missing</span></a>
  <a class="row"><span class="ic">🏢</span><span class="tx"><span class="t1">JKN Realty</span><span class="t2">Property manager</span></span><span class="b b-up">On file</span></a>
  <a class="row"><span class="ic">🧹</span><span class="tx"><span class="t1">Community Unity Connections</span><span class="t2">$195.00 paid in 2025</span></span><span class="b b-up">On file</span></a>
</div>
<div class="note">2025 reports at <b>$600</b>. From 2026 the threshold is <b>$2,000</b> under OBBBA — the same payment answers differently depending on the year.</div>
`, 'reports.html');

page('settings.html', `
${hdr('Settings')}
<div class="card tight">
  <div class="row"><span class="tx"><span class="t2">Enterprise</span><span class="t1">Residential portfolio</span></span></div>
  <div class="row"><span class="tx"><span class="t2">Active tax year</span><span class="t1">2026</span></span></div>
  <div class="row"><span class="tx"><span class="t2">Time zone</span><span class="t1">America/New_York</span></span></div>
</div>
<h2>Rules for 2025</h2>
<div class="card tight">
  <div class="row"><span class="tx"><span class="t1">1099 threshold</span><span class="t2">$2,000 from 2026 under OBBBA</span></span><span class="amt"><span class="a1">$600</span></span></div>
  <div class="row"><span class="tx"><span class="t1">Safe harbour target</span></span><span class="amt"><span class="a1">250 h</span></span></div>
  <div class="row"><span class="tx"><span class="t1">De minimis invoice</span></span><span class="amt"><span class="a1">$2,500</span></span></div>
</div>
<div class="note">Every figure is keyed to the tax year, so a 2025 payment is judged by 2025's rules however long afterwards you look at it.</div>
<button class="cta ghost">Run integrity check</button>
`, 'reports.html');

console.log('concept-2 written to', out);
