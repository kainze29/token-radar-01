'use strict';
var D = window.RADAR;
var rows = D.rows, live = D.liveRows;
var maxImplied = rows.length ? rows[0].implied_value_usd : 1;

function $(s) { return document.querySelector(s); }
function money(v) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(v);
}
function pct(v) { return (v === null || v === undefined) ? 'n/a' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; }
function ageText(d) {
  if (d === null || d === undefined) return 'n/a';
  if (d >= 365) return (d / 365).toFixed(1) + 'y';
  return d + 'd';
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function chainsText(chains) {
  if (!chains || !chains.length) return 'n/a';
  if (chains.length <= 2) return esc(chains.join(', '));
  return esc(chains.slice(0, 2).join(', ')) + ' +' + (chains.length - 2);
}
function wlBadge(slug) {
  return D.watchlist.indexOf(slug) >= 0 ? '<span class="wl">WATCHLIST</span>' : '';
}

function readHash() {
  var h = new URLSearchParams(location.hash.slice(1));
  return {
    q: h.get('q') || '', cat: h.get('category') || '', chain: h.get('chain') || '',
    tab: h.get('tab') || 'pre', sort: h.get('sort') || 'rank', p: h.get('p') || '',
  };
}
function writeHash() {
  var h = new URLSearchParams();
  if (S.q) h.set('q', S.q);
  if (S.cat) h.set('category', S.cat);
  if (S.chain) h.set('chain', S.chain);
  if (S.tab !== 'pre') h.set('tab', S.tab);
  if (S.sort !== 'rank') h.set('sort', S.sort);
  if (S.p) h.set('p', S.p);
  history.replaceState(null, '', '#' + h.toString());
}
var S = readHash();

function filtered(list) {
  var q = S.q.trim().toLowerCase();
  return list.filter(function (r) {
    if (S.cat && r.category !== S.cat) return false;
    if (S.chain && (!r.chains || r.chains.indexOf(S.chain) < 0)) return false;
    if (q) {
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
}
function sorted(list) {
  var out = list.slice();
  if (S.sort === 'tvl') out.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
  else if (S.sort === 'growth') out.sort(function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d); });
  else if (S.sort === 'age') out.sort(function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); });
  return out;
}

