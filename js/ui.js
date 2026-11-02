// Rendering, input and saves. Each view is an HTML string patched into the page by morph(),
// which keeps elements in place so clicks land even while numbers update.
(function () {
  const G = WD.Game;
  const D = WD.DATA;
  const fmt = G.fmt;
  const SAVE_KEY = 'nine-heavens.save.v1';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x) => `${Math.round(x * 100)}%`;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TABS = [
    ['cultivate', 'Techniques'], ['hunt', 'Hunt'], ['sect', 'Sect'], ['alchemy', 'Alchemy'],
    ['fate', 'Fate'], ['rebirth', 'Rebirth'], ['records', 'Records'],
  ];
  let tab = 'cultivate';
  let trib = null;        // Tribulation currently playing: { ev, shown, done }
  let confirmWipe = false;
  let confirmRebirth = false;
  let confirmLeave = false;
  let lastEncounterText = '';
  let saveMsg = '';

  // ---------- DOM patching ----------
  function morph(parent, html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    patchChildren(parent, tpl.content);
  }
  function patchChildren(a, b) {
    const ac = a.childNodes, bc = Array.from(b.childNodes);
    bc.forEach((nb, i) => {
      const na = ac[i];
      if (!na) { a.appendChild(nb); return; }
      if (na.nodeType !== nb.nodeType || na.nodeName !== nb.nodeName) { a.replaceChild(nb, na); return; }
      if (na.nodeType === 3) { if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue; return; }
      if (na.nodeType !== 1) return;
      for (const at of Array.from(na.attributes)) if (!nb.hasAttribute(at.name)) na.removeAttribute(at.name);
      for (const at of Array.from(nb.attributes)) if (na.getAttribute(at.name) !== at.value) na.setAttribute(at.name, at.value);
      if (na.nodeName !== 'TEXTAREA') patchChildren(na, nb);
    });
    while (ac.length > bc.length) a.removeChild(a.lastChild);
  }

  // ---------- small view helpers ----------
  const btn = (label, action, on, cls) => `<button type="button" data-a="${action}" class="${cls || ''}"${on === false ? ' disabled' : ''}>${label}</button>`;
  const bar = (frac, cls) => `<div class="bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%"></i></div>`;
  const zh = (t) => `<span class="zh">${t}</span>`;
  const row = (left, right, cls) => `<div class="row ${cls || ''}"><div>${left}</div><div class="actions">${right}</div></div>`;
  function costText(c) {
    const out = [];
    if (c.qi) out.push(`${fmt(c.qi)} Qi`);
    if (c.herbs) out.push(`${fmt(c.herbs)} herbs`);
    if (c.stones) out.push(`${fmt(c.stones)} stones`);
    return out.join(' + ');
  }
  function fxText(fx) {
    const L = { qi: 'Qi', atk: 'attack', hp: 'vitality', stones: 'stones', herbs: 'herbs', luck: 'luck', bt: 'breakthrough', alch: 'alchemy', trib: 'tribulation resistance', mission: 'mission speed', dev: 'deviation', life: 'lifespan' };
    return Object.keys(fx).map((k) => {
      const v = fx[k];
      if (k === 'luck') return `${v > 0 ? '+' : ''}${v} luck`;
      return `${v > 0 ? '+' : ''}${Math.round(v * 100)}% ${L[k]}`;
    }).join(', ');
  }
  function stageLabel(stage) { return `Stage ${G.stageInRealm(stage) + 1} of ${D.STAGES_PER_REALM}`; }

  // ---------- left column ----------
  function renderIdentity() {
    const S = G.S;
    const r = D.REALMS[G.realmOf(S.stage)];
    document.documentElement.style.setProperty('--realm', r.color);
    morph($('identity'), `<div class="realm-name">${r.zh}</div><div class="realm-en">${r.name}</div><div class="dim small">${stageLabel(S.stage)} · ${esc(G.rootName(S.root))}</div>`);
    const h = Math.min(S.ascensions, D.HEAVENS.length - 1);
    morph($('heaven'), `${zh(D.HEAVEN_ZH[h])} ${D.HEAVENS[h]}${S.ascensions > 9 ? ` +${S.ascensions - 9}` : ''} · Life ${S.stats.lives}`);
  }

  function renderStatus() {
    const S = G.S;
    const m = G.mods();
    const cost = G.stageCost(S.stage);
    const life = G.lifespan(m);
    const major = G.isMajor(S.stage);
    const st = G.stats(m);
    let main;
    if (S.ascendReady) main = btn('Ascend to the next heaven', 'askAscend', true, 'primary big');
    else if (major) {
      const nextTrib = S.stage >= G.MAX_STAGE || G.realmOf(S.stage + 1) >= G.TRIB_FROM_REALM;
      main = btn(`${S.stage >= G.MAX_STAGE ? 'Face the final tribulation' : 'Attempt breakthrough'} · ${pct(G.btChance(m))}${nextTrib ? ' + lightning' : ''}`, 'advance', G.canAttempt(), 'primary big');
    } else main = btn('Advance to next stage', 'advance', G.canAttempt(), 'big');

    const chips = [];
    if (S.injury > 0) chips.push(`<span class="chip warn">Injured ${Math.ceil(S.injury)}s: half Qi</span>`);
    if (S.btBonus > 0) chips.push(`<span class="chip gold">Breakthrough +${pct(S.btBonus)}</span>`);
    for (const b of S.buffs) chips.push(`<span class="chip ${b.fx.qi < 0 || b.fx.stones < 0 ? 'warn' : ''}" title="${esc(fxText(b.fx))}">${esc(b.name)} ${Math.ceil(b.t)}s</span>`);

    const autos = [];
    if (S.karmaUps.autoStage) autos.push(toggle('autoStage', 'Auto stages'));
    if (S.karmaUps.autoTech) autos.push(toggle('autoTech', 'Auto study'));
    if (S.dao.autoMajor) autos.push(toggle('autoMajor', 'Auto breakthrough'));

    morph($('status'), `<div class="stack">
      <div class="kv"><span>Qi ${fmt(S.qi)} / ${fmt(cost)}</span><span class="dim small">${fmt(G.qiRate(m))}/s</span></div>
      ${bar(S.qi / cost)}
      ${main}
      ${autos.length ? `<div class="toolbar small">${autos.join('')}</div>` : ''}
      <div class="kv small"><span>Age ${Math.floor(S.age)} of ${Math.floor(life)} years</span><span class="dim">1 month/s</span></div>
      ${bar(S.age / life, 'age')}
      <div class="kv small"><span>Vitality ${fmt(S.hp)} / ${fmt(st.hp)}</span><span class="dim">Attack ${fmt(st.atk)}</span></div>
      ${bar(S.hp / st.hp, 'hp')}
      <div class="res">
        <div class="kv"><span>Stones</span><b>${fmt(S.stones)}</b></div>
        <div class="kv"><span>Herbs</span><b>${fmt(S.herbs)}</b></div>
        <div class="kv"><span>Karma</span><b>${fmt(S.karma)}</b></div>
        <div class="kv"><span>Dao Marks</span><b>${fmt(S.daoMarks)}</b></div>
      </div>
      ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
    </div>`);
  }
  function toggle(key, label) {
    return `<label class="toggle"><input type="checkbox" data-t="${key}"${G.S.settings[key] ? ' checked' : ''}>${label}</label>`;
  }

  function renderEncounter() {
    const S = G.S;
    if (!S.encounter) {
      morph($('encounter'), lastEncounterText ? `<div class="scroll-card small"><span>${esc(lastEncounterText)}</span>${btn('Close', 'closeEnc', true, 'ghost')}</div>` : '');
      return;
    }
    const e = D.ENCOUNTERS[S.encounter.i];
    const buttons = e.choices.map((c, i) => {
      const cost = G.choiceCost(c);
      return btn(`${c.label}${cost ? ` (${fmt(cost)} stones)` : ''}`, `enc:${i}`, G.canChoose(i));
    }).join('');
    morph($('encounter'), `<div class="scroll-card"><h3>${zh(e.zh)} ${e.title}</h3><p class="small">${e.text}</p><div class="actions">${buttons}</div></div>`);
  }

  function renderTabs() {
    const S = G.S;
    const flag = {
      fate: !!S.encounter,
      rebirth: S.karma >= 3 && D.KARMA_UPS.some((u) => (S.karmaUps[u.id] || 0) < u.max && S.karma >= G.karmaCost(u)),
    };
    morph($('tabs'), TABS.map(([id, label]) => `<button type="button" data-a="tab:${id}" class="${tab === id ? 'on' : ''}">${label}${flag[id] ? ' <span class="dot">•</span>' : ''}</button>`).join(''));
  }

  function renderLog() {
    morph($('log'), G.S.log.map((l) => `<div class="e ${l.k}"><b>Age ${l.a}</b>${esc(l.m)}</div>`).join(''));
  }

  // ---------- tabs ----------
  const VIEWS = {
    cultivate() {
      const groups = [['qi', 'Cultivation Methods', 'Raise Qi per second.'], ['atk', 'Martial Arts', 'Raise attack.'], ['hp', 'Body Tempering', 'Raise vitality, which also shields you from lightning.']];
      return groups.map(([type, title, note]) => {
        const all = G.TECHS.filter((t) => t.type === type);
        const open = all.filter((t) => G.S.stage >= t.unlock);
        const next = all.find((t) => G.S.stage < t.unlock);
        const rows = open.map((t) => {
          const c = G.techCost(t);
          const unit = type === 'qi' ? 'Qi/s' : type === 'atk' ? 'attack' : 'vitality';
          return row(`<div class="title">${zh(t.zh)} ${t.name} <span class="dim small">Lv ${G.techLevel(t.id)}</span></div><div class="dim small">+${fmt(t.power)} base ${unit} per level</div>`,
            btn(costText(c), `tech:${t.id}`, G.canAfford(c)));
        }).join('');
        const lock = next ? `<div class="dim small">Next: ${next.name}, at ${D.REALMS[G.realmOf(next.unlock)].name} stage ${G.stageInRealm(next.unlock) + 1}.</div>` : '';
        return `<div class="section"><div><h2>${title}</h2><div class="dim small">${note}</div></div>${rows}${lock}</div>`;
      }).join('');
    },

    hunt() {
      const S = G.S;
      const st = G.stats();
      const regions = D.REGIONS.map((r, i) => {
        const rs = G.regionStats(i);
        const open = S.stage >= rs.unlock;
        if (!open) return i === G.bestRegion() + 1 ? row(`<div class="title dim">${r.name}</div><div class="dim small">Opens at ${D.REALMS[G.realmOf(rs.unlock)].name} stage ${G.stageInRealm(rs.unlock) + 1}.</div>`, '', 'locked') : '';
        const risk = rs.dmg * Math.ceil(rs.hp / st.atk) > st.hp ? '<span class="bad">Deadly</span>' : rs.hp / st.atk > 6 ? '<span class="dim">Slow</span>' : '<span class="good">Manageable</span>';
        return row(`<div class="title">${zh(r.zh)} ${r.name}</div><div class="dim small">Foes ${fmt(rs.hp)} HP, ${fmt(rs.dmg)} dmg/s · ${fmt(rs.stones)} stones · ${risk}</div>`,
          btn(S.region === i ? 'Selected' : 'Travel', `region:${i}`, S.region !== i), S.region === i ? 'done' : '');
      }).join('');
      const foe = S.foe;
      const fight = S.recover > 0 ? `<div class="dim">Recovering for ${Math.ceil(S.recover)}s.</div>`
        : foe ? `<div class="kv small"><span>${esc(foe.name)}</span><span>${fmt(Math.max(0, foe.hp))} HP</span></div>${bar(foe.hp / foe.maxHp, 'hp')}` : `<div class="dim small">${S.hunting ? 'Searching for prey.' : 'You are resting.'}</div>`;
      const gear = Object.keys(D.GEAR_SLOTS).map((slot) => {
        const it = S.gear[slot];
        return row(`<div class="small dim">${zh(D.GEAR_SLOTS[slot].zh)} ${D.GEAR_SLOTS[slot].name}</div>${it ? itemText(it) : '<div class="dim small">Empty</div>'}`, '');
      }).join('');
      const bag = S.bag.slice().sort((a, b) => b.rarity - a.rarity || G.itemScore(b) - G.itemScore(a)).map((it) => {
        const better = G.itemScore(it) > G.itemScore(S.gear[it.slot]);
        return row(`<div class="small dim">${D.GEAR_SLOTS[it.slot].name}${better ? ' · <span class="good">Upgrade</span>' : ''}</div>${itemText(it)}`,
          btn('Equip', `equip:${it.id}`) + btn(`Sell ${fmt(G.itemValue(it) * G.mods().stones)}`, `sell:${it.id}`, true, 'ghost'));
      }).join('');
      return `<div class="section"><h2>The Hunt</h2>
          <div class="toolbar">${btn(S.hunting ? 'Stop hunting' : 'Begin hunting', 'hunt', true, S.hunting ? '' : 'primary')}</div>${fight}
          <div class="stack">${regions}</div></div>
        <div class="section"><h2>Equipped</h2><div class="grid2">${gear}</div></div>
        <div class="section"><div class="kv"><h2>Storage Ring</h2><span class="dim small">${S.bag.length} of ${G.BAG_SIZE}</span></div>
          <div class="toolbar">${btn('Equip upgrades', 'equipBest', S.bag.length > 0)}${btn('Sell non-upgrades', 'sellBad', S.bag.length > 0, 'ghost')}${toggle('autoEquip', 'Auto-equip upgrades')}</div>
          <div class="stack">${bag || '<div class="dim small">Hunt, explore and take risks to find artifacts.</div>'}</div></div>`;
    },

    sect() {
      const S = G.S;
      if (!S.sect) {
        const can = S.stage >= G.sectJoinStage;
        return `<div class="section"><h2>Choose a Sect</h2>
          <div class="dim small">${can ? 'A wandering cultivator only goes so far. Choose carefully: leaving forfeits your rank.' : `Sects accept disciples from Qi Refining stage ${G.sectJoinStage + 1}.`}</div>
          <div class="stack">${D.SECTS.map((x) => row(`<div class="title">${zh(x.zh)} ${x.name}</div><div class="small"><i>“${x.motto}”</i> ${x.desc}</div><div class="small good">${fxText(x.fx)}</div>`, btn('Join', `join:${x.id}`, can))).join('')}</div></div>`;
      }
      const s = S.sect;
      const sd = D.SECTS.find((x) => x.id === s.id);
      const rank = D.SECT_RANKS[s.rank];
      const next = D.SECT_RANKS[s.rank + 1];
      const active = s.active.map((a) => {
        const t = D.MISSIONS[a.tpl];
        return `<div class="row"><div><div class="kv small"><span>${t.name}</span><span>${Math.ceil(a.t)}s</span></div>${bar(1 - a.t / a.dur, 'gold')}</div><div></div></div>`;
      }).join('');
      const free = s.active.length < G.missionSlots();
      const board = s.board.map((b) => {
        const t = D.MISSIONS[b.tpl];
        const parts = [`${fmt(t.reward.contribution * 5 * b.scale)} contribution`];
        if (t.reward.stones) parts.push('stones');
        if (t.reward.herbs) parts.push('herbs');
        if (t.reward.item) parts.push(`${pct(t.reward.item)} artifact`);
        return row(`<div class="title">${t.name}</div><div class="dim small">${t.dur}s · ${pct(G.missionChance(t))} success · ${parts.join(', ')}</div>`, btn('Accept', `mission:${b.id}`, free));
      }).join('');
      const shop = G.treasury().map((it) => {
        const locked = s.rank < (it.unlockRank || 0);
        return row(`<div class="title">${it.name}</div><div class="dim small">${locked ? `Requires ${D.SECT_RANKS[it.unlockRank].name}.` : it.desc}</div>`, btn(`${fmt(it.cost)}`, `treasury:${it.id}`, !locked && s.contribution >= it.cost), locked ? 'locked' : '');
      }).join('');
      return `<div class="section"><h2>${zh(sd.zh)} ${sd.name}</h2>
          <div class="kv"><span>${zh(rank.zh)} ${rank.name}</span><b>${fmt(s.contribution)} contribution</b></div>
          ${next ? `<div class="dim small">Next rank, ${next.name}: ${fmt(s.earned)} of ${fmt(next.need)} earned</div>${bar(s.earned / next.need, 'gold')}` : '<div class="good small">You lead the sect.</div>'}
          <div class="small good">${fxText(sd.fx)} (rank bonus ×${(1 + 0.25 * s.rank).toFixed(2)})</div></div>
        <div class="section"><div class="kv"><h2>Mission Hall</h2><span class="dim small">${s.active.length} of ${G.missionSlots()} slots · new board in ${Math.ceil(Math.max(0, s.boardIn))}s</span></div>
          ${S.dao.autoHunt ? `<div class="small">${toggle('autoMission', 'Auto-accept missions')}</div>` : ''}${active}${board}</div>
        <div class="section"><h2>Treasury</h2>${shop}</div>
        <div class="toolbar">${confirmLeave ? btn('Yes, abandon the sect', 'leaveYes', true, 'primary') + btn('Stay', 'leaveNo') : btn('Leave the sect', 'leaveAsk', true, 'ghost')}</div>`;
    },

    alchemy() {
      const S = G.S;
      const rows = D.PILLS.map((p) => {
        const locked = S.stage < p.stage;
        const c = G.pillCost(p);
        const have = S.pills[p.id] || 0;
        const left = `<div class="title">${zh(p.zh)} ${p.name} <span class="dim small">× ${have}</span></div><div class="dim small">${p.desc}</div>`
          + (locked ? `<div class="small dim">Opens at ${D.REALMS[G.realmOf(p.stage)].name} stage ${G.stageInRealm(p.stage) + 1}.</div>` : `<div class="small">${costText(c)} · ${pct(G.pillChance(p))} success</div>`);
        return row(left, btn('Refine', `refine:${p.id}`, !locked && G.canAfford(c)) + btn('Consume', `use:${p.id}`, have > 0), locked ? 'locked' : '');
      }).join('');
      return `<div class="section"><div class="kv"><h2>Pill Furnace</h2><span class="dim small">Alchemy level ${G.alchLevel()}</span></div>
        <div class="dim small">Every attempt trains your hand. Fortune sometimes yields two perfect pills.</div>${rows}</div>`;
    },

    fate() {
      const S = G.S;
      const f = S.lastFortune === null ? null : D.FORTUNES[S.lastFortune];
      const odds = D.FORTUNES.map((x) => `<span class="chip" title="${esc(fxText(x.fx))}">${zh(x.zh)} ${x.name}</span>`).join('');
      return `<div class="section"><h2>Temple of the Bamboo Sticks</h2>
          <div class="dim small">Shake the cylinder and let one stick fall. Its fortune lasts a few minutes and replaces the last. Luck tilts the draw, but calamity is always possible.</div>
          <div class="toolbar">${btn(`Draw a stick · ${fmt(G.divineCost())} stones`, 'divine', S.stones >= G.divineCost(), 'primary')}</div>
          ${f ? `<div class="row"><div><div class="fortune ${S.lastFortune <= 1 ? 'ill' : ''}">${f.zh}</div><div class="title">${f.name}</div><div class="small">${f.text}</div><div class="small dim">${fxText(f.fx)} for ${f.secs}s</div></div><div></div></div>` : ''}
          <div class="chips">${odds}</div></div>
        <div class="section"><h2>Your Luck</h2><div class="kv"><span>Current luck</span><b>${fmt(G.mods().luck)}</b></div>
          <div class="dim small">Luck improves artifact grades, root rolls, mission and encounter odds, and the sticks.</div>
          <h2>Chance Encounters</h2><div class="dim small">${S.encounter ? 'Fate has found you. See the scroll under your dantian.' : `Resolved in all your lives: ${S.stats.encounters}.`}</div></div>`;
    },

    rebirth() {
      const S = G.S;
      const karmaRows = D.KARMA_UPS.map((u) => {
        const l = S.karmaUps[u.id] || 0;
        const maxed = l >= u.max;
        return row(`<div class="title">${zh(u.zh)} ${u.name} <span class="dim small">${l} of ${u.max}</span></div><div class="dim small">${u.desc}</div>`,
          btn(maxed ? 'Complete' : `${fmt(G.karmaCost(u))} karma`, `karma:${u.id}`, !maxed && S.karma >= G.karmaCost(u)), maxed ? 'done' : '');
      }).join('');
      const daoRows = D.DAO_UPS.map((u) => {
        const l = S.dao[u.id] || 0;
        const maxed = l >= u.max;
        return row(`<div class="title">${zh(u.zh)} ${u.name} <span class="dim small">${l} of ${u.max}</span></div><div class="dim small">${u.desc}</div>`,
          btn(maxed ? 'Complete' : `${fmt(G.daoCost(u))} marks`, `dao:${u.id}`, !maxed && S.daoMarks >= G.daoCost(u)), maxed ? 'done' : '');
      }).join('');
      return `<div class="section"><h2>The Wheel of Rebirth</h2>
          <div class="small">Dying, or choosing to end this life now, earns <b>${fmt(G.karmaOnDeath())} karma</b>. The higher you climbed, the more you keep. You lose stones, techniques, sect and artifacts, and a new spirit root is rolled.</div>
          <div class="toolbar">${confirmRebirth ? btn('Yes, end this life', 'rebirthYes', true, 'primary') + btn('Keep living', 'rebirthNo') : btn('End this life', 'rebirthAsk', true, 'ghost')}</div>
          ${karmaRows}</div>
        <div class="section"><h2>Tree of the Dao</h2>
          <div class="small dim">Survive the final tribulation at Half-Step Immortal stage 9 to ascend. Ascension earns Dao Marks that are never lost, multiplies your Qi, and resets karma upgrades. Each heaven's cultivation costs far more.</div>
          ${S.ascensions || S.daoMarks ? daoRows : `<div class="dim small">Sealed until your first ascension. You have reached ${D.REALMS[G.realmOf(S.best)].name}.</div>`}</div>`;
    },

    records() {
      const S = G.S;
      const st = S.stats;
      const m = G.mods();
      const root = D.ROOT_TIERS[S.root.tier];
      const elems = S.root.elements.map((e) => { const i = G.elementInfo(e); return `<span class="chip">${zh(i.zh)} ${i.name}: ${i.desc}</span>`; }).join('');
      const feats = D.FEATS.map((f) => row(`<div class="title ${S.feats[f.id] ? '' : 'dim'}">${f.name}</div><div class="dim small">${f.desc}</div>`, S.feats[f.id] ? '<span class="good small">Recorded</span>' : '', S.feats[f.id] ? 'done' : 'locked')).join('');
      const list = [['Lives lived', st.lives], ['Breakthroughs', st.breakthroughs], ['Qi deviations', st.deviations], ['Tribulations survived', st.tribs], ['Foes defeated', st.kills], ['Pills refined', st.pills], ['Artifacts found', st.items], ['Sticks drawn', st.draws], ['Time cultivating', `${Math.floor(st.playSeconds / 60)} min`], ['Luck', fmt(m.luck)], ['Breakthrough bonus', pct(m.bt)]]
        .map(([k, v]) => `<div class="kv small"><span class="dim">${k}</span><span>${typeof v === 'number' ? fmt(v) : v}</span></div>`).join('');
      return `<div class="section"><h2>Spirit Root</h2><div>${zh(root.zh)} ${esc(G.rootName(S.root))} · Qi ×${root.mult}</div><div class="chips">${elems}</div></div>
        <div class="section"><h2>Annals</h2><div class="res">${list}</div></div>
        <div class="section"><div class="kv"><h2>Feats</h2><span class="dim small">${Object.keys(S.feats).length} of ${D.FEATS.length} · each gives +3% Qi</span></div>${feats}</div>
        <div class="section"><h2>Save</h2><div class="dim small">Saved in this browser every 15 seconds. Copy your save string to move it to another device.</div>
          <div class="toolbar">${btn('Save now', 'save')}${btn('Copy save string', 'export')}${btn('Load from box', 'import')}${confirmWipe ? btn('Yes, erase everything', 'wipeYes', true, 'primary') + btn('Cancel', 'wipeNo') : btn('Erase save', 'wipeAsk', true, 'ghost')}</div>
          <div class="small good">${esc(saveMsg)}</div>
          <textarea id="savebox" aria-label="Save string" spellcheck="false" placeholder="Save string appears here. Paste one to load it."></textarea></div>`;
    },
  };

  function itemText(it) {
    const r = D.RARITIES[it.rarity];
    const slot = D.GEAR_SLOTS[it.slot];
    const main = it.slot === 'weapon' || it.slot === 'robe' ? `+${fmt(it.power)} ${slot.stat.toLowerCase()}` : `+${pct(it.power)} ${slot.stat.toLowerCase()}`;
    const extra = it.slot === 'talisman' && it.rarity ? `, +${it.rarity} luck` : '';
    let affix = '';
    if (it.affix) {
      const v = it.affix.flat && !it.affix.pct ? `+${it.affix.v}` : `+${(it.affix.v * 100).toFixed(it.affix.pct ? 1 : 0)}%`;
      affix = `, ${v} ${esc(it.affix.label)}`;
    }
    return `<div class="title" style="color:${r.color}">${r.zh} · ${esc(it.name)}</div><div class="dim small">${main}${extra}${affix}</div>`;
  }

  // ---------- overlays ----------
  function renderOverlay() {
    const S = G.S;
    let html = '';
    if (trib) html = tribView();
    else if (S.choosingRoot) html = rootView();
    else if (S.dead) html = deathView();
    else if (S.ascendReady && S.askingAscend) html = ascendView();
    morph($('overlay'), html);
  }
  function rootView() {
    const S = G.S;
    const t = D.ROOT_TIERS[S.root.tier];
    const elems = S.root.elements.map((e) => { const i = G.elementInfo(e); return `<span class="chip">${zh(i.zh)} ${i.name}: ${i.desc}</span>`; }).join('');
    const cost = G.rerollCost();
    return `<div class="veil"><div class="rite">
      <div class="dim">${S.stats.lives === 1 ? 'A travelling elder presses your palm to the Root-Testing Stone.' : 'You open new eyes in a new body. The stone glows beneath your palm.'}</div>
      <div class="glyph">${t.zh}</div><h2>${esc(G.rootName(S.root))}</h2>
      <div>Qi ×${t.mult}. A ${t.weight}% roll with no luck.</div>
      <div class="chips" style="justify-content:center">${elems}</div>
      <div class="actions">${btn('Begin this life', 'rootOk', true, 'primary big')}${btn(`Rewrite fate · ${fmt(cost)} karma (you have ${fmt(S.karma)})`, 'rootRe', S.karma >= cost)}</div>
    </div></div>`;
  }
  function deathView() {
    const S = G.S;
    return `<div class="veil"><div class="rite">
      <div class="glyph ill">寂</div><h2>Your Lifespan Is Spent</h2>
      <p>You reached ${D.REALMS[G.realmOf(S.stage)].name}, ${stageLabel(S.stage).toLowerCase()}, at ${Math.floor(S.age)} years.</p>
      <p>The wheel turns. You carry <b>${fmt(G.karmaOnDeath())} karma</b> into your next life.</p>
      <div class="actions">${btn('Be reborn', 'reborn', true, 'primary big')}</div>
    </div></div>`;
  }
  function ascendView() {
    const S = G.S;
    const h = D.HEAVENS[Math.min(S.ascensions + 1, D.HEAVENS.length - 1)];
    return `<div class="veil"><div class="rite">
      <div class="glyph">飞升</div><h2>The Gate Stands Open</h2>
      <p>Ascend to the <b>${h}</b> and earn <b>${fmt(G.daoOnAscend())} Dao Marks</b>. This world, its sects and your karma upgrades fall away below you.</p>
      <div class="actions">${btn('Ascend', 'ascend', true, 'primary big')}${btn('Linger a while', 'ascendNo')}</div>
    </div></div>`;
  }
  function tribView() {
    const ev = trib.ev;
    const tr = ev.tr;
    const shown = tr.bolts.slice(0, trib.shown);
    const hp = shown.length ? shown[shown.length - 1].hp : tr.maxHp;
    const stamp = trib.done ? `<div class="stamp ${tr.survived ? 'ok' : ''}">${tr.survived ? '成' : '败'}</div>` : '';
    const txt = trib.done
      ? (tr.survived ? (ev.ascend ? 'The final bolt breaks on your shoulders. The heavens yield.' : 'The clouds scatter. Your body has been reforged in thunder.') : 'The lightning finds the flaw in you. You fall from the sky, alive and five years older.')
      : `Bolt ${Math.min(trib.shown, tr.total)} of ${tr.total}`;
    return `<div class="veil"><div class="rite">
      <div class="glyph">${ev.ascend ? '飞升劫' : '天劫'}</div><h2>Heavenly Tribulation</h2>
      <div class="kv small"><span>Body and spirit</span><span>${fmt(hp)} / ${fmt(tr.maxHp)}</span></div>
      <div class="bar hp"><i style="width:${(hp / tr.maxHp * 100).toFixed(1)}%"></i></div>
      <div>${txt}</div>${stamp}
      ${trib.done ? `<div class="actions">${btn('Continue', 'tribOk', true, 'primary big')}</div>` : ''}
    </div></div>`;
  }
  function playTribulation(ev) {
    trib = { ev, shown: 0, done: false };
    const step = () => {
      if (!trib) return;
      if (trib.shown >= ev.tr.bolts.length) { trib.done = true; renderOverlay(); return; }
      trib.shown++;
      strike();
      renderOverlay();
      setTimeout(step, reduced ? 250 : 650);
    };
    setTimeout(step, 450);
  }
  function strike() {
    if (reduced) return;
    const w = innerWidth, h = innerHeight;
    let x = w * (0.2 + Math.random() * 0.6), y = 0;
    const pts = [`${x},0`];
    while (y < h) { y += 30 + Math.random() * 70; x += (Math.random() - 0.5) * 120; pts.push(`${x.toFixed(0)},${y.toFixed(0)}`); }
    const sky = document.createElement('div');
    sky.className = 'sky';
    sky.innerHTML = `<svg viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(' ')}"></polyline></svg>`;
    const flash = document.createElement('div');
    flash.className = 'flash';
    document.body.append(flash, sky);
    setTimeout(() => { sky.remove(); flash.remove(); }, 350);
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  function drainFx() {
    const S = G.S;
    while (S.fx.length) {
      const ev = S.fx.shift();
      if (ev.kind === 'tribulation') playTribulation(ev);
      if (ev.kind === 'feat') toast(`Feat: ${ev.name}`);
      if (ev.kind === 'realm') burst(120);
      if (ev.kind === 'deviation') toast('Qi deviation! Injured.');
    }
  }

  function render() {
    drainFx();
    renderIdentity();
    renderStatus();
    renderEncounter();
    renderTabs();
    morph($('panel'), VIEWS[tab]());
    renderLog();
    renderOverlay();
  }

  // ---------- actions ----------
  const ACTIONS = {
    tab: (v) => { tab = v; },
    advance: () => G.attemptBreakthrough(),
    askAscend: () => { G.S.askingAscend = true; },
    ascendNo: () => { G.S.askingAscend = false; },
    ascend: () => { G.S.askingAscend = false; G.ascend(); save(); },
    closeEnc: () => { lastEncounterText = ''; },
    enc: (v) => { const r = G.chooseEncounter(+v); if (r) lastEncounterText = r.text; },
    tech: (v) => G.buyTech(v),
    region: (v) => G.setRegion(+v),
    hunt: () => G.setHunting(!G.S.hunting),
    equip: (v) => G.equip(+v),
    sell: (v) => G.sell(+v),
    equipBest: () => G.equipBest(),
    sellBad: () => G.sellInferior(),
    join: (v) => G.joinSect(v),
    leaveAsk: () => { confirmLeave = true; },
    leaveNo: () => { confirmLeave = false; },
    leaveYes: () => { confirmLeave = false; G.leaveSect(); },
    mission: (v) => G.startMission(+v),
    treasury: (v) => G.buyTreasury(v),
    refine: (v) => G.refine(v),
    use: (v) => G.usePill(v),
    divine: () => G.divine(),
    karma: (v) => G.buyKarma(v),
    dao: (v) => G.buyDao(v),
    rebirthAsk: () => { confirmRebirth = true; },
    rebirthNo: () => { confirmRebirth = false; },
    rebirthYes: () => { confirmRebirth = false; G.reincarnate(); save(); },
    reborn: () => { G.reincarnate(); save(); },
    rootOk: () => { G.confirmRoot(); save(); },
    rootRe: () => G.rerollRoot(),
    tribOk: () => { trib = null; },
    save: () => { save(); saveMsg = 'Saved.'; },
    export: exportSave,
    import: importSave,
    wipeAsk: () => { confirmWipe = true; },
    wipeNo: () => { confirmWipe = false; },
    wipeYes: () => {
      confirmWipe = false;
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage blocked */ }
      G.newGame();
      saveMsg = '';
      lastEncounterText = '';
    },
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const [name, arg] = b.getAttribute('data-a').split(':');
    if (ACTIONS[name]) { ACTIONS[name](arg); render(); }
  });
  document.addEventListener('change', (e) => {
    const k = e.target.getAttribute && e.target.getAttribute('data-t');
    if (k) G.S.settings[k] = e.target.checked;
  });
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'textarea' || tag === 'input') return;
    e.preventDefault();
    circulateFx();
  });

  // ---------- saves ----------
  function snapshot() {
    const copy = Object.assign({}, G.S, { fx: [], lastSeen: Date.now() });
    return JSON.stringify(copy);
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, snapshot()); } catch (e) { /* storage blocked: the game still runs */ }
  }
  function exportSave() {
    const str = btoa(unescape(encodeURIComponent(snapshot())));
    const box = $('savebox');
    if (box) { box.value = str; box.select(); }
    saveMsg = 'Save string is in the box.';
    if (navigator.clipboard) navigator.clipboard.writeText(str).then(() => { saveMsg = 'Save string copied.'; }).catch(() => {});
  }
  function importSave() {
    const box = $('savebox');
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(box.value.trim()))));
      if (!data || data.v !== 1 || !data.root) throw new Error('bad');
      G.load(data);
      save();
      box.value = '';
      saveMsg = 'Save loaded.';
    } catch (e) {
      saveMsg = 'That save string could not be read. Check that you copied all of it.';
    }
  }
  function boot() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { saved = null; }
    if (saved && saved.v === 1 && saved.root) {
      G.load(saved);
      const r = G.applyOffline((Date.now() - (saved.lastSeen || Date.now())) / 1000);
      if (r) toast(`Seclusion: +${fmt(r.qi)} Qi, +${fmt(r.stones)} stones`);
    } else {
      G.newGame();
    }
  }

  // ---------- dantian canvas ----------
  const canvas = $('well');
  const ctx = canvas.getContext('2d');
  const motes = [];
  let spin = 0;
  const floaters = [];

  function fitCanvas() {
    const size = canvas.clientWidth || 290;
    const px = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(size * px)) { canvas.width = canvas.height = Math.round(size * px); }
    ctx.setTransform(canvas.width / 320, 0, 0, canvas.width / 320, 0, 0);
  }
  function burst(n) {
    for (let i = 0; i < n; i++) {
      motes.push({ a: Math.random() * 6.283, r: 40 + Math.random() * 20, v: 18 + Math.random() * 70, s: 0.7 + Math.random() * 1.8, life: 1, burst: true });
    }
  }
  function circulateFx() {
    const g = G.circulate();
    if (!g) return;
    burst(6);
    floaters.push({ text: `+${fmt(g)}`, y: 150, x: 130 + Math.random() * 60, life: 1 });
    if (floaters.length > 14) floaters.shift();
  }
  function drawWell(dt) {
    const S = G.S;
    if (!S) return;
    fitCanvas();
    const realm = D.REALMS[G.realmOf(S.stage)];
    const color = realm.color;
    ctx.clearRect(0, 0, 320, 320);
    const c = 160;
    spin += dt * (reduced ? 0 : 0.5);
    const frac = Math.min(1, S.qi / G.stageCost(S.stage));

    const glow = ctx.createRadialGradient(c, c, 12, c, c, 150);
    glow.addColorStop(0, color + '55');
    glow.addColorStop(0.55, color + '14');
    glow.addColorStop(1, color + '00');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(c, c, 150, 0, 6.283); ctx.fill();

    // Nine tick marks per realm: lit ticks are the stages already passed.
    const si = G.stageInRealm(S.stage);
    for (let i = 0; i < 9; i++) {
      const a = -1.571 + i / 9 * 6.283;
      ctx.strokeStyle = i <= si ? color : '#2f4a46';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 138, c + Math.sin(a) * 138);
      ctx.lineTo(c + Math.cos(a) * 150, c + Math.sin(a) * 150);
      ctx.stroke();
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2f4a46';
    ctx.beginPath(); ctx.arc(c, c, 128, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(c, c, 128, -1.571, -1.571 + frac * 6.283); ctx.stroke();

    // Orbiting Qi: denser as income grows by orders of magnitude.
    const want = reduced ? 0 : Math.min(160, 24 + Math.log10(1 + G.qiRate()) * 14);
    while (motes.filter((m) => !m.burst).length < want) {
      motes.push({ a: Math.random() * 6.283, r: 50 + Math.random() * 70, v: 0.2 + Math.random() * 0.7, s: 0.6 + Math.random() * 1.4, life: 1 });
    }
    ctx.fillStyle = color;
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      if (m.burst) {
        m.r += m.v * dt; m.life -= dt * 1.3;
        if (m.life <= 0) { motes.splice(i, 1); continue; }
      } else {
        m.a += m.v * dt; m.r -= dt * 3;
        if (m.r < 30) m.r = 120;
      }
      ctx.globalAlpha = m.burst ? m.life : Math.min(1, (m.r - 28) / 30) * 0.8;
      ctx.beginPath();
      ctx.arc(c + Math.cos(m.a) * m.r, c + Math.sin(m.a) * m.r, m.s, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Taiji at the centre.
    const R = 26 + frac * 8;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(spin);
    ctx.fillStyle = '#ece6d3';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#0e1a1a';
    ctx.beginPath(); ctx.arc(0, 0, R, 1.571, 4.712); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -R / 2, R / 2, 0, 6.283); ctx.fillStyle = '#0e1a1a'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, R / 2, R / 2, 0, 6.283); ctx.fillStyle = '#ece6d3'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -R / 2, R / 7, 0, 6.283); ctx.fillStyle = '#ece6d3'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, R / 2, R / 7, 0, 6.283); ctx.fillStyle = '#0e1a1a'; ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = '600 15px Alegreya, Georgia, serif';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt * 1.2; f.y -= dt * 60;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = f.life;
      ctx.fillStyle = '#ece6d3';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  canvas.addEventListener('click', circulateFx);
  canvas.addEventListener('keydown', (e) => { if (e.key === 'Enter') circulateFx(); });

  // ---------- loops ----------
  let lastTick = Date.now();
  function gameLoop() {
    const now = Date.now();
    const gap = (now - lastTick) / 1000;
    lastTick = now;
    if (gap > 120) {
      // The tab slept for a long time: count it as seclusion.
      const r = G.applyOffline(gap);
      if (r) toast(`Seclusion: +${fmt(r.qi)} Qi, +${fmt(r.stones)} stones`);
    } else {
      let left = gap;
      while (left > 0) { const step = Math.min(left, 1); G.tick(step); left -= step; }
    }
    drainFx();
  }
  let lastFrame = performance.now();
  function frame(t) {
    const dt = Math.min(0.1, (t - lastFrame) / 1000);
    lastFrame = t;
    drawWell(dt);
    requestAnimationFrame(frame);
  }

  boot();
  render();
  setInterval(gameLoop, 100);
  setInterval(render, 250);
  setInterval(save, 15000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  requestAnimationFrame(frame);
})();
