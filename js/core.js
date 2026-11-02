// Game rules and state. No DOM access, so the test bot can drive it directly.
(function () {
  const D = WD.DATA;
  const SPR = D.STAGES_PER_REALM;
  const MAX_STAGE = D.REALMS.length * SPR - 1;
  const TRIB_FROM_REALM = 2; // Entering Core Formation or later calls down lightning.
  const BAG_SIZE = 24;
  const ADDITIVE = { luck: 1, bt: 1, alch: 1 };

  // ---------- tunable pacing ----------
  const P = {
    stageBase: 25, stageGrowth: 1.7, stageGrowthLate: 1.5, stageTaperAt: 36, stageGrowthFinal: 1.32, stageFinalAt: 76, heavenCost: 30, karmaScale: 1.3,
    stageQiBonus: 1.05, realmQiBonus: 1.4,
    qiTechPower: 0.5, qiTechPowerStep: 10, qiTechStoneBase: 25, qiTechStoneStep: 16, techGrowth: 1.2,
    fightTechPower: 2, fightTechStep: 30, fightTechCost: 15, fightTechCostStep: 60,
    enemyHp: 14, enemyHpStep: 9, enemyDmg: 1.5, enemyDmgStep: 7, enemyStones: 3, enemyStoneStep: 6,
    atkStage: 1.1, hpStage: 1.1,
    offlineRate: 0.5, offlineCapHours: 8,
    encounterMin: 75, encounterMax: 170,
  };

  let rng = Math.random;
  let S = null;

  // ---------- helpers ----------
  const rand = (a, b) => a + rng() * (b - a);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  function weighted(items, weightFn) {
    const total = items.reduce((t, it, i) => t + weightFn(it, i), 0);
    let roll = rng() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weightFn(items[i], i);
      if (roll <= 0) return i;
    }
    return items.length - 1;
  }
  const realmOf = (stage) => Math.min(Math.floor(stage / SPR), D.REALMS.length - 1);
  const stageInRealm = (stage) => stage % SPR;
  const isMajor = (stage) => stage % SPR === SPR - 1;

  function log(msg, kind) {
    S.log.unshift({ m: msg, k: kind || '', a: Math.floor(S.age) });
    if (S.log.length > 80) S.log.length = 80;
  }
  function emit(ev) { S.fx.push(ev); }

  // ---------- state ----------
  function freshMeta() {
    return {
      v: 1, ascensions: 0, daoMarks: 0, dao: {}, karma: 0, karmaUps: {}, feats: {}, best: 0, lastSeen: Date.now(),
      settings: { autoStage: false, autoTech: false, autoMajor: false, autoMission: false, autoEquip: false },
      stats: { clicks: 0, kills: 0, pills: 0, lives: 1, tribs: 0, breakthroughs: 0, deviations: 0, bestRoot: 0, bestRarity: 0,
        bestRank: 0, supreme: 0, draws: 0, encounters: 0, deaths: 0, items: 0, playSeconds: 0 },
      log: [], fx: [],
    };
  }

  function startLife() {
    Object.assign(S, {
      age: 16, stage: 0, qi: 0, stones: 0, herbs: 0, bonusYears: 0, longevityUsed: 0,
      techs: {}, sect: null, gear: { weapon: null, robe: null, ring: null, talisman: null }, bag: [],
      pills: {}, buffs: [], injury: 0, btBonus: 0, alchXp: 0,
      region: 0, hunting: false, foe: null, hp: 0, recover: 0, swing: 0,
      encounter: null, encounterIn: rand(30, 60), lastFortune: null,
      dead: false, ascendReady: false, itemSeq: S.itemSeq || 1, choosingRoot: true, rerolls: 0,
    });
    S.root = rollRoot();
    noteRoot();
    S.hp = stats().hp;
  }

  function newGame() {
    S = freshMeta();
    startLife();
    log('You sit down beneath an old pine and take your first deliberate breath.', 'story');
    return S;
  }

  function load(saved) {
    S = freshMeta();
    const stats0 = S.stats, settings0 = S.settings;
    Object.assign(S, saved);
    S.stats = Object.assign(stats0, saved.stats);
    S.settings = Object.assign(settings0, saved.settings);
    S.fx = [];
    return S;
  }

  // ---------- spirit roots ----------
  function rollRoot() {
    const luck = mods().luck;
    const idx = weighted(D.ROOT_TIERS, (t, i) => t.weight * Math.pow(1 + Math.max(luck, -40) * 0.01, i));
    const tier = D.ROOT_TIERS[idx];
    let elements;
    if (tier.variant) {
      elements = [pick(Object.keys(D.VARIANTS))];
    } else {
      const pool = Object.keys(D.ELEMENTS);
      elements = [];
      while (elements.length < tier.count) elements.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return { tier: idx, elements };
  }
  function noteRoot() { S.stats.bestRoot = Math.max(S.stats.bestRoot, S.root.tier); }
  const rerollCost = () => Math.ceil(2 * Math.pow(1.7, S.rerolls));
  function rerollRoot() {
    const cost = rerollCost();
    if (!S.choosingRoot || S.karma < cost) return false;
    S.karma -= cost;
    S.rerolls++;
    S.root = rollRoot();
    noteRoot();
    return true;
  }
  function confirmRoot() {
    S.choosingRoot = false;
    S.hp = stats().hp;
    log(`Your root is judged: ${rootName(S.root)}. This life begins.`, 'story');
  }
  function rootName(r) {
    const t = D.ROOT_TIERS[r.tier];
    if (t.variant) return `${D.VARIANTS[r.elements[0]].name} ${t.name}`;
    return t.name;
  }
  function elementInfo(key) { return D.ELEMENTS[key] || D.VARIANTS[key]; }

  // ---------- modifiers ----------
  function applyFx(m, fx, n) {
    for (const k in fx) {
      if (ADDITIVE[k]) m[k] += fx[k] * n;
      else m[k] = Math.max(0.05, m[k] * (1 + fx[k] * n));
    }
  }

  function mods() {
    const m = { qi: 1, atk: 1, hp: 1, stones: 1, herbs: 1, luck: 0, bt: 0, alch: 0, life: 1, mission: 1, trib: 1, dev: 1 };
    if (!S) return m;
    if (S.root) {
      const t = D.ROOT_TIERS[S.root.tier];
      m.qi *= t.mult;
      for (const e of S.root.elements) {
        const info = elementInfo(e);
        const fx = {};
        fx[info.fx] = t.power * info.scale;
        applyFx(m, fx, 1);
      }
    }
    for (const u of D.KARMA_UPS) if (S.karmaUps[u.id] && u.fx) applyFx(m, u.fx, S.karmaUps[u.id]);
    for (const u of D.DAO_UPS) if (S.dao[u.id] && u.fx) applyFx(m, u.fx, S.dao[u.id]);
    if (S.ascensions) {
      const f = Math.pow(8, S.ascensions);
      m.qi *= f; m.stones *= Math.pow(3, S.ascensions); m.atk *= Math.pow(3, S.ascensions); m.hp *= Math.pow(3, S.ascensions);
    }
    m.qi *= 1 + 0.03 * Object.keys(S.feats).length;
    if (S.sect) {
      const sect = D.SECTS.find((x) => x.id === S.sect.id);
      applyFx(m, sect.fx, 1 + 0.25 * S.sect.rank);
      m.qi *= 1 + 0.12 * (S.sect.manual || 0);
    }
    for (const slot in S.gear || {}) {
      const it = S.gear[slot];
      if (!it) continue;
      if (slot === 'ring') m.qi *= 1 + it.power;
      if (slot === 'talisman') { m.stones *= 1 + it.power; m.luck += it.rarity; }
      if (it.affix) { const fx = {}; fx[it.affix.fx] = it.affix.v; applyFx(m, fx, 1); }
    }
    for (const b of S.buffs || []) applyFx(m, b.fx, 1);
    if (S.injury > 0) { m.qi *= 0.5; m.atk *= 0.7; }
    return m;
  }

  // ---------- techniques ----------
  function buildTechList() {
    const list = [];
    D.QI_TECHS.forEach((n, i) => list.push({
      id: 'q' + i, name: n[0], zh: n[1], type: 'qi', unlock: i * SPR,
      power: P.qiTechPower * Math.pow(P.qiTechPowerStep, i),
      cost: i === 0 ? { qi: 10 } : { stones: P.qiTechStoneBase * Math.pow(P.qiTechStoneStep, i - 1) },
    }));
    D.ATK_TECHS.forEach((n, i) => list.push({
      id: 'a' + i, name: n[0], zh: n[1], type: 'atk', unlock: i * SPR * 2,
      power: P.fightTechPower * Math.pow(P.fightTechStep, i),
      cost: { stones: P.fightTechCost * Math.pow(P.fightTechCostStep, i) },
    }));
    D.HP_TECHS.forEach((n, i) => list.push({
      id: 'h' + i, name: n[0], zh: n[1], type: 'hp', unlock: i * SPR * 2 + 2,
      power: 10 * P.fightTechPower * Math.pow(P.fightTechStep, i),
      cost: { stones: 1.3 * P.fightTechCost * Math.pow(P.fightTechCostStep, i) },
    }));
    return list;
  }
  const TECHS = buildTechList();
  const techLevel = (id) => S.techs[id] || 0;
  function techCost(t) {
    const f = Math.pow(P.techGrowth, techLevel(t.id));
    const out = {};
    for (const k in t.cost) out[k] = t.cost[k] * f;
    return out;
  }
  function canAfford(cost) { for (const k in cost) if ((S[k] || 0) < cost[k]) return false; return true; }
  function pay(cost) { for (const k in cost) S[k] -= cost[k]; }
  function buyTech(id) {
    const t = TECHS.find((x) => x.id === id);
    if (!t || S.stage < t.unlock) return false;
    const c = techCost(t);
    if (!canAfford(c)) return false;
    pay(c);
    S.techs[id] = techLevel(id) + 1;
    return true;
  }

  // ---------- derived numbers ----------
  function stageCost(stage) {
    const early = Math.min(stage, P.stageTaperAt);
    const final = Math.max(0, stage - P.stageFinalAt);
    const late = stage - early - final;
    return P.stageBase * Math.pow(P.stageGrowth, early) * Math.pow(P.stageGrowthLate, late) * Math.pow(P.stageGrowthFinal, final) * Math.pow(P.heavenCost, S.ascensions);
  }
  function qiRate(m) {
    m = m || mods();
    let base = 0.5;
    for (const t of TECHS) if (t.type === 'qi') base += techLevel(t.id) * t.power;
    return base * Math.pow(P.stageQiBonus, S.stage) * Math.pow(P.realmQiBonus, realmOf(S.stage)) * m.qi;
  }
  function clickGain(m) { return 1 + qiRate(m) * 0.5; }
  function stats(m) {
    m = m || mods();
    let atk = 5, hp = 50;
    for (const t of TECHS) {
      if (t.type === 'atk') atk += techLevel(t.id) * t.power;
      if (t.type === 'hp') hp += techLevel(t.id) * t.power;
    }
    if (S.gear.weapon) atk += S.gear.weapon.power;
    if (S.gear.robe) hp += S.gear.robe.power;
    return {
      atk: atk * Math.pow(P.atkStage, S.stage) * m.atk,
      hp: hp * Math.pow(P.hpStage, S.stage) * m.hp,
      luck: m.luck,
    };
  }
  function lifespan(m) {
    m = m || mods();
    return D.REALMS[realmOf(S.stage)].life * m.life + S.bonusYears;
  }
  function btChance(m) {
    m = m || mods();
    const realm = realmOf(S.stage);
    const base = Math.max(0.3, 0.8 - realm * 0.06);
    return Math.min(0.98, Math.max(0.05, base + m.bt + S.btBonus));
  }
  function regionStats(i) {
    return {
      hp: P.enemyHp * Math.pow(P.enemyHpStep, i),
      dmg: P.enemyDmg * Math.pow(P.enemyDmgStep, i),
      stones: P.enemyStones * Math.pow(P.enemyStoneStep, i),
      power: 4 * Math.pow(P.fightTechStep * 0.55, i),
      unlock: Math.max(0, i * SPR - 3),
    };
  }
  function bestRegion() {
    let best = 0;
    for (let i = 0; i < D.REGIONS.length; i++) if (S.stage >= regionStats(i).unlock) best = i;
    return best;
  }
  // One "stone unit" is a kill's worth at the best open region; event rewards scale from it.
  const stoneUnit = () => regionStats(bestRegion()).stones * mods().stones;

  // ---------- breakthrough ----------
  function canAttempt() { return !S.dead && !S.choosingRoot && S.qi >= stageCost(S.stage); }

  function callTribulation(realm, extra) {
    const st = stats();
    const m = mods();
    const count = 3 + Math.floor(realm / 2) + (extra || 0);
    const bolt = regionStats(realm).dmg * 2.2 * Math.pow(1.25, S.ascensions);
    const maxHp = st.hp * m.trib;
    let hp = maxHp;
    const bolts = [];
    for (let i = 0; i < count; i++) {
      const dmg = bolt * rand(0.7, 1.3) * (1 + i * 0.12);
      hp -= dmg;
      bolts.push({ dmg, hp: Math.max(0, hp) });
      if (hp <= 0) break;
    }
    return { maxHp, bolts, survived: hp > 0, total: count };
  }

  function attemptBreakthrough() {
    if (!canAttempt()) return false;
    const cost = stageCost(S.stage);
    if (!isMajor(S.stage)) {
      S.qi -= cost;
      S.stage++;
      S.best = Math.max(S.best, S.stage);
      S.stats.breakthroughs++;
      return { ok: true, minor: true };
    }
    const m = mods();
    const chance = btChance(m);
    S.btBonus = 0;
    if (rng() >= chance) {
      S.qi -= cost * 0.4;
      S.injury = Math.max(S.injury, 30 * m.dev);
      S.stats.deviations++;
      log(`Qi deviation! Your breakthrough collapses at ${Math.round(chance * 100)}% odds. Meridians torn.`, 'bad');
      emit({ kind: 'deviation' });
      return { ok: false, deviation: true };
    }
    const toAscend = S.stage >= MAX_STAGE;
    const nextRealm = realmOf(S.stage + 1);
    if (toAscend || nextRealm >= TRIB_FROM_REALM) {
      const tr = callTribulation(toAscend ? D.REALMS.length - 1 : nextRealm, toAscend ? 3 : 0);
      emit({ kind: 'tribulation', tr, ascend: toAscend });
      if (!tr.survived) {
        S.qi -= cost * 0.5;
        S.injury = Math.max(S.injury, 60);
        S.bonusYears -= 5;
        log(`Bolt ${tr.bolts.length} of ${tr.total} breaks you. You crawl out of the crater, five years older.`, 'bad');
        return { ok: false, tribulation: true, tr };
      }
      S.stats.tribs++;
    }
    S.qi -= cost;
    if (toAscend) {
      S.ascendReady = true;
      log('Nine colours of cloud part above you. The Southern Gate of Heaven stands open.', 'rare');
      return { ok: true, ascendReady: true };
    }
    S.stage++;
    S.best = Math.max(S.best, S.stage);
    S.stats.breakthroughs++;
    S.hp = stats().hp;
    const r = D.REALMS[realmOf(S.stage)];
    log(`Breakthrough! You enter ${r.name} (${r.zh}). Your lifespan stretches to ${Math.floor(lifespan())} years.`, 'rare');
    emit({ kind: 'realm', realm: realmOf(S.stage) });
    return { ok: true, major: true };
  }

  function circulate() {
    if (S.dead || S.choosingRoot) return 0;
    const g = clickGain();
    S.qi += g;
    S.stats.clicks++;
    return g;
  }

  // ---------- combat ----------
  function spawnFoe() {
    const i = S.region;
    const r = regionStats(i);
    const elite = rng() < 0.06 + Math.max(0, mods().luck) * 0.001;
    const f = rand(0.85, 1.15) * (elite ? 3 : 1);
    S.foe = {
      name: (elite ? 'Elite ' : '') + pick(D.REGIONS[i].foes), elite,
      hp: r.hp * f, maxHp: r.hp * f, dmg: r.dmg * (elite ? 1.6 : 1) * rand(0.9, 1.1),
    };
  }
  function setRegion(i) {
    if (i < 0 || i >= D.REGIONS.length || S.stage < regionStats(i).unlock) return false;
    S.region = i;
    S.foe = null;
    return true;
  }
  function setHunting(on) { S.hunting = !!on; if (!on) S.foe = null; }

  function tickCombat(dt, m) {
    const st = stats(m);
    if (S.hp > st.hp) S.hp = st.hp;
    if (S.recover > 0) {
      S.recover -= dt;
      S.hp = Math.min(st.hp, S.hp + st.hp * dt / 12);
      return;
    }
    if (!S.hunting) { S.hp = Math.min(st.hp, S.hp + st.hp * dt * 0.03); return; }
    if (!S.foe) spawnFoe();
    S.swing += dt;
    while (S.swing >= 1 && S.foe) {
      S.swing -= 1;
      const crit = rng() < 0.1;
      S.foe.hp -= st.atk * (crit ? 2 : 1) * rand(0.9, 1.1);
      if (S.foe.hp <= 0) { foeDefeated(m); return; }
      S.hp -= S.foe.dmg;
      if (S.hp <= 0) {
        S.hp = 0;
        S.recover = 15;
        S.foe = null;
        log(`Beaten in ${D.REGIONS[S.region].name}. You limp away to recover.`, 'bad');
        return;
      }
    }
  }

  function foeDefeated(m) {
    const r = regionStats(S.region);
    const elite = S.foe.elite;
    S.stones += r.stones * rand(0.8, 1.2) * m.stones * (elite ? 4 : 1);
    S.stats.kills++;
    if (rng() < (elite ? 0.8 : 0.22)) S.herbs += Math.ceil(rand(1, 3) * (S.region + 1) * m.herbs);
    const dropChance = (elite ? 0.3 : 0.015) * (1 + Math.max(0, m.luck) * 0.01);
    if (rng() < dropChance) gainItem(S.region);
    S.foe = null;
  }

  // ---------- artifacts ----------
  function makeItem(regionIdx, slotHint, minRarity) {
    const luck = mods().luck;
    const rar = Math.max(minRarity || 0, weighted(D.RARITIES, (r, i) => r.weight * Math.pow(1 + Math.max(luck, -40) * 0.015, i)));
    const slot = slotHint || pick(Object.keys(D.GEAR_SLOTS));
    const def = D.GEAR_SLOTS[slot];
    const rr = D.RARITIES[rar];
    const roll = rand(0.85, 1.15);
    let power;
    if (slot === 'weapon') power = regionStats(regionIdx).power * rr.mult * roll;
    else if (slot === 'robe') power = regionStats(regionIdx).power * 6 * rr.mult * roll;
    else power = (0.06 + 0.04 * regionIdx) * rr.mult * roll;
    let affix = null;
    if (rar >= 1) {
      const a = pick(D.AFFIXES);
      let v = a.base * (a.flat ? rr.mult : rr.mult * (1 + regionIdx * 0.25)) * rand(0.8, 1.2);
      if (a.flat && !a.pct) v = Math.ceil(v);
      affix = { fx: a.fx, label: a.label, v, flat: !!a.flat, pct: !!a.pct };
    }
    return { id: S.itemSeq++, slot, rarity: rar, power, affix, region: regionIdx, name: `${pick(D.GEAR_ADJ)} ${pick(def.nouns)}` };
  }
  function itemValue(it) {
    return Math.ceil(regionStats(it.region).stones * 2 * D.RARITIES[it.rarity].mult);
  }
  function itemScore(it) {
    if (!it) return -1;
    const base = it.slot === 'ring' || it.slot === 'talisman' ? it.power * 100 : it.power;
    return base * (1 + (it.affix ? 0.1 : 0));
  }
  function gainItem(regionIdx, slotHint, minRarity) {
    const it = makeItem(regionIdx, slotHint, minRarity);
    S.stats.items++;
    S.stats.bestRarity = Math.max(S.stats.bestRarity, it.rarity);
    const rr = D.RARITIES[it.rarity];
    log(`Found ${rr.name}-grade ${it.name}.`, it.rarity >= 3 ? 'rare' : 'loot');
    if (S.settings.autoEquip && itemScore(it) > itemScore(S.gear[it.slot])) {
      const old = S.gear[it.slot];
      S.gear[it.slot] = it;
      if (old) S.stones += itemValue(old) * mods().stones;
      return it;
    }
    if (S.bag.length >= BAG_SIZE) {
      S.stones += itemValue(it) * mods().stones;
      log(`Your storage ring is full. Sold the ${it.name}.`, 'loot');
      return it;
    }
    S.bag.push(it);
    return it;
  }
  function equip(id) {
    const i = S.bag.findIndex((x) => x.id === id);
    if (i < 0) return false;
    const it = S.bag[i];
    const old = S.gear[it.slot];
    S.gear[it.slot] = it;
    S.bag.splice(i, 1);
    if (old) S.bag.push(old);
    return true;
  }
  function sell(id) {
    const i = S.bag.findIndex((x) => x.id === id);
    if (i < 0) return false;
    S.stones += itemValue(S.bag[i]) * mods().stones;
    S.bag.splice(i, 1);
    return true;
  }
  function sellInferior() {
    const keep = [];
    let n = 0;
    for (const it of S.bag) {
      if (itemScore(it) <= itemScore(S.gear[it.slot])) { S.stones += itemValue(it) * mods().stones; n++; } else keep.push(it);
    }
    S.bag = keep;
    return n;
  }
  function equipBest() {
    for (const it of S.bag.slice()) if (itemScore(it) > itemScore(S.gear[it.slot])) equip(it.id);
  }

  // ---------- alchemy ----------
  const alchLevel = () => Math.floor(Math.sqrt(S.alchXp / 5));
  const pillScale = (p) => Math.pow(1.22, Math.max(0, S.stage - p.stage));
  function pillCost(p) { return { herbs: Math.ceil(p.herbs * Math.min(pillScale(p), 40)), stones: p.stones * Math.pow(1.3, S.stage) }; }
  function pillChance(p, m) {
    m = m || mods();
    return Math.min(0.98, p.chance + m.alch + alchLevel() * 0.01);
  }
  function refine(id) {
    const p = D.PILLS.find((x) => x.id === id);
    if (!p || S.stage < p.stage) return false;
    const c = pillCost(p);
    if (!canAfford(c)) return false;
    pay(c);
    S.alchXp += 1;
    if (rng() >= pillChance(p)) {
      log(`The furnace cracks. Your ${p.name} is ash.`, 'bad');
      return { ok: false };
    }
    const perfect = rng() < 0.08 + Math.max(0, mods().luck) * 0.002;
    const n = perfect ? 2 : 1;
    S.pills[id] = (S.pills[id] || 0) + n;
    S.stats.pills += n;
    log(perfect ? `Pill clouds gather! Two perfect ${p.name}s.` : `Refined a ${p.name}.`, perfect ? 'rare' : 'loot');
    return { ok: true, n };
  }
  function addBuff(id, name, secs, fx) {
    S.buffs = S.buffs.filter((b) => b.id !== id);
    S.buffs.push({ id, name, t: secs, fx });
  }
  function usePill(id) {
    if (!S.pills[id]) return false;
    const m = mods();
    if (id === 'gather') { const b = D.ENCOUNTER_BUFFS.gather; addBuff('gather', b.name, b.secs, b.fx); }
    else if (id === 'heal') { S.injury = 0; S.hp = stats().hp; S.recover = 0; }
    else if (id === 'foundation') { if (S.btBonus >= 0.36 - 1e-9) return false; S.btBonus += 0.12; }
    else if (id === 'insight') { S.qi += qiRate(m) * 180; }
    else if (id === 'longevity') { if (S.longevityUsed >= 8) return false; S.longevityUsed++; S.bonusYears += 15; }
    else if (id === 'marrow') {
      const r = rollRoot();
      if (r.tier > S.root.tier) { S.root = r; noteRoot(); log(`Impurities pour from your skin. You awaken a ${rootName(r)}!`, 'rare'); }
      else log('Your marrow burns clean, but your root does not change.', '');
    }
    S.pills[id]--;
    return true;
  }

  // ---------- sects ----------
  const sectJoinStage = 2;
  function joinSect(id) {
    if (S.sect || S.stage < sectJoinStage) return false;
    const sect = D.SECTS.find((x) => x.id === id);
    if (!sect) return false;
    S.sect = { id, rank: 0, contribution: 0, earned: 0, manual: 0, board: [], active: [], boardIn: 0 };
    refreshBoard();
    log(`You kneel at the gate of the ${sect.name} (${sect.zh}) and are given a grey robe.`, 'story');
    return true;
  }
  function leaveSect() {
    if (!S.sect) return false;
    log('You burn your jade token and walk out. They will not forget.', 'bad');
    S.sect = null;
    return true;
  }
  const missionScale = () => Math.pow(1.13, S.stage);
  function refreshBoard() {
    const pool = D.MISSIONS.slice();
    S.sect.board = [];
    for (let i = 0; i < 3; i++) {
      const tpl = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      S.sect.board.push({ id: S.itemSeq++, tpl: D.MISSIONS.indexOf(tpl), scale: missionScale() });
    }
  }
  const missionSlots = () => (S.sect ? 1 + (S.sect.rank >= 2 ? 1 : 0) + (S.sect.rank >= 4 ? 1 : 0) : 0);
  function missionChance(tpl, m) {
    m = m || mods();
    return Math.min(0.99, tpl.chance + Math.max(-30, m.luck) * 0.003);
  }
  function startMission(id) {
    if (!S.sect || S.sect.active.length >= missionSlots()) return false;
    const i = S.sect.board.findIndex((b) => b.id === id);
    if (i < 0) return false;
    const b = S.sect.board.splice(i, 1)[0];
    const tpl = D.MISSIONS[b.tpl];
    S.sect.active.push({ tpl: b.tpl, scale: b.scale, t: tpl.dur, dur: tpl.dur });
    return true;
  }
  function finishMission(a, m) {
    const tpl = D.MISSIONS[a.tpl];
    if (rng() >= missionChance(tpl, m)) {
      log(`Mission failed: ${tpl.name}.`, 'bad');
      return;
    }
    const c = tpl.reward.contribution * 5 * a.scale;
    S.sect.contribution += c;
    S.sect.earned += c;
    if (tpl.reward.stones) S.stones += tpl.reward.stones * stoneUnit();
    if (tpl.reward.herbs) S.herbs += Math.ceil(tpl.reward.herbs * (bestRegion() + 1) * m.herbs);
    if (tpl.reward.item && rng() < tpl.reward.item) gainItem(bestRegion());
    log(`Mission complete: ${tpl.name}.`, 'loot');
    updateRank();
  }
  function updateRank() {
    if (!S.sect) return;
    let r = 0;
    D.SECT_RANKS.forEach((x, i) => { if (S.sect.earned >= x.need) r = i; });
    if (r > S.sect.rank) {
      S.sect.rank = r;
      S.stats.bestRank = Math.max(S.stats.bestRank, r);
      log(`The sect names you ${D.SECT_RANKS[r].name} (${D.SECT_RANKS[r].zh}).`, 'rare');
    }
  }
  const treasury = () => {
    const s = missionScale();
    return [
      { id: 'manual', name: 'Sect Secret Manual', desc: `+12% Qi forever while in this sect (level ${S.sect.manual})`, cost: 40 * Math.pow(1.9, S.sect.manual) * s },
      { id: 'pill_foundation', name: 'Foundation Pill', desc: 'A pill from the sect furnace.', cost: 30 * s, unlockRank: 1 },
      { id: 'pill_longevity', name: 'Longevity Pill', desc: 'A pill from the elders\' reserve.', cost: 120 * s, unlockRank: 2 },
      { id: 'artifact', name: 'Vault Artifact', desc: 'A random artifact of Spirit grade or better.', cost: 80 * s, unlockRank: 1 },
      { id: 'heirloom', name: 'Founder\'s Heirloom', desc: 'A random artifact of Earth grade or better.', cost: 900 * s, unlockRank: 4 },
    ];
  };
  function buyTreasury(id) {
    if (!S.sect) return false;
    const it = treasury().find((x) => x.id === id);
    if (!it || S.sect.contribution < it.cost || S.sect.rank < (it.unlockRank || 0)) return false;
    S.sect.contribution -= it.cost;
    if (id === 'manual') S.sect.manual++;
    else if (id === 'pill_foundation') S.pills.foundation = (S.pills.foundation || 0) + 1;
    else if (id === 'pill_longevity') S.pills.longevity = (S.pills.longevity || 0) + 1;
    else if (id === 'artifact') gainItem(bestRegion(), null, 1);
    else if (id === 'heirloom') gainItem(bestRegion(), null, 3);
    return true;
  }
  function tickSect(dt, m) {
    if (!S.sect) return;
    const stipendRate = 0.05 * (1 + S.sect.rank) * regionStats(bestRegion()).stones * m.stones;
    S.stones += stipendRate * dt;
    S.sect.boardIn -= dt;
    if (S.sect.boardIn <= 0 || S.sect.board.length === 0) { refreshBoard(); S.sect.boardIn = 90; }
    for (const a of S.sect.active) a.t -= dt * m.mission;
    const done = S.sect.active.filter((a) => a.t <= 0);
    S.sect.active = S.sect.active.filter((a) => a.t > 0);
    done.forEach((a) => finishMission(a, m));
    if (S.settings.autoMission && S.sect.active.length < missionSlots() && S.sect.board.length) {
      const b = S.sect.board.slice().sort((x, y) => D.MISSIONS[y.tpl].chance - D.MISSIONS[x.tpl].chance)[0];
      startMission(b.id);
    }
  }

  // ---------- divination ----------
  const divineCost = () => regionStats(bestRegion()).stones * 6;
  function divine() {
    const c = divineCost();
    if (S.stones < c) return false;
    S.stones -= c;
    const luck = mods().luck;
    const idx = weighted(D.FORTUNES, (f, i) => f.weight * Math.pow(1 + Math.max(luck, -40) * 0.008, i - 2));
    const f = D.FORTUNES[idx];
    addBuff('fortune', `${f.name} ${f.zh}`, f.secs, f.fx);
    S.stats.draws++;
    if (idx === D.FORTUNES.length - 1) S.stats.supreme++;
    S.lastFortune = idx;
    log(`You shake the sticks: ${f.zh} ${f.name}. ${f.text}`, idx >= 5 ? 'rare' : idx <= 1 ? 'bad' : '');
    return { idx };
  }

  // ---------- encounters ----------
  function rollEncounter() {
    S.encounter = { i: Math.floor(rng() * D.ENCOUNTERS.length) };
    emit({ kind: 'encounter' });
  }
  function choiceCost(ch) {
    return ch.cost && ch.cost.stones ? ch.cost.stones * stoneUnit() : 0;
  }
  function canChoose(i) {
    if (!S.encounter) return false;
    const ch = D.ENCOUNTERS[S.encounter.i].choices[i];
    return !!ch && S.stones >= choiceCost(ch);
  }
  function chooseEncounter(i) {
    if (!canChoose(i)) return false;
    const ch = D.ENCOUNTERS[S.encounter.i].choices[i];
    const m = mods();
    S.stones -= choiceCost(ch);
    const chance = Math.min(0.98, ch.chance + Math.max(-30, m.luck) * 0.004);
    const won = ch.chance >= 1 || rng() < chance;
    const fx = won ? ch.win : ch.lose;
    if (fx.qiSec) S.qi += qiRate(m) * fx.qiSec;
    if (fx.stones) S.stones += fx.stones * stoneUnit();
    if (fx.herbs) S.herbs += Math.ceil(fx.herbs * (bestRegion() + 1) * m.herbs);
    if (fx.item) gainItem(bestRegion());
    if (fx.injury) S.injury = Math.max(S.injury, fx.injury * m.dev);
    if (fx.years) S.bonusYears += fx.years;
    if (fx.karma) S.karma = Math.max(0, S.karma + fx.karma);
    if (fx.contribution && S.sect) { const c = fx.contribution * missionScale(); S.sect.contribution += c; S.sect.earned += c; updateRank(); }
    if (fx.buff) { const b = D.ENCOUNTER_BUFFS[fx.buff]; addBuff(fx.buff, b.name, b.secs, b.fx); }
    log(fx.text, won ? 'story' : 'bad');
    S.stats.encounters++;
    S.encounter = null;
    S.encounterIn = rand(P.encounterMin, P.encounterMax);
    return { won, text: fx.text };
  }

  // ---------- rebirth and ascension ----------
  const karmaOnDeath = () => Math.floor(P.karmaScale * Math.pow(S.stage + 1, 1.35)) + 1;
  function reincarnate() {
    if (S.choosingRoot) return false;
    const gain = karmaOnDeath();
    S.karma += gain;
    S.stats.lives++;
    log(`Your life ends in the ${D.REALMS[realmOf(S.stage)].name} realm. The wheel turns. +${gain} karma.`, 'story');
    const keepLog = S.log;
    startLife();
    S.log = keepLog;
    return gain;
  }
  function karmaCost(u) { return Math.ceil(u.base * Math.pow(u.growth, S.karmaUps[u.id] || 0)); }
  function buyKarma(id) {
    const u = D.KARMA_UPS.find((x) => x.id === id);
    const lvl = S.karmaUps[id] || 0;
    if (!u || lvl >= u.max) return false;
    const c = karmaCost(u);
    if (S.karma < c) return false;
    S.karma -= c;
    S.karmaUps[id] = lvl + 1;
    if (u.unlock) S.settings[u.unlock] = true;
    return true;
  }
  function daoCost(u) { return Math.ceil(u.base * Math.pow(u.growth, S.dao[u.id] || 0)); }
  function buyDao(id) {
    const u = D.DAO_UPS.find((x) => x.id === id);
    const lvl = S.dao[id] || 0;
    if (!u || lvl >= u.max) return false;
    const c = daoCost(u);
    if (S.daoMarks < c) return false;
    S.daoMarks -= c;
    S.dao[id] = lvl + 1;
    if (u.unlock) S.settings[u.unlock] = true;
    return true;
  }
  const daoOnAscend = () => 4 + S.ascensions * 3 + Math.floor(Object.keys(S.feats).length / 3);
  function karmaInvested() {
    let total = S.karma;
    for (const u of D.KARMA_UPS) for (let l = 0; l < (S.karmaUps[u.id] || 0); l++) total += Math.ceil(u.base * Math.pow(u.growth, l));
    return total;
  }
  function ascend() {
    if (!S.ascendReady) return false;
    const gain = daoOnAscend();
    const kept = Math.floor(karmaInvested() * 0.2 * (S.dao.karmaKeep || 0));
    S.daoMarks += gain;
    S.ascensions++;
    S.karma = kept;
    S.karmaUps = {};
    S.settings.autoStage = false;
    S.settings.autoTech = false;
    S.settings.autoMajor = !!S.dao.autoMajor;
    S.settings.autoMission = !!S.dao.autoHunt;
    S.stats.lives++;
    const heaven = D.HEAVENS[Math.min(S.ascensions, D.HEAVENS.length - 1)];
    log(`You ascend to the ${heaven}. +${gain} Dao Marks. In this new world, you are an ant again.`, 'rare');
    emit({ kind: 'ascend', heaven });
    const keepLog = S.log;
    startLife();
    S.log = keepLog;
    return gain;
  }

  // ---------- main loop ----------
  function checkFeats() {
    for (const f of D.FEATS) {
      if (!S.feats[f.id] && f.test(S)) {
        S.feats[f.id] = 1;
        log(`Feat recorded: ${f.name}. All Qi +3%.`, 'rare');
        emit({ kind: 'feat', name: f.name });
      }
    }
  }

  function autoStudy() {
    const open = TECHS.filter((t) => S.stage >= t.unlock);
    for (const t of open.slice().sort((a, b) => techCost(a).stones - techCost(b).stones)) {
      const c = techCost(t);
      if (!c.qi && canAfford(c)) buyTech(t.id);
    }
  }

  function tick(dt) {
    if (!S || S.dead || S.choosingRoot) return;
    S.stats.playSeconds += dt;
    const m = mods();
    S.qi += qiRate(m) * dt;
    S.age += dt / 12; // One real second is one month of cultivation.
    if (S.injury > 0) S.injury = Math.max(0, S.injury - dt);
    for (const b of S.buffs) b.t -= dt;
    S.buffs = S.buffs.filter((b) => b.t > 0);
    tickCombat(dt, m);
    tickSect(dt, m);
    if (!S.encounter) {
      S.encounterIn -= dt;
      if (S.encounterIn <= 0) rollEncounter();
    }
    if (S.settings.autoTech && S.karmaUps.autoTech) autoStudy();
    if (S.settings.autoStage && S.karmaUps.autoStage && !isMajor(S.stage)) while (!isMajor(S.stage) && canAttempt()) attemptBreakthrough();
    if (S.settings.autoMajor && S.dao.autoMajor && isMajor(S.stage) && !S.ascendReady && canAttempt() && S.injury <= 0) attemptBreakthrough();
    checkFeats();
    if (S.age >= lifespan(m) && !S.ascendReady) {
      S.dead = true;
      S.stats.deaths++;
      log(`At ${Math.floor(S.age)} years your lifespan runs out. Your Qi scatters like smoke.`, 'bad');
      emit({ kind: 'death' });
    }
  }

  // Time away grants a share of income but does not age you.
  function applyOffline(seconds) {
    if (!S || S.dead || S.choosingRoot) return null;
    const secs = Math.min(seconds, P.offlineCapHours * 3600);
    if (secs < 30) return null;
    const m = mods();
    const qi = qiRate(m) * secs * P.offlineRate;
    let stones = 0;
    if (S.hunting && S.recover <= 0) stones = regionStats(S.region).stones * m.stones * secs * P.offlineRate * 0.25;
    if (S.sect) stones += 0.05 * (1 + S.sect.rank) * regionStats(bestRegion()).stones * m.stones * secs * P.offlineRate;
    S.qi += qi;
    S.stones += stones;
    S.buffs = [];
    S.injury = 0;
    log(`You return from ${Math.round(secs / 60)} minutes of seclusion.`, 'story');
    return { secs, qi, stones };
  }

  // Numbers shown as "1.2K", then scientific once the suffixes run out.
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(n) {
    if (n === undefined || n === null || !isFinite(n)) return '∞';
    const sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n < 10) return sign + (Math.round(n * 10) / 10).toString();
    if (n < 1000) return sign + Math.floor(n).toString();
    const e = Math.floor(Math.log10(n) / 3);
    if (e >= SUFFIX.length) return sign + n.toExponential(2).replace('e+', 'e');
    return sign + (n / Math.pow(1000, e)).toFixed(2) + SUFFIX[e];
  }

  WD.Game = {
    P, TECHS, MAX_STAGE, BAG_SIZE, sectJoinStage, TRIB_FROM_REALM,
    get S() { return S; },
    setRng(f) { rng = f; },
    newGame, load, tick, applyOffline, fmt,
    realmOf, stageInRealm, isMajor, stageCost, qiRate, clickGain, stats, mods, lifespan, btChance, canAttempt,
    attemptBreakthrough, circulate, techLevel, techCost, canAfford, buyTech,
    rootName, elementInfo, rerollRoot, rerollCost, confirmRoot,
    regionStats, bestRegion, setRegion, setHunting, equip, sell, sellInferior, equipBest, itemScore, itemValue,
    pillCost, pillChance, refine, usePill, alchLevel,
    joinSect, leaveSect, startMission, missionSlots, missionChance, treasury, buyTreasury,
    divine, divineCost, choiceCost, canChoose, chooseEncounter,
    reincarnate, karmaOnDeath, karmaCost, buyKarma, daoCost, buyDao, daoOnAscend, ascend,
  };
})();
