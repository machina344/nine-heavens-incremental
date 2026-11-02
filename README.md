# Path of Nine Heavens 问道

A wuxia cultivation incremental game for the browser. Refine Qi, join a sect, gamble on fate, survive heavenly tribulation and ascend through nine heavens.

It is plain HTML, CSS and JavaScript with no build step or dependencies. Fonts load from Google Fonts and fall back to system fonts.

## Play

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8123
```

Then visit http://localhost:8123.

## Publish on GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Set the source to **Deploy from a branch**, then choose your main branch and the `/ (root)` folder.

## Systems

- **Cultivation:** 20 realms of nine stages each. The mortal ten are open at the start, and each ascension opens one immortal realm above them. Major breakthroughs can fail and injure you, and from Core Formation onward they call down lightning.
- **Meridians and mastery:** open 12 regular channels and 8 extraordinary vessels. Techniques gain power at seven mastery tiers.
- **Spirit roots:** rolled at the start of each life, from a common Five-Spirit Root to a rare Variant Root.
- **Lifespan:** one real second is one month. When your years run out, you are reborn.
- **Combat:** auto-attacks plus skills on cooldown, Momentum, kill streaks and charged blows you can parry with Guard. Martial Intent levels up as you fight and unlocks auto-casting.
- **Regions and bosses:** 20 regions with 10 depths each. Bosses drop high-grade artifacts, and first kills earn permanent trophies and open the next depth.
- **Tower and tournament:** a timed climb through the Tower of Trials, and 12 named rivals in the Martial Tournament.
- **Artifacts:** 24 grades from Common to Chaos Origin, each 1.9× stronger than the last, with up to five bonus stats and forging. Drops follow a bell curve that rises with progress and luck, and low grades eventually stop dropping.
- **Sects:** 16 sects with their own bonuses and signature combat arts, nine ranks, timed missions and a treasury.
- **Jianghu fame:** 12 titles earned through deeds, each adding luck and stones.
- **Cave abode and spirit beasts:** six buildings that work for you, and companions that hatch from eggs and grow when fed.
- **Alchemy:** six pills with success rolls and a chance of perfect results.
- **Fate:** temple fortune sticks and 19 branching chance encounters.
- **Hover notes and Codex:** hover over almost anything for its exact stat sources, odds and lore drawn from Chinese myth, medicine and wuxia fiction. Reading widely unlocks elder hints and a feat.
- **Rebirth:** karma buys upgrades that carry between lives.
- **Ascension:** Dao Marks buy permanent upgrades. Each heaven costs far more to climb.
- **Seclusion:** time away pays 30–60% of your usual income for 8–24 hours without aging you. Your hunt, abode, sect stipend and active missions keep paying, long absences can turn up artifacts and eggs, and you return to a report and a temporary Qi bonus. The Closed-Door Chamber and Dao of Stillness raise both limits.
- **Trusted time:** time away is measured with the web server's clock, not the device's, so moving the clock forward earns nothing. Without a connection, at most 1 hour of unconfirmed time counts until the server is reached again.
- **Caps and Perfection:** techniques, abode buildings, forging, beasts, the sect manual and meridians have level caps. Reaching one pays its own reward plus +1% to everything.
- **Interconnected systems:** Beast Cores from combat feed pills, forging, deep meridians, the abode, beasts and sect donations. Each new realm asks for meridians, a region boss and a sect rank, and "The Path Ahead" links to the tab you need next.
- **Rolled qualities:** spirit roots (12 grades), technique comprehension (12), pill grades (10), mission ranks (14), meridian purity (10), cave sites (12) and artifact condition (10) all roll on bell curves that rise with your realm and heavens, so rerolling stays worthwhile.
- **Idle Arts:** 13 permanent automation upgrades bought with karma, each switchable: meridians, hunting ground, bosses, pill stock, abode, beasts, forging, encounters, rebirth, sect duties, major breakthroughs at a chosen odds threshold, auto-clearing low-grade artifacts, and an Ancestral Vault that keeps artifacts between lives.
- **Storage:** an expandable storage ring (24 to 120 slots), item locks, and dismantling artifacts into Beast Cores.
- **Saves:** automatic saves in the browser and a copyable save string. Script links carry a version stamp, so browsers always load matching files after an update.

## Project layout

| Path | Purpose |
| --- | --- |
| `js/data.js` | All content: realms, sects, encounters, upgrades |
| `js/lore.js` | Tooltip lore, Codex terms and hints |
| `js/core.js` | Game rules, with pacing values in the `P` object at the top |
| `js/ui.js` | Rendering, input, saves and the dantian canvas |
| `css/style.css` | Styling |
| `tests/` | Autoplay bot for checking pacing |

## Check the pacing

Serve the folder and open `/tests/index.html`. A bot plays three seeded runs through the real rules with no saves touched, then prints when it reached each realm and ascended. It also reports any invalid numbers. In the latest run (one seed, playing nonstop), it reached its ninth ascension in about 125 hours. The bot uses every skill on cooldown, so real players will take longer. `tests/worker.js` runs longer simulations off the main thread.