function renderMeta() {
  $('#asof').textContent = 'Snapshot: ' + D.asOf;
  $('#model').textContent = 'Model: ' + D.modelVersion + ' (category-calibrated)';
}
function renderStats() {
  var cats = {};
  rows.forEach(function (r) { cats[r.category || 'Unknown'] = 1; });
  var nCats = Object.keys(cats).length;
  $('#stats').innerHTML =
    stat('Protocols ranked', String(rows.length), 'farmable pre-token') +
    stat('Combined implied value', money(D.impliedSum), 'if every one launched today') +
    stat('Watchlist covered', D.watchlist.length + ' / ' + D.watchlist.length, 'every watchlist protocol ranked') +
    stat('Categories', String(nCats), 'across ' + rows.reduce(function (a, r) { return a + r.chains.length; }, 0) + ' chain listings');
  function stat(k, v, s) {
    return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
  }
}
function renderSpot() {
  $('#spot').innerHTML = rows.slice(0, 3).map(function (r) {
    return '<div class="card" data-slug="' + esc(r.slug) + '">' +
      '<div class="rk">RANK ' + r.rank + ' · ' + esc((r.category || '').toUpperCase()) + '</div>' +
      '<h3>' + esc(r.name) + '</h3><div class="cat">' + chainsText(r.chains) + '</div>' +
      '<div class="val">' + money(r.implied_value_usd) + '</div>' +
      '<div class="sub">TVL ' + money(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) + ' · ' + ageText(r.age_days) + ' with no token</div></div>';
  }).join('');
}
function renderChips() {
  var counts = {};
  rows.forEach(function (r) { counts[r.category || 'Unknown'] = (counts[r.category || 'Unknown'] || 0) + 1; });
  var cats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 12);
  var html = '<button data-cat="" class="' + (S.cat === '' ? 'on' : '') + '">All categories</button>';
  cats.forEach(function (c) {
    html += '<button data-cat="' + esc(c) + '" class="' + (S.cat === c ? 'on' : '') + '">' + esc(c) + ' (' + counts[c] + ')</button>';
  });
  $('#chips').innerHTML = html;
}
function renderChainOptions() {
  var set = {};
  rows.forEach(function (r) { (r.chains || []).forEach(function (c) { set[c] = 1; }); });
  var chains = Object.keys(set).sort();
  var sel = $('#chain');
  sel.innerHTML = '<option value="">All chains</option>' + chains.map(function (c) {
    return '<option value="' + esc(c) + '"' + (S.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
  }).join('');
}

function renderTable() {
  var isLive = S.tab === 'live';
  $('#sort').style.display = isLive ? 'none' : '';
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-tab') === S.tab);
  });
  if (isLive) {
    $('#thead').innerHTML = '<tr><th>#</th><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th class="num">7d</th></tr>';
    var list = sorted(filtered(live).slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }));
    $('#rows').innerHTML = list.map(function (r, i) {
      return '<tr style="cursor:default"><td class="rank">' + (i + 1) + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="mut">' + esc(r.category || 'n/a') + '</td><td class="mut">' + chainsText(r.chains) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num">' + r.ratio.toFixed(2) + 'x</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</td></tr>';
    }).join('');
    $('#count').textContent = 'Showing ' + list.length + ' of ' + live.length + ' live-token protocols, sorted by market cap. These are the calibration set the multiples are built from.';
    return;
  }
  $('#thead').innerHTML = '<tr><th data-k="rank">#</th><th data-k="name">Protocol</th><th data-k="category">Category</th><th>Chains</th><th data-k="tvl" class="num">TVL</th><th data-k="growth" class="num">7d</th><th data-k="age" class="num">Age</th><th data-k="implied" class="num">Implied value</th></tr>';
  var list2 = sorted(filtered(rows));
  $('#rows').innerHTML = list2.map(function (r) {
    var w = Math.max(2, Math.round(Math.sqrt(r.implied_value_usd / maxImplied) * 100));
    return '<tr data-slug="' + esc(r.slug) + '"><td class="rank">' + r.rank + '</td>' +
      '<td><span class="name">' + esc(r.name) + '</span>' + wlBadge(r.slug) + '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
      '<td class="mut">' + esc(r.category || 'n/a') + '</td><td class="mut">' + chainsText(r.chains) + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + ageText(r.age_days) + '</td>' +
      '<td class="num imp"><span class="barwrap"><span class="bar" style="width:' + w + '%"></span></span>' + money(r.implied_value_usd) + '</td></tr>';
  }).join('');
  $('#count').textContent = 'Showing ' + list2.length + ' of ' + rows.length + ' protocols · watchlist ' + D.watchlist.length + '/' + D.watchlist.length + ' covered · click a row for the farm plan.';
}

function whyText(r) {
  var parts = [];
  parts.push('Rank #' + r.rank + ' of ' + rows.length + ' farmable pre-token protocols.');
  parts.push('TVL ' + money(r.tvl_usd) + (r.rank <= 3 ? ' is among the largest on the board.' : ' is mid-sized for this board.'));
  if (D.multiples[r.category] !== undefined) {
    parts.push('The ' + (r.category || 'category') + ' multiple ' + r.multiple.toFixed(4) + 'x is the median market-cap/TVL of ' + D.multiplesMeta[r.category].n + ' live ' + (r.category || '') + ' tokens; the highest is ' + D.multiplesMeta[r.category].topLive + ' at ' + D.multiplesMeta[r.category].topRatio.toFixed(2) + 'x.');
  } else {
    parts.push('The ' + (r.category || 'category') + ' has too few live tokens to calibrate from, so it uses the global median multiple ' + r.multiple.toFixed(4) + 'x.');
  }
  if (r.change_7d !== null) {
    parts.push('Seven-day TVL ' + (r.change_7d >= 0 ? 'growth of +' : 'change of ') + r.change_7d.toFixed(1) + '% gives a growth factor of ' + r.growth_mult.toFixed(4) + 'x.');
  }
  parts.push('It has run ' + (r.age_days === null ? 'an unknown time' : r.age_days + ' days') + ' with no token, giving a maturity factor of ' + r.maturity_mult.toFixed(4) + 'x.');
  return parts.join(' ');
}

