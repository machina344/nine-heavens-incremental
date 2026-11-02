// A simple autoplayer used to check pacing and catch crashes. Runs the real rules with no page.
(function () {
  function runBot(opts) {
    const G = WD.Game;
    const D = WD.DATA;
    const maxSeconds = opts.maxSeconds || 12 * 3600;
    const clicksPerSecond = opts.clicks === undefined ? 1 : opts.clicks;
    let seed = opts.seed || 12345;
    G.setRng(() => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; });
    const S0 = G.newGame();
    const out = { realms: {}, lives: [], ascensions: [], errors: [], end: null };
    let t = 0;
    const sectId = opts.sect || D.SECTS[(opts.seed || 0) % D.SECTS.length].id;

    const check = (label) => {
      const S = G.S;
      for (const k of ['qi', 'stones', 'herbs', 'hp', 'age', 'karma']) {
        if (!Number.isFinite(S[k]) || (k !== 'hp' && S[k] < -1e-6)) out.errors.push(`${label}: ${k}=${S[k]} at ${t}s`);
      }
    };

    while (t < maxSeconds && out.errors.length < 5) {
      let S = G.S;
      if (S.choosingRoot) {
        while (S.root.tier < 2 && G.rerollRoot()) { /* spend spare karma on a decent root */ }
        G.confirmRoot();
      }
      if (S.dead) {
        out.lives.push({ t, stage: S.stage, karma: G.karmaOnDeath() });
        G.reincarnate();
        for (let bought = true; bought;) bought = D.KARMA_UPS.some((u) => G.buyKarma(u.id));
        continue;
      }
      if (S.ascendReady) {
        out.ascensions.push({ t, lives: S.stats.lives });
        G.ascend();
        for (let bought = true; bought;) bought = D.DAO_UPS.some((u) => G.buyDao(u.id));
        if (opts.stopAfterAscensions && out.ascensions.length >= opts.stopAfterAscensions) break;
        continue;
      }
      for (let i = 0; i < clicksPerSecond; i++) G.circulate();
      S.settings.autoEquip = true;

      // Buy the cheapest open technique until nothing is affordable.
      const open = G.TECHS.filter((x) => S.stage >= x.unlock);
      for (let n = 0; n < 40; n++) {
        const next = open.filter((x) => {
          const c = G.techCost(x);
          // Leave Qi for the next stage: only spend it when it is small next to the stage cost.
          return G.canAfford(c) && (!c.qi || c.qi < G.stageCost(S.stage) * 0.4);
        }).sort((a, b) => (G.techCost(a).stones || 0) - (G.techCost(b).stones || 0))[0];
        if (!next || !G.buyTech(next.id)) break;
      }

      // Hunt the toughest region and depth that a fight would not kill us in.
      const st = G.stats();
      const safe = (r) => r.dmg * Math.ceil(r.hp * 1.2 / st.atk) < st.hp * 0.6;
      let target = 0, depth = 0;
      for (let i = 0; i <= G.bestRegion(); i++) {
        for (let d = 0; d <= (S.maxDepth[i] || 0); d++) if (safe(G.foeStats(i, d))) { target = i; depth = d; }
      }
      if (!S.fight) {
        if (S.region !== target) G.setRegion(target);
        if (S.depth !== depth) G.setDepth(depth);
      }
      if (!S.hunting) G.setHunting(true);

      // Fight like a decent player: use every skill, guard most charged blows, summon bosses we can beat.
      if (S.foe && S.foe.charging > 0 && S.foe.charging < 1.5 && !S.fight) G.useSkill('guard');
      else if (S.foe && S.foe.charging > 0 && S.foe.charging < 1.5) G.useSkill('guard');
      for (const id of G.skillList()) if (id !== 'guard') G.useSkill(id);
      G.strike();
      const bossSafe = (() => { const r = G.foeStats(S.region, S.depth); return r.hp * G.P.bossHp / (st.atk * 3) < 60 && r.dmg * G.P.bossDmg * 15 < st.hp; })();
      if (G.canSummonBoss() && bossSafe) G.summonBoss();
      const towerFoeHp = 28 * Math.pow(G.P.towerStep, S.towerBest + 1);
      if (!S.fight && S.recover <= 0 && t % 300 === 0 && towerFoeHp / (st.atk * 3) < 25) G.enterTower();
      if (!S.fight && S.recover <= 0 && S.duelsWon < D.RIVALS.length && S.stage >= G.rivalStage(S.duelsWon)) {
        const r = G.foeStats(Math.floor(S.duelsWon * 1.6), 0);
        if (r.hp * 10 / (st.atk * 3) < 60 && r.dmg * 1.8 * 15 < st.hp) G.challengeRival(S.duelsWon);
      }

      // Meridians, abode and beast.
      if (S.meridians < D.MERIDIANS.length && S.stage >= S.meridians * 4 && S.qi > G.meridianCost(S.meridians) * 3) G.openMeridian();
      for (const a of D.ABODE) if (S.stones > G.abodeCost(a) * 3) G.buildAbode(a.id);
      if (S.eggs > 0) G.hatchEgg();
      if (S.beast && S.herbs > G.beastFeedCost() * 4) G.feedBeast();
      for (const slot in S.gear) if (S.gear[slot] && S.stones > G.forgeCost(S.gear[slot]) * 6 && (S.gear[slot].plus || 0) < 10) G.forge(slot);

      if (!S.sect && S.stage >= G.sectJoinStage) G.joinSect(sectId);
      if (S.sect) {
        while (S.sect.active.length < G.missionSlots() && S.sect.board.length) G.startMission(S.sect.board[0].id);
        for (const id of ['manual', 'pill_foundation', 'pill_longevity']) if (S.sect.rank >= 1 || id === 'manual') G.buyTreasury(id);
      }

      if (S.injury > 0 && S.pills.heal) G.usePill('heal');
      if (S.pills.gather && !S.buffs.some((b) => b.id === 'gather')) G.usePill('gather');
      if (S.pills.insight) G.usePill('insight');
      if (S.pills.marrow) G.usePill('marrow');
      if (S.pills.longevity && S.age > G.lifespan() * 0.6) G.usePill('longevity');
      for (const p of D.PILLS) if (p.id !== 'heal' && G.S.stones > G.pillCost(p).stones * 3) G.refine(p.id);
      if (S.encounter) G.chooseEncounter(0) || G.chooseEncounter(1);
      if (S.stones > G.divineCost() * 10 && !S.buffs.some((b) => b.id === 'fortune')) G.divine();

      if (G.isMajor(S.stage) && S.pills.foundation && S.btBonus < 0.36) G.usePill('foundation');
      for (let n = 0; n < 20 && G.canAttempt() && !S.ascendReady; n++) {
        if (G.isMajor(S.stage)) {
          const res = G.attemptBreakthrough();
          if (res && res.tribulation) out.tribFails = (out.tribFails || 0) + 1;
          break;
        }
        G.attemptBreakthrough();
      }
      if (out.realms[G.realmOf(S.stage)] === undefined || (out.best || 0) < S.stage) {
        out.best = Math.max(out.best || 0, S.stage);
        if (out.realms[G.realmOf(S.stage)] === undefined) out.realms[G.realmOf(S.stage)] = { t, life: S.stats.lives };
      }
      G.tick(1);
      t += 1;
      S.fx.length = 0;
      check('tick');
    }
    const S = G.S;
    out.end = { t, stage: S.stage, best: S.best, lives: S.stats.lives, karma: S.karma, dao: S.daoMarks, asc: S.ascensions, feats: Object.keys(S.feats).length, deviations: S.stats.deviations, tribs: S.stats.tribs, trophies: Object.keys(S.trophies).length, tower: S.towerBest, duels: S.duelsWon, bestRarity: S.stats.bestRarity, fame: S.fame, S0ok: !!S0 };
    return out;
  }
  WD.runBot = runBot;
})();
