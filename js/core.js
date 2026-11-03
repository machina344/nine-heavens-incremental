// Game rules and state. No DOM access, so the test bot can drive it directly.
(function () {
  const D = WD.DATA;
  const SPR = D.STAGES_PER_REALM;
  const TRIB_FROM_REALM = 2; // Entering Core Formation or later calls down lightning.
  const BAG_SIZE = 24;
  const ADDITIVE = { luck: 1, bt: 1, alch: 1 };
  // Ascending opens one more realm above the mortal ten.
  const maxStage = () => (10 + Math.min(S.ascensions, D.REALMS.length - 10)) * SPR - 1;

  // ---------- tunable pacing ----------
  const P = {
    stageBase: 25, stageGrowth: 2, stageGrowthLate: 1.72, stageTaperAt: 36, stageGrowthFinal: 1.48, stageFinalAt: 76, heavenCost: 10, heavenSteepen: 0.01, heavenFoeHp: 100, heavenFoeDmg: 30, heavenFoeStones: 6, karmaScale: 1.3,
    stageQiBonus: 1.05, realmQiBonus: 1.4,
    qiTechPower: 0.5, qiTechPowerStep: 7, qiTechStoneBase: 25, qiTechStoneStep: 9, techGrowth: 1.2,
    fightTechPower: 2, fightTechStep: 14, fightTechCost: 15, fightTechCostStep: 60,
    enemyHp: 14, enemyHpStep: 9, enemyDmg: 1.5, enemyDmgStep: 7, enemyStones: 3, enemyStoneStep: 6,
    atkStage: 1.07, hpStage: 1.07,
    techMax: 100, manualMax: 25, battleRegen: 0.003, unverifiedHours: 1,
    offlineRate: 0.3, offlineCapHours: 8, offlineRateMax: 0.6, offlineCapMax: 24,
    offlineRatePerChamber: 0.01, offlineCapPerChamber: 0.4, offlineRatePerDao: 0.02, offlineCapPerDao: 1,
    offlineFindsMax: 6, offlineFindItem: 0.2, offlineFindEgg: 0.04, insightMinSecs: 1800, insightMaxSecs: 600, insightQi: 0.5,
    encounterMin: 75, encounterMax: 170,
    towerStep: 1.5, towerDmgStep: 1.38, masteryStep: 1.5, gearStep: 5,
    gradeBase: 0.4, gradeRegion: 0.6, gradeRealmFloor: 0.8, gradeShift: 0.15, gradeLuck: 0.25, gradeLuckCap: 5, gradeAscension: 0.5, gradeWidth: 1.5,
    lateLuckRealm: 0.15, lateLuckAscension: 0.25,
    depthHp: 3.5, depthDmg: 3, depthStones: 1.35, bossHp: 25, bossDmg: 3, trophyBonus: 0.015, towerBonus: 0.005,
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

  // ---------- sliding quality ladders ----------
  // Every rolled quality draws from a bell curve. Its centre climbs with realm and heavens
  // (plus a ladder-specific bonus and some luck), and grades far below the centre stop appearing.
  const LADDER_CURVES = {
    root: { list: () => D.ROOT_TIERS, base: 1.3, perRealm: 0, perAscension: 0.8, width: 1.3 },
    comprehension: { list: () => D.COMPREHENSION, base: 1.6, perRealm: 0.45, perAscension: 0.35, width: 1.3 },
    pills: { list: () => D.PILL_GRADES, base: 1.2, perRealm: 0.3, perAscension: 0.3, width: 1.1 },
    missions: { list: () => D.MISSION_RANKS, base: 1.2, perRealm: 0.4, perAscension: 0.4, width: 1.2 },
    purity: { list: () => D.PURITY, base: 1.8, perRealm: 0.3, perAscension: 0.3, width: 1.1 },
    sites: { list: () => D.SITES, base: 1.4, perRealm: 0.35, perAscension: 0.4, width: 1.3 },
    condition: { list: () => D.CONDITIONS, base: 2.4, perRealm: 0.2, perAscension: 0.2, width: 1.2 },
  };
  function ladderCurve(key, bonus) {
    const cv = LADDER_CURVES[key];
    const last = cv.list().length - 1;
    const fate = S ? fateLuck() : 0;
    const luck = Math.min(1.5, Math.sign(fate) * Math.sqrt(Math.abs(fate)) * 0.1);
    const realm = S ? realmOf(S.stage) : 0;
    const asc = S ? S.ascensions : 0;
    const centre = Math.max(0, Math.min(last, cv.base + cv.perRealm * realm + cv.perAscension * asc + luck + (bonus || 0)));
    return {
      centre,
      low: Math.max(0, Math.min(last, Math.ceil(centre - 2 * cv.width))),
      high: Math.min(last, Math.floor(centre + 2.5 * cv.width)),
      width: cv.width,
    };
  }
  function ladderOdds(key, bonus) {
    const c = ladderCurve(key, bonus);
    const w = LADDER_CURVES[key].list().map((x, i) => (i < c.low || i > c.high ? 0 : Math.exp(-Math.pow(i - c.centre, 2) / (2 * c.width * c.width))));
    const total = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / total);
  }
  function rollLadder(key, bonus) {
    const odds = ladderOdds(key, bonus);
    return weighted(odds, (p) => p);
  }

  function log(msg, kind) {
    S.log.unshift({ m: msg, k: kind || '', a: Math.floor(S.age) });
    if (S.log.length > 80) S.log.length = 80;
  }
  function emit(ev) { S.fx.push(ev); }

  // ---------- state ----------
  function freshMeta() {
    return {
      v: 3, lastSect: null, idleArts: {}, bagLevel: 0, vault: [], vaultLevel: 0, pillTargets: { gather: 2, heal: 1, foundation: 1 }, clockPool: 3600, perfectSeen: {}, lore: {}, trophies: {}, maxDepth: {}, towerBest: 0, duelsWon: 0, fame: 0, ascensions: 0, daoMarks: 0, dao: {}, karma: 0, karmaUps: {}, feats: {}, best: 0, lastSeen: Date.now(),
      settings: { autoStage: false, autoTech: false, autoMajor: false, autoMission: false, autoEquip: true, autoSkills: true, autoGuard: true, autoMeridian: false, autoRegion: false, autoBoss: false, autoPills: false, autoAbode: false, autoBeast: false, autoForge: false, autoFate: false, autoRebirth: false, autoSect: false, autoMajorArt: false, majorThreshold: 0.7, autoSellBelow: -1, salvageForCores: false },
      stats: { clicks: 0, kills: 0, pills: 0, lives: 1, tribs: 0, breakthroughs: 0, deviations: 0, bestRoot: 0, bestRarity: 0,
        bestRank: 0, supreme: 0, draws: 0, encounters: 0, deaths: 0, items: 0, playSeconds: 0, bestComprehension: 0, bestCondition: 0, bestPillGrade: 0, bestSite: 0, bestSkillRank: 0, bestBeastStage: 0, secludedSeconds: 0, parries: 0, defeats: 0, bestStreak: 0, bestPlus: 0 },
      log: [], fx: [],
    };
  }

  function lifeDefaults() {
    return {
      age: 16, stage: 0, qi: 0, stones: 0, herbs: 0, bonusYears: 0, longevityUsed: 0,
      techs: {}, sect: null, gear: { weapon: null, robe: null, ring: null, talisman: null }, bag: [],
      pills: {}, buffs: [], injury: 0, btBonus: 0, alchXp: 0,
      region: 0, depth: 0, hunting: false, foe: null, fight: null, hp: 0, recover: 0, swing: 0, strikeCd: 0,
      momentum: 0, streak: 0, guard: 0, cds: {}, miXp: 0, bossMeter: 0, doubleLoot: false, parryBonus: false,
      meridians: 0, abode: {}, eggs: 0, beast: null,
      cores: 0, techQ: {}, pillGrades: {}, meridianQ: [], abodeSite: 2, skillUse: {},
      encounter: null, encounterIn: rand(30, 60), encounterWait: 0, lastFortune: null, idleClock: 0,
      dead: false, ascendReady: false, itemSeq: S.itemSeq || 1, choosingRoot: true, rerolls: 0,
    };
  }
  function startLife() {
    Object.assign(S, lifeDefaults());
    S.root = rollRoot();
    noteRoot();
    S.abodeSite = rollLadder('sites');
    S.stats.bestSite = Math.max(S.stats.bestSite, S.abodeSite);
    S.hp = stats().hp;
  }

  function newGame() {
    S = freshMeta();
    startLife();
    log('You sit down beneath an old pine and take your first deliberate breath.', 'story');
    return S;
  }

  // Version 1 saves had six artifact grades and one bonus stat per item.
  const OLD_GRADES = [0, 2, 4, 7, 9, 13];
  function migrateItem(it) {
    if (!it) return;
    if (!it.affixes) { it.rarity = OLD_GRADES[it.rarity] || 0; it.affixes = it.affix ? [it.affix] : []; delete it.affix; it.plus = 0; }
  }
  // Version 2 saves used shorter ladders. Map each old grade to the nearest new one.
  function migrateLadders() {
    const map = (v, to) => (v === undefined || v === null ? v : to[v] === undefined ? v : to[v]);
    const ROOT = [1, 2, 3, 4, 6, 8];
    if (S.root) S.root.tier = map(S.root.tier, ROOT);
    S.stats.bestRoot = map(S.stats.bestRoot, ROOT);
    const COMP = [1, 2, 4, 6, 8];
    for (const k in S.techQ || {}) S.techQ[k] = map(S.techQ[k], COMP);
    S.stats.bestComprehension = map(S.stats.bestComprehension, COMP);
    const PUR = [1, 3, 4, 7];
    S.meridianQ = (S.meridianQ || []).map((q) => map(q, PUR));
    const SITE = [0, 2, 5, 7, 9];
    S.abodeSite = map(S.abodeSite, SITE);
    S.stats.bestSite = map(S.stats.bestSite, SITE);
    const PILL = [1, 2, 3, 5];
    for (const k in S.pillGrades || {}) {
      const old = S.pillGrades[k];
      const next = D.PILL_GRADES.map(() => 0);
      old.forEach((n, i) => { next[map(i, PILL)] += n; });
      S.pillGrades[k] = next;
    }
    S.stats.bestPillGrade = map(S.stats.bestPillGrade, PILL);
    if (S.sect) for (const m of S.sect.board.concat(S.sect.active)) m.rank = (m.rank || 0) + 1;
    S.v = 3;
  }
  // Clamps every grade, tier and index in a save to something that exists, so a value from an
  // older or mismatched version can never point past the end of a list.
  function repairSave() {
    const int = (v, max, fallback) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? Math.max(0, Math.min(max, Math.round(+v))) : fallback);
    const last = (list) => list.length - 1;
    const num = (v, fallback) => (Number.isFinite(+v) ? +v : fallback);
    if (!S.root || typeof S.root !== 'object') S.root = { tier: 1, elements: ['metal', 'wood', 'water', 'fire', 'earth'], purity: 0.5 };
    S.root.tier = int(S.root.tier, last(D.ROOT_TIERS), 1);
    // The elements must suit the tier: a variant root has one variant element, the rest that many ordinary ones.
    const tier = D.ROOT_TIERS[S.root.tier];
    const have = Array.isArray(S.root.elements) ? S.root.elements : [];
    if (tier.variant) {
      S.root.elements = [D.VARIANTS[have[0]] ? have[0] : Object.keys(D.VARIANTS)[0]];
    } else {
      const ordinary = have.filter((e, i) => D.ELEMENTS[e] && have.indexOf(e) === i);
      for (const e of Object.keys(D.ELEMENTS)) if (ordinary.length < tier.count && !ordinary.includes(e)) ordinary.push(e);
      S.root.elements = ordinary.slice(0, tier.count);
    }
    S.root.purity = Math.max(0, Math.min(1, num(S.root.purity, 0.5)));
    for (const k of ['qi', 'stones', 'herbs', 'cores', 'karma', 'daoMarks', 'age', 'hp', 'fame']) S[k] = Math.max(0, num(S[k], 0));
    S.stage = int(S.stage, D.REALMS.length * SPR - 1, 0);
    S.best = Math.max(S.stage, int(S.best, D.REALMS.length * SPR - 1, 0));
    S.ascensions = int(S.ascensions, 1000, 0);
    S.techs = S.techs && typeof S.techs === 'object' ? S.techs : {};
    for (const k in S.techs) S.techs[k] = int(S.techs[k], P.techMax, 0);
    S.techQ = S.techQ && typeof S.techQ === 'object' ? S.techQ : {};
    for (const k in S.techQ) S.techQ[k] = int(S.techQ[k], last(D.COMPREHENSION), 2);
    S.meridians = int(S.meridians, D.MERIDIANS.length, 0);
    S.meridianQ = (Array.isArray(S.meridianQ) ? S.meridianQ : []).slice(0, S.meridians).map((q) => int(q, last(D.PURITY), 3));
    while (S.meridianQ.length < S.meridians) S.meridianQ.push(3);
    S.abodeSite = int(S.abodeSite, last(D.SITES), 2);
    S.abode = S.abode && typeof S.abode === 'object' ? S.abode : {};
    for (const a of D.ABODE) if (S.abode[a.id] !== undefined) S.abode[a.id] = int(S.abode[a.id], a.max, 0);
    S.pillGrades = S.pillGrades && typeof S.pillGrades === 'object' ? S.pillGrades : {};
    for (const k in S.pillGrades) {
      const old = Array.isArray(S.pillGrades[k]) ? S.pillGrades[k] : [];
      S.pillGrades[k] = D.PILL_GRADES.map((g, i) => Math.max(0, Math.round(num(old[i], 0))));
    }
    const fixItem = (it) => {
      if (!it || typeof it !== 'object' || !D.GEAR_SLOTS[it.slot]) return null;
      it.rarity = int(it.rarity, last(D.RARITIES), 0);
      it.region = int(it.region, last(D.REGIONS), 0);
      if (it.cond !== undefined) it.cond = int(it.cond, last(D.CONDITIONS), 3);
      it.plus = int(it.plus, Math.min(30, 5 + it.rarity), 0);
      it.power = Math.max(0, num(it.power, 0));
      it.affixes = Array.isArray(it.affixes) ? it.affixes.filter((a) => a && Number.isFinite(+a.v)) : [];
      if (typeof it.name !== 'string') it.name = 'Nameless Artifact';
      return it;
    };
    S.bag = (Array.isArray(S.bag) ? S.bag : []).map(fixItem).filter(Boolean);
    S.vault = (Array.isArray(S.vault) ? S.vault : []).map(fixItem).filter(Boolean);
    S.gear = S.gear && typeof S.gear === 'object' ? S.gear : {};
    for (const slot of Object.keys(D.GEAR_SLOTS)) S.gear[slot] = fixItem(S.gear[slot]) || null;
    if (S.beast) {
      if (!D.BEASTS.some((b) => b.id === S.beast.species)) S.beast = null;
      else { S.beast.rarity = int(S.beast.rarity, last(D.RARITIES), 0); S.beast.level = int(S.beast.level, 200, 0); }
    }
    if (S.sect) {
      if (!D.SECTS.some((x) => x.id === S.sect.id)) S.sect = null;
      else {
        S.sect.rank = int(S.sect.rank, last(D.SECT_RANKS), 0);
        const fixMission = (m) => (m && D.MISSIONS[m.tpl] ? Object.assign(m, { rank: int(m.rank, last(D.MISSION_RANKS), 0) }) : null);
        S.sect.board = (Array.isArray(S.sect.board) ? S.sect.board : []).map(fixMission).filter(Boolean);
        S.sect.active = (Array.isArray(S.sect.active) ? S.sect.active : []).map(fixMission).filter(Boolean);
      }
    }
    S.region = int(S.region, last(D.REGIONS), 0);
    S.depth = int(S.depth, D.MAX_DEPTH, 0);
    S.buffs = (Array.isArray(S.buffs) ? S.buffs : []).filter((b) => b && b.fx && typeof b.fx === 'object');
    if (S.encounter && !D.ENCOUNTERS[S.encounter.i]) S.encounter = null;
    if (S.lastFortune !== null && S.lastFortune !== undefined) S.lastFortune = int(S.lastFortune, last(D.FORTUNES), null);
    if (S.foe && !(S.foe.maxHp > 0)) S.foe = null;
    const st = S.stats;
    st.bestRoot = int(st.bestRoot, last(D.ROOT_TIERS), 0);
    st.bestRarity = int(st.bestRarity, last(D.RARITIES), 0);
    st.bestComprehension = int(st.bestComprehension, last(D.COMPREHENSION), 0);
    st.bestPillGrade = int(st.bestPillGrade, last(D.PILL_GRADES), 0);
    st.bestSite = int(st.bestSite, last(D.SITES), 0);
    st.bestCondition = int(st.bestCondition, last(D.CONDITIONS), 0);
    st.bestRank = int(st.bestRank, last(D.SECT_RANKS), 0);
  }
  function load(saved) {
    S = freshMeta();
    const stats0 = S.stats, settings0 = S.settings;
    Object.assign(S, lifeDefaults(), saved);
    S.stats = Object.assign(stats0, saved.stats);
    S.settings = Object.assign(settings0, saved.settings);
    if ((saved.v || 1) < 2) {
      S.bag.forEach(migrateItem);
      Object.values(S.gear).forEach(migrateItem);
      S.stats.bestRarity = OLD_GRADES[S.stats.bestRarity] || 0;
      S.foe = null;
      S.v = 2;
    }
    if (S.v < 3) migrateLadders();
    repairSave();
    S.fx = [];
    return S;
  }

  // ---------- spirit roots ----------
  function rollRoot() {
    const idx = rollLadder('root');
    const tier = D.ROOT_TIERS[idx];
    let elements;
    if (tier.variant) {
      elements = [pick(Object.keys(D.VARIANTS))];
    } else {
      const pool = Object.keys(D.ELEMENTS);
      elements = [];
      while (elements.length < tier.count) elements.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return { tier: idx, elements, purity: rng() };
  }
  const rootPurityMult = () => 0.8 + 0.6 * (S.root.purity === undefined ? 0.5 : S.root.purity);
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
    const t = D.ROOT_TIERS[r.tier] || D.ROOT_TIERS[1];
    const v = t.variant && r.elements && D.VARIANTS[r.elements[0]];
    return v ? `${v.name} ${t.name}` : t.name;
  }
  function elementInfo(key) { return D.ELEMENTS[key] || D.VARIANTS[key]; }

  // ---------- modifiers ----------
  function applyFx(m, fx, n) {
    for (const k in fx) {
      if (ADDITIVE[k]) m[k] += fx[k] * n;
      else m[k] = Math.max(0.05, m[k] * (1 + fx[k] * n));
    }
  }

  // Each group applies one source of bonuses. Keeping them separate lets tooltips show where a number comes from.
  const MOD_GROUPS = [
    ['Spirit root', (m) => {
      if (!S.root) return;
      const t = D.ROOT_TIERS[S.root.tier];
      m.qi *= t.mult * rootPurityMult();
      for (const e of S.root.elements) {
        const info = elementInfo(e);
        const fx = {};
        fx[info.fx] = t.power * info.scale;
        applyFx(m, fx, 1);
      }
    }],
    ['Karma upgrades', (m) => { for (const u of D.KARMA_UPS) if (S.karmaUps[u.id] && u.fx) applyFx(m, u.fx, S.karmaUps[u.id]); }],
    ['Tree of the Dao', (m) => { for (const u of D.DAO_UPS) if (S.dao[u.id] && u.fx) applyFx(m, u.fx, S.dao[u.id]); }],
    ['Heavens reached', (m) => {
      if (!S.ascensions) return;
      m.qi *= Math.pow(4, S.ascensions);
      const f = Math.pow(2, S.ascensions);
      m.stones *= f; m.atk *= f; m.hp *= f;
    }],
    ['Feats', (m) => { m.qi *= 1 + 0.03 * Object.keys(S.feats).length; }],
    ['Sect', (m) => {
      if (!S.sect) return;
      applyFx(m, D.SECTS.find((x) => x.id === S.sect.id).fx, 1 + 0.25 * S.sect.rank);
      m.qi *= 1 + 0.12 * (S.sect.manual || 0);
    }],
    ['Artifacts', (m) => {
      // Gear bonuses add together and apply once, so extra bonus stats cannot compound.
      const gearFx = {};
      for (const slot in S.gear || {}) {
        const it = S.gear[slot];
        if (!it) continue;
        if (slot === 'ring') gearFx.qi = (gearFx.qi || 0) + itemPower(it);
        if (slot === 'talisman') { gearFx.stones = (gearFx.stones || 0) + itemPower(it); m.luck += it.rarity; }
        for (const a of it.affixes) gearFx[a.fx] = (gearFx[a.fx] || 0) + a.v;
      }
      applyFx(m, gearFx, 1);
    }],
    ['Meridians', (m) => { for (let i = 0; i < (S.meridians || 0); i++) applyFx(m, D.MERIDIANS[i].fx, purityMult(i)); }],
    ['Cave abode', (m) => { for (const a of D.ABODE) if (a.fx && S.abode && S.abode[a.id]) applyFx(m, a.fx, S.abode[a.id] * siteMult()); }],
    ['Perfection', (m) => {
      const list = perfectionList();
      for (const p of list) if (p.fx) applyFx(m, p.fx, 1);
      const f = 1 + 0.01 * list.length;
      m.qi *= f; m.atk *= f; m.hp *= f; m.stones *= f; m.herbs *= f;
    }],
    ['Martial Intent', (m) => { const f = 1 + 0.04 * miLevel(); m.atk *= f; m.hp *= f; }],
    ['Boss trophies', (m) => { const f = 1 + P.trophyBonus * Object.keys(S.trophies).length; m.atk *= f; m.hp *= f; }],
    ['Tower of Trials', (m) => { const f = 1 + P.towerBonus * S.towerBest; m.atk *= f; m.hp *= f; }],
    ['Jianghu title', (m) => { const t = titleIndex(); m.luck += t; m.stones *= 1 + 0.1 * t; }],
    ['Active effects', (m) => { for (const b of S.buffs || []) applyFx(m, b.fx, 1); }],
    ['Spirit beast', (m) => {
      if (!S.beast) return;
      const sp = D.BEASTS.find((x) => x.id === S.beast.species);
      const fx = {};
      fx[sp.fx] = sp.fx === 'luck' ? beastLuck(m.beast) : beastPower(m.beast);
      applyFx(m, fx, 1);
    }],
    ['Injury', (m) => { if (S.injury > 0) { m.qi *= 0.5; m.atk *= 0.7; } }],
  ];
  const baseMods = () => ({ qi: 1, atk: 1, hp: 1, stones: 1, herbs: 1, luck: 0, bt: 0, alch: 0, life: 1, mission: 1, trib: 1, dev: 1, beast: 1 });
  function mods() {
    const m = baseMods();
    if (!S) return m;
    for (const g of MOD_GROUPS) g[1](m);
    return m;
  }
  // Where a stat comes from: [label, multiplier or flat amount] for each source that changed it.
  function modSources(key) {
    const m = baseMods();
    const out = [];
    for (const g of MOD_GROUPS) {
      const before = m[key];
      g[1](m);
      if (m[key] !== before) out.push([g[0], ADDITIVE[key] ? m[key] - before : (before ? m[key] / before : 1)]);
    }
    return out;
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
  function masteryIndex(level) {
    let t = 0;
    D.MASTERY.forEach((x, i) => { if (level >= x.level) t = i; });
    return t;
  }
  const techQuality = (id) => D.COMPREHENSION[S.techQ[id] === undefined ? 2 : S.techQ[id]];
  const techMaxed = (id) => techLevel(id) >= P.techMax;
  const techPower = (t) => techLevel(t.id) * t.power * Math.pow(P.masteryStep, masteryIndex(techLevel(t.id))) * techQuality(t.id).mult * (techMaxed(t.id) ? 1.5 : 1);
  const rollComprehension = () => rollLadder('comprehension');
  const contemplateCost = (t) => Math.ceil(3 * (1 + Math.floor(t.unlock / SPR)));
  function contemplate(id) {
    const t = TECHS.find((x) => x.id === id);
    const have = S.techQ[id] === undefined ? 2 : S.techQ[id];
    if (!t || !techLevel(id) || S.cores < contemplateCost(t) || have >= D.COMPREHENSION.length - 1) return false;
    S.cores -= contemplateCost(t);
    const r = rollComprehension();
    if (r > have) {
      S.techQ[id] = r;
      S.stats.bestComprehension = Math.max(S.stats.bestComprehension, r);
      log(`Long contemplation pays off. Your ${t.name} deepens to ${D.COMPREHENSION[r].name}.`, r >= 3 ? 'rare' : 'loot');
      return { improved: true };
    }
    log(`You contemplate the ${t.name} and find nothing new.`, '');
    return { improved: false };
  }
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
    if (!t || S.stage < t.unlock || techMaxed(id)) return false;
    const c = techCost(t);
    if (!canAfford(c)) return false;
    pay(c);
    if (!techLevel(id)) {
      S.techQ[id] = rollComprehension();
      S.stats.bestComprehension = Math.max(S.stats.bestComprehension, S.techQ[id]);
      const q = D.COMPREHENSION[S.techQ[id]];
      log(`You study the ${t.name} and reach ${q.name} comprehension.`, S.techQ[id] >= 3 ? 'rare' : '');
    }
    S.techs[id] = techLevel(id) + 1;
    return true;
  }

  // ---------- derived numbers ----------
  function stageCost(stage) {
    const early = Math.min(stage, P.stageTaperAt);
    const final = Math.max(0, stage - P.stageFinalAt);
    const late = stage - early - final;
    // Each heaven also steepens the climb, so permanent bonuses cannot flatten later heavens.
    const steep = 1 + P.heavenSteepen * S.ascensions;
    return P.stageBase * Math.pow(Math.pow(P.stageGrowth, early) * Math.pow(P.stageGrowthLate, late) * Math.pow(P.stageGrowthFinal, final), steep) * Math.pow(P.heavenCost, S.ascensions);
  }
  function qiRate(m) {
    m = m || mods();
    let base = 0.5;
    for (const t of TECHS) if (t.type === 'qi') base += techPower(t);
    return base * Math.pow(P.stageQiBonus, S.stage) * Math.pow(P.realmQiBonus, realmOf(S.stage)) * m.qi;
  }
  function clickGain(m) { return 1 + qiRate(m) * 0.5; }
  function stats(m) {
    m = m || mods();
    let atk = 5, hp = 50;
    for (const t of TECHS) {
      if (t.type === 'atk') atk += techPower(t);
      if (t.type === 'hp') hp += techPower(t);
    }
    if (S.gear.weapon) atk += itemPower(S.gear.weapon);
    if (S.gear.robe) hp += itemPower(S.gear.robe);
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
    // Higher heavens toughen the later regions, leaving the early ones beatable after you ascend.
    const heaven = S.ascensions * Math.min(1, i / 10);
    return {
      hp: P.enemyHp * Math.pow(P.enemyHpStep, i) * Math.pow(P.heavenFoeHp, heaven),
      dmg: P.enemyDmg * Math.pow(P.enemyDmgStep, i) * Math.pow(P.heavenFoeDmg, heaven),
      stones: P.enemyStones * Math.pow(P.enemyStoneStep, i) * Math.pow(P.heavenFoeStones, heaven),
      power: 4 * Math.pow(P.gearStep, i),
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
  // Each new realm asks something of the other systems. Trophies last forever; the rest belong to one life.
  function realmGates() {
    if (!isMajor(S.stage)) return [];
    const toAscend = S.stage >= maxStage();
    const next = toAscend ? D.REALMS.length : realmOf(S.stage + 1);
    const gates = [];
    const meridians = toAscend ? D.MERIDIANS.length : Math.min(D.MERIDIANS.length, next * 2);
    gates.push({ label: `Open ${meridians} meridians`, have: `${S.meridians} of ${meridians}`, met: S.meridians >= meridians, tab: 'cultivate' });
    if (next >= 2) {
      const region = Math.min(D.REGIONS.length - 1, next - 2 + 1);
      const useRegion = Math.min(region, bestRegion());
      gates.push({ label: `Slay the Lord of ${D.REGIONS[useRegion].name}`, have: S.trophies[`${useRegion}:0`] ? 'done' : 'not yet', met: !!S.trophies[`${useRegion}:0`], tab: 'combat', region: useRegion });
    }
    if (next >= 3) {
      const rank = Math.min(4, Math.floor(next / 3));
      gates.push({ label: `Reach ${D.SECT_RANKS[rank].name} in a sect`, have: S.sect ? D.SECT_RANKS[S.sect.rank].name : 'no sect', met: !!S.sect && S.sect.rank >= rank, tab: 'sect' });
    }
    return gates;
  }
  const gatesMet = () => realmGates().every((g) => g.met);
  function canAttempt() { return !S.dead && !S.choosingRoot && !S.ascendReady && S.qi >= stageCost(S.stage) && gatesMet(); }

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

  // Survival odds for the next lightning, estimated by simulating it. Cached for a game second.
  let tribMemo = { at: -1, S: null, p: 1 };
  function tribSurvival() {
    if (!isMajor(S.stage)) return 1;
    const toAscend = S.stage >= maxStage();
    const nextRealm = realmOf(S.stage + 1);
    if (!toAscend && nextRealm < TRIB_FROM_REALM) return 1;
    if (tribMemo.S === S && tribMemo.at === Math.floor(S.stats.playSeconds) && tribMemo.stage === S.stage) return tribMemo.p;
    let ok = 0;
    for (let i = 0; i < 200; i++) if (callTribulation(toAscend ? realmOf(S.stage) : nextRealm, toAscend ? 3 : 0).survived) ok++;
    tribMemo = { at: Math.floor(S.stats.playSeconds), S, stage: S.stage, p: ok / 200 };
    return tribMemo.p;
  }
  function rootImproveChance() {
    const purity = S.root.purity === undefined ? 0.5 : S.root.purity;
    return ladderOdds('root').reduce((p, o, i) => p + (i > S.root.tier ? o : i === S.root.tier ? o * (1 - purity) : 0), 0);
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
    const toAscend = S.stage >= maxStage();
    const nextRealm = realmOf(S.stage + 1);
    if (toAscend || nextRealm >= TRIB_FROM_REALM) {
      const tr = callTribulation(toAscend ? realmOf(S.stage) : nextRealm, toAscend ? 3 : 0);
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
  // Depth multiplies a region's danger and rewards. Beating its boss opens the next depth, for good.
  function foeStats(i, depth) {
    const r = regionStats(i);
    const d = depth || 0;
    return { hp: r.hp * Math.pow(P.depthHp, d), dmg: r.dmg * Math.pow(P.depthDmg, d), stones: r.stones * Math.pow(P.depthStones, d), unlock: r.unlock };
  }
  const miLevel = () => Math.floor(Math.sqrt((S.miXp || 0) / 8));
  const BOSS_METER = 12;
  const canSummonBoss = () => S.bossMeter >= BOSS_METER && !S.fight && S.recover <= 0;

  function skillRank(id) {
    let r = 0;
    D.SKILL_RANKS.forEach((x, i) => { if ((S.skillUse[id] || 0) >= x.use) r = i; });
    return r;
  }
  function skillDef(id) {
    if (id === 'sect') return S.sect ? D.SECT_SKILLS[S.sect.id] : null;
    return D.SKILLS.find((x) => x.id === id);
  }
  function skillList() {
    const list = D.SKILLS.filter((x) => S.stage >= x.stage).map((x) => x.id);
    if (S.sect) list.push('sect');
    return list;
  }
  function useSkill(id) {
    const def = skillDef(id);
    if (!def || (id !== 'sect' && S.stage < def.stage) || (S.cds[id] || 0) > 0 || S.recover > 0 || !S.hunting) return false;
    if (def.mult && !S.foe) return false;
    S.cds[id] = def.cd;
    S.skillUse[id] = (S.skillUse[id] || 0) + 1;
    S.stats.bestSkillRank = Math.max(S.stats.bestSkillRank, skillRank(id));
    const m = mods();
    const st = stats(m);
    if (def.hurt) S.hp = Math.max(1, S.hp - st.hp * def.hurt);
    if (def.guard) S.guard = Math.max(S.guard, def.guard);
    if (def.heal) S.hp = Math.min(st.hp, S.hp + st.hp * def.heal);
    if (def.momentum) S.momentum = Math.min(100, S.momentum + def.momentum);
    if (def.loot) S.doubleLoot = true;
    if (def.stun && S.foe) S.foe.stun = Math.max(S.foe.stun, def.stun);
    if (def.mult) {
      const execute = def.exec && S.foe.hp / S.foe.maxHp < 0.3;
      landBlow((def.exec && execute ? def.exec : def.mult) * (1 + 0.25 * skillRank(id)), st, m, def.name);
    }
    return true;
  }
  function landBlow(mult, st, m, label) {
    if (!S.foe) return;
    const crit = rng() < 0.1 + S.momentum * 0.002;
    const dmg = st.atk * mult * (1 + S.momentum / 100) * (crit ? 2.5 : 1) * rand(0.9, 1.1);
    S.foe.hp -= dmg;
    S.momentum = Math.min(100, S.momentum + (mult > 1 ? 10 : 4));
    emit({ kind: 'hit', dmg, crit, label });
    if (S.foe.hp <= 0) foeDefeated(m);
  }
  function strike() {
    if (!S.hunting || !S.foe || S.recover > 0 || S.strikeCd > 0) return false;
    S.strikeCd = 0.2;
    const m = mods();
    landBlow(0.6, stats(m), m);
    return true;
  }

  function spawnFoe() {
    const f = S.fight;
    if (f && f.kind === 'tower') {
      const hp = P.enemyHp * 2 * Math.pow(P.towerStep, f.floor);
      S.foe = makeFoe(`Floor ${f.floor} Warden`, 'tower', hp, P.enemyDmg * 1.3 * Math.pow(P.towerDmgStep, f.floor), true);
      return;
    }
    if (f && f.kind === 'duel') {
      const r = foeStats(Math.floor(f.i * 1.6), 0);
      S.foe = makeFoe(`${D.RIVALS[f.i][0]}, ${D.RIVALS[f.i][1]}`, 'duel', r.hp * 10, r.dmg * 1.8, true);
      return;
    }
    const i = S.region;
    const r = foeStats(i, S.depth);
    if (f && f.kind === 'boss') {
      S.foe = makeFoe(`Lord of ${D.REGIONS[i].name}`, 'boss', r.hp * P.bossHp, r.dmg * P.bossDmg, true);
      return;
    }
    const roll = rng();
    const odds = foeTierOdds();
    const tier = roll < odds.champion ? 'champion' : roll < odds.champion + odds.elite ? 'elite' : 'normal';
    const scale = { normal: 1, elite: 3, champion: 7 }[tier];
    const prefix = { normal: '', elite: 'Elite ', champion: 'Champion ' }[tier];
    const affix = tier === 'normal' ? null : pick(D.FOE_AFFIXES);
    S.foe = makeFoe(`${affix ? `${affix.name} ` : ''}${prefix}${pick(D.REGIONS[i].foes)}`, tier, r.hp * scale * rand(0.85, 1.15) * (affix ? affix.hp : 1), r.dmg * (1 + (scale - 1) * 0.3) * rand(0.9, 1.1) * (affix ? affix.dmg : 1), tier !== 'normal');
    S.foe.pay = affix ? affix.pay : 1;
  }
  function foeTierOdds() {
    const luck = Math.max(0, mods().luck);
    const champion = 0.015 + luck * 0.0003;
    const elite = Math.max(0, 0.1 + luck * 0.001 - champion);
    return { champion, elite, normal: Math.max(0, 1 - champion - elite) };
  }
  const dropChance = (tier, depth) => Math.min(1, TIER_REWARD[tier].drop * (1 + Math.max(0, mods().luck) * 0.01) * (1 + (depth || 0) * 0.1));
  const herbChance = (tier) => TIER_REWARD[tier].herb;
  function makeFoe(name, tier, hp, dmg, charges) {
    return { name, tier, hp, maxHp: hp, dmg, stun: 0, charges, chargeIn: charges ? rand(5, 8) : 0, charging: 0 };
  }
  function setRegion(i) {
    if (i < 0 || i >= D.REGIONS.length || S.stage < regionStats(i).unlock || S.fight) return false;
    S.region = i;
    S.depth = Math.min(S.depth, S.maxDepth[i] || 0);
    S.foe = null;
    return true;
  }
  function setDepth(d) {
    if (d < 0 || d > (S.maxDepth[S.region] || 0) || S.fight) return false;
    S.depth = d;
    S.foe = null;
    return true;
  }
  function setHunting(on) {
    S.hunting = !!on;
    if (!on) { S.foe = null; S.fight = null; }
  }
  function summonBoss() {
    if (!canSummonBoss()) return false;
    S.bossMeter = 0;
    S.fight = { kind: 'boss', t: 90 };
    S.hunting = true;
    S.foe = null;
    return true;
  }
  function enterTower() {
    if (S.fight || S.recover > 0) return false;
    S.fight = { kind: 'tower', floor: S.towerBest + 1, t: 30, cleared: 0 };
    S.hunting = true;
    S.foe = null;
    return true;
  }
  function challengeRival(i) {
    if (S.fight || S.recover > 0 || i > S.duelsWon || i >= D.RIVALS.length || S.stage < rivalStage(i)) return false;
    S.fight = { kind: 'duel', i, t: 90 };
    S.hunting = true;
    S.foe = null;
    return true;
  }
  const rivalStage = (i) => Math.floor(i * 1.6) * SPR;
  function endFight(msg, kind) {
    if (msg) log(msg, kind);
    S.fight = null;
    S.foe = null;
  }
  function suffer(dmg, st) {
    S.hp -= dmg;
    if (S.hp > 0) return false;
    S.hp = 0;
    S.recover = 15;
    S.streak = 0;
    S.momentum = 0;
    S.stats.defeats++;
    const where = S.fight ? `the ${S.fight.kind === 'tower' ? `Tower, floor ${S.fight.floor}` : S.fight.kind === 'duel' ? 'Martial Tournament' : `lair of ${D.REGIONS[S.region].name}`}` : D.REGIONS[S.region].name;
    endFight(`Beaten in ${where}. You limp away to recover. Your streak is lost.`, 'bad');
    return true;
  }

  function tickCombat(dt, m) {
    const st = stats(m);
    // When maximum vitality changes, keep the same share of it, so growing stronger never looks like damage.
    if (S.hpMax > 0 && S.hpMax !== st.hp) S.hp *= st.hp / S.hpMax;
    S.hpMax = st.hp;
    if (!(S.hp >= 0)) S.hp = st.hp;
    if (S.hp > st.hp) S.hp = st.hp;
    for (const k in S.cds) { S.cds[k] -= dt; if (S.cds[k] <= 0) delete S.cds[k]; }
    if (S.guard > 0) S.guard = Math.max(0, S.guard - dt);
    if (S.strikeCd > 0) S.strikeCd -= dt;
    if (S.recover > 0) {
      S.recover -= dt;
      S.hp = Math.min(st.hp, S.hp + st.hp * dt / 12);
      return;
    }
    if (!S.hunting) {
      S.hp = Math.min(st.hp, S.hp + st.hp * dt * 0.03);
      S.momentum = Math.max(0, S.momentum - dt * 5);
      return;
    }
    // In battle you recover slowly, and faster as Martial Intent grows.
    S.hp = Math.min(st.hp, S.hp + st.hp * dt * (P.battleRegen + 0.004 * miLevel() / 5));
    if (S.fight) {
      S.fight.t -= dt;
      if (S.fight.t <= 0) {
        const isTower = S.fight.kind === 'tower';
        endFight(isTower ? `Time runs out on floor ${S.fight.floor}. The Tower sets you back on the ground.` : 'Your foe outlasts you and withdraws, laughing.', 'bad');
        return;
      }
    }
    if (!S.foe) spawnFoe();
    if (S.foe.stun > 0) S.foe.stun -= dt;
    else if (S.foe.charges) {
      if (S.foe.charging > 0) {
        S.foe.charging -= dt;
        if (S.foe.charging <= 0) {
          S.foe.chargeIn = rand(6, 9);
          S.foe.charging = 0;
          if (S.guard > 0) {
            S.stats.parries++;
            S.momentum = Math.min(100, S.momentum + 35);
            S.foe.stun = 3;
            S.foe.hp -= st.atk * 3;
            S.parryBonus = true;
            emit({ kind: 'parry' });
            if (S.foe.hp <= 0) { foeDefeated(m); return; }
          } else {
            S.momentum = Math.max(0, S.momentum - 50);
            emit({ kind: 'smash' });
            if (suffer(S.foe.dmg * 5, st)) return;
          }
        }
      } else {
        S.foe.chargeIn -= dt;
        if (S.foe.chargeIn <= 0) S.foe.charging = 3;
      }
    }
    S.swing += dt;
    while (S.swing >= 1 && S.foe) {
      S.swing -= 1;
      landBlow(1, st, m);
      if (!S.foe) break;
      if (S.foe.stun <= 0 && S.foe.charging <= 0 && suffer(S.foe.dmg * (S.guard > 0 ? 0.3 : 1), st)) return;
    }
    if (S.settings.autoSkills && miLevel() >= 5) {
      for (const id of skillList()) {
        if (id === 'guard') continue;
        if ((S.cds[id] || 0) <= 0 && S.foe) useSkill(id);
      }
    }
    if (S.settings.autoGuard && miLevel() >= 15 && S.foe && S.foe.charging > 0 && S.foe.charging < 1.5 && S.guard <= 0) useSkill('guard');
  }

  const TIER_REWARD = {
    normal: { stones: 1, herb: 0.22, drop: 0.015, xp: 1, fame: 0, shift: 0 },
    elite: { stones: 4, herb: 0.8, drop: 0.25, xp: 4, fame: 1, shift: 1, cores: 1 },
    champion: { stones: 14, herb: 1, drop: 0.8, xp: 14, fame: 5, shift: 3, cores: 5 },
  };
  function gainCores(n) { S.cores += n; }
  function foeDefeated(m) {
    const foe = S.foe;
    emit({ kind: 'kill', name: foe.name, maxHp: foe.maxHp, tier: foe.tier });
    S.stats.kills++;
    S.streak++;
    S.stats.bestStreak = Math.max(S.stats.bestStreak, S.streak);
    S.foe = null;
    const payout = (1 + Math.min(S.streak, 200) * 0.005) * (1 + S.momentum / 200) * (S.doubleLoot ? 2 : 1) * (S.parryBonus ? 1.5 : 1);
    S.doubleLoot = false;
    S.parryBonus = false;
    const f = S.fight;
    if (f) return fightWon(f, m, payout);

    const r = foeStats(S.region, S.depth);
    const tw = TIER_REWARD[foe.tier];
    S.stones += r.stones * rand(0.8, 1.2) * m.stones * tw.stones * payout * (foe.pay || 1);
    if (tw.cores) gainCores(Math.ceil(tw.cores * (S.region + 1) * (1 + S.depth * 0.25) * (foe.pay || 1)));
    S.miXp += tw.xp * (S.region + 1);
    S.bossMeter = Math.min(BOSS_METER, S.bossMeter + (foe.tier === 'normal' ? 1 : 3));
    if (tw.fame) gainFame(tw.fame * (S.region + 1) * (S.depth + 1));
    if (rng() < tw.herb) S.herbs += Math.ceil(rand(1, 3) * (S.region + 1) * (1 + S.depth * 0.3) * m.herbs);
    if (rng() < dropChance(foe.tier, S.depth)) gainItem(S.region, null, 0, tw.shift + S.depth);
    if (foe.tier === 'champion' && rng() < 0.1) gainEgg();
  }
  function bossGrade(i, d) { return Math.min(D.RARITIES.length - 1, Math.floor(i * 0.6 + d * 0.4) + 1); }
  function fightWon(f, m, payout) {
    const u = regionStats(bestRegion()).stones * m.stones;
    if (f.kind === 'boss') {
      const i = S.region, d = S.depth;
      const r = foeStats(i, d);
      const key = `${i}:${d}`;
      const first = !S.trophies[key];
      S.stones += r.stones * 15 * m.stones * payout;
      S.herbs += Math.ceil(12 * (i + 1) * m.herbs);
      S.miXp += 40 * (i + 1) * (d + 1);
      gainCores(25 * (i + 1) * (d + 1));
      gainFame(15 * (i + 1) * (d + 1) * (first ? 3 : 1));
      gainItem(i, null, bossGrade(i, d), d + 3);
      if (first) {
        S.trophies[key] = 1;
        gainItem(i, null, bossGrade(i, d) + 1, d + 3);
        S.maxDepth[i] = Math.min(D.MAX_DEPTH, Math.max(S.maxDepth[i] || 0, d + 1));
        log(`First kill: Lord of ${D.REGIONS[i].name}, depth ${d + 1}. Trophy earned. Depth ${S.maxDepth[i] + 1} opens.`, 'rare');
        emit({ kind: 'trophy', name: D.REGIONS[i].name });
      } else log(`You fell the Lord of ${D.REGIONS[i].name} once more.`, 'loot');
      if (rng() < 0.3) gainEgg();
      S.fight = null;
    } else if (f.kind === 'duel') {
      const first = f.i >= S.duelsWon;
      const rival = D.RIVALS[f.i];
      S.stones += u * 30 * payout;
      gainFame(80 * Math.pow(2.2, f.i) * (first ? 3 : 0.3));
      if (first) {
        S.duelsWon = f.i + 1;
        gainItem(Math.min(bestRegion(), Math.floor(f.i * 1.6)), null, 3 + f.i, 4);
        log(`You defeat ${rival[0]}, ${rival[1]}, before the whole martial world.`, 'rare');
        emit({ kind: 'trophy', name: rival[0] });
      } else log(`A rematch against ${rival[0]} ends the same way.`, 'loot');
      S.fight = null;
    } else if (f.kind === 'tower') {
      const fl = f.floor;
      if (fl > S.towerBest) {
        S.towerBest = fl;
        S.stones += u * 2 * payout;
        gainFame(fl);
        if (fl % 10 === 0) {
          gainItem(bestRegion(), null, Math.min(23, 2 + Math.floor(fl / 10)), 3);
          gainCores(fl);
          log(`Tower floor ${fl} cleared. The treasure chest opens.`, 'rare');
        }
      }
      f.floor = fl + 1;
      f.t = 30;
      f.cleared++;
    }
    return null;
  }
  function gainFame(n) {
    const before = titleIndex();
    S.fame += n;
    const after = titleIndex();
    if (after > before) {
      log(`The jianghu now calls you ${D.TITLES[after].name} (${D.TITLES[after].zh}).`, 'rare');
      emit({ kind: 'title', name: D.TITLES[after].name });
    }
  }
  function titleIndex() {
    let t = 0;
    D.TITLES.forEach((x, i) => { if (S.fame >= x.need) t = i; });
    return t;
  }

  // ---------- perfection ----------
  // Maxing something out is worth more than the last level: a reward of its own, and +1% to everything.
  // Recomputed at most once per game tick: bonus maths asks for it constantly.
  let perfectionMemo = { at: -1, list: [] };
  function perfectionList() {
    if (!S.abode) return [];
    if (perfectionMemo.at === S.stats.playSeconds && perfectionMemo.S === S) return perfectionMemo.list;
    perfectionMemo = { at: S.stats.playSeconds, S, list: buildPerfection() };
    return perfectionMemo.list;
  }
  function buildPerfection() {
    const out = [];
    for (const t of TECHS) if (techMaxed(t.id)) out.push({ id: `tech:${t.id}`, name: t.name, reward: 'Its power rises 50%, and all of its kind gain 3%', fx: { [t.type]: 0.03 } });
    for (const a of D.ABODE) if ((S.abode[a.id] || 0) >= a.max) out.push({ id: `abode:${a.id}`, name: a.name, reward: a.maxText, fx: a.maxFx });
    if ((S.meridians || 0) >= 12) out.push({ id: 'meridian:regular', name: 'Twelve Regular Channels', reward: '+25% Qi', fx: { qi: 0.25 } });
    if ((S.meridians || 0) >= D.MERIDIANS.length) out.push({ id: 'meridian:all', name: 'Grand Heavenly Circuit', reward: '+50% Qi', fx: { qi: 0.5 } });
    if (S.sect && (S.sect.manual || 0) >= P.manualMax) out.push({ id: 'manual', name: 'Sect Secret Manual', reward: '+50% Qi', fx: { qi: 0.5 } });
    if (S.beast && S.beast.level >= beastCap()) out.push({ id: 'beast', name: 'Spirit Beast Bond', reward: 'Companion power doubles', fx: { beast: 1 } });
    for (const u of D.KARMA_UPS) if ((S.karmaUps[u.id] || 0) >= u.max && u.max > 1) out.push({ id: `karma:${u.id}`, name: u.name, reward: '+1% to everything' });
    for (const u of D.DAO_UPS) if ((S.dao[u.id] || 0) >= u.max && u.max > 1) out.push({ id: `dao:${u.id}`, name: u.name, reward: '+1% to everything' });
    for (const slot in S.gear) {
      const it = S.gear[slot];
      if (it && (it.plus || 0) >= forgeCap(it)) out.push({ id: `forge:${slot}`, name: `Perfected ${D.GEAR_SLOTS[slot].name}`, reward: 'This artifact gains 50% power' });
    }
    return out;
  }
  function notePerfection() {
    for (const p of perfectionList()) {
      if (!S.perfectSeen[p.id]) {
        S.perfectSeen[p.id] = 1;
        log(`Perfected: ${p.name}. ${p.reward}.`, 'rare');
        emit({ kind: 'perfect', name: p.name });
      }
    }
  }

  // ---------- spirit beasts ----------
  function gainEgg() {
    S.eggs++;
    log('You find a spirit beast egg, warm to the touch.', 'loot');
  }
  function hatchEgg() {
    if (S.eggs <= 0) return false;
    S.eggs--;
    const rar = rollRarity(bestRegion(), 2);
    const b = { species: pick(D.BEASTS).id, rarity: rar, level: 0 };
    const sp = D.BEASTS.find((x) => x.id === b.species);
    const rr = D.RARITIES[rar];
    if (!S.beast || rar >= S.beast.rarity) {
      S.beast = b;
      log(`The egg cracks: a ${rr.name}-grade ${sp.name} (${sp.zh}) bonds with you.`, rar >= 7 ? 'rare' : 'loot');
    } else {
      S.herbs += Math.ceil(10 * rr.mult * (bestRegion() + 1));
      log(`A ${rr.name}-grade ${sp.name} hatches, weaker than your companion. You release it and keep the shell's herbs.`, '');
    }
    return true;
  }
  const beastCap = () => (S.beast ? 20 + S.beast.rarity * 5 : 0);
  const beastFeedCost = () => Math.ceil(5 * Math.pow(1.2, S.beast ? S.beast.level : 0) * (bestRegion() + 1));
  const beastFeedCores = () => (S.beast && S.beast.level % 5 === 4 ? Math.ceil((S.beast.level + 1) / 5) * 2 : 0);
  function beastStage() {
    let t = 0;
    if (S.beast) D.BEAST_STAGES.forEach((x, i) => { if (S.beast.level >= x.level) t = i; });
    return t;
  }
  function feedBeast() {
    if (!S.beast || S.beast.level >= beastCap() || S.herbs < beastFeedCost() || S.cores < beastFeedCores()) return false;
    const before = beastStage();
    S.cores -= beastFeedCores();
    S.herbs -= beastFeedCost();
    S.beast.level++;
    if (beastStage() > before) {
      S.stats.bestBeastStage = Math.max(S.stats.bestBeastStage, beastStage());
      log(`Your companion evolves into its ${D.BEAST_STAGES[beastStage()].name} form!`, 'rare');
    }
    return true;
  }
  const beastLuck = (sect) => Math.min(30, Math.ceil(10 * Math.log10(1 + beastPower(sect) * 20)));
  function beastPower(sect) {
    if (!S.beast) return 0;
    const rar = D.RARITIES[S.beast.rarity];
    return 0.05 * Math.pow(rar.mult, 0.3) * (1 + S.beast.level * 0.1) * Math.pow(1.5, beastStage()) * (sect || 1);
  }

  // ---------- meridians ----------
  function meridianCost(i) { return stageCost(i * 4) * 1.5; }
  const meridianCores = (i) => (i < 12 ? 0 : (i - 11) * 4);
  const purityMult = (i) => D.PURITY[S.meridianQ && S.meridianQ[i] !== undefined ? S.meridianQ[i] : 3].mult;
  const rollPurity = () => rollLadder('purity');
  const temperCost = (i) => ({ herbs: Math.ceil(10 * (i + 1) * (bestRegion() + 1)), cores: 1 + Math.floor(i / 4) });
  function temperMeridian(i) {
    const c = temperCost(i);
    const have = S.meridianQ[i] === undefined ? 3 : S.meridianQ[i];
    if (i >= S.meridians || have >= D.PURITY.length - 1 || !canAfford(c)) return false;
    pay(c);
    const r = rollPurity();
    if (r > have) { S.meridianQ[i] = r; log(`The ${D.MERIDIANS[i].name} is tempered to ${D.PURITY[r].name}.`, r >= 3 ? 'rare' : 'loot'); return { improved: true }; }
    return { improved: false };
  }
  function openMeridian() {
    const i = S.meridians;
    if (i >= D.MERIDIANS.length || S.stage < i * 4) return false;
    const c = meridianCost(i);
    if (S.qi < c || S.cores < meridianCores(i)) return false;
    S.qi -= c;
    S.cores -= meridianCores(i);
    S.meridianQ[i] = rollPurity();
    S.meridians++;
    log(`The ${D.MERIDIANS[i].name} (${D.MERIDIANS[i].zh}) opens, ${D.PURITY[S.meridianQ[i]].name}. Qi rushes through.`, i >= 12 ? 'rare' : 'story');
    return true;
  }

  // ---------- cave abode ----------
  function abodeCost(a) {
    return a.cost * Math.pow(1.7, S.abode[a.id] || 0) * regionStats(bestRegion()).stones;
  }
  const siteMult = () => D.SITES[S.abodeSite === undefined ? 2 : S.abodeSite].mult;
  const abodeCores = (a) => Math.floor((S.abode[a.id] || 0) / 5);
  const surveyCost = () => regionStats(bestRegion()).stones * 40;
  function surveySite() {
    if (S.stones < surveyCost() || S.abodeSite >= D.SITES.length - 1) return false;
    S.stones -= surveyCost();
    const r = rollLadder('sites');
    if (r > S.abodeSite) {
      S.abodeSite = r;
      S.stats.bestSite = Math.max(S.stats.bestSite, r);
      log(`Your surveyors find a better home: ${D.SITES[r].name} (${D.SITES[r].zh}).`, r >= 3 ? 'rare' : 'loot');
      return { improved: true };
    }
    log('The geomancer walks the ridges and shakes their head.', '');
    return { improved: false };
  }
  function buildAbode(id) {
    const a = D.ABODE.find((x) => x.id === id);
    if (!a || (S.abode[id] || 0) >= a.max || S.stones < abodeCost(a) || S.cores < abodeCores(a)) return false;
    S.stones -= abodeCost(a);
    S.cores -= abodeCores(a);
    S.abode[id] = (S.abode[id] || 0) + 1;
    return true;
  }
  function tickAbode(dt, m) {
    const g = S.abode.garden || 0, v = S.abode.vein || 0;
    if (g) S.herbs += D.ABODE[1].herbRate * g * siteMult() * (bestRegion() + 1) * m.herbs * dt;
    if (v) S.stones += D.ABODE[2].stoneRate * v * siteMult() * regionStats(bestRegion()).stones * m.stones * dt;
  }

  // ---------- artifacts ----------
  // Late-game luck: realm and ascensions multiply whatever luck you already have.
  function fateLuck() {
    const luck = mods().luck;
    if (luck <= 0) return luck;
    return luck * (1 + P.lateLuckRealm * realmOf(S.stage) + P.lateLuckAscension * S.ascensions);
  }
  // Drops follow a bell curve over the grades. Progress moves its centre up, and
  // grades more than two widths below the centre stop dropping altogether.
  function gradeCurve(regionIdx, shift) {
    const fate = fateLuck();
    const reach = Math.max(regionIdx, realmOf(S.stage) * P.gradeRealmFloor);
    const luckPart = Math.min(P.gradeLuckCap, Math.sign(fate) * Math.sqrt(Math.abs(fate)) * P.gradeLuck);
    const centre = Math.max(0, P.gradeBase + P.gradeRegion * reach + P.gradeShift * (shift || 0) + luckPart + P.gradeAscension * S.ascensions);
    const last = D.RARITIES.length - 1;
    const low = Math.min(last, Math.max(0, Math.ceil(centre - 2 * P.gradeWidth)));
    return { centre: Math.min(last, centre), low, high: Math.min(last, Math.floor(centre + 2 * P.gradeWidth)) };
  }
  function gradeOdds(regionIdx, shift) {
    const c = gradeCurve(regionIdx, shift);
    const w = D.RARITIES.map((r, i) => (i < c.low || i > c.high ? 0 : Math.exp(-Math.pow(i - c.centre, 2) / (2 * P.gradeWidth * P.gradeWidth))));
    const total = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / total);
  }
  const rollRarity = (regionIdx, shift) => weighted(gradeOdds(regionIdx, shift), (p) => p);
  function makeItem(regionIdx, slotHint, minRarity, shift) {
    const rar = Math.min(D.RARITIES.length - 1, Math.max(minRarity || 0, rollRarity(regionIdx, shift)));
    const slot = slotHint || pick(Object.keys(D.GEAR_SLOTS));
    const def = D.GEAR_SLOTS[slot];
    const rr = D.RARITIES[rar];
    const roll = rand(0.85, 1.15);
    let power;
    if (slot === 'weapon') power = regionStats(regionIdx).power * rr.mult * roll;
    else if (slot === 'robe') power = regionStats(regionIdx).power * 6 * rr.mult * roll;
    else power = (0.05 + 0.02 * regionIdx) * Math.pow(rr.mult, 0.35) * roll;
    const affixes = [];
    const count = rar === 0 ? 0 : 1 + Math.floor(rar / 5);
    for (let i = 0; i < count; i++) {
      const a = pick(D.AFFIXES);
      let v = a.base * (a.flat ? Math.sqrt(rr.mult) : Math.pow(rr.mult, 0.25) * (1 + regionIdx * 0.1)) * rand(0.8, 1.2);
      if (a.flat && !a.pct) v = Math.ceil(v);
      affixes.push({ fx: a.fx, label: a.label, v, flat: !!a.flat, pct: !!a.pct });
    }
    const cond = rollLadder('condition', (shift || 0) * 0.3 + rar * 0.1);
    S.stats.bestCondition = Math.max(S.stats.bestCondition || 0, cond);
    return { id: S.itemSeq++, slot, rarity: rar, power, plus: 0, roll, cond, affixes, region: regionIdx, name: `${pick(D.GEAR_ADJ)} ${pick(def.nouns)}` };
  }
  function itemValue(it) {
    return Math.ceil(regionStats(it.region).stones * 2 * Math.pow(D.RARITIES[it.rarity].mult, 0.3));
  }
  const forgeCap = (it) => Math.min(30, 5 + it.rarity);
  const forgeStep = (it) => (it.slot === 'ring' || it.slot === 'talisman' ? 0.05 : 0.2);
  const itemPower = (it) => it.power * itemQuality(it).mult * (1 + forgeStep(it) * (it.plus || 0)) * ((it.plus || 0) >= forgeCap(it) ? 1.5 : 1);
  const itemQuality = (it) => D.CONDITIONS[it.cond === undefined ? 3 : it.cond];
  const reforgeCost = (it) => Math.ceil(2 * (1 + it.rarity / 3));
  function reforge(slot) {
    const it = S.gear[slot];
    if (!it || S.cores < reforgeCost(it) || (it.cond || 3) >= D.CONDITIONS.length - 1) return false;
    S.cores -= reforgeCost(it);
    const r = rollLadder('condition', it.rarity * 0.1);
    if (r > (it.cond === undefined ? 3 : it.cond)) {
      it.cond = r;
      S.stats.bestCondition = Math.max(S.stats.bestCondition, r);
      log(`Reforged: ${it.name} is now ${D.CONDITIONS[r].name}.`, r >= 7 ? 'rare' : 'loot');
      return { improved: true };
    }
    return { improved: false };
  }
  const forgeCores = (it) => Math.ceil((1 + (it.plus || 0)) * (1 + it.rarity / 4));
  function itemScore(it) {
    if (!it) return -1;
    const base = it.slot === 'ring' || it.slot === 'talisman' ? itemPower(it) * 100 : itemPower(it);
    return base * (1 + 0.1 * it.affixes.length);
  }
  function forgeCost(it) { return itemValue(it) * 3 * Math.pow(1.5, it.plus || 0); }
  function forgeChance(it) { return Math.max(0.2, 1 - 0.05 * (it.plus || 0)); }
  function forge(slot) {
    const it = S.gear[slot];
    if (!it || it.plus >= forgeCap(it) || S.stones < forgeCost(it) || S.cores < forgeCores(it)) return false;
    S.stones -= forgeCost(it);
    S.cores -= forgeCores(it);
    if (rng() < forgeChance(it)) {
      it.plus = (it.plus || 0) + 1;
      S.stats.bestPlus = Math.max(S.stats.bestPlus, it.plus);
      if (it.plus >= 10) log(`The anvil rings. ${it.name} reaches +${it.plus}.`, 'rare');
      return { ok: true };
    }
    if ((it.plus || 0) >= 10) { it.plus--; log(`The forge flares. ${it.name} falls back to +${it.plus}.`, 'bad'); }
    return { ok: false };
  }
  // ---------- storage ----------
  const BAG_STEP = 6;
  const BAG_MAX_LEVEL = 16;
  const bagSize = () => BAG_SIZE + BAG_STEP * (S.bagLevel || 0);
  const bagUpgradeCost = () => ({ stones: regionStats(bestRegion()).stones * 50 * Math.pow(1.8, S.bagLevel || 0), cores: 5 * ((S.bagLevel || 0) + 1) });
  function upgradeBag() {
    const c = bagUpgradeCost();
    if ((S.bagLevel || 0) >= BAG_MAX_LEVEL || !canAfford(c)) return false;
    pay(c);
    S.bagLevel = (S.bagLevel || 0) + 1;
    return true;
  }
  const dismantleCores = (it) => Math.ceil((1 + it.rarity) * (it.region + 1) / 2);
  function salvage(it, forCores) {
    if (forCores) S.cores += dismantleCores(it);
    else S.stones += itemValue(it) * mods().stones;
  }
  function dismantle(id) {
    const i = S.bag.findIndex((x) => x.id === id);
    if (i < 0 || S.bag[i].locked) return false;
    salvage(S.bag[i], true);
    S.bag.splice(i, 1);
    return true;
  }
  function toggleLock(id) {
    const it = S.bag.find((x) => x.id === id) || Object.values(S.gear).find((x) => x && x.id === id) || S.vault.find((x) => x.id === id);
    if (!it) return false;
    it.locked = !it.locked;
    return true;
  }
  const shouldAutoSell = (it) => S.idleArts.salvage && S.settings.autoSellBelow >= 0 && it.rarity < S.settings.autoSellBelow && itemScore(it) <= itemScore(S.gear[it.slot]);
  const vaultCap = () => (S.idleArts.vault ? 2 + (S.vaultLevel || 0) : 0);
  const vaultUpgradeCost = () => Math.ceil(8 * Math.pow(1.6, S.vaultLevel || 0));
  function upgradeVault() {
    if (!S.idleArts.vault || (S.vaultLevel || 0) >= 6 || S.karma < vaultUpgradeCost()) return false;
    S.karma -= vaultUpgradeCost();
    S.vaultLevel = (S.vaultLevel || 0) + 1;
    return true;
  }
  function storeInVault(id) {
    const i = S.bag.findIndex((x) => x.id === id);
    if (i < 0 || S.vault.length >= vaultCap()) return false;
    S.vault.push(S.bag.splice(i, 1)[0]);
    return true;
  }
  function takeFromVault(id) {
    const i = S.vault.findIndex((x) => x.id === id);
    if (i < 0 || S.bag.length >= bagSize()) return false;
    S.bag.push(S.vault.splice(i, 1)[0]);
    return true;
  }

  function gainItem(regionIdx, slotHint, minRarity, shift) {
    const it = makeItem(regionIdx, slotHint, minRarity, shift);
    S.stats.items++;
    S.stats.bestRarity = Math.max(S.stats.bestRarity, it.rarity);
    const rr = D.RARITIES[it.rarity];
    log(`Found ${rr.name}-grade ${it.name}.`, it.rarity >= 7 ? 'rare' : 'loot');
    emit({ kind: 'loot', it });
    if (S.settings.autoEquip && itemScore(it) > itemScore(S.gear[it.slot])) {
      const old = S.gear[it.slot];
      S.gear[it.slot] = it;
      if (old) S.stones += itemValue(old) * mods().stones;
      return it;
    }
    if (shouldAutoSell(it)) {
      salvage(it, S.settings.salvageForCores);
      return it;
    }
    if (S.bag.length >= bagSize()) {
      salvage(it, S.idleArts.salvage && S.settings.salvageForCores);
      log(`Your storage ring is full. ${S.idleArts.salvage && S.settings.salvageForCores ? 'Dismantled' : 'Sold'} the ${it.name}.`, 'loot');
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
    if (i < 0 || S.bag[i].locked) return false;
    S.stones += itemValue(S.bag[i]) * mods().stones;
    S.bag.splice(i, 1);
    return true;
  }
  function sellInferior() {
    const keep = [];
    let n = 0;
    for (const it of S.bag) {
      if (!it.locked && itemScore(it) <= itemScore(S.gear[it.slot])) { S.stones += itemValue(it) * mods().stones; n++; } else keep.push(it);
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
  function pillCost(p) { return { herbs: Math.ceil(p.herbs * Math.min(pillScale(p), 40)), stones: p.stones * Math.pow(1.3, S.stage), cores: p.cores * (1 + realmOf(S.stage)) }; }
  function pillChance(p, m) {
    m = m || mods();
    return Math.min(0.98, p.chance + m.alch + alchLevel() * 0.01);
  }
  const perfectChance = () => Math.min(1, 0.08 + Math.max(0, mods().luck) * 0.002);
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
    const perfect = rng() < perfectChance();
    const n = perfect ? 2 : 1;
    S.pills[id] = (S.pills[id] || 0) + n;
    const grade = rollLadder('pills', alchLevel() * 0.05);
    S.pillGrades[id] = S.pillGrades[id] || D.PILL_GRADES.map(() => 0);
    S.pillGrades[id][grade] += n;
    S.stats.bestPillGrade = Math.max(S.stats.bestPillGrade, grade);
    S.stats.pills += n;
    log(perfect ? `Pill clouds gather! Two perfect ${p.name}s.` : `Refined a ${p.name}.`, perfect ? 'rare' : 'loot');
    return { ok: true, n };
  }
  function addBuff(id, name, secs, fx) {
    S.buffs = S.buffs.filter((b) => b.id !== id);
    S.buffs.push({ id, name, t: secs, fx });
  }
  // Highest grade in stock, or -1 for pills that came ungraded from the sect treasury.
  function bestPillGrade(id) {
    const stock = S.pillGrades[id] || [];
    for (let i = stock.length - 1; i >= 0; i--) if (stock[i] > 0) return i;
    return -1;
  }
  function usePill(id) {
    if (!S.pills[id]) return false;
    const m = mods();
    const best = bestPillGrade(id);
    const q = D.PILL_GRADES[best < 0 ? 0 : best].mult;
    if (id === 'gather') { const b = D.ENCOUNTER_BUFFS.gather; addBuff('gather', b.name, b.secs * q, b.fx); }
    else if (id === 'heal') { S.injury = 0; S.hp = stats().hp; S.recover = 0; }
    else if (id === 'foundation') { if (S.btBonus >= 0.36 - 1e-9) return false; S.btBonus = Math.min(0.36, S.btBonus + 0.12 * q); }
    else if (id === 'insight') { S.qi += qiRate(m) * 180 * q; }
    else if (id === 'longevity') { if (S.longevityUsed >= 8) return false; S.longevityUsed++; S.bonusYears += 15 * q; }
    else if (id === 'marrow') {
      const r = rollRoot();
      if (r.tier > S.root.tier || (r.tier === S.root.tier && r.purity > S.root.purity)) { S.root = r; noteRoot(); log(`Impurities pour from your skin. You awaken a ${rootName(r)}!`, 'rare'); }
      else log('Your marrow burns clean, but your root does not change.', '');
    }
    S.pills[id]--;
    if (best >= 0) S.pillGrades[id][best]--;
    return true;
  }

  // ---------- sects ----------
  const sectJoinStage = 2;
  function joinSect(id) {
    if (S.sect || S.stage < sectJoinStage) return false;
    const sect = D.SECTS.find((x) => x.id === id);
    if (!sect) return false;
    S.sect = { id, rank: 0, contribution: 0, earned: 0, manual: 0, board: [], active: [], boardIn: 0 };
    S.lastSect = id;
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
  function rollMissionRank() {
    return rollLadder('missions', S.sect.rank * 0.4);
  }
  function refreshBoard() {
    const pool = D.MISSIONS.slice();
    S.sect.board = [];
    for (let i = 0; i < 3; i++) {
      const tpl = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      S.sect.board.push({ id: S.itemSeq++, tpl: D.MISSIONS.indexOf(tpl), scale: missionScale(), rank: rollMissionRank() });
    }
  }
  const missionSlots = () => (S.sect ? 1 + (S.sect.rank >= 2 ? 1 : 0) + (S.sect.rank >= 4 ? 1 : 0) : 0);
  function missionChance(tpl, m, rank) {
    m = m || mods();
    const shift = rank === undefined ? 0 : D.MISSION_RANKS[rank].chance;
    return Math.min(0.99, tpl.chance + shift + Math.max(-30, m.luck) * 0.003);
  }
  function startMission(id) {
    if (!S.sect || S.sect.active.length >= missionSlots()) return false;
    const i = S.sect.board.findIndex((b) => b.id === id);
    if (i < 0) return false;
    const b = S.sect.board.splice(i, 1)[0];
    const tpl = D.MISSIONS[b.tpl];
    S.sect.active.push({ tpl: b.tpl, scale: b.scale, rank: b.rank || 0, t: tpl.dur, dur: tpl.dur });
    return true;
  }
  function finishMission(a, m) {
    const tpl = D.MISSIONS[a.tpl];
    const rank = D.MISSION_RANKS[a.rank || 0];
    if (rng() >= missionChance(tpl, m, a.rank || 0)) {
      log(`Mission failed: ${tpl.name}.`, 'bad');
      return;
    }
    const c = tpl.reward.contribution * 5 * a.scale * rank.mult;
    if (rank.cores) gainCores(rank.cores * (bestRegion() + 1));
    S.sect.contribution += c;
    S.sect.earned += c;
    if (tpl.reward.stones) S.stones += tpl.reward.stones * rank.mult * stoneUnit();
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
  const donationSize = () => 5 * (bestRegion() + 1);
  const donationReward = () => 60 * missionScale();
  function donateCores() {
    if (!S.sect || S.cores < donationSize()) return false;
    S.cores -= donationSize();
    S.sect.contribution += donationReward();
    S.sect.earned += donationReward();
    updateRank();
    return true;
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
    if (id === 'manual') { if (S.sect.manual >= P.manualMax) { S.sect.contribution += it.cost; return false; } S.sect.manual++; }
    else if (id === 'pill_foundation') S.pills.foundation = (S.pills.foundation || 0) + 1;
    else if (id === 'pill_longevity') S.pills.longevity = (S.pills.longevity || 0) + 1;
    else if (id === 'artifact') gainItem(bestRegion(), null, 2);
    else if (id === 'heirloom') gainItem(bestRegion(), null, 7);
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
      const b = S.sect.board.slice().sort((x, y) => (y.rank || 0) - (x.rank || 0))[0];
      startMission(b.id);
    }
  }

  // ---------- divination ----------
  function fortuneOdds() {
    const luck = mods().luck;
    const w = D.FORTUNES.map((f, i) => f.weight * Math.pow(1 + Math.max(luck, -40) * 0.008, i - 2));
    const total = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / total);
  }
  const divineCost = () => regionStats(bestRegion()).stones * 6;
  function divine() {
    const c = divineCost();
    if (S.stones < c) return false;
    S.stones -= c;
    const idx = weighted(fortuneOdds(), (p) => p);
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
    if (fx.egg) gainEgg();
    if (fx.fame) gainFame(fx.fame * (bestRegion() + 1));
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
    S.fight = null;
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

  // ---------- idle arts ----------
  const hasArt = (id) => !!S.idleArts[id];
  function buyIdleArt(id) {
    const a = D.IDLE_ARTS.find((x) => x.id === id);
    if (!a || hasArt(id) || S.karma < a.cost) return false;
    S.karma -= a.cost;
    S.idleArts[id] = 1;
    if (a.setting) S.settings[a.setting] = true;
    if (id === 'salvage' && S.settings.autoSellBelow < 0) S.settings.autoSellBelow = 2;
    log(`You learn the Idle Art ${a.name} (${a.zh}).`, 'rare');
    return true;
  }
  const artOn = (id) => hasArt(id) && S.settings[D.IDLE_ARTS.find((x) => x.id === id).setting];
  function setPillTarget(id, n) {
    S.pillTargets[id] = Math.max(0, Math.min(20, n));
    return true;
  }
  // The safest-looking region and depth to hunt: the deepest where a fight should not kill you.
  function bestSafeHunt() {
    const st = stats();
    const safe = (r) => r.dmg * Math.ceil(r.hp * 1.2 / st.atk) < st.hp * 0.6;
    let best = { region: 0, depth: 0 };
    for (let i = 0; i <= bestRegion(); i++) {
      for (let d = 0; d <= (S.maxDepth[i] || 0); d++) if (safe(foeStats(i, d))) best = { region: i, depth: d };
    }
    return best;
  }
  function bossLooksWinnable() {
    const st = stats();
    const r = foeStats(S.region, S.depth);
    return r.hp * P.bossHp / (st.atk * 3) < 60 && r.dmg * P.bossDmg * 15 < st.hp;
  }
  function tickIdle(dt) {
    S.idleClock = (S.idleClock || 0) + dt;
    if (S.encounter) S.encounterWait = (S.encounterWait || 0) + dt;
    else S.encounterWait = 0;
    if (S.idleClock < 1) return;
    S.idleClock = 0;
    if (artOn('sect')) {
      if (!S.sect && S.lastSect && S.stage >= sectJoinStage) joinSect(S.lastSect);
      if (S.sect) {
        while (S.sect.active.length < missionSlots() && S.sect.board.length) {
          const b = S.sect.board.slice().sort((x, y) => (y.rank || 0) - (x.rank || 0))[0];
          if (!startMission(b.id)) break;
        }
        if (realmGates().some((g) => g.tab === 'sect' && !g.met)) while (S.cores >= donationSize() * 2 && donateCores()) { /* buy rank with spare cores */ }
      }
    }
    if (artOn('meridian') && S.meridians < D.MERIDIANS.length && S.stage >= S.meridians * 4) openMeridian();
    if (artOn('region') && !S.fight && S.recover <= 0) {
      const b = bestSafeHunt();
      if (S.region !== b.region) setRegion(b.region);
      if (S.depth !== b.depth) setDepth(b.depth);
      if (!S.hunting) setHunting(true);
    }
    if (artOn('boss') && canSummonBoss() && bossLooksWinnable()) summonBoss();
    if (artOn('pills')) {
      for (const id in S.pillTargets) {
        const p = D.PILLS.find((x) => x.id === id);
        if (!p || S.stage < p.stage || (S.pills[id] || 0) >= S.pillTargets[id]) continue;
        const cost = pillCost(p);
        if (canAfford(cost) && cost.stones < S.stones * 0.25) refine(id);
      }
      if (S.pills.gather && !S.buffs.some((b) => b.id === 'gather')) usePill('gather');
      if (S.pills.heal && S.injury > 0) usePill('heal');
      if (S.pills.foundation && isMajor(S.stage) && S.btBonus < 0.36 && S.qi >= stageCost(S.stage) * 0.9) usePill('foundation');
    }
    if (artOn('abode')) {
      const open = D.ABODE.filter((a) => (S.abode[a.id] || 0) < a.max && S.cores >= abodeCores(a)).sort((a, b) => abodeCost(a) - abodeCost(b))[0];
      if (open && abodeCost(open) < S.stones * 0.2) buildAbode(open.id);
    }
    if (artOn('beast')) {
      if (S.eggs > 0) hatchEgg();
      if (S.beast && S.herbs > beastFeedCost() * 4 && S.cores >= beastFeedCores() * 3) feedBeast();
    }
    if (artOn('forge')) {
      for (const slot in S.gear) {
        const it = S.gear[slot];
        if (it && it.plus < forgeCap(it) && S.stones > forgeCost(it) * 5 && S.cores > forgeCores(it) * 3) { forge(slot); break; }
      }
    }
    if (artOn('major') && isMajor(S.stage) && !S.ascendReady && S.injury <= 0 && canAttempt() && btChance() >= S.settings.majorThreshold) attemptBreakthrough();
    if (artOn('fate') && S.encounter && S.encounterWait >= 20) {
      const e = D.ENCOUNTERS[S.encounter.i];
      const order = e.choices.map((ch, i) => ({ i, p: ch.chance })).sort((a, b) => b.p - a.p);
      for (const o of order) if (chooseEncounter(o.i)) break;
    }
  }
  function idleRebirth() {
    if (!artOn('rebirth')) return;
    if (S.dead) reincarnate();
    if (S.choosingRoot) confirmRoot();
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
    const open = TECHS.filter((t) => S.stage >= t.unlock && !techMaxed(t.id));
    for (const t of open.slice().sort((a, b) => techCost(a).stones - techCost(b).stones)) {
      const c = techCost(t);
      // Qi-priced techniques are bought only while cheap next to the stage, so study never stalls cultivation.
      if (canAfford(c) && (!c.qi || c.qi < stageCost(S.stage) * 0.2)) buyTech(t.id);
    }
  }

  function tick(dt) {
    if (S && (S.dead || S.choosingRoot)) idleRebirth();
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
    tickAbode(dt, m);
    tickIdle(dt);
    if (!S.encounter) {
      S.encounterIn -= dt;
      if (S.encounterIn <= 0) rollEncounter();
    }
    if (S.settings.autoTech && S.karmaUps.autoTech) autoStudy();
    if (S.settings.autoStage && S.karmaUps.autoStage && !isMajor(S.stage)) while (!isMajor(S.stage) && canAttempt()) attemptBreakthrough();
    if (S.settings.autoMajor && S.dao.autoMajor && isMajor(S.stage) && !S.ascendReady && canAttempt() && S.injury <= 0) attemptBreakthrough();
    notePerfection();
    checkFeats();
    if (S.age >= lifespan(m) && !S.ascendReady) {
      S.dead = true;
      S.stats.deaths++;
      log(`At ${Math.floor(S.age)} years your lifespan runs out. Your Qi scatters like smoke.`, 'bad');
      emit({ kind: 'death' });
    }
  }

  // ---------- seclusion: time away ----------
  // Time away pays a share of active income and does not age you. It also pays out what the
  // abode, sect and hunt would have produced, and long absences can turn up finds.
  function offlineRate() {
    return Math.min(P.offlineRateMax, P.offlineRate + P.offlineRatePerChamber * (S.abode.chamber || 0) + P.offlineRatePerDao * (S.dao.stillness || 0));
  }
  function offlineCapHours() {
    return Math.min(P.offlineCapMax, P.offlineCapHours + P.offlineCapPerChamber * (S.abode.chamber || 0) + P.offlineCapPerDao * (S.dao.stillness || 0));
  }
  const insightSeconds = (secs) => (secs < P.insightMinSecs ? 0 : Math.min(P.insightMaxSecs, secs * 0.1));
  // Works out how much absence to pay for. A device clock can be set to anything, so only
  // time confirmed by the server counts in full. Unconfirmed time draws on a small pool
  // that refills only when the server next confirms the time.
  function resolveAway({ lastSeen, trustedNow, deviceNow, pool }) {
    const max = P.unverifiedHours * 3600;
    if (trustedNow !== null && trustedNow !== undefined) {
      return { seconds: Math.max(0, (trustedNow - lastSeen) / 1000), verified: true, pool: max };
    }
    const seconds = Math.min(Math.max(0, (deviceNow - lastSeen) / 1000), Math.max(0, pool));
    return { seconds, verified: false, pool: Math.max(0, pool) - seconds };
  }
  function huntOutlook(m) {
    const st = stats(m);
    const r = foeStats(S.region, S.depth);
    const hits = Math.ceil(r.hp / st.atk);
    if (!S.hunting || r.dmg * hits >= st.hp) return null;
    return { killsPerSec: 1 / (hits + 1), r };
  }
  function offlineFindOdds() {
    const boost = 1 + Math.max(0, mods().luck) * 0.005;
    const item = Math.min(1, P.offlineFindItem * boost);
    return { item, egg: (1 - item) * Math.min(1, P.offlineFindEgg * boost) };
  }
  function applyOffline(seconds) {
    if (!S || S.dead || S.choosingRoot) return null;
    const secs = Math.min(seconds, offlineCapHours() * 3600);
    if (secs < 30) return null;
    S.fight = null;
    S.foe = null;
    S.recover = 0;
    S.buffs = [];
    S.injury = 0;
    const m = mods();
    const rate = offlineRate();
    const rep = { away: seconds, secs, rate, qi: qiRate(m) * secs * rate, stones: 0, herbs: 0, xp: 0, kills: 0, missions: 0, contribution: 0, finds: [], insight: 0 };
    S.qi += rep.qi;

    const hunt = huntOutlook(m);
    if (hunt) {
      rep.kills = Math.floor(hunt.killsPerSec * secs * rate);
      rep.stones += rep.kills * hunt.r.stones * m.stones;
      rep.herbs += rep.kills * 0.22 * 2 * (S.region + 1) * m.herbs;
      rep.xp = rep.kills * (S.region + 1);
      rep.cores = Math.floor(rep.kills * 0.1 * (S.region + 1));
      S.cores += rep.cores;
      S.miXp += rep.xp;
      S.stats.kills += rep.kills;
    }
    const unit = regionStats(bestRegion()).stones;
    rep.stones += (S.abode.vein || 0) * siteMult() * D.ABODE[2].stoneRate * unit * m.stones * secs * rate;
    rep.herbs += (S.abode.garden || 0) * siteMult() * D.ABODE[1].herbRate * (bestRegion() + 1) * m.herbs * secs * rate;

    if (S.sect) {
      rep.stones += 0.05 * (1 + S.sect.rank) * unit * m.stones * secs * rate;
      const before = S.sect.earned;
      for (const a of S.sect.active) a.t -= secs * m.mission;
      const done = S.sect.active.filter((a) => a.t <= 0);
      S.sect.active = S.sect.active.filter((a) => a.t > 0);
      done.forEach((a) => finishMission(a, m));
      rep.missions = done.length;
      rep.contribution = S.sect.earned - before;
    }
    S.stones += rep.stones;
    S.herbs += rep.herbs;

    // One chance per hour away at something found while wandering, up to a limit.
    const rolls = Math.min(P.offlineFindsMax, Math.floor(secs / 3600));
    const luckBoost = 1 + Math.max(0, m.luck) * 0.005;
    for (let i = 0; i < rolls; i++) {
      if (rng() < P.offlineFindItem * luckBoost) {
        const it = gainItem(bestRegion());
        rep.finds.push(`${D.RARITIES[it.rarity].name}-grade ${it.name}`);
      } else if (rng() < P.offlineFindEgg * luckBoost) {
        gainEgg();
        rep.finds.push('A spirit beast egg');
      }
    }

    rep.insight = insightSeconds(secs);
    if (rep.insight) addBuff('seclusion', 'Seclusion Insight', rep.insight, { qi: P.insightQi });
    S.stats.secludedSeconds += secs;
    log(`You return from ${secs >= 3600 ? `${(secs / 3600).toFixed(1)} hours` : `${Math.round(secs / 60)} minutes`} of seclusion.`, 'story');
    return rep;
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
    P, TECHS, maxStage, BAG_SIZE, sectJoinStage, TRIB_FROM_REALM,
    get S() { return S; },
    setRng(f) { rng = f; },
    newGame, load, repairSave, tick, applyOffline, offlineRate, offlineCapHours, insightSeconds, huntOutlook, fmt,
    realmOf, stageInRealm, isMajor, stageCost, qiRate, clickGain, stats, mods, lifespan, btChance, canAttempt,
    attemptBreakthrough, circulate, techLevel, techCost, canAfford, buyTech,
    rootName, elementInfo, rerollRoot, rerollCost, confirmRoot,
    regionStats, bestRegion, setRegion, setHunting, equip, sell, sellInferior, equipBest, itemScore, itemValue,
    pillCost, pillChance, refine, usePill, alchLevel,
    joinSect, leaveSect, startMission, missionSlots, missionChance, treasury, buyTreasury,
    divine, divineCost, choiceCost, canChoose, chooseEncounter,
    ladderCurve, ladderOdds, rollLadder, reforge, reforgeCost,
    bagSize, bagUpgradeCost, upgradeBag, BAG_MAX_LEVEL, dismantle, dismantleCores, toggleLock, vaultCap, vaultUpgradeCost, upgradeVault, storeInVault, takeFromVault,
    hasArt, buyIdleArt, setPillTarget, bestSafeHunt,
    fortuneOdds, gradeOdds, foeTierOdds, dropChance, herbChance, perfectChance, offlineFindOdds, tribSurvival, rootImproveChance,
    fateLuck, gradeCurve, rollRarity, modSources, beastLuck, resolveAway, realmGates, gatesMet, perfectionList, rootPurityMult,
    bestPillGrade, techQuality, techMaxed, contemplate, contemplateCost, meridianCores, purityMult, temperCost, temperMeridian, siteMult, abodeCores, surveyCost, surveySite,
    forgeCap, forgeCores, itemQuality, beastCap, beastStage, beastFeedCores, donateCores, donationSize, donationReward, skillRank,
    foeStats, miLevel, BOSS_METER, canSummonBoss, skillDef, skillList, useSkill, strike, summonBoss, enterTower, challengeRival, rivalStage, setDepth, titleIndex,
    hatchEgg, feedBeast, beastFeedCost, beastPower, meridianCost, openMeridian, abodeCost, buildAbode, forge, forgeCost, forgeChance, itemPower, masteryIndex, techPower,
    reincarnate, karmaOnDeath, karmaCost, buyKarma, daoCost, buyDao, daoOnAscend, ascend,
  };
})();