function openDetail(slug) {
  var r = null;
  rows.forEach(function (x) { if (x.slug === slug) r = x; });
  if (!r) return;
  var multNote = D.multiples[r.category] !== undefined
    ? 'Multiple source: median of ' + D.multiplesMeta[r.category].n + ' live comps, top ' + esc(D.multiplesMeta[r.category].topLive) + ' at ' + D.multiplesMeta[r.category].topRatio.toFixed(2) + 'x.'
    : 'Multiple source: global median, too few live comps in this category.';
  var steps = r.farm_steps.map(function (s) {
    var t = esc(s).replace(/Cost:/g, '<b>Cost:</b>').replace(/Time:/g, '<b>Time:</b>');
    return '<li>' + t + '</li>';
  }).join('');
  $('#drawer').innerHTML =
    '<button class="close" id="dclose" aria-label="Close">x</button>' +
    '<div class="drank">RANK ' + r.rank + ' · ' + esc((r.category || '').toUpperCase()) + (D.watchlist.indexOf(r.slug) >= 0 ? ' · WATCHLIST' : '') + '</div>' +
    '<h2>' + esc(r.name) + '</h2>' +
    '<p class="dsub">' + esc(r.chains.join(', ')) + ' · listed ' + (r.listed_at || 'unknown') + ' · ' + ageText(r.age_days) + ' with no token</p>' +
    '<div class="dimp"><div class="k">Implied launch value</div><div class="v">' + money(r.implied_value_usd) + '</div></div>' +
    '<h3>How the value is built</h3>' +
    '<table class="break">' +
    '<tr><td>TVL</td><td>' + money(r.tvl_usd) + '</td></tr>' +
    '<tr><td>Category multiple (' + esc(r.category || 'n/a') + ')</td><td>' + r.multiple.toFixed(4) + 'x</td></tr>' +
    '<tr><td>Growth factor (7d ' + pct(r.change_7d) + ')</td><td>' + r.growth_mult.toFixed(4) + 'x</td></tr>' +
    '<tr><td>Maturity factor (' + ageText(r.age_days) + ', no token)</td><td>' + r.maturity_mult.toFixed(4) + 'x</td></tr>' +
    '<tr class="tot"><td>Implied value</td><td>' + money(r.implied_value_usd) + '</td></tr></table>' +
    '<p class="why">' + multNote + '. ' + esc(whyText(r)) + '</p>' +
    '<h3>Farm plan: what to do</h3><ol>' + steps + '</ol>';
  $('#drawer').classList.add('open');
  $('#dclose').addEventListener('click', function () { closeDetail(); });
}
function closeDetail() {
  $('#drawer').classList.remove('open');
  if (S.p) { S.p = ''; writeHash(); }
}

