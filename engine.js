/* Fantasy Front Office season engine
 * Shared by the browser (solo play) and the server (leagues), so both follow the same rules.
 * - Prospects, pro schedules and fantasy head-to-head schedules
 * - Week simulation with a play-by-play timeline for the live broadcast
 * - Standings, playoff bracket and champion
 * - News desk items (injuries, hot streaks, rumors, recaps) that change projections
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FFOEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SPORTS = {
    football: { name: 'Football', roles: ['QB', 'RB', 'WR', 'TE'], teams: ['Comets', 'Titans', 'Storm', 'Wolves', 'Knights', 'Falcons', 'Royals', 'Phoenix'], matchScores: [17, 38] },
    basketball: { name: 'Basketball', roles: ['PG', 'SG', 'SF', 'PF', 'C'], teams: ['Skyline', 'Velocity', 'Orbit', 'Dragons', 'Nova', 'Titans', 'Pulse', 'Monarchs'], matchScores: [86, 127] },
    baseball: { name: 'Baseball', roles: ['P', 'C', '1B', 'SS', 'OF'], teams: ['Harbor', 'Lightning', 'Rockets', 'Rivermen', 'Outlaws', 'Suns', 'Wolves', 'Pioneers'], matchScores: [2, 11] }
  };
  const FIRST = ['Jaxon', 'Mason', 'Elijah', 'Noah', 'Caleb', 'Roman', 'Asher', 'Luca', 'Owen', 'Ethan', 'Levi', 'Hudson', 'Micah', 'Grayson', 'Wyatt', 'Isaac', 'Carter', 'Logan', 'Nolan', 'Silas', 'Adrian', 'Riley', 'Jordan', 'Parker'];
  const LAST = ['Steele', 'Drake', 'Cross', 'Frost', 'Stone', 'King', 'Cole', 'Shaw', 'Price', 'Vale', 'Quinn', 'Pike', 'Reed', 'Holt', 'Banks', 'Lane', 'Voss', 'Pierce', 'Graves', 'West', 'Mills', 'Brooks', 'Hayes', 'Ford'];
  const SLOTS = 5, REG_WEEKS = 5, TOTAL_WEEKS = 7;
  const DURATIONS = [0, 30000, 75000];

  const rand = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const fillT = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
  const r4 = x => Math.round(x * 10000) / 10000;

  // ---------- prospects ----------
  function makePlayers(key) {
    const c = SPORTS[key];
    return Array.from({ length: 24 }, (_, i) => ({
      id: i, name: FIRST[i] + ' ' + LAST[i], team: c.teams[i % 8],
      // every franchise gets players in different positions
      role: c.roles[(i % 8 + Math.floor(i / 8)) % c.roles.length],
      proj: 15 + ((i * 7 + 11) % 17) + (key === 'basketball' ? 5 : 0),
      ceiling: 30 + ((i * 3) % 15) + (key === 'basketball' ? 5 : 0),
      risk: ['Low', 'Medium', 'High'][i % 3]
    }));
  }

  // ---------- schedules ----------
  // Fantasy head-to-head: 5 managers, round robin over 5 weeks (one bye each week)
  const H2H = [[[0, 1], [2, 3]], [[0, 2], [1, 4]], [[0, 3], [2, 4]], [[0, 4], [1, 3]], [[1, 2], [3, 4]]];
  const weekKind = w => (w <= REG_WEEKS ? 'regular' : w === REG_WEEKS + 1 ? 'semifinal' : 'final');
  const weekLabel = w => (w <= REG_WEEKS ? `Week ${w}` : w === REG_WEEKS + 1 ? 'Semifinals' : 'Championship');
  const weekPhrase = w => (w <= REG_WEEKS ? `Week ${w}` : w === REG_WEEKS + 1 ? 'the semifinals' : 'the championship');

  // Pro games: the 8 franchises play a round robin (circle method), 4 games per week
  function proGames(key, week) {
    const t = SPORTS[key].teams, r = (Math.max(1, week) - 1) % 7, arr = [0];
    for (let i = 0; i < 7; i++) arr.push(1 + ((i + r) % 7));
    return [0, 1, 2, 3].map(i => {
      const a = arr[i], b = arr[7 - i], swap = (i + r) % 2 === 1;
      return { id: i, home: t[swap ? b : a], away: t[swap ? a : b] };
    });
  }

  function matchupsFor(season, week) {
    const kind = weekKind(week);
    if (kind === 'regular') {
      const pairs = H2H[week - 1], used = new Set(pairs.flat());
      return { matchups: pairs.map(([a, b]) => ({ a, b, label: '' })), bye: [0, 1, 2, 3, 4].filter(i => !used.has(i)), out: [] };
    }
    const br = season.bracket;
    if (!br) return { matchups: [], bye: [], out: [] };
    if (kind === 'semifinal') return { matchups: [{ a: br.seeds[0], b: br.seeds[3], label: 'Semifinal' }, { a: br.seeds[1], b: br.seeds[2], label: 'Semifinal' }], bye: [], out: [br.seeds[4]] };
    return { matchups: [{ a: br.final[0], b: br.final[1], label: 'Championship' }, { a: br.third[0], b: br.third[1], label: 'Third place' }], bye: [], out: [br.seeds[4]] };
  }

  const newSeason = () => ({ week: 1, status: 'regular', weeks: [], news: {}, bracket: null, champion: null, runnerUp: null, third: null });

  // ---------- news effects ----------
  function newsMods(season, week) {
    const out = {};
    for (const n of (season && season.news && season.news[week]) || []) if (n.pid >= 0) out[n.pid] = n;
    return out;
  }
  const newsWeight = (mod, k) => 1 + ((mod ?? 1) - 1) * k;

  // ---------- play-by-play text ----------
  const FB = {
    td: { QB: ['{n} fires a {y}-yard touchdown strike', '{n} keeps it and dives in from {y} yards out'], RB: ['{n} bursts up the middle for a {y}-yard touchdown run', '{n} bounces outside and scores from {y} yards out'], WR: ['{n} hauls in a {y}-yard touchdown catch', '{n} beats the coverage for a {y}-yard score'], TE: ['{n} rumbles into the end zone from {y} yards', '{n} snags a {y}-yard touchdown over the middle'] },
    big: { QB: ['{n} connects deep for {y} yards', '{n} scrambles for {y} yards'], RB: ['{n} rips off a {y}-yard gain', '{n} breaks three tackles for {y} yards'], WR: ['{n} makes a diving {y}-yard grab', '{n} turns a short pass into a {y}-yard gain'], TE: ['{n} rumbles {y} yards after the catch', '{n} picks up {y} yards and a first down'] },
    fg: ['The {team} kick a {y}-yard field goal', 'A {y}-yard field goal puts three on the board for the {team}'],
    teamTd: 'The {team} punch in a {y}-yard touchdown',
    walkoff: 'The {team} drill a {y}-yard field goal as time expires'
  };
  const BB = {
    run: ['{n} drills back-to-back threes in a {k}-point burst', '{n} throws down a thunderous dunk to cap a {k}-point run', '{n} hits a step-back jumper during a {k}-point run', '{n} goes coast to coast as the {team} rattle off {k} points', '{n} scores {k} straight for the {team}', '{n} sinks a deep three and the {team} add {k} points'],
    generic: 'The {team} go on a {k}-point run',
    buzzer: '{n} beats the buzzer to win it'
  };
  const BSB = {
    hr: { 1: '{n} crushes a solo homer to left', 2: '{n} launches a two-run homer', 3: '{n} blasts a three-run shot into the upper deck', 4: 'Grand slam! {n} clears the bases' },
    rbi: { 1: ['{n} lines an RBI single up the middle', '{n} drives in a run with a double into the gap', '{n} lifts a sacrifice fly to bring a run home'], 2: ['{n} rips a two-run double down the line', '{n} slaps a two-run single into right field'] },
    k: ['{n} strikes out the side', '{n} escapes a bases-loaded jam', '{n} retires nine straight hitters'],
    walkoff: '{n} walks it off with an RBI single'
  };

  function weightedPlayer(list, fp) {
    const c = list.filter(p => (fp[p.id] || 0) > 0);
    if (!c.length) return null;
    let r = Math.random() * c.reduce((s, p) => s + fp[p.id], 0);
    for (const p of c) { r -= fp[p.id]; if (r <= 0) return p; }
    return c[c.length - 1];
  }

  function buildSide(sport, team, side, gi, players, fp, tl) {
    const [lo, hi] = SPORTS[sport].matchScores, roster = players.filter(p => p.team === team), rt = () => 0.02 + Math.random() * 0.95;
    const push = e => tl.push({ t: e.t, g: gi, side, pts: e.pts, pid: e.p ? e.p.id : -1, fp: 0, text: e.text, big: e.big ? 1 : 0 });
    if (sport === 'football') {
      let td, fg, s;
      do { td = rand(1, 5); fg = rand(0, 3); s = 7 * td + 3 * fg; } while (s < lo || s > hi);
      for (let i = 0; i < td; i++) { const p = weightedPlayer(roster, fp), y = rand(2, 68); push({ t: rt(), pts: 7, p, big: 1, text: p ? fillT(pick(FB.td[p.role] || FB.td.WR), { n: p.name, y }) : fillT(FB.teamTd, { team, y }) }); }
      for (let i = 0; i < fg; i++) push({ t: rt(), pts: 3, p: null, text: fillT(pick(FB.fg), { team, y: rand(22, 54) }) });
      for (let i = rand(1, 3); i > 0; i--) { const p = weightedPlayer(roster, fp); if (p) push({ t: rt(), pts: 0, p, text: fillT(pick(FB.big[p.role] || FB.big.WR), { n: p.name, y: rand(18, 55) }) }); }
      return s;
    }
    if (sport === 'basketball') {
      const T = rand(lo, hi), n = rand(8, 11), w = Array.from({ length: n }, () => 0.5 + Math.random()), tot = w.reduce((a, b) => a + b, 0);
      const parts = w.map(x => Math.max(2, Math.round((x / tot) * T)));
      parts[parts.indexOf(Math.max(...parts))] += T - parts.reduce((a, b) => a + b, 0);
      const big = [...parts].sort((a, b) => b - a)[1];
      for (const k of parts) { const p = weightedPlayer(roster, fp); push({ t: rt(), pts: k, p, big: k >= big, text: p ? fillT(pick(BB.run), { n: p.name, k, team }) : fillT(BB.generic, { team, k }) }); }
      return T;
    }
    // baseball: away bats in the top of each inning, home in the bottom
    const T = rand(lo, hi), bats = roster.filter(p => p.role !== 'P'), arms = roster.filter(p => p.role === 'P');
    const it = () => { const i = rand(0, 8); return (i + (side === 'home' ? 0.55 : 0.05) + Math.random() * 0.4) / 9; };
    let left = T;
    while (left > 0) {
      const hr = Math.random() < 0.4, r = Math.min(left, hr ? pick([1, 1, 2, 2, 3, 4]) : pick([1, 1, 1, 2])), p = weightedPlayer(bats.length ? bats : roster, fp);
      const text = p ? fillT(hr ? BSB.hr[r] : pick(BSB.rbi[Math.min(r, 2)]), { n: p.name }) : `The ${team} push across ${r} run${r > 1 ? 's' : ''}`;
      push({ t: it(), pts: r, p, big: hr && r >= 2, text });
      left -= r;
    }
    for (const p of arms) if ((fp[p.id] || 0) > 0) for (let i = rand(1, 2); i > 0; i--) push({ t: it(), pts: 0, p, text: fillT(pick(BSB.k), { n: p.name }) });
    return T;
  }

  function buildGame(sport, g, gi, players, fp, tl) {
    let hScore = buildSide(sport, g.home, 'home', gi, players, fp, tl), aScore = buildSide(sport, g.away, 'away', gi, players, fp, tl);
    if (hScore === aScore) {
      const roster = players.filter(p => p.team === g.home), p = weightedPlayer(sport === 'baseball' ? roster.filter(x => x.role !== 'P') : roster, fp);
      const pts = sport === 'football' ? 3 : sport === 'basketball' ? 2 : 1;
      const text = sport === 'football' ? fillT(FB.walkoff, { team: g.home, y: rand(28, 52) }) : p ? fillT(sport === 'basketball' ? BB.buzzer : BSB.walkoff, { n: p.name }) : `The ${g.home} win it at the buzzer`;
      tl.push({ t: 0.995, g: gi, side: 'home', pts, pid: sport === 'football' || !p ? -1 : p.id, fp: 0, text, big: 1 });
      hScore += pts;
    }
    return { id: g.id, home: g.home, away: g.away, hScore, aScore, star: -1 };
  }

  // ---------- predictions ----------
  function scorePreds(preds, games) {
    if (!Array.isArray(preds)) return 0;
    return games.reduce((s, g, i) => {
      const p = preds[i]; if (!p) return s;
      const winner = g.hScore > g.aScore ? g.home : g.away;
      return s + (p.winner === winner ? 10 : 0) + (p.home === g.hScore && p.away === g.aScore ? 20 : Math.abs(p.home + p.away - g.hScore - g.aScore) <= 7 ? 5 : 0) + (p.star === g.star ? 10 : 0);
    }, 0);
  }

  // ---------- simulate one week ----------
  // o: { sport, players, rosters, season, preds: {slot: predictions}, humanSlots: [slots], now, duration }
  function simulateWeek(o) {
    const { sport, players, rosters, season } = o, week = season.week, kind = weekKind(week), mods = newsMods(season, week);
    const fp = {};
    for (const p of players) {
      const mod = mods[p.id] ? mods[p.id].mod : 1;
      if (mod === 0) { fp[p.id] = 0; continue; }
      const lo = Math.max(2, Math.round(p.proj * mod) - 7), hi = Math.max(lo + 1, Math.round(p.ceiling * mod));
      fp[p.id] = rand(lo, hi);
    }
    const tl = [], schedule = proGames(sport, week);
    const games = schedule.map((g, gi) => buildGame(sport, g, gi, players, fp, tl));
    const gameOf = team => schedule.findIndex(g => g.home === team || g.away === team);

    // spread each player's fantasy points over their highlight plays plus a few quiet ticks
    const byPlayer = {};
    for (const e of tl) if (e.pid >= 0) (byPlayer[e.pid] = byPlayer[e.pid] || []).push(e);
    for (const p of players) {
      const F = fp[p.id], evs = byPlayer[p.id] || [];
      let used = 0;
      if (F > 0 && evs.length) { const share = Math.max(1, Math.floor((F * 0.7) / evs.length)); for (const e of evs) { const v = Math.min(share, F - used); e.fp = v; used += v; } }
      let rest = F - used;
      const n = Math.min(3, rest);
      for (let k = 0; k < n; k++) { const v = k === n - 1 ? rest : Math.max(1, Math.floor(rest / (n - k))); rest -= v; tl.push({ t: 0.03 + Math.random() * 0.94, g: gameOf(p.team), side: null, pts: 0, pid: p.id, fp: v, text: '', big: 0 }); }
    }
    for (const e of tl) e.t = r4(e.t);
    tl.sort((x, y) => x.t - y.t);
    games.forEach(g => { const c = players.filter(p => p.team === g.home || p.team === g.away); g.star = c.reduce((b, p) => (fp[p.id] > fp[b.id] ? p : b), c[0]).id; });

    const snap = rosters.map(r => r.slice()), score = s => snap[s].reduce((a, id) => a + (fp[id] || 0), 0), top = s => Math.max(0, ...snap[s].map(id => fp[id] || 0));
    const plan = matchupsFor(season, week);
    const matchups = plan.matchups.map(m => {
      const sa = score(m.a), sb = score(m.b);
      return { ...m, sa, sb, winner: sa > sb ? m.a : sb > sa ? m.b : top(m.a) >= top(m.b) ? m.a : m.b, tiebreak: sa === sb };
    });
    const humans = new Set(o.humanSlots || []);
    const predPts = Array.from({ length: SLOTS }, (_, i) => (humans.has(i) ? scorePreds(o.preds && o.preds[i], games) : rand(12, 55)));
    return { week, kind, label: weekLabel(week), games, timeline: tl, fp, matchups, bye: plan.bye, out: plan.out, rosters: snap, predPts, startedAt: o.now || Date.now(), duration: DURATIONS.includes(o.duration) ? o.duration : 75000 };
  }

  // ---------- standings and playoffs ----------
  function standings(weeks, n = SLOTS) {
    const rows = Array.from({ length: n }, (_, slot) => ({ slot, w: 0, l: 0, pf: 0, pa: 0, pp: 0, res: [] }));
    for (const wk of weeks || []) {
      (wk.predPts || []).forEach((v, i) => { if (rows[i]) rows[i].pp += v; });
      if (wk.kind !== 'regular') continue;
      for (const m of wk.matchups) {
        const A = rows[m.a], B = rows[m.b];
        A.pf += m.sa; A.pa += m.sb; B.pf += m.sb; B.pa += m.sa;
        const aw = m.winner === m.a;
        (aw ? A : B).w++; (aw ? B : A).l++;
        A.res.push(aw ? 'W' : 'L'); B.res.push(aw ? 'L' : 'W');
      }
    }
    for (const r of rows) {
      const last = r.res[r.res.length - 1]; let k = 0;
      for (let i = r.res.length - 1; i >= 0 && r.res[i] === last; i--) k++;
      r.streak = last ? last + k : '–';
    }
    return rows.sort((x, y) => y.w - x.w || y.pf - x.pf || x.slot - y.slot);
  }

  function advanceSeason(season, w) {
    season.weeks.push(w);
    const loser = m => (m.winner === m.a ? m.b : m.a);
    if (w.week === REG_WEEKS) { season.bracket = { seeds: standings(season.weeks).map(r => r.slot), final: null, third: null }; season.status = 'playoffs'; }
    else if (w.week === REG_WEEKS + 1) { const [m1, m2] = w.matchups; season.bracket.final = [m1.winner, m2.winner]; season.bracket.third = [loser(m1), loser(m2)]; }
    else if (w.week === TOTAL_WEEKS) { const [f, t] = w.matchups; season.champion = f.winner; season.runnerUp = loser(f); season.third = t.winner; season.status = 'complete'; }
    season.week = w.week + 1;
    return season;
  }

  // ---------- news desk ----------
  const INJ = ['a sprained ankle', 'a hamstring strain', 'a sore shoulder', 'bruised ribs', 'a tweaked knee', 'a wrist injury'];
  const NEWS = {
    out: { mod: 0, w: 14, h: ['{name} ruled out for {wk}', 'Injury blow: {name} sidelined', '{team} lose {name} for {wk}'], b: ['{name} ({role}, {team}) will miss {wk} with {injury}. Expect zero fantasy points from this spot.', 'The {team} confirmed {name} is out for {wk} after suffering {injury} in practice. {owner} will feel this one.'] },
    questionable: { mod: 0.6, w: 18, h: ['{name} listed as questionable', 'Game-time decision for {name}'], b: ['{name} is nursing {injury} and is a game-time decision for {wk}. Expect reduced production even if he plays.', 'The {team} are being cagey about {name}, who is dealing with {injury}. Plan for a limited role in {wk}.'] },
    hot: { mod: 1.25, w: 24, h: ['{name} is on fire', '{name} heating up for the {team}', 'Hot streak: {name} can’t be stopped'], b: ['{name} has been unstoppable in practice, and the {team} plan to feature him heavily in {wk}.', 'Coaches are raving about {name}. Expect a bigger workload for the {team} {role} in {wk}.'] },
    slump: { mod: 0.8, w: 15, h: ['{name} mired in a slump', 'Cold spell for {name}'], b: ['{name} has looked out of sync lately, and the {team} may scale back his role in {wk}.', 'Scouts say {name} is pressing. The {team} {role} is trending down heading into {wk}.'] },
    breakout: { mod: 1.4, w: 11, h: ['Breakout alert: {name}', '{name} set for a career week'], b: ['With a bigger role in the {team} game plan, {name} could post a monster line in {wk}.', 'The {team} are building their {wk} game plan around {name}. This could be the breakout.'] },
    rumor: { mod: 1, w: 18, h: ['Rumor: {rival} eyeing {name}', 'Trade buzz: {rivalTeam} want {name}'], b: ['League sources say {rival} of {rivalTeam} has been asking about {name}. Expect a premium offer if {owner} is willing to listen.', '{rivalTeam} GM {rival} reportedly covets {name} and is ready to overpay. {owner} holds the cards.'] }
  };
  const TYPES = Object.keys(NEWS);
  function pickType(allowRumor) {
    const list = TYPES.filter(k => allowRumor || k !== 'rumor');
    let r = Math.random() * list.reduce((s, k) => s + NEWS[k].w, 0);
    for (const k of list) { r -= NEWS[k].w; if (r <= 0) return k; }
    return list[list.length - 1];
  }

  function recapItem(o) {
    const w = o.lastWeek, nm = s => o.managerNames[s], obj = s => (nm(s) === 'You' ? 'you' : nm(s));
    const loser = m => (m.winner === m.a ? m.b : m.a), hi = m => Math.max(m.sa, m.sb), lo = m => Math.min(m.sa, m.sb), gap = m => Math.abs(m.sa - m.sb);
    const topId = Object.keys(w.fp).reduce((a, b) => (w.fp[b] > w.fp[a] ? b : a)), top = o.players[topId], topLine = `${top.name} (${top.team}) led all players with ${w.fp[topId]} fantasy points.`;
    let headline, body;
    if (w.kind === 'final') {
      const f = w.matchups[0], t = w.matchups[1];
      headline = `${nm(f.winner)} win the championship!`;
      body = `${nm(f.winner)} beat ${obj(loser(f))} ${hi(f)}-${lo(f)} to claim the title. ${nm(t.winner)} took third place. ${topLine}`;
    } else {
      const ms = w.matchups.slice(), close = ms.slice().sort((a, b) => gap(a) - gap(b))[0], blow = ms.slice().sort((a, b) => gap(b) - gap(a))[0];
      if (w.kind === 'semifinal') {
        headline = `Semifinal recap: ${nm(ms[0].winner)} and ${nm(ms[1].winner)} reach the final`;
        body = `${nm(ms[0].winner)} beat ${obj(loser(ms[0]))} ${hi(ms[0])}-${lo(ms[0])}, and ${nm(ms[1].winner)} beat ${obj(loser(ms[1]))} ${hi(ms[1])}-${lo(ms[1])}. ${topLine}`;
      } else {
        headline = `${w.label} recap: ${nm(close.winner)} edge ${obj(loser(close))} ${hi(close)}-${lo(close)}`;
        body = `${blow !== close ? `${nm(blow.winner)} rolled past ${obj(loser(blow))} ${hi(blow)}-${lo(blow)}. ` : ''}${topLine}${w.week === REG_WEEKS ? ' The playoff field is set.' : ''}`;
      }
    }
    return { id: `${w.week}-recap`, type: 'recap', pid: -1, mod: 1, rival: null, headline, body, by: 'wire', week: w.week };
  }

  // o: { players, rosters, week, lastWeek, managerNames, rivals: {slot: GM name}, humans: [slots], recapOnly }
  function genNews(o) {
    const items = [];
    if (o.lastWeek) items.push(recapItem(o));
    if (o.recapOnly) return items;
    const owned = new Map();
    o.rosters.forEach((r, s) => r.forEach(id => owned.set(id, s)));
    const humans = new Set(o.humans || []), rivalSlots = Object.keys(o.rivals || {}).map(Number);
    const chosen = o.players.map(p => ({ p, w: (owned.has(p.id) ? 3 : 1) * Math.random() })).sort((a, b) => b.w - a.w).slice(0, 4).map(x => x.p);
    let outs = 0;
    for (const p of chosen) {
      const owner = owned.has(p.id) ? owned.get(p.id) : -1, rivalsFor = rivalSlots.filter(s => s !== owner);
      // rumors only make sense for players a human owns and an AI GM could buy
      let type = pickType(humans.has(owner) && rivalsFor.length > 0), rival = null;
      if (type === 'out' && ++outs > 1) type = 'questionable';
      if (type === 'rumor') rival = pick(rivalsFor);
      const T = NEWS[type];
      const v = { name: p.name, role: p.role, team: p.team, wk: weekPhrase(o.week), injury: pick(INJ), rival: rival != null ? o.rivals[rival] : '', rivalTeam: rival != null ? o.managerNames[rival] : '', owner: owner >= 0 ? (o.managerNames[owner] === 'You' ? 'you' : o.managerNames[owner]) : 'his team' };
      const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
      items.push({ id: `${o.week}-${items.length}`, type, pid: p.id, mod: T.mod, rival, headline: cap(fillT(pick(T.h), v)), body: cap(fillT(pick(T.b), v)), by: 'wire', week: o.week });
    }
    return items;
  }

  return { SPORTS, SLOTS, REG_WEEKS, TOTAL_WEEKS, DURATIONS, H2H, makePlayers, proGames, matchupsFor, weekKind, weekLabel, weekPhrase, newSeason, simulateWeek, advanceSeason, standings, scorePreds, genNews, newsMods, newsWeight };
});
