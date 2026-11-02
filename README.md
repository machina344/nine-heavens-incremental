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

- **Cultivation:** ten realms of nine stages each. Major breakthroughs can fail and injure you, and from Core Formation onward they call down lightning.
- **Spirit roots:** rolled at the start of each life, from a common Five-Spirit Root to a rare Variant Root.
- **Lifespan:** one real second is one month. When your years run out, you are reborn.
- **Sects:** six sects with their own bonuses, seven ranks, timed missions and a treasury.
- **The Hunt:** ten regions of automatic combat, with artifacts in six grades and random bonus stats.
- **Alchemy:** six pills with success rolls and a chance of perfect results.
- **Fate:** temple fortune sticks and branching chance encounters.
- **Rebirth:** karma buys upgrades that carry between lives.
- **Ascension:** Dao Marks buy permanent upgrades. Each heaven costs far more to climb.
- **Saves:** automatic saves in the browser, up to 8 hours of offline progress at half rate, and a copyable save string.

## Project layout

| Path | Purpose |
| --- | --- |
| `js/data.js` | All content: realms, sects, encounters, upgrades |
| `js/core.js` | Game rules, with pacing values in the `P` object at the top |
| `js/ui.js` | Rendering, input, saves and the dantian canvas |
| `css/style.css` | Styling |
| `tests/` | Autoplay bot for checking pacing |

## Check the pacing

Serve the folder and open `/tests/index.html`. A bot plays three seeded runs through the real rules with no saves touched, then prints when it reached each realm and ascended. It also reports any invalid numbers. In the last tuning run across six seeds, its first ascension took about 9 to 24 simulated hours.