function renderModel() {
  var cats = Object.keys(D.multiples).sort(function (a, b) { return D.multiples[b] - D.multiples[a]; });
  var mrows = cats.map(function (c) {
    var m = D.multiplesMeta[c];
    return '<tr><td>' + esc(c) + '</td><td class="num">' + D.multiples[c].toFixed(4) + 'x</td><td class="num">' + m.n + '</td><td class="num">' + esc(m.topLive) + ' (' + m.topRatio.toFixed(2) + 'x)</td></tr>';
  }).join('');
  mrows += '<tr><td>Global median (fallback)</td><td class="num">' + D.globalMultiple.toFixed(4) + 'x</td><td class="num">all</td><td class="num">used when a category has fewer than 3 live tokens</td></tr>';
  $('#modelsec').innerHTML =
    '<h2>How the radar works</h2>' +
    '<p class="lede">Implied value = <b>TVL x category multiple x growth x maturity</b>. The multiple is the median market-cap / TVL of live protocols in the same category, so a Basis Trading protocol is priced near 0.65x TVL while a Lending protocol is priced near 0.13x, because that is how their live peers actually trade. Growth rewards 7-day TVL momentum; maturity rewards time spent with no token. Nothing here is a hardcoded list of names: re-running the program on a new snapshot rebuilds every number from that snapshot.</p>' +
    '<div class="modelgrid"><div><h3>Category multiples, from live tokens in this snapshot</h3>' +
    '<table><thead><tr><th>Category</th><th class="num">Multiple</th><th class="num">Live comps</th><th class="num">Top comp</th></tr></thead><tbody>' + mrows + '</tbody></table>' +
    '<p class="fine">Multiples are medians over live protocols with a market cap (minimum 3 comparables), clamped to 0.05-1.00. Growth is 1 + clamp(7d change, -60, 120) / 100 x 0.5. Maturity is 0.6 + min(age in days, 1095) / 1095 x 0.4, with unknown age counted as 365 days.</p></div>' +
    '<div><h3>What counts as farmable</h3><ul>' +
    '<li><b>' + rows.length + ' protocols ranked.</b> Every pre-token protocol that could plausibly launch a token, including all ' + D.watchlist.length + ' watchlist protocols.</li>' +
    '<li><b>' + D.excludedCount + ' pre-token protocols excluded.</b> Bridges, wrapped assets, staked derivatives, CEX products, and versioned forks will never launch a farmable token, so they are not ranked as airdrop candidates.</li>' +
    '<li><b>Live tokens shown separately.</b> The Live tokens tab lists the actual market caps the multiples are calibrated on, so the model can be checked against real trading tokens.</li>' +
    '</ul></div></div>' +
    '<p class="fine">Snapshot: DefiLlama, ' + D.asOf + '. Implied values are model estimates, not investment advice. Farm plans are a starting point: check each protocol own points page and terms before depositing.</p>';
}

function syncInputs() {
  $('#q').value = S.q;
  $('#chain').value = S.chain;
  $('#sort').value = S.sort;
  renderChips();
}

renderMeta();
renderStats();
renderSpot();
renderChainOptions();
renderChips();
renderTable();
renderModel();
syncInputs();
if (S.p) openDetail(S.p);

$('#q').addEventListener('input', function (e) { S.q = e.target.value; writeHash(); renderTable(); });
$('#chain').addEventListener('change', function (e) { S.chain = e.target.value; writeHash(); renderTable(); });
$('#sort').addEventListener('change', function (e) { S.sort = e.target.value; writeHash(); renderTable(); });
$('#chips').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-cat]');
  if (!b) return;
  S.cat = b.getAttribute('data-cat');
  writeHash(); renderChips(); renderTable();
});
document.querySelectorAll('.tabs button').forEach(function (b) {
  b.addEventListener('click', function () { S.tab = b.getAttribute('data-tab'); writeHash(); renderTable(); });
});
$('#thead').addEventListener('click', function (e) {
  var th = e.target.closest('th[data-k]');
  if (!th) return;
  var k = th.getAttribute('data-k');
  S.sort = (k === 'rank' || k === 'implied') ? 'rank' : (k === 'tvl' ? 'tvl' : (k === 'growth' ? 'growth' : (k === 'age' ? 'age' : 'rank')));
  writeHash(); syncInputs(); renderTable();
});
document.addEventListener('click', function (e) {
  var card = e.target.closest('.card[data-slug]');
  if (card) { S.p = card.getAttribute('data-slug'); writeHash(); openDetail(S.p); return; }
  var row = e.target.closest('tr[data-slug]');
  if (row) { S.p = row.getAttribute('data-slug'); writeHash(); openDetail(S.p); }
});
window.addEventListener('hashchange', function () {
  S = readHash(); syncInputs(); renderTable();
  if (S.p) openDetail(S.p); else $('#drawer').classList.remove('open');
});
