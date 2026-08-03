/**
 * Concept 3 — "Console". Split-pane master/detail, in the spirit of Notion
 * Calendar, Copilot Money and a mail client.
 *
 * Thesis: you never leave the list. Picking a row opens it in the right pane,
 * so reviewing eighty expenses is eighty glances rather than eighty round
 * trips through a detail page and back. A persistent command bar sits at the
 * top, filters are inline pills that read as a sentence, and the accent is
 * warm amber rather than the usual fintech blue.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), 'concept-3');
mkdirSync(out, { recursive: true });

const CSS = `
:root{
  --bg:#111110; --pane:#191917; --pane2:#1f1f1d; --line:#2a2a27; --line2:#3a3a35;
  --ink:#ededea; --dim:#a1a09a; --faint:#6f6e68;
  --amber:#ffb224; --amber-dim:#3b2a08;
  --green:#46a758; --red:#e5484d; --blue:#3e9bff; --plum:#ab6ee4;
  --mono:ui-monospace,"SF Mono",Menlo,monospace;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:var(--bg);color:var(--ink);font:13.5px/1.5 ui-sans-serif,system-ui,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;height:100vh;overflow:hidden}
a{color:inherit;text-decoration:none}

/* command bar */
.cmd{height:44px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid var(--line);background:var(--pane)}
.logo{display:flex;align-items:center;gap:7px;font-weight:600;font-size:13px;padding-right:6px;border-right:1px solid var(--line);margin-right:4px;height:24px}
.logo b{width:16px;height:16px;border-radius:5px;background:var(--amber);display:inline-block}
.omni{flex:1;max-width:520px;position:relative}
.omni input{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:7px;color:var(--ink);padding:6px 10px 6px 30px;font-size:13px;outline:none}
.omni svg{position:absolute;left:9px;top:7px;opacity:.45}
.omni .k{position:absolute;right:8px;top:6px;font:500 10px var(--mono);color:var(--faint);border:1px solid var(--line2);border-radius:4px;padding:1px 5px}
.cmdr{margin-left:auto;display:flex;align-items:center;gap:8px}
.yrsel{display:flex;background:var(--bg);border:1px solid var(--line);border-radius:7px;overflow:hidden}
.yrsel a{padding:5px 10px;font:600 11.5px var(--mono);color:var(--faint)}
.yrsel a.on{background:var(--amber);color:#231803}
.who{width:24px;height:24px;border-radius:50%;background:linear-gradient(140deg,var(--amber),var(--plum));font:600 10px/24px sans-serif;text-align:center;color:#231803}

/* layout */
.body{display:grid;grid-template-columns:190px 1fr;height:calc(100vh - 44px)}
.side{border-right:1px solid var(--line);background:var(--pane);overflow-y:auto;padding:10px 8px}
.side h6{font:600 10px/1 ui-sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);padding:12px 8px 6px}
.side a{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;color:var(--dim);font-size:13px}
.side a:hover{background:var(--pane2);color:var(--ink)}
.side a.on{background:var(--amber-dim);color:var(--amber)}
.side a .n{margin-left:auto;font:500 10.5px var(--mono);color:var(--faint)}
.side .sw{width:6px;height:6px;border-radius:2px;flex:none}

.split{display:grid;grid-template-columns:minmax(0,1fr) 400px;min-width:0}
.split.full{grid-template-columns:minmax(0,1fr)}
.list{overflow-y:auto;min-width:0;border-right:1px solid var(--line)}
.detail{overflow-y:auto;background:var(--pane);padding:20px}

/* filter sentence */
.sentence{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:11px 16px;border-bottom:1px solid var(--line);font-size:13px;color:var(--dim);position:sticky;top:0;background:var(--bg);z-index:2}
.fp{display:inline-flex;align-items:center;gap:5px;background:var(--pane2);border:1px solid var(--line2);border-radius:6px;padding:3px 8px;color:var(--ink);font-size:12.5px}
.fp.amber{background:var(--amber-dim);border-color:#54400f;color:var(--amber)}
.fp .x{color:var(--faint);font-size:14px;line-height:1}
.addf{color:var(--faint);border:1px dashed var(--line2);border-radius:6px;padding:3px 8px;font-size:12.5px}

/* rows */
.r{display:grid;grid-template-columns:74px 1fr auto;gap:12px;padding:9px 16px;border-bottom:1px solid #202020;cursor:pointer;align-items:center}
.r:hover{background:var(--pane)}
.r.sel{background:var(--pane2);box-shadow:inset 2px 0 0 var(--amber)}
.r .d{font:500 11.5px var(--mono);color:var(--faint)}
.r .m{min-width:0}
.r .m b{display:block;font-weight:500;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r .m span{font-size:12px;color:var(--faint)}
.r .a{text-align:right;font:600 13.5px var(--mono);white-space:nowrap}
.r .a small{display:block;font:500 11px var(--mono);color:var(--faint);margin-top:1px}
.gh{padding:7px 16px;font:600 10.5px ui-sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);background:var(--pane);border-bottom:1px solid var(--line);position:sticky;top:41px;z-index:1}

/* detail pane */
.dh{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);font-weight:600;margin:22px 0 9px}
.dh:first-child{margin-top:0}
.title{font-size:19px;font-weight:600;letter-spacing:-.02em}
.hero{font:600 32px/1 var(--mono);letter-spacing:-.03em;margin:12px 0 4px}
.sub{color:var(--faint);font-size:12.5px}
.kv{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid #232322;font-size:13px}
.kv:last-child{border:0}
.kv dt{color:var(--faint)}
.kv dd{font-family:var(--mono);text-align:right}
.split2{height:6px;border-radius:3px;overflow:hidden;display:flex;background:var(--pane2);margin:14px 0 8px}
.split2 i{height:100%}
.lg{display:flex;gap:14px;font-size:12px;color:var(--dim);flex-wrap:wrap}
.lg i{width:8px;height:8px;border-radius:2px;display:inline-block;margin-right:6px}
.tag{display:inline-block;font:500 11px ui-sans-serif;padding:2px 7px;border-radius:5px}
.t-g{background:rgba(70,167,88,.15);color:var(--green)}
.t-a{background:rgba(255,178,36,.15);color:var(--amber)}
.t-p{background:rgba(171,110,228,.15);color:var(--plum)}
.t-d{background:rgba(161,160,154,.13);color:var(--dim)}
.act{display:flex;gap:7px;margin-top:16px;flex-wrap:wrap}
.bt{border:1px solid var(--line2);background:var(--pane2);color:var(--ink);border-radius:7px;padding:6px 11px;font-size:12.5px;cursor:pointer}
.bt.p{background:var(--amber);border-color:var(--amber);color:#231803;font-weight:600}
.callout{border-left:2px solid var(--amber);background:#1c1710;padding:10px 12px;border-radius:0 7px 7px 0;font-size:12.5px;color:var(--dim);margin:12px 0;line-height:1.55}
.callout b{color:var(--ink)}

/* full-width content */
.pad{padding:20px;overflow-y:auto;height:100%}
.cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.c{background:var(--pane);border:1px solid var(--line);border-radius:10px;padding:15px}
.c .k{font-size:11.5px;color:var(--faint);letter-spacing:.03em}
.c .v{font:600 24px/1.1 var(--mono);letter-spacing:-.025em;margin-top:7px}
.c .s{font-size:12px;color:var(--faint);margin-top:6px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font:600 10.5px ui-sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);padding:9px 14px;border-bottom:1px solid var(--line)}
th.n,td.n{text-align:right;font-family:var(--mono)}
td{padding:10px 14px;border-bottom:1px solid #202020}
tr:last-child td{border:0}
.tw{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--pane)}
.f{margin-bottom:13px}
.f label{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin-bottom:5px}
.f input,.f select{width:100%;background:var(--bg);border:1px solid var(--line2);border-radius:7px;color:var(--ink);padding:8px 10px;font-size:13.5px;outline:none;font-family:inherit}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.green{color:var(--green)}.red{color:var(--red)}.amberc{color:var(--amber)}.dimc{color:var(--faint)}
@media(max-width:1000px){.body{grid-template-columns:1fr}.side{display:none}.split{grid-template-columns:1fr}.detail{display:none}}
`;

const SIDE = [
  ['Review', [
    ['entries.html', 'Expenses', '78', 'var(--amber)'],
    ['income.html', 'Rent', '13', 'var(--green)'],
    ['time.html', 'Time', '0', 'var(--red)'],
    ['trips.html', 'Mileage', '5', 'var(--blue)'],
  ]],
  ['Records', [
    ['properties.html', 'Properties', '4', 'var(--plum)'],
    ['jobs.html', 'Jobs', '2', 'var(--dim)'],
    ['people.html', 'People', '6', 'var(--dim)'],
  ]],
  ['Close the year', [
    ['index.html', 'Overview', '', 'var(--dim)'],
    ['year-end.html', 'Year-end', '', 'var(--dim)'],
    ['reports.html', 'Reports', '12', 'var(--dim)'],
    ['settings.html', 'Settings', '', 'var(--dim)'],
  ]],
];

const shell = (active, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Console</title><style>${CSS}</style></head><body>
<div class="cmd">
  <span class="logo"><b></b>Console</span>
  <div class="omni">
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="4.2"/><path d="M9.2 9.2 12.5 12.5"/></svg>
    <input placeholder="Search or jump to…"><span class="k">⌘K</span>
  </div>
  <div class="cmdr">
    <div class="yrsel"><a class="on">2025</a><a>2024</a><a>2023</a></div>
    <span class="who">AG</span>
  </div>
</div>
<div class="body">
  <aside class="side">
    ${SIDE.map(([g, items]) => `<h6>${g}</h6>${items.map(([h, l, n, c]) => `<a href="${h}" class="${h === active ? 'on' : ''}"><span class="sw" style="background:${c}"></span>${l}${n ? `<span class="n">${n}</span>` : ''}</a>`).join('')}`).join('')}
  </aside>
  ${inner}
</div></body></html>`;

const write = (f, active, inner) => writeFileSync(resolve(out, f), shell(active, inner), 'utf8');

/* ---- expenses: the flagship split view ---- */
const rows = [
  ['NOV', [
    ['28 Nov', 'Big Alz Handyman', 'Creedmore · Repairs · INV011307', '$8,244.00', '$2,500.00 paid', true],
    ['26 Nov', 'The Home Depot', 'Creedmore · LVP flooring', '$6,959.53', 'Capital', false],
    ['18 Nov', 'Closing — hazard insurance', 'Creedmore · Insurance', '$1,072.56', '', false],
  ]],
  ['DEC', [
    ['07 Dec', 'Sherwin-Williams', 'Creedmore · Rehab paint', '$2,164.47', 'Capital', false],
    ['31 Dec', 'Mileage — operating', 'Arbordale · 812.1 mi', '$568.47', '', false],
    ['31 Dec', 'Mileage — acquisition', 'Creedmore · basis', '$181.72', 'Basis', false],
  ]],
  ['EARLIER', [
    ['20 May', 'Facebook — Furniture', 'Arbordale', '$6,500.00', 'Capital', false],
    ['28 Apr', 'Facebook — Refrigerator', 'Westmill', '$480.00', 'Capital', false],
    ['27 Jan', 'Big Alz Handyman', 'Westmill · Repairs', '$6,510.53', '', false],
    ['06 Jan', 'Cleaning services', 'Westmill · Cleaning', '$430.00', '', false],
  ]],
];

write('entries.html', 'entries.html', `
<div class="split">
  <div class="list">
    <div class="sentence">
      Showing
      <span class="fp amber">expenses <span class="x">×</span></span>
      in <span class="fp">2025 <span class="x">×</span></span>
      for <span class="fp">all properties <span class="x">×</span></span>
      <span class="addf">+ filter</span>
      <span style="margin-left:auto;font-family:var(--mono);font-size:12px">78 · $55,306.20</span>
    </div>
    ${rows.map(([g, items]) => `<div class="gh">${g}</div>${items.map(([d, t, s, a, note, sel]) => `
      <div class="r${sel ? ' sel' : ''}">
        <span class="d">${d}</span>
        <span class="m"><b>${t}</b><span>${s}</span></span>
        <span class="a">${a}${note ? `<small${note.includes('paid') ? ' class="amberc"' : ''}>${note}</small>` : ''}</span>
      </div>`).join('')}`).join('')}
  </div>

  <div class="detail">
    <div class="title">Big Alz Moving n Handyman</div>
    <div class="sub">Invoice INV011307 · 28 November 2025</div>
    <div class="hero">$8,244.00</div>
    <div class="split2"><i style="width:30.3%;background:var(--green)"></i><i style="width:69.7%;background:var(--amber)"></i></div>
    <div class="lg"><span><i style="background:var(--green)"></i>$2,500.00 paid</span><span><i style="background:var(--amber)"></i>$5,744.00 scheduled</span></div>
    <div class="callout">Cash basis deducts when the money moves, so <b>2025 sees $2,500.00</b>. The balance lands in 2026 the day you confirm it went out.</div>

    <div class="dh">Payments</div>
    <dl>
      <div class="kv"><dt>28 Nov 2025 · check</dt><dd class="green">$2,500.00</dd></div>
      <div class="kv"><dt>15 Jan 2026 · scheduled</dt><dd class="amberc">$5,744.00</dd></div>
      <div class="kv"><dt>Unaccounted for</dt><dd>$0.00</dd></div>
    </dl>

    <div class="dh">Record</div>
    <dl>
      <div class="kv"><dt>Property</dt><dd>Creedmore ct</dd></div>
      <div class="kv"><dt>Schedule E line</dt><dd>14 · Repairs</dd></div>
      <div class="kv"><dt>Classification</dt><dd><span class="tag t-a">Needs review</span></dd></div>
      <div class="kv"><dt>Cost treatment</dt><dd><span class="tag t-p">Acquisition</span></dd></div>
      <div class="kv"><dt>Receipt</dt><dd><span class="tag t-g">On file</span></dd></div>
    </dl>

    <div class="act">
      <button class="bt p">Confirm January payment</button>
      <button class="bt">Edit</button>
      <button class="bt">Delete</button>
    </div>
  </div>
</div>`);

write('index.html', 'index.html', `
<div class="split full"><div class="pad">
  <div class="cards">
    <div class="c"><div class="k">Rent received</div><div class="v">$66,127.00</div><div class="s">13 receipts</div></div>
    <div class="c"><div class="k">Deductible</div><div class="v">$55,085.53</div><div class="s">78 expenses paid</div></div>
    <div class="c"><div class="k">Net before depreciation</div><div class="v green">+$11,041.47</div><div class="s">Schedule E</div></div>
    <div class="c"><div class="k">Capital added</div><div class="v plum" style="color:var(--plum)">$20,869.57</div><div class="s">outside the net</div></div>
    <div class="c"><div class="k">Hours logged</div><div class="v red">0.0</div><div class="s">target 250</div></div>
  </div>

  <div class="dh">Per property</div>
  <div class="tw"><table>
    <thead><tr><th>Property</th><th>Available from</th><th class="n">Rent</th><th class="n">Deductible</th><th class="n">Net</th><th class="n">Capital</th></tr></thead>
    <tbody>
      <tr><td>Kettlewell</td><td class="dimc">Oct 2019</td><td class="n">$25,400.00</td><td class="n">$12,576.00</td><td class="n green">+$12,824.00</td><td class="n dimc">—</td></tr>
      <tr><td>Westmill</td><td class="dimc">Feb 2023</td><td class="n">$26,489.00</td><td class="n">$21,966.47</td><td class="n green">+$4,522.53</td><td class="n">$970.00</td></tr>
      <tr><td>Arbordale</td><td class="dimc">Jan 2025</td><td class="n">$14,238.00</td><td class="n">$14,897.52</td><td class="n red">−$659.52</td><td class="n">$10,775.57</td></tr>
      <tr><td>Creedmore</td><td class="dimc">Dec 2025</td><td class="n">$0.00</td><td class="n">$5,645.54</td><td class="n red">−$5,645.54</td><td class="n">$9,124.00</td></tr>
    </tbody>
  </table></div>

  <div class="dh">Waiting on you</div>
  <div class="tw"><table><tbody>
    <tr><td><span class="tag t-a">Review</span></td><td>3 expenses on physical work have no repair-or-improvement answer</td><td class="n"><a class="bt" href="entries.html">Open</a></td></tr>
    <tr><td><span class="tag t-a">W-9</span></td><td>Big Alz has been paid $10,744.53 with no W-9 on file</td><td class="n"><a class="bt" href="people.html">Open</a></td></tr>
    <tr><td><span class="tag t-p">Planned</span></td><td>$5,744.00 scheduled for 15 January 2026</td><td class="n"><a class="bt" href="entries.html">Open</a></td></tr>
  </tbody></table></div>
</div></div>`);

write('year-end.html', 'year-end.html', `
<div class="split">
  <div class="list">
    <div class="sentence">Closing <span class="fp amber">2025</span> <span style="margin-left:auto;font-size:12px">3 of 4 done</span></div>
    <div class="gh">The four things</div>
    <div class="r sel"><span class="d">01</span><span class="m"><b>The 1098s</b><span>4 lenders · $16,213.35 interest</span></span><span class="a"><span class="tag t-g">Done</span></span></div>
    <div class="r"><span class="d">02</span><span class="m"><b>Rent against the 1099</b><span>Both managed properties square</span></span><span class="a"><span class="tag t-g">Done</span></span></div>
    <div class="r"><span class="d">03</span><span class="m"><b>Payments still planned</b><span>$5,744.00 due 15 Jan 2026</span></span><span class="a"><span class="tag t-a">1 open</span></span></div>
    <div class="r"><span class="d">04</span><span class="m"><b>Figures from your CPA</b><span>Depreciation, carryforwards</span></span><span class="a"><span class="tag t-d">Waiting</span></span></div>
    <div class="gh">By property</div>
    ${[['Kettlewell','Rocket Mortgage LLC','$4,919.11'],['Westmill','JPMorgan Chase Bank','$4,215.52'],['Arbordale','Freedom Mortgage','$6,446.90'],['Creedmore','loanDepot.com LLC','$631.82']]
      .map(([p,l,i]) => `<div class="r"><span class="d">1098</span><span class="m"><b>${p}</b><span>${l}</span></span><span class="a">${i}</span></div>`).join('')}
  </div>
  <div class="detail">
    <div class="title">Kettlewell · the 1098s</div>
    <div class="sub">One lender this year. Servicing can transfer mid-year, which is why these group by property rather than by bank.</div>
    <div class="dh">Rocket Mortgage LLC</div>
    <dl>
      <div class="kv"><dt>Interest · box 1</dt><dd>$4,919.11</dd></div>
      <div class="kv"><dt>Property tax · box 10</dt><dd>$3,317.92</dd></div>
      <div class="kv"><dt>Read from</dt><dd class="dimc">Supplemental block</dd></div>
      <div class="kv"><dt>Insurance from escrow</dt><dd>$886.50</dd></div>
      <div class="kv"><dt>Originated</dt><dd>2018-05-10</dd></div>
      <div class="kv"><dt>Rate</dt><dd>3.625%</dd></div>
    </dl>
    <div class="callout">Box 10 was blank on all four 2025 forms. The tax and insurance figures were in a supplemental block below the numbered boxes — recorded here so next January does not repeat the hunt.</div>
    <div class="dh">Rent against the 1099</div>
    <dl>
      <div class="kv"><dt>Banked</dt><dd>$25,400.00</dd></div>
      <div class="kv"><dt>1099 box 1</dt><dd>$26,240.00</dd></div>
      <div class="kv"><dt>Fee kept at source</dt><dd>$770.00</dd></div>
      <div class="kv"><dt>Held at year end</dt><dd>$70.00</dd></div>
      <div class="kv"><dt>Still unexplained</dt><dd class="green">$0.00</dd></div>
    </dl>
    <div class="act"><button class="bt p">Add a lender</button><button class="bt">Edit</button></div>
  </div>
</div>`);

write('properties.html', 'properties.html', `
<div class="split">
  <div class="list">
    <div class="sentence">Showing <span class="fp amber">4 properties</span> <span class="addf">+ filter</span></div>
    <div class="r sel"><span class="d">🏚</span><span class="m"><b>Creedmore ct</b><span>1109 Creedmore Ct, Charlotte NC</span></span><span class="a">$0.00<small>rent 2025</small></span></div>
    <div class="r"><span class="d">🏠</span><span class="m"><b>Kettlewell</b><span>16824 Kettlewell Lane, Charlotte NC</span></span><span class="a">$25,400<small>rent 2025</small></span></div>
    <div class="r"><span class="d">🏡</span><span class="m"><b>Westmill</b><span>17334 Westmill Ln, Charlotte NC</span></span><span class="a">$26,489<small>rent 2025</small></span></div>
    <div class="r"><span class="d">🏘</span><span class="m"><b>Arbordale way</b><span>5120 Arbordale Way, Mt Holly NC</span></span><span class="a">$14,238<small>rent 2025</small></span></div>
  </div>
  <div class="detail">
    <div class="title">Creedmore ct</div>
    <div class="sub">1109 Creedmore Ct, Charlotte NC 28215</div>
    <div class="dh">Key dates</div>
    <dl>
      <div class="kv"><dt>Acquired</dt><dd class="dimc">not recorded</dd></div>
      <div class="kv"><dt>Listed / available</dt><dd>2025-12-02</dd></div>
      <div class="kv"><dt>First tenant</dt><dd class="dimc">not recorded</dd></div>
      <div class="kv"><dt>Managed by</dt><dd>JKN Realty</dd></div>
    </dl>
    <div class="callout">Listed / available is where depreciation starts. Everything spent before it falls on the acquisition side — here that is <b>$9,124.00</b> and <b>259.6 miles</b>.</div>
    <div class="dh">Off the closing statement</div>
    <dl>
      <div class="kv"><dt>Purchase price</dt><dd>$378,500.00</dd></div>
      <div class="kv"><dt>Closing costs</dt><dd>$5,204.57</dd></div>
      <div class="kv"><dt>Land value</dt><dd class="dimc">not recorded</dd></div>
      <div class="kv"><dt>Unadjusted basis</dt><dd class="dimc">your CPA fills this</dd></div>
    </dl>
    <div class="act"><button class="bt p">Edit details</button><button class="bt">Management history</button></div>
  </div>
</div>`);

write('reports.html', 'reports.html', `
<div class="split full"><div class="pad">
  <div class="dh" style="margin-top:0">Schedule E · 2025</div>
  <div class="tw"><table>
    <thead><tr><th>Property</th><th class="n">Rent</th><th class="n">Ledger</th><th class="n">1098</th><th class="n">CPA</th><th class="n">Net</th><th class="n">Capital</th></tr></thead>
    <tbody>
      <tr><td>Kettlewell</td><td class="n">$25,400.00</td><td class="n">$3,452.47</td><td class="n">$9,123.53</td><td class="n dimc">—</td><td class="n green">+$12,824.00</td><td class="n dimc">—</td></tr>
      <tr><td>Westmill</td><td class="n">$26,489.00</td><td class="n">$12,476.53</td><td class="n">$9,489.94</td><td class="n dimc">—</td><td class="n green">+$4,522.53</td><td class="n">$970.00</td></tr>
      <tr><td>Arbordale</td><td class="n">$14,238.00</td><td class="n">$4,233.30</td><td class="n">$10,664.22</td><td class="n dimc">—</td><td class="n red">−$659.52</td><td class="n">$10,775.57</td></tr>
      <tr><td>Creedmore</td><td class="n">$0.00</td><td class="n">$5,013.72</td><td class="n">$631.82</td><td class="n dimc">—</td><td class="n red">−$5,645.54</td><td class="n">$9,124.00</td></tr>
    </tbody>
  </table></div>
  <div class="callout">Ledger amounts are what actually left the bank. A line fed by both the ledger and a 1098 shows twice on purpose — that is a possible double count, and merging them would hide it.</div>
  <div class="dh">Twelve files for your CPA</div>
  <div class="cards">
    ${['Schedule E summary','Every expense','Every payment','Rent received','Rent vs 1099','Time log','Mileage log','Jobs rolled up','Contractors & W-9','Mortgage & escrow','CPA figures','Property facts']
      .map((n) => `<a class="c" href="#"><div class="k">CSV</div><div style="font-size:14px;font-weight:500;margin-top:6px">${n}</div></a>`).join('')}
  </div>
</div></div>`);

write('income.html', 'income.html', `
<div class="split">
  <div class="list">
    <div class="sentence">Showing <span class="fp amber">rent</span> in <span class="fp">2025</span> <span class="addf">+ filter</span><span style="margin-left:auto;font-family:var(--mono);font-size:12px">$66,127.00</span></div>
    <div class="r sel"><span class="d">31 Dec</span><span class="m"><b>Westmill</b><span>Year total disbursed by JKN Realty</span></span><span class="a">$26,489.00</span></div>
    <div class="r"><span class="d">31 Dec</span><span class="m"><b>Kettlewell</b><span>Year total disbursed by JKN Realty</span></span><span class="a">$25,400.00</span></div>
    <div class="r"><span class="d">06 May</span><span class="m"><b>Arbordale</b><span>Direct from tenant · rent</span></span><span class="a">$1,860.00</span></div>
    <div class="r"><span class="d">02 Jul</span><span class="m"><b>Arbordale</b><span>Prorated first month</span></span><span class="a">$1,197.00</span></div>
    <div class="r"><span class="d">30 Jun</span><span class="m"><b>Arbordale</b><span>One-time</span></span><span class="a">$496.00</span></div>
  </div>
  <div class="detail">
    <div class="title">Westmill</div>
    <div class="sub">Year total disbursed by JKN Realty</div>
    <div class="hero">$26,489.00</div>
    <div class="dh">Against the 1099</div>
    <dl>
      <div class="kv"><dt>Banked</dt><dd>$26,489.00</dd></div>
      <div class="kv"><dt>1099 box 1</dt><dd>$27,910.00</dd></div>
      <div class="kv"><dt>Management fee kept</dt><dd>$720.00</dd></div>
      <div class="kv"><dt>Repair paid out of rent</dt><dd>$631.00</dd></div>
      <div class="kv"><dt>Held at year end</dt><dd>$70.00</dd></div>
      <div class="kv"><dt>Still unexplained</dt><dd class="green">$0.00</dd></div>
    </dl>
    <div class="callout">The manager collects the gross, keeps their fee and remits the balance — so the gross never touches your account. What is banked plus what was explained is exactly what the 1099 reports.</div>
  </div>
</div>`);

write('time.html', 'time.html', `
<div class="split full"><div class="pad">
  <div style="max-width:520px;margin:60px auto;text-align:center">
    <div class="hero red" style="font-size:52px">0.0</div>
    <div class="sub" style="font-size:14px;margin-top:10px">hours logged in 2025, against a 250-hour target</div>
    <div class="callout" style="text-align:left;margin-top:24px">The spreadsheet never captured a single hour. The safe harbour needs a <b>contemporaneous</b> log — one written on the day. A reconstruction after the fact is weaker evidence, which is exactly why this is the gap worth closing in 2026.</div>
    <div class="act" style="justify-content:center"><button class="bt p">Log time</button><button class="bt">Start a timer</button></div>
  </div>
</div></div>`);

write('trips.html', 'trips.html', `
<div class="split full"><div class="pad">
  <div class="cards">
    <div class="c"><div class="k">Miles in 2025</div><div class="v">1,252.5</div><div class="s">5 aggregate rows</div></div>
    <div class="c"><div class="k">Operating</div><div class="v green">992.9</div></div>
    <div class="c"><div class="k">Acquisition side</div><div class="v" style="color:var(--plum)">259.6</div><div class="s">Creedmore, before it was available</div></div>
  </div>
  <div class="dh">By property</div>
  <div class="tw"><table>
    <thead><tr><th>Property</th><th>Purpose</th><th>Side</th><th class="n">Miles</th></tr></thead>
    <tbody>
      <tr><td>Arbordale</td><td class="dimc">Year total · 37 trips</td><td><span class="tag t-g">Operating</span></td><td class="n">812.1</td></tr>
      <tr><td>Creedmore</td><td class="dimc">Due diligence, showings</td><td><span class="tag t-p">Acquisition</span></td><td class="n">259.6</td></tr>
      <tr><td>Westmill</td><td class="dimc">Year total · 27 trips</td><td><span class="tag t-g">Operating</span></td><td class="n">103.3</td></tr>
      <tr><td>Kettlewell</td><td class="dimc">Year total · 9 trips</td><td><span class="tag t-g">Operating</span></td><td class="n">58.6</td></tr>
      <tr><td>Portfolio</td><td class="dimc">iPad purchase · 2 trips</td><td><span class="tag t-g">Operating</span></td><td class="n">18.9</td></tr>
    </tbody>
  </table></div>
  <div class="callout">Aggregated from the 2025 MileIQ log, so these are year totals rather than single journeys. Marked as reconstructed, because they are.</div>
</div></div>`);

write('jobs.html', 'jobs.html', `
<div class="split">
  <div class="list">
    <div class="sentence">Showing <span class="fp amber">2 jobs</span></div>
    <div class="r sel"><span class="d">💻</span><span class="m"><b>Laptop for rental bookkeeping</b><span>5 records · 2 dates</span></span><span class="a">$1,429.00</span></div>
    <div class="r"><span class="d">🔨</span><span class="m"><b>Creedmore make-ready</b><span>7 records</span></span><span class="a">$9,124.00</span></div>
  </div>
  <div class="detail">
    <div class="title">Laptop for rental bookkeeping</div>
    <div class="sub">Portfolio-wide · rolled up under 2025 rules</div>
    <div class="dh">Rollup</div>
    <dl>
      <div class="kv"><dt>Time logged</dt><dd>2.00 h</dd></div>
      <div class="kv"><dt>Counting toward 250</dt><dd>1.33 h</dd></div>
      <div class="kv"><dt>Miles</dt><dd>18.4</dd></div>
      <div class="kv"><dt>Paid</dt><dd>$1,429.00</dd></div>
    </dl>
    <div class="callout">Nothing here is stored. Ask for 2026 and the same five records answer differently — which is why the job itself carries no figures at all.</div>
    <div class="dh">Records</div>
    <dl>
      <div class="kv"><dt>Mon · searched for laptops</dt><dd>45 m</dd></div>
      <div class="kv"><dt>Tue · drive to the store</dt><dd class="dimc">40 m · not eligible</dd></div>
      <div class="kv"><dt>Tue · spec, negotiate, pay</dt><dd>35 m</dd></div>
      <div class="kv"><dt>Tue · 18.4 miles</dt><dd>18.4 mi</dd></div>
      <div class="kv"><dt>Tue · the invoice</dt><dd>$1,429.00</dd></div>
    </dl>
    <div class="act"><button class="bt">+ Add related</button><button class="bt">Delete job, keep records</button></div>
  </div>
</div>`);

write('people.html', 'people.html', `
<div class="split">
  <div class="list">
    <div class="sentence">Showing <span class="fp amber">people</span> <span class="addf">+ filter</span></div>
    <div class="gh">Household</div>
    <div class="r"><span class="d">👤</span><span class="m"><b>Amit Gandhi</b><span>Owner</span></span><span class="a"></span></div>
    <div class="gh">Contractors &amp; managers</div>
    <div class="r sel"><span class="d">🔨</span><span class="m"><b>Big Alz Moving n Handyman</b><span>Contractor</span></span><span class="a">$10,744.53<small class="amberc">W-9 missing</small></span></div>
    <div class="r"><span class="d">🏢</span><span class="m"><b>JKN Realty</b><span>Property manager</span></span><span class="a">—</span></div>
    <div class="r"><span class="d">🧹</span><span class="m"><b>Community Unity Connections</b><span>Contractor</span></span><span class="a">$195.00</span></div>
  </div>
  <div class="detail">
    <div class="title">Big Alz Moving n Handyman</div>
    <div class="sub">Contractor</div>
    <div class="hero">$10,744.53</div>
    <div class="sub">paid in 2025 across 7 invoices</div>
    <div class="dh">Reporting</div>
    <dl>
      <div class="kv"><dt>W-9 on file</dt><dd><span class="tag t-a">No</span></dd></div>
      <div class="kv"><dt>Tax ID collected</dt><dd><span class="tag t-a">No</span></dd></div>
      <div class="kv"><dt>2025 threshold</dt><dd>$600.00</dd></div>
      <div class="kv"><dt>Reportable for 2025</dt><dd class="amberc">Yes</dd></div>
      <div class="kv"><dt>Reportable for 2026</dt><dd class="dimc">Same amount, threshold $2,000</dd></div>
    </dl>
    <div class="callout">The threshold moved from $600 to <b>$2,000</b> for payments after 31 December 2025 under OBBBA. The app keeps both, so a 2025 payment is always judged by 2025's rule.</div>
    <div class="act"><button class="bt p">Mark W-9 received</button><button class="bt">Edit</button></div>
  </div>
</div>`);

write('log.html', 'entries.html', `
<div class="split full"><div class="pad">
  <div style="max-width:460px">
    <div class="title" style="margin-bottom:4px">Log an expense</div>
    <div class="sub" style="margin-bottom:20px">Five fields. Everything else is derived.</div>
    <div class="f"><label>How much</label><input value="124.99" style="font-family:var(--mono);font-size:22px;padding:12px"></div>
    <div class="f"><label>Paid to</label><input placeholder="Home Depot"></div>
    <div class="g2">
      <div class="f"><label>Schedule E line</label><select><option>15 · Supplies</option><option>14 · Repairs</option></select></div>
      <div class="f"><label>Property</label><select><option>Arbordale</option><option>Creedmore</option></select></div>
    </div>
    <div class="f"><label>When</label><input type="date" value="2025-12-31"></div>
    <div class="callout">Supplies is spend on physical work, so it needs a repair-or-improvement answer before year end. It will sit in the review list until then.</div>
    <div class="act"><button class="bt p">Save expense</button><button class="bt">Save and add another</button></div>
  </div>
</div></div>`);

write('settings.html', 'settings.html', `
<div class="split full"><div class="pad">
  <div class="cards">
    <div class="c"><div class="k">Enterprise</div><div style="font-size:15px;margin-top:6px">Residential portfolio</div><div class="s">4 properties · residential</div></div>
    <div class="c"><div class="k">Active tax year</div><div class="v">2026</div><div class="s">viewing 2025</div></div>
    <div class="c"><div class="k">Integrity</div><div class="v green" style="font-size:17px">No errors</div><div class="s">3 warnings</div></div>
  </div>
  <div class="dh">Rules in force for 2025</div>
  <div class="tw"><table>
    <thead><tr><th>Rule</th><th class="n">2025</th><th class="n">2026</th><th>Why it differs</th></tr></thead>
    <tbody>
      <tr><td>1099 reporting threshold</td><td class="n">$600.00</td><td class="n amberc">$2,000.00</td><td class="dimc">OBBBA, payments after 31 Dec 2025</td></tr>
      <tr><td>Safe harbour target</td><td class="n">250 h</td><td class="n">250 h</td><td class="dimc">Rev. Proc. 2019-38</td></tr>
      <tr><td>De minimis invoice</td><td class="n">$2,500.00</td><td class="n">$2,500.00</td><td class="dimc">unchanged</td></tr>
    </tbody>
  </table></div>
  <div class="callout">Every figure is keyed to the tax year rather than held as one constant. That is why the same $1,400 contractor is reportable in 2025 and not in 2026 — the app never applies this year's rule to last year's money.</div>
</div></div>`);

console.log('concept-3 written to', out);
