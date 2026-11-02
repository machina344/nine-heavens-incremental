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
    ['cultivate', 'Cultivate'], ['combat', 'Combat'], ['gear', 'Artifacts'], ['sect', 'Sect'], ['alchemy', 'Alchemy'],
    ['abode', 'Abode'], ['fate', 'Fate'], ['rebirth', 'Rebirth'], ['records', 'Records'],
  ];
  const TAB_NOTES = {
    cultivate: 'Techniques and meridians: the slow, steady heart of your power.',
    combat: 'Fight for stones, artifacts, fame and trophies. Number keys cast skills and space strikes.',
    gear: 'Your artifacts, forging and the ladder of 24 grades.',
    sect: 'Join a sect for bonuses, a signature art, missions and a treasury.',
    alchemy: 'Refine herbs into pills. Practice improves your success rate.',
    abode: 'Your cave home and spirit beast companion.',
    fate: 'Fortune sticks, luck, and the encounters that find you.',
    rebirth: 'Karma, ascension and the Tree of the Dao.',
    records: 'Your annals, feats, the Codex and your save.',
  };
  const TAB_LABEL = Object.fromEntries(TABS);
  let tab = 'cultivate';
  let seclusion = null;   // Report shown after a long absence.
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
  // A tooltip is an attribute holding escaped HTML: title, body lines, and optional italic lore.
  function tip(title, lines, lore) {
    const body = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).map((l) => `<div>${l}</div>`).join('');
    const html = `<b>${title}</b>${body}${lore ? `<i>${lore}</i>` : ''}`;
    return ` data-tip="${esc(html)}" tabindex="0"`;
  }
  const signed = (v, add, pctAdd) => (add ? `${v >= 0 ? '+' : ''}${pctAdd ? `${(v * 100).toFixed(1)}%` : fmt(v)}` : `×${v >= 100 ? fmt(v) : v.toFixed(2)}`);
  function sourceLines(key) {
    const add = key === 'luck' || key === 'bt' || key === 'alch';
    const list = G.modSources(key);
    if (!list.length) return ['<span class="dim">No bonuses yet.</span>'];
    return list.map(([l, v]) => `<span class="kv"><span>${l}</span><span>${signed(v, add, key !== 'luck')}</span></span>`);
  }
  const btn = (label, action, on, cls, tp) => `<button type="button" data-a="${action}" class="${cls || ''}"${on === false ? ' disabled' : ''}${tp || ''}>${label}</button>`;
  const bar = (frac, cls) => `<div class="bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%"></i></div>`;
  const zh = (t) => `<span class="zh">${t}</span>`;
  const row = (left, right, cls, tp) => `<div class="row ${cls || ''}"><div${tp || ''}>${left}</div><div class="actions">${right}</div></div>`;
  function costText(c) {
    const out = [];
    if (c.qi) out.push(`${fmt(c.qi)} Qi`);
    if (c.herbs) out.push(`${fmt(c.herbs)} herbs`);
    if (c.stones) out.push(`${fmt(c.stones)} stones`);
    if (c.cores) out.push(`${fmt(c.cores)} cores`);
    return out.join(' + ');
  }
  function fxText(fx) {
    const L = { qi: 'Qi', atk: 'attack', hp: 'vitality', stones: 'stones', herbs: 'herbs', luck: 'luck', bt: 'breakthrough', alch: 'alchemy', trib: 'tribulation resistance', mission: 'mission speed', dev: 'deviation', life: 'lifespan', beast: 'companion power' };
    return Object.keys(fx).map((k) => {
      const v = fx[k];
      if (k === 'luck') return `${v > 0 ? '+' : ''}${v} luck`;
      return `${v > 0 ? '+' : ''}${Math.round(v * 100)}% ${L[k]}`;
    }).join(', ');
  }
  const SOURCE = { qi: ['Qi', 'cultivate'], stones: ['stones', 'combat'], herbs: ['herbs', 'combat'], cores: ['Beast Cores', 'combat'] };
  // A small link to the tab that provides whatever this cost is short of.
  function shortLink(cost) {
    for (const k in cost) {
      if ((G.S[k] || 0) < cost[k]) return `<button type="button" class="link small" data-a="tab:${SOURCE[k][1]}">Need ${SOURCE[k][0]}: ${TAB_LABEL[SOURCE[k][1]]} →</button>`;
    }
    return '<span class="link small placeholder" aria-hidden="true">&nbsp;</span>';
  }
  // A ladder in a tooltip: the grades you can roll right now, with odds, and where yours sits.
  function ladderLines(key, list, have, bonus) {
    const odds = G.ladderOdds(key, bonus);
    const c = G.ladderCurve(key, bonus);
    const lines = list.map((x, i) => {
      if (!odds[i] && i !== have) return '';
      const mark = i === have ? 'good' : '';
      return `<span class="kv ${mark}"><span>${x.zh ? `${x.zh} ` : ''}${x.name}${i === have ? ' (yours)' : ''}</span><span>${odds[i] ? `${(odds[i] * 100).toFixed(odds[i] < 0.01 ? 2 : 0)}%` : '—'} · ×${x.mult}</span></span>`;
    }).filter(Boolean);
    lines.unshift(`Rolls now centre on ${list[Math.round(c.centre)].name} and climb with your realm and heavens. ${list.length} grades in all.`);
    return lines;
  }
  // Tells the player when a past roll has fallen below what they could roll today.
  const belowCurve = (key, have, bonus) => have !== undefined && have < Math.round(G.ladderCurve(key, bonus).centre);
  const goLink = (label, tabId) => `<button type="button" class="link small" data-a="tab:${tabId}">${label} →</button>`;
  function stageLabel(stage) { return `Stage ${G.stageInRealm(stage) + 1} of ${D.STAGES_PER_REALM}`; }

  // ---------- tooltips with knowledge ----------
  function realmTip(i) {
    const r = D.REALMS[i];
    const next = D.REALMS[i + 1];
    const cap = G.realmOf(G.maxStage());
    return tip(`${r.zh} ${r.name}`, [
      `Realm ${i + 1} of ${D.REALMS.length}. Base lifespan ${fmt(r.life)} years.`,
      next ? (i + 1 > cap ? `${next.name} is sealed until you ascend again.` : `Next: ${next.name} (${next.zh}), ${fmt(next.life)} years.`) : 'There is nothing above this realm.',
    ], WD.LORE.realms[i]);
  }
  function rootTip() {
    const S = G.S;
    const t = D.ROOT_TIERS[S.root.tier];
    return tip(`${t.zh} ${G.rootName(S.root)}`, [`Elements: ${S.root.elements.map((e) => G.elementInfo(e).name).join(', ')}.`, 'Fewer elements means purer Qi. Your next life would roll:', ...ladderLines('root', D.ROOT_TIERS, S.root.tier), 'Heavens and luck raise the curve. A Marrow Washing Pill can reroll it.']);
  }
  function titleTip() {
    const S = G.S;
    const now = G.titleIndex();
    const list = D.TITLES.map((x, i) => `<span class="kv ${i === now ? 'good' : i > now ? 'dim' : ''}"><span>${i > now + 1 ? '???' : x.name}</span><span>${fmt(x.need)}</span></span>`);
    return tip('Fame in the jianghu', [`You have ${fmt(S.fame)} fame.`, 'Each title gives +1 luck and +10% stones. Bosses, duels, the Tower and bold choices earn fame.', ...list]);
  }
  function elementChip(e) {
    const i = G.elementInfo(e);
    return `<span class="chip"${tip(`${i.zh} ${i.name}`, `Strengthens ${i.desc}. A purer root gives it more.`, WD.LORE.elements[e])}>${zh(i.zh)} ${i.name}: ${i.desc}</span>`;
  }
  function gradeLore(i) {
    let text = '';
    for (const [from, t] of WD.LORE.families) if (i >= from) text = t;
    return text;
  }
  function itemTip(it) {
    const S = G.S;
    const r = D.RARITIES[it.rarity];
    const cur = S.gear[it.slot];
    const lines = [
      `${D.GEAR_SLOTS[it.slot].name} from ${D.REGIONS[it.region].name}. Grade ${it.rarity + 1} of ${D.RARITIES.length}, ×${fmt(r.mult)} base power.`,
      it.plus ? `Forged +${it.plus} of +${G.forgeCap(it)}: ${Math.round(it.plus * (it.slot === 'ring' || it.slot === 'talisman' ? 5 : 20))}% more power.` : `Forges to +${G.forgeCap(it)}. Reaching it adds another 50% power and a Perfection.`,
      `Condition: ${G.itemQuality(it).name}, ×${G.itemQuality(it).mult} power.`,
    ];
    if (cur && cur.id !== it.id) lines.push(`Score ${fmt(G.itemScore(it))} against ${fmt(G.itemScore(cur))} for your ${esc(cur.name)}.`);
    lines.push(`Sells for ${fmt(G.itemValue(it) * G.mods().stones)} stones.`);
    return tip(`${r.zh} ${r.name} ${esc(it.name)}`, lines, gradeLore(it.rarity));
  }
  function techTip(t) {
    const lv = G.techLevel(t.id);
    const mi = G.masteryIndex(lv);
    const ladder = D.MASTERY.map((x, i) => `<span class="kv ${i === mi ? 'good' : i > mi ? 'dim' : ''}"><span>${x.zh} ${x.name}</span><span>Lv ${x.level}</span></span>`);
    const unit = t.type === 'qi' ? 'Qi/s' : t.type === 'atk' ? 'attack' : 'vitality';
    return tip(`${t.zh} ${t.name}`, [`Provides ${fmt(G.techPower(t))} base ${unit}. Each level costs 20% more than the last.`, `Each mastery tier multiplies this technique by ${G.P.masteryStep}. At level ${G.P.techMax} it is Perfected: power rises 50%, and all techniques of its kind gain 3%.`, ...ladder]);
  }
  const buffTip = (b) => tip(esc(b.name), [fxText(b.fx), `${Math.ceil(b.t)} seconds left.`]);

  // ---------- the path ahead ----------
  function pathAhead() {
    const S = G.S;
    const m = G.mods();
    const out = [];
    const add = (text, t, urgent) => { if (out.length < 8) out.push({ text, tab: t, urgent: !!urgent }); };
    const life = G.lifespan(m);
    if (S.age > life * 0.85) add((S.pills.longevity || 0) ? 'Years run short: take a Longevity Pill' : 'Years run short: rise a realm or refine longevity', 'alchemy', true);
    if (S.injury > 0 && S.pills.heal) add('Injured: take a Bone-Mending Pill', 'alchemy', true);
    if (S.foe && S.foe.charging > 0) add('A killing blow is charging: Guard!', 'combat', true);
    for (const g of G.realmGates().filter((x) => !x.met)) add(`To advance: ${g.label.toLowerCase()} (${g.have})`, g.tab, true);
    if (G.isMajor(S.stage) && G.btChance(m) < 0.6) {
      if (S.pills.foundation) add('Take a Foundation Pill before your breakthrough', 'alchemy');
      else if (S.stage >= 5) add(`Breakthrough odds are ${pct(G.btChance(m))}: refine a Foundation Pill`, 'alchemy');
    }
    if (!S.sect && S.stage >= G.sectJoinStage) add('Sects are accepting disciples', 'sect');
    if (!S.hunting && !S.recover) add('Begin hunting for stones, herbs and cores', 'combat');
    if (G.canSummonBoss()) add('A region boss can be summoned', 'combat');
    if (S.sect && S.sect.active.length < G.missionSlots() && S.sect.board.length) add('A mission slot is empty', 'sect');
    if (S.sect && S.cores >= G.donationSize() * 4) add('Spare cores can earn sect contribution', 'sect');
    if (S.bag.some((it) => G.itemScore(it) > G.itemScore(S.gear[it.slot]))) add('An upgrade waits in your storage ring', 'gear');
    if (S.eggs > 0) add('A spirit beast egg is ready to hatch', 'abode');
    if (S.meridians < D.MERIDIANS.length && S.stage >= S.meridians * 4 && S.qi >= G.meridianCost(S.meridians) && S.cores >= G.meridianCores(S.meridians)) add('A meridian can be opened', 'cultivate');
    if (S.encounter) add('Fate has found you', 'fate');
    const staleTech = G.TECHS.find((t) => G.techLevel(t.id) && belowCurve('comprehension', S.techQ[t.id] === undefined ? 2 : S.techQ[t.id]));
    if (staleTech && S.cores >= G.contemplateCost(staleTech)) add(`${staleTech.name} could roll a deeper comprehension now`, 'cultivate');
    if (belowCurve('sites', S.abodeSite) && S.stones >= G.surveyCost()) add('A better cave site is within reach: survey', 'abode');
    const staleGear = Object.keys(S.gear).find((k) => S.gear[k] && belowCurve('condition', S.gear[k].cond === undefined ? 3 : S.gear[k].cond, S.gear[k].rarity * 0.1));
    if (staleGear && S.cores >= G.reforgeCost(S.gear[staleGear])) add(`Your ${D.GEAR_SLOTS[staleGear].name.toLowerCase()} could be reforged to a better condition`, 'gear');
    if (S.meridianQ.some((q) => belowCurve('purity', q)) && S.cores >= 2) add('A meridian could be tempered purer now', 'cultivate');
    if (D.KARMA_UPS.some((u) => (S.karmaUps[u.id] || 0) < u.max && S.karma >= G.karmaCost(u))) add('Karma can be spent', 'rebirth');
    if (D.DAO_UPS.some((u) => (S.dao[u.id] || 0) < u.max && S.daoMarks >= G.daoCost(u))) add('Dao Marks can be spent', 'rebirth');
    if (G.TECHS.some((t) => S.stage >= t.unlock && !G.techMaxed(t.id) && G.techCost(t).stones && G.canAfford(G.techCost(t)))) add('You can afford to study a technique', 'cultivate');
    return out;
  }

  // ---------- left column ----------
  function renderIdentity() {
    const S = G.S;
    const r = D.REALMS[G.realmOf(S.stage)];
    document.documentElement.style.setProperty('--realm', r.color);
    morph($('identity'), `<div${realmTip(G.realmOf(S.stage))}><div class="realm-name">${r.zh}</div><div class="realm-en">${r.name}</div></div><div class="dim small">${stageLabel(S.stage)} · <span${rootTip()}>${esc(G.rootName(S.root))}</span></div><div class="small"${titleTip()}>${zh(D.TITLES[G.titleIndex()].zh)} ${D.TITLES[G.titleIndex()].name}</div>`);
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
      const nextTrib = S.stage >= G.maxStage() || G.realmOf(S.stage + 1) >= G.TRIB_FROM_REALM;
      main = btn(`${S.stage >= G.maxStage() ? 'Face the ascension tribulation' : 'Attempt breakthrough'} · ${pct(G.btChance(m))}${nextTrib ? ' + lightning' : ''}`, 'advance', G.canAttempt(), 'primary big', tip('Major breakthrough', [`Base chance ${pct(Math.max(0.3, 0.8 - G.realmOf(S.stage) * 0.06))}. Falls 6% per realm, never below 30%.`, ...sourceLines('bt'), S.btBonus ? `Foundation Pills: +${pct(S.btBonus)}` : '', 'Failure costs 40% of the Qi and injures you for 30 seconds or so. Lightning that defeats you costs 50% and 5 years.'], 'Clouds gather first. Elders say to bring an umbrella. It does not help.'));
    } else main = btn('Advance to next stage', 'advance', G.canAttempt(), 'big', tip('Minor stage', [`Costs ${fmt(cost)} Qi and never fails.`, `Stage ${G.stageInRealm(S.stage) + 1} of ${D.STAGES_PER_REALM}. The ninth stage needs a major breakthrough.`]));

    const chips = [];
    if (S.injury > 0) chips.push(`<span class="chip warn">Injured ${Math.ceil(S.injury)}s: half Qi</span>`);
    if (S.btBonus > 0) chips.push(`<span class="chip gold">Breakthrough +${pct(S.btBonus)}</span>`);
    for (const b of S.buffs) chips.push(`<span class="chip ${b.fx.qi < 0 || b.fx.stones < 0 ? 'warn' : ''}"${buffTip(b)}>${esc(b.name)} ${Math.ceil(b.t)}s</span>`);

    const autos = [];
    if (S.karmaUps.autoStage) autos.push(toggle('autoStage', 'Auto stages'));
    if (S.karmaUps.autoTech) autos.push(toggle('autoTech', 'Auto study'));
    if (S.dao.autoMajor) autos.push(toggle('autoMajor', 'Auto breakthrough'));

    morph($('status'), `<div class="stack">
      <div class="kv"${tip('Qi', [`${fmt(cost)} Qi needed for the next stage. Clicking your dantian gives ${fmt(G.clickGain(m))}.`, `Stage bonus ×${fmt(Math.pow(G.P.stageQiBonus, S.stage))}, realm bonus ×${fmt(Math.pow(G.P.realmQiBonus, G.realmOf(S.stage)))}.`, ...sourceLines('qi')])}><span>Qi ${fmt(S.qi)} / ${fmt(cost)}</span><span class="dim small">${fmt(G.qiRate(m))}/s</span></div>
      ${bar(S.qi / cost)}
      ${main}
      <div class="gates">${[0, 1, 2].map((i) => { const g = G.realmGates()[i]; return g ? `<button type="button" class="gate ${g.met ? 'met' : ''}" data-a="tab:${g.tab}"><span>${g.met ? '✓' : '○'} ${g.label}</span><span class="dim small">${g.have}</span></button>` : '<div class="gate empty" aria-hidden="true"></div>'; }).join('')}</div>
      <div class="toolbar small autos">${autos.join('')}</div>
      <div class="kv small"${tip('Lifespan', [`Realm grants ${fmt(D.REALMS[G.realmOf(S.stage)].life)} years. Pills and encounters changed that by ${S.bonusYears >= 0 ? '+' : ''}${fmt(S.bonusYears)}.`, 'One real second is one month. You do not age while away.', ...sourceLines('life')], 'To live ten thousand years is the only reason some ever begin.')}><span>Age ${Math.floor(S.age)} of ${Math.floor(life)} years</span><span class="dim">1 month/s</span></div>
      ${bar(S.age / life, 'age')}
      <div class="kv small"><span${tip('Vitality', ['Your health in fights, and your shield against lightning. Grows 7% per stage.', ...sourceLines('hp'), 'Lightning resistance:', ...sourceLines('trib')])}>Vitality ${fmt(S.hp)} / ${fmt(st.hp)}</span><span class="dim"${tip('Attack', ['Damage per second before skills. Grows 7% per stage.', ...sourceLines('atk')])}>Attack ${fmt(st.atk)}</span></div>
      ${bar(S.hp / st.hp, 'hp')}
      <div class="res">
        <div class="kv"${tip('Spirit Stones', ['The currency of cultivators: Qi crystallised in rock. Earned from fights, missions, your sect stipend and a stone vein.', ...sourceLines('stones')])}><span>Stones</span><b>${fmt(S.stones)}</b></div>
        <div class="kv"${tip('Spirit Herbs', ['Used in alchemy and to feed spirit beasts. Foes, missions and an herb garden provide them.', ...sourceLines('herbs')])}><span>Herbs</span><b>${fmt(S.herbs)}</b></div>
        <div class="kv"${tip('Karma', [`Dying now would earn ${fmt(G.karmaOnDeath())}. It depends on your highest stage this life, not your age.`, 'Spent on the Rebirth tab. Ascending resets karma upgrades.'], 'Every deed is a debt, and the wheel always collects.')}><span>Karma</span><b>${fmt(S.karma)}</b></div>
        <div class="kv"${tip('Beast Cores', ['Dropped by elites, champions, bosses and high-rank missions. Spent on pills, forging, deep meridians, abode upgrades, beast evolution, contemplation and sect donations.'], WD.LORE.cores)}><span>Cores</span><b>${fmt(S.cores)}</b></div>
        <div class="kv"${tip('Perfection', [`${G.perfectionList().length} things perfected in this life, each +1% to everything.`, 'See Records for the full list.'])}><span>Perfect</span><b>${G.perfectionList().length}</b></div>
        <div class="kv"${tip('Dao Marks', [`Earned only by ascending. Your next ascension gives ${fmt(G.daoOnAscend())}.`, 'They buy permanent upgrades and are never lost.'])}><span>Dao Marks</span><b>${fmt(S.daoMarks)}</b></div>
      </div>
      <div class="chips one-line">${chips.join('')}</div>
      <div class="stack path"><h3>The Path Ahead</h3>${(() => { const steps = pathAhead(); return [0, 1, 2, 3].map((i) => { const p = steps[i]; return p ? `<button type="button" class="path-step ${p.urgent ? 'urgent' : ''} ${tab === p.tab ? 'here' : ''}" data-a="tab:${p.tab}"><span>${p.text}</span><span class="dim small">${TAB_LABEL[p.tab]} →</span></button>` : `<div class="path-step empty">${i === 0 ? '<span class="dim">Keep cultivating.</span>' : ''}</div>`; }).join(''); })()}</div>
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
      const odds = Math.round(Math.min(0.98, c.chance + Math.max(-30, G.mods().luck) * 0.004) * 100);
      return btn(`${c.label}${cost ? ` (${fmt(cost)} stones)` : ''}`, `enc:${i}`, G.canChoose(i), '', tip(c.label, c.chance >= 1 ? 'The outcome is certain.' : `About ${odds}% chance with your luck.`));
    }).join('');
    morph($('encounter'), `<div class="scroll-card"><h3>${zh(e.zh)} ${e.title}</h3><p class="small">${e.text}</p><div class="actions">${buttons}</div></div>`);
  }

  function renderTabs() {
    const S = G.S;
    const flag = {};
    for (const p of pathAhead().slice(0, 4)) flag[p.tab] = true;
    morph($('tabs'), TABS.map(([id, label]) => `<button type="button" data-a="tab:${id}" class="${tab === id ? 'on' : ''}"${tip(label, TAB_NOTES[id])}>${label}${flag[id] ? ' <span class="dot">•</span>' : ''}</button>`).join(''));
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
          const mi = G.masteryIndex(G.techLevel(t.id));
          const nextM = D.MASTERY[mi + 1];
          return row(`<div class="title">${zh(t.zh)} ${t.name} <span class="dim small">Lv ${G.techLevel(t.id)} of ${G.P.techMax} · ${D.MASTERY[mi].name}${G.techLevel(t.id) ? ` · ${G.techQuality(t.id).name} ×${G.techQuality(t.id).mult}` : ''}</span></div><div class="dim small">+${fmt(t.power * Math.pow(G.P.masteryStep, mi))} base ${unit} per level${nextM ? ` · ×${G.P.masteryStep} at Lv ${nextM.level} (${nextM.name})` : ''}</div>`,
            (G.techLevel(t.id) && (G.S.techQ[t.id] === undefined ? 2 : G.S.techQ[t.id]) < D.COMPREHENSION.length - 1 ? btn(`Contemplate ${G.contemplateCost(t)} cores`, `contemplate:${t.id}`, G.S.cores >= G.contemplateCost(t), 'ghost', tip('Contemplate', ['Reroll this technique\'s comprehension. Only a better result is kept.', ...ladderLines('comprehension', D.COMPREHENSION, G.S.techQ[t.id] === undefined ? 2 : G.S.techQ[t.id])])) : '') + (G.techMaxed(t.id) ? '<span class="good small">Perfected</span>' : btn(costText(c), `tech:${t.id}`, G.canAfford(c)) + shortLink(c)), G.techMaxed(t.id) ? 'done' : '', techTip(t));
        }).join('');
        const lock = next ? `<div class="dim small">Next: ${next.name}, at ${D.REALMS[G.realmOf(next.unlock)].name} stage ${G.stageInRealm(next.unlock) + 1}.</div>` : '';
        return `<div class="section"><div><h2>${title}</h2><div class="dim small">${note}</div></div>${rows}${lock}</div>`;
      }).join('') + meridianView();
    },

    combat() {
      const S = G.S;
      const st = G.stats();
      const foe = S.foe;
      const f = S.fight;
      let card;
      if (S.recover > 0) card = `<div class="dim">Recovering for ${Math.ceil(S.recover)}s.</div>`;
      else if (foe) {
        const warn = foe.charging > 0 ? `<div class="charge">Charging a killing blow: ${foe.charging.toFixed(1)}s. Guard now!</div>` : foe.stun > 0 ? `<div class="good small">Stunned ${foe.stun.toFixed(1)}s</div>` : '<div class="small">&nbsp;</div>';
        const tag = { elite: 'chip gold', champion: 'chip warn', boss: 'chip warn', duel: 'chip warn', tower: 'chip gold' }[foe.tier];
        card = `<div class="kv"><b${tip(esc(foe.name), [{ normal: 'An ordinary foe. It pays little but fills the boss meter.', elite: 'Elites have 3× health, pay 4× stones and often drop artifacts. They charge killing blows.', champion: 'Champions have 7× health, pay 14× stones, and may carry a beast egg.', boss: 'A region lord: guaranteed high-grade drops. A first kill is permanent.', duel: 'A named master of the jianghu. Your record against them survives rebirth.', tower: 'A floor warden. Each floor is 50% tougher than the last.' }[foe.tier], `Charged blows hit for 5× and cost 50 Momentum. Guard turns one into a parry.`])}>${esc(foe.name)}</b>${tag ? `<span class="${tag}">${foe.tier}</span>` : ''}</div>
          <div class="kv small"><span class="dim">Dealing ${fmt(foe.dmg)}/s</span><span>${fmt(Math.max(0, foe.hp))} / ${fmt(foe.maxHp)}</span></div>${bar(foe.hp / foe.maxHp, 'hp')}${warn}`;
      } else card = `<div class="dim small">${S.hunting ? 'Searching for prey.' : 'You are at rest. Begin hunting to fight.'}</div>`;
      const fightBar = `<div class="kv small">${f ? `<span class="good">${f.kind === 'tower' ? `Tower of Trials, floor ${f.floor}` : f.kind === 'duel' ? 'Martial Tournament' : 'Boss battle'}</span><span>${Math.ceil(f.t)}s left</span>` : `<span class="dim">Hunting in ${D.REGIONS[S.region].name}, depth ${S.depth + 1}</span><span></span>`}</div>`;
      const skills = G.skillList().map((id, i) => {
        const d = G.skillDef(id);
        const cd = S.cds[id] || 0;
        const hot = id === 'guard' && foe && foe.charging > 0;
        return `<button type="button" data-a="skill:${id}" ${tip(`${d.zh} ${d.name}`, [d.desc, `Cooldown ${d.cd}s. Used ${S.skillUse[id] || 0} times this life.`, `Each rank adds 25% damage: ${D.SKILL_RANKS.map((x) => `${x.name} ${x.use}`).join(', ')}.`])} class="skill ${hot ? 'primary' : ''}"${cd > 0 || S.recover > 0 || !S.hunting ? ' disabled' : ''}><span class="zh">${d.zh}</span><span class="small">${cd > 0 ? `${Math.ceil(cd)}s` : `Key ${i + 1}`}</span><span class="small dim">${D.SKILL_RANKS[G.skillRank(id)].name}</span></button>`;
      }).join('');
      const skillNotes = G.skillList().map((id) => { const d = G.skillDef(id); return `<div class="small"><b>${d.name}</b> <span class="dim">${d.desc}</span></div>`; }).join('');
      const mi = G.miLevel();
      const miToggles = (mi >= 5 ? toggle('autoSkills', 'Auto-cast attacks') : '<span class="dim small">Auto-cast at Martial Intent 5</span>') + (mi >= 15 ? toggle('autoGuard', 'Auto-guard') : '<span class="dim small">Auto-guard at 15</span>');
      const regions = D.REGIONS.map((r, i) => {
        const rs = G.regionStats(i);
        const open = S.stage >= rs.unlock;
        if (!open) return i === G.bestRegion() + 1 ? row(`<div class="title dim">${r.name}</div><div class="dim small">Opens at ${D.REALMS[G.realmOf(rs.unlock)].name} stage ${G.stageInRealm(rs.unlock) + 1}.</div>`, '', 'locked') : '';
        const fs = G.foeStats(i, S.region === i ? S.depth : 0);
        const risk = fs.dmg * Math.ceil(fs.hp / st.atk) > st.hp ? '<span class="bad">Deadly</span>' : fs.hp / st.atk > 6 ? '<span class="dim">Slow</span>' : '<span class="good">Manageable</span>';
        return row(`<div class="title">${zh(r.zh)} ${r.name}</div><div class="dim small">Foes ${fmt(fs.hp)} HP, ${fmt(fs.dmg)} dmg/s · ${fmt(fs.stones)} stones · ${risk} · deepest ${(S.maxDepth[i] || 0) + 1} of ${D.MAX_DEPTH + 1}</div>`,
          btn(S.region === i ? 'Here' : 'Travel', `region:${i}`, S.region !== i && !f), S.region === i ? 'done' : '', tip(`${r.zh} ${r.name}`, [`Foes: ${r.foes.join(', ')}.`, `Trophies here: ${Array.from({ length: D.MAX_DEPTH + 1 }, (_, d) => d).filter((d) => S.trophies[`${i}:${d}`]).length} of ${D.MAX_DEPTH + 1}.`], WD.LORE.regions[i]));
      }).reverse().join('');
      const depths = [];
      for (let d = 0; d <= (S.maxDepth[S.region] || 0); d++) depths.push(btn(`${d + 1}`, `depth:${d}`, S.depth !== d && !f, S.depth === d ? 'on-depth' : '', tip(`Depth ${d + 1}`, [`Foe health ×${fmt(Math.pow(G.P.depthHp, d))}, damage ×${fmt(Math.pow(G.P.depthDmg, d))}, stones ×${fmt(Math.pow(G.P.depthStones, d))}.`, 'Deeper foes also roll higher grades and drop artifacts more often.', S.trophies[`${S.region}:${d}`] ? '<span class="good">Trophy earned.</span>' : 'Boss not yet slain at this depth.'])));
      const rivals = D.RIVALS.slice(0, Math.min(D.RIVALS.length, S.duelsWon + 1)).map((rv, i) => {
        const open = S.stage >= G.rivalStage(i);
        const beaten = i < S.duelsWon;
        return row(`<div class="title">${rv[0]}</div><div class="dim small">${rv[1]}${open ? '' : ` · needs ${D.REALMS[G.realmOf(G.rivalStage(i))].name}`}</div>`, btn(beaten ? 'Rematch' : 'Challenge', `rival:${i}`, open && !f && S.recover <= 0), beaten ? 'done' : open ? '' : 'locked', tip(`${rv[0]}, ${rv[1]}`, [`Rank ${i + 1} of ${D.RIVALS.length}. ${beaten ? 'Rematches pay far less fame.' : 'A first win pays triple fame and a treasure.'}`], WD.LORE.rivals[i]));
      }).reverse().join('');
      return `<div class="section foe-section"><div class="toolbar">
            ${btn(S.hunting ? 'Stop fighting' : 'Begin hunting', 'hunt', true, S.hunting ? '' : 'primary')}
            ${btn('Strike', 'strike', S.hunting && !!foe)}
            ${btn('Withdraw', 'flee', !!f, 'ghost')}
          </div>
          ${fightBar}<div id="foe-card" class="foe-card stack">${card}</div>
          <div class="kv small"${tip('Momentum', ['Normal hits add 4 and skills add 10. Parries add 35.', `Also raises crit chance: now ${Math.round(10 + S.momentum * 0.2)}%. Crits deal 2.5×.`, 'A blow you fail to guard costs 50. Falling loses it all.'])}><span>Momentum ${Math.floor(S.momentum)}</span><span class="dim">+${Math.floor(S.momentum)}% damage · +${Math.floor(S.momentum / 2)}% rewards</span></div>${bar(S.momentum / 100, 'gold')}
          <div class="kv small"${tip('Kill streak', [`Best ever: ${S.stats.bestStreak}. Rewards rise 0.5% per kill, up to +100% at 200.`, 'Falling in battle resets it. Withdrawing does not.'])}><span>Kill streak ${S.streak}</span><span class="dim">+${Math.round(Math.min(S.streak, 200) / 2)}% rewards until you fall</span></div>
          <div class="kv small"${tip('Guard', ['Blocks 70% of normal hits while active.', 'If a charged blow lands while you guard, you parry: 3× attack back, a 3 second stun and 1.5× reward on the kill.'])}><span>Guard ${S.guard > 0 ? `${S.guard.toFixed(1)}s` : 'down'}</span><span class="dim">Vitality ${fmt(S.hp)} / ${fmt(st.hp)}</span></div>
          <div class="skills">${skills}</div>
          <div class="toolbar small">${miToggles}</div></div>
        <div class="section"><div class="kv"${tip('Martial Intent', [`${fmt(S.miXp)} intent. Level ${mi + 1} needs ${fmt(8 * (mi + 1) * (mi + 1))}.`, 'Tougher regions and foes teach more. It resets each life.', 'Auto-cast unlocks at level 5, auto-guard at level 15.'], 'The moment before a master moves, the opponent has already lost.')}><h2>Martial Intent ${zh('武意')}</h2><b>Level ${mi}</b></div>
          <div class="dim small">Every kill sharpens you: +4% attack and vitality per level this life. ${Object.keys(S.trophies).length} boss trophies add +${G.P.trophyBonus * 100}% each, and Tower floors +${G.P.towerBonus * 100}% each, forever.</div></div>
        <div class="section"><div class="kv"><h2>Region Boss</h2><span class="dim small">${S.bossMeter} of ${G.BOSS_METER} kills</span></div>
          ${bar(S.bossMeter / G.BOSS_METER, 'gold')}
          <div class="toolbar">${btn(`Summon the Lord of ${D.REGIONS[S.region].name}`, 'boss', G.canSummonBoss(), 'primary')}</div>
          <div class="dim small">Bosses drop artifacts of guaranteed high grade. A first kill earns a trophy and opens the next depth, where foes and rewards both grow.</div>
          <div class="toolbar"><span class="small">Depth</span>${depths.join('')}</div></div>
        <div class="section"><h2>Regions</h2><div class="stack">${regions}</div></div>
        <div class="section"><div class="kv"><h2>Tower of Trials ${zh('通天塔')}</h2><b>Best floor ${S.towerBest}</b></div>
          <div class="dim small">Clear each floor in 30 seconds and climb until you fall. New floors pay stones and fame, and every 10th opens a treasure chest.</div>
          <div class="toolbar">${btn(`Climb from floor ${S.towerBest + 1}`, 'tower', !f && S.recover <= 0, 'primary')}</div></div>
        <div class="section"><div class="kv"><h2>Martial Tournament ${zh('华山论剑')}</h2><b>${S.duelsWon} of ${D.RIVALS.length} beaten</b></div>
          <div class="dim small">Defeat the masters of the jianghu in order, for fame and treasure. Your record lasts through every life.</div>
          <div class="stack">${rivals}</div></div>
        <div class="section"><h2>Your Skills</h2>${skillNotes}</div>`;
    },

    gear() {
      const S = G.S;
      const gear = Object.keys(D.GEAR_SLOTS).map((slot) => {
        const it = S.gear[slot];
        const fc = it && { stones: G.forgeCost(it), cores: G.forgeCores(it) };
        const reforge = it && (it.cond === undefined ? 3 : it.cond) < D.CONDITIONS.length - 1 ? btn(`Reforge ${G.reforgeCost(it)} cores`, `reforge:${slot}`, S.cores >= G.reforgeCost(it), 'ghost', tip('Reforge condition', ['Reroll this artifact\'s condition. Only a better result is kept. Higher grades roll better.', ...ladderLines('condition', D.CONDITIONS, it.cond === undefined ? 3 : it.cond, it.rarity * 0.1)])) : '';
        const action = !it ? goLink('Find artifacts', 'combat') : reforge + (it.plus >= G.forgeCap(it) ? '<span class="good small">Perfected</span>' : btn(`Forge ${costText(fc)} · ${pct(G.forgeChance(it))}`, `forge:${slot}`, G.canAfford(fc)) + shortLink(fc));
        return row(`<div class="small dim">${zh(D.GEAR_SLOTS[slot].zh)} ${D.GEAR_SLOTS[slot].name}</div>${it ? itemText(it) : '<div class="dim small">Empty</div>'}`, action, '', it ? itemTip(it) : tip(D.GEAR_SLOTS[slot].name, `Provides ${D.GEAR_SLOTS[slot].stat.toLowerCase()}. Nothing equipped yet.`));
      }).join('');
      const bag = S.bag.slice().sort((a, b) => b.rarity - a.rarity || G.itemScore(b) - G.itemScore(a)).map((it) => {
        const better = G.itemScore(it) > G.itemScore(S.gear[it.slot]);
        return row(`<div class="small dim">${D.GEAR_SLOTS[it.slot].name}${better ? ' · <span class="good">Upgrade</span>' : ''}</div>${itemText(it)}`,
          btn('Equip', `equip:${it.id}`) + btn(`Sell ${fmt(G.itemValue(it) * G.mods().stones)}`, `sell:${it.id}`, true, 'ghost'), '', itemTip(it));
      }).join('');
      const seen = S.stats.bestRarity;
      const ladder = D.RARITIES.map((r, i) => `<span class="grade ${r.shimmer && i <= seen ? 'shimmer' : ''}" style="color:${i <= seen ? r.color : 'var(--line)'}"${i <= seen ? tip(`${r.zh} ${r.name}`, [`Grade ${i + 1} of ${D.RARITIES.length}. Base power ×${fmt(r.mult)}.`, i === 0 ? '' : `${i <= 4 ? '' : `Up to ${1 + Math.floor(i / 5)} bonus stats. `}1.9× stronger than the grade below.`], gradeLore(i)) : tip('Undiscovered grade', 'Find one to learn its name.')}>${i <= seen ? r.zh : '?'}</span>`).join('');
      return `<div class="section"><div class="kv"><h2>Grades Discovered</h2><span class="dim small">${seen + 1} of ${D.RARITIES.length}</span></div>
          <div class="ladder">${ladder}</div>
          ${(() => {
            const c = G.gradeCurve(S.region, S.depth);
            const name = (i) => D.RARITIES[i].name;
            return `<div class="kv small"><span>Drops here: ${name(c.low)} to ${name(c.high)}</span><span class="dim">most often ${name(Math.round(c.centre))}</span></div>
              <div class="kv small"${tip('Fate luck', [`Your luck of ${fmt(G.mods().luck)}, multiplied by ${fmt(G.mods().luck > 0 ? G.fateLuck() / G.mods().luck : 1)} for your realm and ascensions.`, 'Luck sources:', ...sourceLines('luck'), `Curve centre ${c.centre.toFixed(1)}, on the ladder of 24 grades. The luck part of it maxes out at ${G.P.gradeLuckCap} grades.`])}><span class="dim">Fate luck (luck boosted by realm and ascensions)</span><span>${fmt(G.fateLuck())}</span></div>`;
          })()}
          <div class="dim small">Each grade is 1.9× stronger than the one below. Your realm, region, depth, luck and ascensions raise the whole range, and grades below it stop dropping. Bosses and champions roll higher still.</div></div>
        <div class="section"><h2>Equipped</h2><div class="stack">${gear}</div>
          <div class="dim small">Each forge level adds 20% power to weapons and robes, or 5% to rings and talismans, up to a limit set by grade. The final level adds 50% and earns a Perfection. Failing above +10 costs a level.</div></div>
        <div class="section"><div class="kv"><h2>Storage Ring</h2><span class="dim small">${S.bag.length} of ${G.BAG_SIZE}</span></div>
          <div class="toolbar">${btn('Equip upgrades', 'equipBest', S.bag.length > 0)}${btn('Sell non-upgrades', 'sellBad', S.bag.length > 0, 'ghost')}${toggle('autoEquip', 'Auto-equip upgrades')}</div>
          <div class="stack">${bag || '<div class="dim small">Hunt, explore and take risks to find artifacts.</div>'}</div></div>`;
    },

    abode() {
      const S = G.S;
      const rows = D.ABODE.map((a) => {
        const l = S.abode[a.id] || 0;
        const maxed = a.max && l >= a.max;
        return row(`<div class="title">${zh(a.zh)} ${a.name} <span class="dim small">Lv ${l} of ${a.max}</span></div><div class="dim small">${a.desc} Perfected: ${a.maxText}.</div>`,
          btn(maxed ? 'Perfected' : `${costText({ stones: G.abodeCost(a), cores: G.abodeCores(a) })}`, `build:${a.id}`, !maxed && S.stones >= G.abodeCost(a) && S.cores >= G.abodeCores(a)) + (maxed ? '' : shortLink({ cores: G.abodeCores(a), stones: G.abodeCost(a) })), maxed ? 'done' : '', tip(`${a.zh} ${a.name}`, [a.desc, 'Each level costs 70% more, and prices rise with the regions you can reach. Abodes reset each life.']));
      }).join('');
      let beast = '<div class="dim small">No companion yet. Eggs come from bosses, champions and strange encounters.</div>' + goLink('Hunt for eggs', 'combat');
      if (S.beast) {
        const sp = D.BEASTS.find((x) => x.id === S.beast.species);
        const r = D.RARITIES[S.beast.rarity];
        const power = G.beastPower(G.mods().beast);
        const label = sp.fx === 'luck' ? `+${G.beastLuck(G.mods().beast)} luck` : `+${fmt(power * 100)}% ${{ qi: 'Qi', atk: 'attack', hp: 'vitality', stones: 'stones' }[sp.fx]}`;
        beast = row(`<div class="title" style="color:${r.color}">${r.zh} · ${zh(sp.zh)} ${sp.name} <span class="dim small">${D.BEAST_STAGES[G.beastStage()].name} · Lv ${S.beast.level} of ${G.beastCap()}</span></div><div class="dim small">${label}</div>`, S.beast.level >= G.beastCap() ? '<span class="good small">Perfected</span>' : btn(`Feed ${costText({ herbs: G.beastFeedCost(), cores: G.beastFeedCores() })}`, 'feed', G.canAfford({ herbs: G.beastFeedCost(), cores: G.beastFeedCores() })) + shortLink({ herbs: G.beastFeedCost(), cores: G.beastFeedCores() }), '', tip(`${sp.zh} ${sp.name}`, [`Grade: ${r.name}, which limits it to level ${G.beastCap()}. Each level adds 10% power, and each evolution multiplies it by 1.5:`, ...D.BEAST_STAGES.map((x) => `<span class="kv"><span>${x.zh} ${x.name}</span><span>Lv ${x.level}</span></span>`), 'Reaching its limit earns a Perfection that doubles it.'], WD.LORE.beasts[sp.id]));
      }
      const hunt = G.huntOutlook(G.mods());
      const away = `<div class="section"><div class="kv"${tip('Seclusion', [`Base ${pct(G.P.offlineRate)}. Each chamber level adds ${pct(G.P.offlineRatePerChamber)}, each Dao of Stillness level ${pct(G.P.offlineRatePerDao)}, up to ${pct(G.P.offlineRateMax)}.`, `Time limit: up to ${G.P.offlineCapMax} hours.`, `Absences of 30 minutes or more grant Seclusion Insight afterwards.`, `Each full hour away, up to ${G.P.offlineFindsMax}, can turn up an artifact or egg. Luck helps.`], WD.LORE.seclusion)}><h2>Seclusion ${zh('闭关')}</h2><b>${pct(G.offlineRate())} income, ${fmt(G.offlineCapHours())} hours</b></div>
          <div class="dim small">When you leave, you keep cultivating without aging. Your abode, sect stipend and active missions keep paying too.</div>
          <div class="small ${hunt ? 'good' : 'dim'}">${hunt ? `If you left now, you would hunt in ${D.REGIONS[S.region].name} and defeat about ${fmt(hunt.killsPerSec * G.offlineRate() * 3600)} foes an hour.` : S.hunting ? 'This hunt is too deadly to continue without you. Choose a safer region before leaving.' : 'Begin hunting before you leave to keep fighting while away.'}</div></div>`;
      const site = D.SITES[S.abodeSite];
      const siteRow = row(`<div class="title">${zh(site.zh)} ${site.name} <span class="dim small">×${site.mult} to all buildings</span></div><div class="dim small">Rolled each life. Survey for a better site. Only a better one is kept.</div>`, S.abodeSite < D.SITES.length - 1 ? btn(`Survey ${fmt(G.surveyCost())} stones`, 'survey', S.stones >= G.surveyCost()) + shortLink({ stones: G.surveyCost() }) : '<span class="good small">Finest site</span>', '', tip('Cave sites', ladderLines('sites', D.SITES, S.abodeSite), 'Feng shui, "wind and water", is the art of reading land for the flow of Qi.'));
      return away + `<div class="section"><div><h2>Cave Abode ${zh('洞府')}</h2><div class="dim small">Your home in the mountains. It works for you while you fight.</div></div>${siteRow}${rows}</div>
        <div class="section"><div class="kv"><h2>Spirit Beast ${zh('灵兽')}</h2><span class="dim small">${S.eggs} eggs</span></div>${beast}
          <div class="toolbar">${btn('Hatch an egg', 'hatch', S.eggs > 0, 'primary')}</div>
          <div class="dim small">A new beast replaces your companion only if its grade is at least as high.</div></div>`;
    },

    sect() {
      const S = G.S;
      if (!S.sect) {
        const can = S.stage >= G.sectJoinStage;
        return `<div class="section"><h2>Choose a Sect</h2>
          <div class="dim small">${can ? 'A wandering cultivator only goes so far. Choose carefully: leaving forfeits your rank.' : `Sects accept disciples from Qi Refining stage ${G.sectJoinStage + 1}.`}</div>
          <div class="stack">${D.SECTS.map((x) => row(`<div class="title">${zh(x.zh)} ${x.name}</div><div class="small"><i>“${x.motto}”</i> ${x.desc}</div><div class="small good">${fxText(x.fx)}</div><div class="small"><span class="chip">${x.align}</span> ${zh(D.SECT_SKILLS[x.id].zh)} ${D.SECT_SKILLS[x.id].name}: <span class="dim">${D.SECT_SKILLS[x.id].desc}</span></div>`, btn('Join', `join:${x.id}`, can), '', tip(`${x.zh} ${x.name}`, [`${x.align} path. Bonuses grow 25% with every rank.`, `Signature art: cooldown ${D.SECT_SKILLS[x.id].cd}s.`], WD.LORE.sects[x.id]))).join('')}</div></div>`;
      }
      const s = S.sect;
      const sd = D.SECTS.find((x) => x.id === s.id);
      const rank = D.SECT_RANKS[s.rank];
      const next = D.SECT_RANKS[s.rank + 1];
      const active = Array.from({ length: G.missionSlots() }, (_, i) => {
        const a = s.active[i];
        if (!a) return '<div class="row slot-empty"><div><div class="kv small"><span class="dim">Mission slot open</span><span></span></div>' + bar(0, 'gold') + '</div><div></div></div>';
        const t = D.MISSIONS[a.tpl];
        return `<div class="row"><div><div class="kv small"><span>${t.name}</span><span>${Math.ceil(a.t)}s</span></div>${bar(1 - a.t / a.dur, 'gold')}</div><div></div></div>`;
      }).join('');
      const free = s.active.length < G.missionSlots();
      const board = [0, 1, 2].map((i) => s.board[i] || null).map((b) => {
        if (!b) return row('<div class="title dim">Posting taken</div><div class="dim small">A new posting arrives with the next board.</div>', '<span class="link small placeholder">&nbsp;</span>', 'slot-empty');
        const t = D.MISSIONS[b.tpl];
        const parts = [`${fmt(t.reward.contribution * 5 * b.scale * D.MISSION_RANKS[b.rank || 0].mult)} contribution`];
        if (D.MISSION_RANKS[b.rank || 0].cores) parts.push('cores');
        if (t.reward.stones) parts.push('stones');
        if (t.reward.herbs) parts.push('herbs');
        if (t.reward.item) parts.push(`${pct(t.reward.item)} artifact`);
        return row(`<div class="title"><span class="chip gold">${D.MISSION_RANKS[b.rank || 0].name}</span> ${t.name}</div><div class="dim small">${t.dur}s · ${pct(G.missionChance(t, undefined, b.rank || 0))} success · ${parts.join(', ')}</div>`, btn('Accept', `mission:${b.id}`, free), '', tip(`Rank ${D.MISSION_RANKS[b.rank || 0].name}: ${t.name}`, ['Higher ranks pay more but succeed less often. Luck and your sect rank improve what gets posted.', ...ladderLines('missions', D.MISSION_RANKS, b.rank || 0, s.rank * 0.4), `Mission speed ×${G.mods().mission.toFixed(2)}.`, 'Rewards were set when this posting went up, and grow 13% per stage.']));
      }).join('');
      const shop = G.treasury().map((it) => {
        const locked = s.rank < (it.unlockRank || 0);
        return row(`<div class="title">${it.name}</div><div class="dim small">${locked ? `Requires ${D.SECT_RANKS[it.unlockRank].name}.` : it.desc}</div>`, btn(`${fmt(it.cost)}`, `treasury:${it.id}`, !locked && s.contribution >= it.cost), locked ? 'locked' : '', tip(it.name, [it.desc, 'Treasury prices rise as you climb stages.']));
      }).join('');
      return `<div class="section"><h2>${zh(sd.zh)} ${sd.name}</h2>
          <div class="kv"${tip('Sect ranks', ['Earn contribution through missions. A higher rank raises bonuses, stipend and mission slots.', 'A second mission slot opens at Core Disciple, a third at Elder.', ...D.SECT_RANKS.map((x, i) => `<span class="kv ${i === s.rank ? 'good' : i > s.rank ? 'dim' : ''}"><span>${x.zh} ${x.name}</span><span>${fmt(x.need)}</span></span>`)], WD.LORE.sects[s.id])}><span>${zh(rank.zh)} ${rank.name}</span><b>${fmt(s.contribution)} contribution</b></div>
          ${next ? `<div class="dim small">Next rank, ${next.name}: ${fmt(s.earned)} of ${fmt(next.need)} earned</div>${bar(s.earned / next.need, 'gold')}` : '<div class="good small">You lead the sect.</div>'}
          <div class="small good">${fxText(sd.fx)} (rank bonus ×${(1 + 0.25 * s.rank).toFixed(2)})</div>
          <div class="small"><span class="chip">${sd.align}</span> Signature art: ${zh(D.SECT_SKILLS[s.id].zh)} ${D.SECT_SKILLS[s.id].name}. <span class="dim">${D.SECT_SKILLS[s.id].desc}</span></div></div>
        <div class="section"><div class="kv"><h2>Mission Hall</h2><span class="dim small">${s.active.length} of ${G.missionSlots()} slots · new board in ${Math.ceil(Math.max(0, s.boardIn))}s</span></div>
          ${S.dao.autoHunt ? `<div class="small">${toggle('autoMission', 'Auto-accept missions')}</div>` : ''}${active}${board}</div>
        <div class="section"><h2>Treasury</h2>
          ${row(`<div class="title">Donate Beast Cores</div><div class="dim small">Hand in ${fmt(G.donationSize())} cores for ${fmt(G.donationReward())} contribution, which counts toward your rank.</div>`, btn('Donate', 'donate', S.cores >= G.donationSize()) + shortLink({ cores: G.donationSize() }))}
          ${shop}</div>
        <div class="toolbar">${confirmLeave ? btn('Yes, abandon the sect', 'leaveYes', true, 'primary') + btn('Stay', 'leaveNo') : btn('Leave the sect', 'leaveAsk', true, 'ghost')}</div>`;
    },

    alchemy() {
      const S = G.S;
      const rows = D.PILLS.map((p) => {
        const locked = S.stage < p.stage;
        const c = G.pillCost(p);
        const have = S.pills[p.id] || 0;
        const grade = G.bestPillGrade(p.id);
        const left = `<div class="title">${zh(p.zh)} ${p.name} <span class="dim small">× ${have}</span></div><div class="dim small">${p.desc}</div>`
          + (locked ? `<div class="small dim">Opens at ${D.REALMS[G.realmOf(p.stage)].name} stage ${G.stageInRealm(p.stage) + 1}.</div>` : `<div class="small">${costText(c)} · ${pct(G.pillChance(p))} success</div>`);
        return row(left, btn('Refine', `refine:${p.id}`, !locked && G.canAfford(c)) + btn(`Consume${grade >= 0 ? ` ${D.PILL_GRADES[grade].name}` : ''}`, `use:${p.id}`, have > 0) + (locked ? '' : shortLink(c)), locked ? 'locked' : '', tip(`${p.zh} ${p.name}`, [`Base success ${pct(p.chance)}. Alchemy level adds 1% per level:`, ...sourceLines('alch'), 'Luck raises the chance of a perfect double pill.', 'Every pill rolls a grade, and the best in stock is used first. Alchemy level nudges the curve up:', ...ladderLines('pills', D.PILL_GRADES, G.bestPillGrade(p.id), G.alchLevel() * 0.05)], WD.LORE.pills[p.id]));
      }).join('');
      return `<div class="section"><div class="kv"><h2>Pill Furnace</h2><span class="dim small">Alchemy level ${G.alchLevel()}</span></div>
        <div class="dim small">Every attempt trains your hand. Fortune sometimes yields two perfect pills.</div>${rows}</div>`;
    },

    fate() {
      const S = G.S;
      const f = S.lastFortune === null ? null : D.FORTUNES[S.lastFortune];
      const odds = D.FORTUNES.map((x) => `<span class="chip"${tip(`${x.zh} ${x.name}`, [`${fxText(x.fx)} for ${x.secs}s.`, `${x.weight}% of draws at no luck.`], x.text)}>${zh(x.zh)} ${x.name}</span>`).join('');
      return `<div class="section"><h2${tip('Temple of the Bamboo Sticks', 'Each stick is numbered. The priest reads your fortune from the first to fall.', WD.LORE.fortunes)}>Temple of the Bamboo Sticks</h2>
          <div class="dim small">Shake the cylinder and let one stick fall. Its fortune lasts a few minutes and replaces the last. Luck tilts the draw, but calamity is always possible.</div>
          <div class="toolbar">${btn(`Draw a stick · ${fmt(G.divineCost())} stones`, 'divine', S.stones >= G.divineCost(), 'primary')}</div>
          ${f ? `<div class="row"><div><div class="fortune ${S.lastFortune <= 1 ? 'ill' : ''}">${f.zh}</div><div class="title">${f.name}</div><div class="small">${f.text}</div><div class="small dim">${fxText(f.fx)} for ${f.secs}s</div></div><div></div></div>` : ''}
          <div class="chips">${odds}</div></div>
        <div class="section"><h2>Your Luck</h2><div class="kv"${tip('Luck', ['Where your luck comes from:', ...sourceLines('luck')])}><span>Current luck</span><b>${fmt(G.mods().luck)}</b></div>
          <div class="dim small">Luck improves artifact grades, root rolls, mission and encounter odds, and the sticks.</div>
          <h2>Chance Encounters</h2><div class="dim small">${S.encounter ? 'Fate has found you. See the scroll under your dantian.' : `Resolved in all your lives: ${S.stats.encounters}.`}</div></div>`;
    },

    rebirth() {
      const S = G.S;
      const karmaRows = D.KARMA_UPS.map((u) => {
        const l = S.karmaUps[u.id] || 0;
        const maxed = l >= u.max;
        return row(`<div class="title">${zh(u.zh)} ${u.name} <span class="dim small">${l} of ${u.max}</span></div><div class="dim small">${u.desc}</div>`,
          btn(maxed ? 'Complete' : `${fmt(G.karmaCost(u))} karma`, `karma:${u.id}`, !maxed && S.karma >= G.karmaCost(u)), maxed ? 'done' : '', tip(`${u.zh} ${u.name}`, [u.desc, `Level ${l} of ${u.max}. Each level costs ×${u.growth} more.`, 'Kept through rebirth, reset by ascension.']));
      }).join('');
      const daoRows = D.DAO_UPS.map((u) => {
        const l = S.dao[u.id] || 0;
        const maxed = l >= u.max;
        return row(`<div class="title">${zh(u.zh)} ${u.name} <span class="dim small">${l} of ${u.max}</span></div><div class="dim small">${u.desc}</div>`,
          btn(maxed ? 'Complete' : `${fmt(G.daoCost(u))} marks`, `dao:${u.id}`, !maxed && S.daoMarks >= G.daoCost(u)), maxed ? 'done' : '', tip(`${u.zh} ${u.name}`, [u.desc, `Level ${l} of ${u.max}. Each level costs ×${u.growth} more.`, 'Permanent. Nothing removes it.']));
      }).join('');
      return `<div class="section"><h2>The Wheel of Rebirth</h2>
          <div class="small">Dying, or choosing to end this life now, earns <b>${fmt(G.karmaOnDeath())} karma</b>. The higher you climbed, the more you keep. You lose stones, techniques, sect and artifacts, and a new spirit root is rolled.</div>
          <div class="toolbar">${confirmRebirth ? btn('Yes, end this life', 'rebirthYes', true, 'primary') + btn('Keep living', 'rebirthNo') : btn('End this life', 'rebirthAsk', true, 'ghost')}</div>
          ${karmaRows}</div>
        <div class="section"><h2>Tree of the Dao</h2>
          <div class="small dim">Survive the tribulation at ${D.REALMS[G.realmOf(G.maxStage())].name} stage 9 to ascend. Ascension earns Dao Marks that are never lost, multiplies your Qi, resets karma upgrades, and opens one more realm above. Each heaven's cultivation costs far more.</div>
          ${S.ascensions || S.daoMarks ? daoRows : `<div class="dim small">Sealed until your first ascension. You have reached ${D.REALMS[G.realmOf(S.best)].name}.</div>`}</div>`;
    },

    records() {
      const S = G.S;
      const st = S.stats;
      const m = G.mods();
      const perfect = G.perfectionList();
      const root = D.ROOT_TIERS[S.root.tier];
      const elems = S.root.elements.map(elementChip).join('');
      const feats = D.FEATS.map((f) => row(`<div class="title ${S.feats[f.id] ? '' : 'dim'}">${f.name}</div><div class="dim small">${f.desc}</div>`, S.feats[f.id] ? '<span class="good small">Recorded</span>' : '', S.feats[f.id] ? 'done' : 'locked')).join('');
      const list = [['Lives lived', st.lives], ['Breakthroughs', st.breakthroughs], ['Qi deviations', st.deviations], ['Tribulations survived', st.tribs], ['Foes defeated', st.kills], ['Pills refined', st.pills], ['Artifacts found', st.items], ['Sticks drawn', st.draws], ['Parries', st.parries], ['Best kill streak', st.bestStreak], ['Boss trophies', Object.keys(S.trophies).length], ['Tower best', S.towerBest], ['Fame', S.fame], ['Times defeated', st.defeats], ['Time cultivating', `${Math.floor(st.playSeconds / 60)} min`], ['Luck', fmt(m.luck)], ['Breakthrough bonus', pct(m.bt)]]
        .map(([k, v]) => `<div class="kv small"><span class="dim">${k}</span><span>${typeof v === 'number' ? fmt(v) : v}</span></div>`).join('');
      return `<div class="section"><h2>Spirit Root</h2><div>${zh(root.zh)} ${esc(G.rootName(S.root))} · Qi ×${root.mult} · purity ×${G.rootPurityMult().toFixed(2)}</div><div class="chips">${elems}</div></div>
        <div class="section"><h2>Annals</h2><div class="res">${list}</div></div>
        <div class="section"><div class="kv"><h2>Feats</h2><span class="dim small">${Object.keys(S.feats).length} of ${D.FEATS.length} · each gives +3% Qi</span></div>${feats}</div>
        <div class="section"><div class="kv"><h2>Perfection</h2><span class="dim small">${perfect.length} now · ${Object.keys(S.perfectSeen).length} ever</span></div>
          <div class="dim small">Levels are capped where more stops being worth it. Reaching a cap pays its own reward, plus +1% to everything.</div>
          ${perfect.map((p) => `<div class="kv small"><span>${esc(p.name)}</span><span class="good">${esc(p.reward)}</span></div>`).join('') || '<div class="dim small">Nothing perfected in this life yet.</div>'}</div>
        <div class="section"><div class="kv"><h2>Codex</h2><span class="dim small">${Object.keys(S.lore).length} entries read by hovering</span></div>
          <div class="dim small">Nearly everything in the game has a note if you hover over it. Tap on a touch screen.</div>
          ${WD.LORE.terms.map(([t, d]) => `<div class="small"><b>${t}</b> <span class="dim">${d}</span></div>`).join('')}
          <h2>Hints from the Elders</h2>
          ${WD.LORE.hints.slice(0, Math.min(WD.LORE.hints.length, 1 + Math.floor(Object.keys(S.lore).length / 5))).map((h) => `<div class="small">${h}</div>`).join('')}
          <div class="dim small">Read more entries to hear more hints.</div></div>
        <div class="section"><h2>Save</h2><div class="dim small">Saved in this browser every 15 seconds. Copy your save string to move it to another device.</div>
          <div class="toolbar">${btn('Save now', 'save')}${btn('Copy save string', 'export')}${btn('Load from box', 'import')}${confirmWipe ? btn('Yes, erase everything', 'wipeYes', true, 'primary') + btn('Cancel', 'wipeNo') : btn('Erase save', 'wipeAsk', true, 'ghost')}</div>
          <div class="small good">${esc(saveMsg)}</div>
          <textarea id="savebox" aria-label="Save string" spellcheck="false" placeholder="Save string appears here. Paste one to load it."></textarea></div>`;
    },
  };

  function itemText(it) {
    const r = D.RARITIES[it.rarity];
    const slot = D.GEAR_SLOTS[it.slot];
    const power = G.itemPower(it);
    const main = it.slot === 'weapon' || it.slot === 'robe' ? `+${fmt(power)} ${slot.stat.toLowerCase()}` : `+${fmt(power * 100)}% ${slot.stat.toLowerCase()}`;
    const extra = it.slot === 'talisman' && it.rarity ? `, +${it.rarity} luck` : '';
    const affix = it.affixes.map((a) => {
      const v = a.flat && !a.pct ? `+${a.v}` : `+${a.pct ? (a.v * 100).toFixed(1) : fmt(a.v * 100)}%`;
      return `, ${v} ${esc(a.label)}`;
    }).join('');
    return `<div class="title ${r.shimmer ? 'shimmer' : ''}" style="color:${r.color}">${r.zh} · ${r.name} ${it.roll ? `${G.itemQuality(it).name} ` : ''}${esc(it.name)}${it.plus ? ` +${it.plus}` : ''}</div><div class="dim small">${main}${extra}${affix}</div>`;
  }

  function meridianView() {
    const S = G.S;
    const i = S.meridians;
    const list = D.MERIDIANS.map((x, n) => `<span class="grade" style="color:${n < i ? 'var(--realm)' : 'var(--line)'}" ${tip(`${x.zh} ${x.name}`, [fxText(x.fx), n < i ? `<span class="good">Open, ${D.PURITY[S.meridianQ[n] === undefined ? 1 : S.meridianQ[n]].name}: ×${G.purityMult(n)}.</span>` : `Needs stage ${n * 4 + 1}.`], n < 12 ? WD.LORE.meridianNote : WD.LORE.vesselNote)}>${n < i ? '脉' : '·'}</span>`).join('');
    const next = D.MERIDIANS[i];
    let action = '<div class="good small">All meridians are open.</div>';
    if (next) {
      const open = S.stage >= i * 4;
      action = row(`<div class="title">${zh(next.zh)} ${next.name}</div><div class="small good">${fxText(next.fx)}</div>${open ? '' : `<div class="dim small">Needs ${D.REALMS[G.realmOf(i * 4)].name} stage ${G.stageInRealm(i * 4) + 1}.</div>`}`,
        btn(`${fmt(G.meridianCost(i))} Qi${G.meridianCores(i) ? ` + ${G.meridianCores(i)} cores` : ''}`, 'meridian', open && S.qi >= G.meridianCost(i) && S.cores >= G.meridianCores(i)) + shortLink({ cores: G.meridianCores(i) }), open ? '' : 'locked');
    }
    return `<div class="section"><div class="kv"><h2>Meridians ${zh('经脉')}</h2><span class="dim small">${i} of ${D.MERIDIANS.length} open</span></div>
      <div class="dim small">Twelve regular channels, then the eight extraordinary vessels. Each opens for this life.</div>
      <div class="ladder">${list}</div>${action}
      <div class="dim small"${tip('Meridian purity', ladderLines('purity', D.PURITY))}>Opening rolls a purity that scales the channel's bonus. Twelve channels, and all twenty, each earn a Perfection.</div>
      ${S.meridianQ.map((q, n) => (q < D.PURITY.length - 1 ? row(`<div class="small">${D.MERIDIANS[n].name}: <b>${D.PURITY[q].name}</b> ×${D.PURITY[q].mult}</div>`, btn(`Temper ${costText(G.temperCost(n))}`, `temper:${n}`, G.canAfford(G.temperCost(n)), 'ghost') + shortLink(G.temperCost(n))) : '')).filter(Boolean).slice(0, 4).join('')}</div>`;
  }

  // ---------- overlays ----------
  function renderOverlay() {
    const S = G.S;
    let html = '';
    if (trib) html = tribView();
    else if (S.choosingRoot) html = rootView();
    else if (S.dead) html = deathView();
    else if (seclusion) html = seclusionView();
    else if (S.ascendReady && S.askingAscend) html = ascendView();
    morph($('overlay'), html);
  }
  function showSeclusion(r) {
    if (r.secs >= 300) seclusion = r;
    else toast(`Seclusion: +${fmt(r.qi)} Qi, +${fmt(r.stones)} stones`);
  }
  const hoursText = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} hours` : `${Math.max(1, Math.round(s / 60))} minutes`);
  function seclusionView() {
    const r = seclusion;
    const line = (k, v) => `<div class="kv"><span class="dim">${k}</span><b>${v}</b></div>`;
    const rows = [line('Qi', `+${fmt(r.qi)}`)];
    if (r.stones) rows.push(line('Spirit stones', `+${fmt(r.stones)}`));
    if (r.herbs) rows.push(line('Herbs', `+${fmt(r.herbs)}`));
    if (r.kills) rows.push(line('Foes defeated', fmt(r.kills)));
    if (r.xp) rows.push(line('Martial Intent', `+${fmt(r.xp)}`));
    if (r.cores) rows.push(line('Beast Cores', `+${fmt(r.cores)}`));
    if (r.missions) rows.push(line('Missions returned', `${r.missions}, +${fmt(r.contribution)} contribution`));
    const capped = r.away > r.secs + 1;
    return `<div class="veil"><div class="rite">
      <div class="glyph">闭关</div><h2>You Return from Seclusion</h2>
      <p>${hoursText(r.secs)} of cultivation at ${pct(r.rate)} of your usual income. You did not age a day.</p>
      ${r.unverified ? `<p class="small dim">The time could not be confirmed online, so only part of your absence may count. Up to ${G.P.unverifiedHours} hour of unconfirmed time is available between connections.</p>` : ''}
      ${capped ? `<p class="small bad">You were away for ${hoursText(r.away)}, past your limit of ${fmt(G.offlineCapHours())} hours. Upgrade your Closed-Door Chamber to stay longer.</p>` : ''}
      <div class="stack">${rows.join('')}</div>
      ${r.finds.length ? `<div class="stack small"><b>Found on your wanderings</b>${r.finds.map((f) => `<div class="good">${esc(f)}</div>`).join('')}</div>` : ''}
      ${r.insight ? `<p class="small good">Seclusion Insight: +${pct(G.P.insightQi)} Qi for ${hoursText(r.insight)}.</p>` : ''}
      <div class="actions">${btn('Open the gate', 'closeSeclusion', true, 'primary big')}</div>
    </div></div>`;
  }
  function rootView() {
    const S = G.S;
    const t = D.ROOT_TIERS[S.root.tier];
    const elems = S.root.elements.map(elementChip).join('');
    const cost = G.rerollCost();
    return `<div class="veil"><div class="rite">
      <div class="dim">${S.stats.lives === 1 ? 'A travelling elder presses your palm to the Root-Testing Stone.' : 'You open new eyes in a new body. The stone glows beneath your palm.'}</div>
      <div class="glyph">${t.zh}</div><h2>${esc(G.rootName(S.root))}</h2>
      <div>Qi ×${t.mult}, purity ×${G.rootPurityMult().toFixed(2)}. Grade ${S.root.tier + 1} of ${D.ROOT_TIERS.length}: a ${(G.ladderOdds('root')[S.root.tier] * 100).toFixed(1)}% roll for you now.</div>
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

  function floatHit(text, cls) {
    const card = $('foe-card');
    if (!card || reduced || document.querySelectorAll('.float').length > 12) return;
    const box = card.getBoundingClientRect();
    if (box.height === 0) return;
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${box.left + box.width * (0.25 + Math.random() * 0.5)}px`;
    el.style.top = `${box.top + 4}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  function toast(msg, color) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    if (color) { t.style.color = color; t.style.borderColor = color; }
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
      if (ev.kind === 'hit') floatHit(ev.crit ? `${fmt(ev.dmg)}!` : fmt(ev.dmg), ev.crit ? 'crit' : '');
      if (ev.kind === 'parry') floatHit('PARRY', 'parry');
      if (ev.kind === 'smash') floatHit('SMASHED', 'smash');
      if (ev.kind === 'trophy') toast(`Trophy: ${ev.name}`);
      if (ev.kind === 'perfect') toast(`Perfected: ${ev.name}`);
      if (ev.kind === 'title') toast(`Title: ${ev.name}`);
      if (ev.kind === 'loot' && ev.it.rarity >= 4) toast(`${D.RARITIES[ev.it.rarity].name} grade: ${ev.it.name}`, D.RARITIES[ev.it.rarity].color);
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
    refreshTip();
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
    contemplate: (v) => G.contemplate(v),
    reforge: (v) => G.reforge(v),
    temper: (v) => G.temperMeridian(+v),
    survey: () => G.surveySite(),
    donate: () => G.donateCores(),
    region: (v) => G.setRegion(+v),
    depth: (v) => G.setDepth(+v),
    skill: (v) => G.useSkill(v),
    strike: () => G.strike(),
    boss: () => G.summonBoss(),
    tower: () => G.enterTower(),
    rival: (v) => G.challengeRival(+v),
    flee: () => { G.S.fight = null; G.S.foe = null; },
    forge: (v) => G.forge(v),
    meridian: () => G.openMeridian(),
    build: (v) => G.buildAbode(v),
    hatch: () => G.hatchEgg(),
    feed: () => G.feedBeast(),
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
    closeSeclusion: () => { seclusion = null; },
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
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    if (tab === 'combat' && /^[1-9]$/.test(e.key)) {
      const id = G.skillList()[+e.key - 1];
      if (id) { G.useSkill(id); render(); }
      return;
    }
    if (e.code !== 'Space' || e.repeat || tag === 'button') return;
    e.preventDefault();
    if (tab === 'combat' && G.S.hunting && G.S.foe) { G.strike(); return; }
    circulateFx();
  });

  // ---------- tooltip behaviour ----------
  const tipEl = $('tip');
  let tipFor = null;
  let tipTimer = null;
  function placeTip(target) {
    const box = target.getBoundingClientRect();
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - w - 8, box.left + box.width / 2 - w / 2));
    const top = box.top - h - 8 >= 0 ? box.top - h - 8 : Math.min(innerHeight - h - 8, box.bottom + 8);
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${Math.max(8, top)}px`;
  }
  function showTip(target) {
    tipFor = target;
    const html = target.getAttribute('data-tip');
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    placeTip(target);
    // The title identifies an entry, so live numbers do not count as new reading.
    const key = (tipEl.querySelector('b') || tipEl).textContent.slice(0, 60);
    if (G.S && !G.S.lore[key]) G.S.lore[key] = 1;
  }
  function hideTip() { tipFor = null; tipEl.hidden = true; }
  function refreshTip() {
    if (!tipFor) return;
    if (!document.contains(tipFor) || !tipFor.getAttribute('data-tip')) { hideTip(); return; }
    const html = tipFor.getAttribute('data-tip');
    if (tipEl.innerHTML !== html) { tipEl.innerHTML = html; placeTip(tipFor); }
  }
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t && t !== tipFor) showTip(t);
    else if (!t && tipFor) hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && e.target.matches(':focus-visible')) showTip(t);
  });
  document.addEventListener('focusout', () => { if (tipFor && !tipFor.matches(':hover')) hideTip(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  // Touch screens have no hover: a tap shows the note for a few seconds.
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    const t = e.target.closest('[data-tip]');
    clearTimeout(tipTimer);
    if (t) { showTip(t); tipTimer = setTimeout(hideTip, 3500); } else hideTip();
  });

  // ---------- saves ----------
  // Time comes from the web server's Date header, then runs on the page's monotonic clock,
  // so changing the device clock has no effect on it.
  let serverBase = null; // { server, perf }
  let timeState = 'checking';
  const trustedNow = () => (serverBase ? serverBase.server + (performance.now() - serverBase.perf) : null);
  async function fetchServerTime() {
    const ctl = new AbortController();
    const stop = setTimeout(() => ctl.abort(), 4000);
    try {
      const res = await fetch(`${location.pathname}?t=${performance.now()}`, { method: 'HEAD', cache: 'no-store', signal: ctl.signal });
      const when = Date.parse(res.headers.get('date'));
      return Number.isFinite(when) ? when : null;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(stop);
    }
  }
  function savedTime() {
    if (serverBase) return trustedNow();
    return timeState === 'checking' ? G.S.lastSeen : Date.now();
  }
  async function settleAbsence() {
    const server = await fetchServerTime();
    if (server !== null) serverBase = { server, perf: performance.now() };
    timeState = server !== null ? 'ok' : 'none';
    const S = G.S;
    const away = G.resolveAway({ lastSeen: S.lastSeen || Date.now(), trustedNow: trustedNow(), deviceNow: Date.now(), pool: S.clockPool });
    S.clockPool = away.pool;
    S.lastSeen = savedTime();
    const r = G.applyOffline(away.seconds);
    if (r) { r.unverified = !away.verified; showSeclusion(r); }
    lastTick = performance.now();
    save();
    render();
  }
  // After the machine sleeps, the page clock may have stopped, so ask the server how long it really was.
  async function resyncAfterSleep() {
    if (!serverBase) return;
    const estimate = trustedNow();
    const server = await fetchServerTime();
    if (server === null) return;
    serverBase = { server, perf: performance.now() };
    const slept = (server - estimate) / 1000;
    if (slept > 120) {
      const r = G.applyOffline(slept);
      if (r) { showSeclusion(r); render(); }
    }
  }

  function snapshot() {
    const copy = Object.assign({}, G.S, { fx: [], lastSeen: savedTime() });
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
      if (!data || !data.root || data.v > 3) throw new Error('bad');
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
    if (saved && saved.root) {
      G.load(saved);
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
  let lastTick = performance.now();
  function gameLoop() {
    const now = performance.now();
    const gap = (now - lastTick) / 1000;
    lastTick = now;
    if (gap > 120) {
      // The tab slept for a long time: count it as seclusion.
      const r = G.applyOffline(gap);
      if (r) showSeclusion(r);
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
  settleAbsence();
  setInterval(gameLoop, 100);
  setInterval(render, 250);
  setInterval(save, 15000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else resyncAfterSleep(); });
  window.addEventListener('pagehide', save);
  requestAnimationFrame(frame);
})();
