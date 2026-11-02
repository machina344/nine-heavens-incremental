// Runs long bot simulations off the page's main thread. Post { seed, maxSeconds, stopAfterAscensions, P }.
self.window = self;
importScripts('../js/data.js', '../js/core.js', 'bot.js');

self.onmessage = (e) => {
  const opts = e.data;
  Object.assign(WD.Game.P, opts.P || {});
  const b = WD.runBot(opts);
  const G = WD.Game;
  const S = G.S;
  const m = G.mods();
  self.postMessage({
    seed: opts.seed,
    P: opts.P,
    asc: b.ascensions.map((a) => +(a.t / 3600).toFixed(1)),
    deaths: b.lives.length,
    hours: +(b.end.t / 3600).toFixed(1),
    best: b.end.best,
    nowStage: S.stage,
    cap: G.maxStage(),
    secsPerStage: Math.round(G.stageCost(S.stage) / G.qiRate(m)),
    atkVsFoe: (G.stats(m).atk / G.regionStats(G.bestRegion()).hp).toExponential(1),
    trophies: b.end.trophies,
    tower: b.end.tower,
    duels: b.end.duels,
    rarity: b.end.bestRarity,
    feats: b.end.feats,
    tribFails: b.tribFails || 0,
    errors: b.errors,
  });
};
