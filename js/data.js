// Static game content. No logic and no DOM access: edit this file to rebalance or add content.
window.WD = window.WD || {};

(function () {
  const STAGES_PER_REALM = 9;

  const REALMS = [
    { name: 'Qi Refining', zh: '炼气', life: 80, color: '#8fc9b0' },
    { name: 'Foundation Establishment', zh: '筑基', life: 120, color: '#7fc4d6' },
    { name: 'Core Formation', zh: '金丹', life: 200, color: '#e2bf62' },
    { name: 'Nascent Soul', zh: '元婴', life: 350, color: '#efa56b' },
    { name: 'Soul Transformation', zh: '化神', life: 600, color: '#e77f7f' },
    { name: 'Void Refinement', zh: '炼虚', life: 900, color: '#c58ee0' },
    { name: 'Body Integration', zh: '合体', life: 1300, color: '#9b9cf0' },
    { name: 'Mahayana', zh: '大乘', life: 1800, color: '#7fb4f5' },
    { name: 'Tribulation Transcendence', zh: '渡劫', life: 2500, color: '#f2efe2' },
    { name: 'Half-Step Immortal', zh: '半仙', life: 3500, color: '#ffe9a3' },
  ];

  const HEAVENS = ['Mortal World', 'First Heaven', 'Second Heaven', 'Third Heaven', 'Fourth Heaven', 'Fifth Heaven',
    'Sixth Heaven', 'Seventh Heaven', 'Eighth Heaven', 'Ninth Heaven'];
  const HEAVEN_ZH = ['凡间', '一重天', '二重天', '三重天', '四重天', '五重天', '六重天', '七重天', '八重天', '九重天'];

  // Spirit roots. `weight` is the roll chance, `mult` multiplies Qi, `count` is how many elements the root splits across.
  // Spirit roots. `mult` multiplies Qi, `count` is how many elements the root splits across.
  // Rolls follow the sliding bell curve in core.js (LADDER_CURVES.root).
  const ROOT_TIERS = [
    { id: 'crippled', name: 'Crippled Root', zh: '残缺灵根', mult: 0.7, count: 5, power: 0.05 },
    { id: 'five', name: 'Five-Spirit Root', zh: '五灵根', mult: 1, count: 5, power: 0.1 },
    { id: 'four', name: 'Four-Spirit Root', zh: '四灵根', mult: 1.35, count: 4, power: 0.2 },
    { id: 'three', name: 'Three-Spirit Root', zh: '三灵根', mult: 1.9, count: 3, power: 0.35 },
    { id: 'dual', name: 'Dual-Spirit Root', zh: '双灵根', mult: 2.8, count: 2, power: 0.55 },
    { id: 'pureDual', name: 'Pure Dual Root', zh: '纯双灵根', mult: 3.6, count: 2, power: 0.7 },
    { id: 'heavenly', name: 'Heavenly Root', zh: '天灵根', mult: 4.5, count: 1, power: 0.9 },
    { id: 'trueHeavenly', name: 'True Heavenly Root', zh: '真天灵根', mult: 6, count: 1, power: 1.1 },
    { id: 'variant', name: 'Variant Root', zh: '异灵根', mult: 7.5, count: 1, power: 1.4, variant: true },
    { id: 'saint', name: 'Saint Root', zh: '圣灵根', mult: 10, count: 1, power: 1.8, variant: true },
    { id: 'immortalBone', name: 'Immortal Bone', zh: '仙骨', mult: 14, count: 1, power: 2.4, variant: true },
    { id: 'chaos', name: 'Chaos Root', zh: '混沌灵根', mult: 20, count: 1, power: 3.2, variant: true },
  ];

  const ELEMENTS = {
    metal: { name: 'Metal', zh: '金', desc: 'attack', fx: 'atk', scale: 1 },
    wood: { name: 'Wood', zh: '木', desc: 'herb yield', fx: 'herbs', scale: 1 },
    water: { name: 'Water', zh: '水', desc: 'breakthrough chance', fx: 'bt', scale: 0.12 },
    fire: { name: 'Fire', zh: '火', desc: 'alchemy success', fx: 'alch', scale: 0.25 },
    earth: { name: 'Earth', zh: '土', desc: 'vitality', fx: 'hp', scale: 1 },
  };
  const VARIANTS = {
    thunder: { name: 'Thunder', zh: '雷', desc: 'tribulation resistance', fx: 'trib', scale: 1 },
    ice: { name: 'Ice', zh: '冰', desc: 'less Qi deviation', fx: 'dev', scale: -0.45 },
    wind: { name: 'Wind', zh: '风', desc: 'faster sect missions', fx: 'mission', scale: 0.6 },
  };

  // Qi techniques: one per realm. Power and cost come from TECH_SCALE in core.js.
  const QI_TECHS = [
    ['Breath Regulation Scripture', '吐纳诀'], ['Flowing Cloud Heart Method', '流云心法'],
    ['Returning Tide Art', '潮汐归元功'], ['Golden Furnace Sutra', '金炉真经'],
    ['Infant Spirit Mantra', '元神咒'], ['Sea of Stars Method', '星海诀'],
    ['Void-Swallowing Canon', '吞虚宝典'], ['Unity of Heaven and Man', '天人合一功'],
    ['Great Vehicle Scripture', '大乘经'], ['Primordial Chaos Classic', '混元太初经'],
  ];
  const ATK_TECHS = [
    ['Green Willow Sword', '青柳剑法'], ['Falling Star Palm', '落星掌'], ['Nine Yang Blade', '九阳刀诀'],
    ['Heaven-Rending Finger', '裂天指'], ['Sword of Ten Thousand Returns', '万剑归宗'],
  ];
  const HP_TECHS = [
    ['Iron Shirt Training', '铁布衫'], ['Bronze Bone Tempering', '铜骨功'], ['Golden Bell Shield', '金钟罩'],
    ['Diamond Body Sutra', '金刚不坏身'], ['Undying Dragon Physique', '不灭龙躯'],
  ];

  const SECTS = [
    { id: 'azure', name: 'Azure Cloud Sword Sect', zh: '青云剑宗', motto: 'One sword, one path.',
      desc: 'Orthodox sword cultivators. Stronger in the hunt, steadier in the storm.', fx: { atk: 0.5, trib: 0.1 } },
    { id: 'herb', name: 'Myriad Herb Valley', zh: '百草谷', motto: 'Every weed is a medicine unread.',
      desc: 'Alchemists of the southern valleys. Herbs and pills come easily.', fx: { herbs: 0.6, alch: 0.1 } },
    { id: 'iron', name: 'Iron Bone Monastery', zh: '铁骨寺', motto: 'The body is the first temple.',
      desc: 'Body cultivators who sit under waterfalls and lightning.', fx: { hp: 0.6, trib: 0.3 } },
    { id: 'moon', name: 'Moon Shadow Pavilion', zh: '月影阁', motto: 'Fortune favours those unseen.',
      desc: 'Assassins and fortune-tellers. Rare finds and quick missions.', fx: { luck: 8, mission: 0.2 } },
    { id: 'blood', name: 'Blood River Cult', zh: '血河教', motto: 'Take what heaven withholds.',
      desc: 'Demonic path. Enormous Qi, but your cultivation is prone to deviation.', fx: { qi: 0.5, dev: 0.5, bt: -0.04 } },
    { id: 'abacus', name: 'Golden Abacus Guild', zh: '金算盟', motto: 'Even the heavens keep accounts.',
      desc: 'Merchant cultivators. Spirit stones flow to them like rivers.', fx: { stones: 0.7, luck: 2 } },
  ];

  const SECT_RANKS = [
    { name: 'Outer Disciple', zh: '外门弟子', need: 0 },
    { name: 'Inner Disciple', zh: '内门弟子', need: 100 },
    { name: 'Core Disciple', zh: '核心弟子', need: 800 },
    { name: 'True Disciple', zh: '真传弟子', need: 6000 },
    { name: 'Elder', zh: '长老', need: 50000 },
    { name: 'Grand Elder', zh: '太上长老', need: 500000 },
    { name: 'Sect Master', zh: '宗主', need: 6000000 },
  ];

  const MISSIONS = [
    { name: 'Sweep the mountain gate', dur: 15, chance: 1, reward: { contribution: 0.7 } },
    { name: 'Gather herbs on the north slope', dur: 25, chance: 0.95, reward: { contribution: 1, herbs: 2 } },
    { name: 'Escort a merchant caravan', dur: 40, chance: 0.85, reward: { contribution: 1.5, stones: 6 } },
    { name: 'Cull demonic beasts', dur: 45, chance: 0.8, reward: { contribution: 2.2, stones: 3 } },
    { name: 'Guard the spirit vein', dur: 60, chance: 0.9, reward: { contribution: 2.5 } },
    { name: 'Investigate a rogue cultivator', dur: 70, chance: 0.7, reward: { contribution: 3.8, item: 0.15 } },
    { name: 'Explore a collapsed ruin', dur: 90, chance: 0.6, reward: { contribution: 5, herbs: 5, item: 0.35 } },
    { name: 'Challenge a rival sect envoy', dur: 120, chance: 0.55, reward: { contribution: 8, stones: 15 } },
  ];

  const REGIONS = [
    { name: 'Bamboo Outskirts', zh: '竹林外围', foes: ['Wild Boar', 'Grey Wolf', 'Bamboo Viper'] },
    { name: 'Misty Peaks', zh: '云雾山', foes: ['Cloud Ape', 'Mist Serpent', 'Rogue Disciple'] },
    { name: 'Blackwater Marsh', zh: '黑水泽', foes: ['Marsh Wraith', 'Poison Toad', 'Bone Crocodile'] },
    { name: 'Crimson Desert', zh: '赤沙漠', foes: ['Sand Scorpion King', 'Flame Lizard', 'Desert Ghoul'] },
    { name: 'Frozen Abyss', zh: '冰渊', foes: ['Ice Jiao', 'Frost Yaksha', 'Soul-Eating Yeti'] },
    { name: 'Sunken Immortal Palace', zh: '沉仙宫', foes: ['Stone Guardian', 'Drowned Immortal', 'Puppet General'] },
    { name: 'Demon Sea', zh: '魔海', foes: ['Demon Admiral', 'Abyssal Kraken', 'Heart Devil'] },
    { name: 'Star Graveyard', zh: '星墓', foes: ['Starlight Corpse', 'Void Beast', 'Comet Spirit'] },
    { name: 'Primal Battlefield', zh: '太古战场', foes: ['Ancient War Soul', 'Taotie Spawn', 'Fallen Deva'] },
    { name: 'Gate of Heaven', zh: '南天门', foes: ['Heavenly Soldier', 'Thunder Marshal', 'Celestial General'] },
  ];

  // 24 artifact grades. Each is 1.9× stronger than the last. Drop odds follow gradeCurve in core.js.
  const RARITIES = [
    ['Common', '凡', '#a9b0a8'], ['Fine', '良', '#c9cfc4'], ['Spirit', '灵', '#7fcf9e'], ['Greater Spirit', '上灵', '#4fd08d'],
    ['Treasure', '宝', '#74b6ea'], ['Greater Treasure', '上宝', '#4c9bf0'], ['Profound', '玄', '#8f94f2'], ['Earth', '地', '#c896ec'],
    ['Greater Earth', '上地', '#d97ee8'], ['Heaven', '天', '#f0bf5c'], ['Greater Heaven', '上天', '#f5a742'], ['Saint', '圣', '#f58b5a'],
    ['Greater Saint', '上圣', '#f56f5a'], ['Immortal', '仙', '#ff7f8f'], ['True Immortal', '真仙', '#ff6fb0'], ['Golden Immortal', '金仙', '#ffd76a'],
    ['Taiyi', '太乙', '#fff08a'], ['Daluo', '大罗', '#a8fff0'], ['Immortal King', '仙王', '#8ff0ff'], ['Immortal Emperor', '仙帝', '#b9c8ff'],
    ['Dao', '道', '#e6d2ff'], ['Dao Ancestor', '道祖', '#ffe0f4'], ['Primordial', '鸿蒙', '#fff6d8'], ['Chaos Origin', '混沌', '#ffffff'],
  ].map((r, i) => ({ name: r[0], zh: r[1], color: r[2], mult: Math.pow(1.9, i), shimmer: i >= 15 }));

  const GEAR_SLOTS = {
    weapon: { name: 'Weapon', zh: '器', stat: 'Attack', nouns: ['Sword', 'Saber', 'Spear', 'Fan', 'Whisk'] },
    robe: { name: 'Robe', zh: '袍', stat: 'Vitality', nouns: ['Robe', 'Daoist Vestment', 'Scale Armor', 'Mantle'] },
    ring: { name: 'Ring', zh: '戒', stat: 'Qi', nouns: ['Ring', 'Jade Pendant', 'Bead String'] },
    talisman: { name: 'Talisman', zh: '符', stat: 'Stones', nouns: ['Talisman', 'Seal', 'Mirror', 'Gourd'] },
  };
  const GEAR_ADJ = ['Azure', 'Cinder', 'Moonlit', 'Jade', 'Thunder', 'Frostbound', 'Nine-Coiled', 'Ghostly', 'Dragonbone', 'Phoenix', 'Unfading', 'Starfallen'];
  const AFFIXES = [
    { fx: 'qi', label: 'Qi', base: 0.05 }, { fx: 'atk', label: 'attack', base: 0.08 }, { fx: 'hp', label: 'vitality', base: 0.08 },
    { fx: 'stones', label: 'stones', base: 0.08 }, { fx: 'herbs', label: 'herbs', base: 0.1 },
    { fx: 'luck', label: 'luck', base: 1, flat: true }, { fx: 'bt', label: 'breakthrough', base: 0.005, flat: true, pct: true },
    { fx: 'trib', label: 'tribulation resistance', base: 0.06 },
  ];

  const PILLS = [
    { id: 'gather', name: 'Qi Gathering Pill', zh: '聚气丹', herbs: 3, stones: 5, chance: 0.9, stage: 0,
      desc: 'Doubles Qi for 2 minutes.' },
    { id: 'heal', name: 'Bone-Mending Pill', zh: '续骨丹', herbs: 4, stones: 6, chance: 0.85, stage: 0,
      desc: 'Cures injury and restores full vitality.' },
    { id: 'foundation', name: 'Foundation Pill', zh: '筑基丹', herbs: 10, stones: 25, chance: 0.65, stage: 5,
      desc: 'Next major breakthrough +12% chance. Stacks to 3.' },
    { id: 'insight', name: 'Enlightenment Pill', zh: '悟道丹', herbs: 14, stones: 40, chance: 0.6, stage: 9,
      desc: 'Instantly grants 3 minutes of Qi.' },
    { id: 'longevity', name: 'Longevity Pill', zh: '延寿丹', herbs: 25, stones: 80, chance: 0.5, stage: 14,
      desc: 'Adds 15 years to your lifespan. Works 8 times per life.' },
    { id: 'marrow', name: 'Marrow Washing Pill', zh: '洗髓丹', herbs: 60, stones: 300, chance: 0.35, stage: 20,
      desc: 'Rerolls your spirit root and keeps the better result.' },
  ];

  // Sticks of fate, from worst to best.
  const FORTUNES = [
    { name: 'Great Calamity', zh: '大凶', weight: 6, secs: 120, fx: { qi: -0.4, luck: -10 }, text: 'The stick falls cracked. Tread softly.' },
    { name: 'Misfortune', zh: '凶', weight: 14, secs: 120, fx: { stones: -0.25 }, text: 'Coins slip through your fingers.' },
    { name: 'Lesser Fortune', zh: '末吉', weight: 24, secs: 180, fx: { herbs: 0.3 }, text: 'A small mercy grows by the road.' },
    { name: 'Modest Fortune', zh: '小吉', weight: 26, secs: 180, fx: { qi: 0.3 }, text: 'The wind is at your back.' },
    { name: 'Good Fortune', zh: '吉', weight: 18, secs: 240, fx: { qi: 0.6, stones: 0.4 }, text: 'Spirit veins stir beneath your feet.' },
    { name: 'Fine Fortune', zh: '中吉', weight: 9, secs: 240, fx: { qi: 1, luck: 10, bt: 0.05 }, text: 'Heaven glances your way.' },
    { name: 'Supreme Fortune', zh: '大吉', weight: 3, secs: 300, fx: { qi: 2, stones: 1, luck: 25, bt: 0.12 }, text: 'Purple qi rises from the east for three thousand li.' },
  ];

  // effects: qiSec, stones (× current stone unit), herbs, item, buff, injury (secs), years, karma, contribution
  const ENCOUNTERS = [
    { title: 'A Beggar at the Crossroads', zh: '路遇乞丐', text: 'A filthy old man holds out a cracked bowl. His eyes are far too clear.',
      choices: [
        { label: 'Give him spirit stones', cost: { stones: 3 }, chance: 0.6, win: { qiSec: 180, text: 'He taps your forehead and vanishes. A breathing method blooms in your mind.' }, lose: { text: 'He bites the stone, nods, and wanders off. Only a beggar after all.' } },
        { label: 'Walk on', chance: 1, win: { text: 'You walk on. Behind you, someone laughs softly.' } },
      ] },
    { title: 'Hidden Cave Abode', zh: '洞府', text: 'Behind a waterfall, you find the sealed cave of a dead cultivator. The formation is still faintly alive.',
      choices: [
        { label: 'Force the seal', chance: 0.55, win: { item: true, stones: 8, text: 'The seal breaks. A dead immortal\'s treasure is yours.' }, lose: { injury: 45, text: 'The formation lashes out and sears your meridians.' } },
        { label: 'Study the formation', chance: 0.9, win: { qiSec: 90, text: 'You leave the treasure and take the insight.' }, lose: { text: 'Its logic escapes you. You leave with nothing.' } },
      ] },
    { title: 'Thousand-Year Lingzhi', zh: '千年灵芝', text: 'A lingzhi glows in a cliff crack. A python as thick as a temple pillar sleeps around it.',
      choices: [
        { label: 'Steal it quietly', chance: 0.5, win: { herbs: 25, text: 'You slip away with an armful of spirit herbs.' }, lose: { injury: 40, herbs: 3, text: 'The python wakes. You escape bleeding, with a few torn leaves.' } },
        { label: 'Fight the python', power: true, chance: 0.5, win: { herbs: 15, stones: 6, text: 'The serpent falls. Its core and the herb are both yours.' }, lose: { injury: 60, text: 'Its coils crack your ribs.' } },
      ] },
    { title: 'Young Master of the Lin Clan', zh: '林家少主', text: '"Do you know who my father is?" A young master blocks the road and insults your ancestors for eighteen generations.',
      choices: [
        { label: 'Slap him', chance: 0.65, win: { stones: 12, item: true, text: 'He flies twenty paces. His guards drop their purses and flee.' }, lose: { injury: 40, text: 'His clan elder steps out of the shadows. You limp home.' } },
        { label: 'Swallow the insult', chance: 1, win: { buff: 'patience', text: 'A gentleman\'s revenge is not late after ten years. Your resolve hardens.' } },
      ] },
    { title: 'Auction at Heavenly Treasure Hall', zh: '天宝阁', text: 'A veiled auctioneer unveils a nameless rusted blade. No one bids. Something in your blood stirs.',
      choices: [
        { label: 'Bid your purse', cost: { stones: 8 }, chance: 0.7, win: { item: true, text: 'Dust falls away from a true treasure. The hall gasps too late.' }, lose: { text: 'It was, in fact, a rusted blade.' } },
        { label: 'Keep your stones', chance: 1, win: { text: 'Someone else buys it. You will wonder about it for years.' } },
      ] },
    { title: 'Heart Demon', zh: '心魔', text: 'In deep meditation a figure wearing your face asks what you gave up to walk this path.',
      choices: [
        { label: 'Face it', chance: 0.6, win: { qiSec: 240, buff: 'clarity', text: 'You answer honestly. It bows and fades, and your mind is a still lake.' }, lose: { injury: 60, text: 'Your Qi turns against you. You wake coughing blood.' } },
        { label: 'Break meditation', chance: 1, win: { years: -1, text: 'You flee your own thoughts. A year passes in troubled dreams.' } },
      ] },
    { title: 'Old Friend on Her Deathbed', zh: '故人', text: 'A mortal friend from your village is dying of old age. The trip home would cost you time.',
      choices: [
        { label: 'Go to her', chance: 1, win: { years: -2, karma: 2, text: 'You hold her hand as the sun sets. Karma remembers.' } },
        { label: 'Stay in seclusion', chance: 1, win: { qiSec: 120, text: 'Word reaches you months later. Immortals do not weep, you remind yourself.' } },
      ] },
    { title: 'Falling Star', zh: '流星', text: 'A meteor craters the valley below. Three rival cultivators are already racing for it.',
      choices: [
        { label: 'Race them', chance: 0.5, win: { stones: 20, text: 'Star-iron! You sell it at a shameless price.' }, lose: { injury: 30, stones: 1, text: 'You arrive third and leave with bruises and a shard.' } },
        { label: 'Watch from afar', chance: 0.4, win: { buff: 'clarity', text: 'Watching its light fade, you glimpse the shape of the Dao.' }, lose: { text: 'It is a very nice meteor.' } },
      ] },
    { title: 'Wine-Drunk Sword Immortal', zh: '醉剑仙', text: 'A drunk sits on your roof. "Pour for me and I\'ll show you one sword form. Just one."',
      choices: [
        { label: 'Buy the best wine', cost: { stones: 4 }, chance: 0.8, win: { buff: 'swordheart', text: 'One form cuts the moon\'s reflection in half. You will spend years understanding it.' }, lose: { text: 'He drinks it all and starts snoring.' } },
        { label: 'Chase him off', chance: 1, win: { text: 'He shrugs and walks up into the clouds.' } },
      ] },
    { title: 'Blood Pool Temptation', zh: '血池', text: 'A demonic altar pulses with stolen life. Its power is right there, and no one is watching.',
      choices: [
        { label: 'Drink deeply', chance: 0.75, win: { qiSec: 480, years: -3, text: 'Power floods you. Something behind your eyes ages.' }, lose: { injury: 90, years: -5, text: 'The pool drinks you back.' } },
        { label: 'Destroy the altar', chance: 1, win: { karma: 1, contribution: 15, text: 'The righteous path pays poorly, but it pays.' } },
      ] },
    { title: 'Stranded Fox Spirit', zh: '狐仙', text: 'A white fox with two tails is caught in a hunter\'s trap. It looks at you and says nothing.',
      choices: [
        { label: 'Free it', chance: 0.7, win: { buff: 'foxluck', text: 'That night, a jade token appears on your pillow and your luck turns.' }, lose: { text: 'It bites you and bolts. Foxes are like that.' } },
        { label: 'Sell its pelt', chance: 1, win: { stones: 7, karma: -1, text: 'A good price. You sleep poorly.' } },
      ] },
  ];

  const ENCOUNTER_BUFFS = {
    patience: { name: 'Hardened Resolve', secs: 300, fx: { bt: 0.08 } },
    clarity: { name: 'Still Lake Mind', secs: 240, fx: { qi: 0.75, dev: -0.3 } },
    swordheart: { name: 'Sword Heart', secs: 300, fx: { atk: 1 } },
    foxluck: { name: 'Fox Fortune', secs: 300, fx: { luck: 20 } },
    gather: { name: 'Qi Gathering', secs: 120, fx: { qi: 1 } },
  };

  // Karma: spent between lives, reset by ascension. fx values apply per level.
  const KARMA_UPS = [
    { id: 'insight', name: 'Past-Life Insight', zh: '宿慧', base: 3, growth: 1.55, max: 40, fx: { qi: 0.3 }, desc: '+30% Qi per level.' },
    { id: 'wealth', name: 'Buried Fortune', zh: '遗财', base: 4, growth: 1.6, max: 25, fx: { stones: 0.25 }, desc: '+25% spirit stones per level.' },
    { id: 'thread', name: 'Long Red Thread', zh: '长寿缘', base: 5, growth: 1.7, max: 15, fx: { life: 0.1 }, desc: '+10% lifespan per level.' },
    { id: 'fate', name: 'Favoured by Fate', zh: '天命', base: 6, growth: 1.7, max: 20, fx: { luck: 3 }, desc: '+3 luck per level.' },
    { id: 'heart', name: 'Steady Dao Heart', zh: '道心', base: 8, growth: 1.8, max: 10, fx: { bt: 0.03, dev: -0.05 }, desc: '+3% breakthrough and less deviation per level.' },
    { id: 'martial', name: 'Battle Memories', zh: '战忆', base: 5, growth: 1.6, max: 25, fx: { atk: 0.3, hp: 0.3 }, desc: '+30% attack and vitality per level.' },
    { id: 'autoStage', name: 'Effortless Circulation', zh: '行云', base: 10, growth: 1, max: 1, unlock: 'autoStage', desc: 'Unlocks automatic minor stage advances.' },
    { id: 'autoTech', name: 'Inherited Manuals', zh: '传承', base: 25, growth: 1, max: 1, unlock: 'autoTech', desc: 'Unlocks automatic technique study.' },
  ];

  // Dao Marks: permanent across everything.
  const DAO_UPS = [
    { id: 'origin', name: 'Dao of Origin', zh: '本源', base: 1, growth: 1.8, max: 30, fx: { qi: 1 }, desc: '+100% Qi per level.' },
    { id: 'slaughter', name: 'Dao of Slaughter', zh: '杀戮', base: 1, growth: 1.8, max: 30, fx: { atk: 1, hp: 0.5 }, desc: '+100% attack, +50% vitality per level.' },
    { id: 'wealthd', name: 'Dao of Abundance', zh: '丰饶', base: 1, growth: 1.8, max: 30, fx: { stones: 1, herbs: 0.5 }, desc: '+100% stones, +50% herbs per level.' },
    { id: 'time', name: 'Dao of Time', zh: '光阴', base: 2, growth: 2, max: 10, fx: { life: 0.5 }, desc: '+50% lifespan per level.' },
    { id: 'fortune', name: 'Dao of Fortune', zh: '气运', base: 2, growth: 2, max: 10, fx: { luck: 10, bt: 0.02 }, desc: '+10 luck, +2% breakthrough per level.' },
    { id: 'thunder', name: 'Dao of Thunder', zh: '天雷', base: 2, growth: 2, max: 10, fx: { trib: 0.5 }, desc: '+50% tribulation resistance per level.' },
    { id: 'stillness', name: 'Dao of Stillness', zh: '清静', base: 2, growth: 2, max: 6, fx: {}, desc: '+2% seclusion income and +1 hour of seclusion per level.' },
    { id: 'karmaKeep', name: 'Unbroken Wheel', zh: '轮回不灭', base: 3, growth: 2, max: 5, fx: {}, desc: 'Keep 20% of unspent and invested karma per level when ascending.' },
    { id: 'autoMajor', name: 'Heart Without Doubt', zh: '无疑', base: 4, growth: 1, max: 1, unlock: 'autoMajor', desc: 'Unlocks automatic major breakthroughs.' },
    { id: 'autoHunt', name: 'Sect Runs Itself', zh: '无为', base: 3, growth: 1, max: 1, unlock: 'autoMission', desc: 'Unlocks automatic sect missions.' },
  ];

  const FEATS = [
    { id: 'first', name: 'First Breath', desc: 'Reach Qi Refining stage 2.', test: (S) => S.stage >= 1 },
    { id: 'foundation', name: 'A Foundation Laid', desc: 'Reach Foundation Establishment.', test: (S) => S.best >= 9 },
    { id: 'core', name: 'The Golden Core', desc: 'Reach Core Formation.', test: (S) => S.best >= 18 },
    { id: 'nascent', name: 'Born Again Within', desc: 'Reach Nascent Soul.', test: (S) => S.best >= 27 },
    { id: 'soul', name: 'Beyond Flesh', desc: 'Reach Soul Transformation.', test: (S) => S.best >= 36 },
    { id: 'mahayana', name: 'The Great Vehicle', desc: 'Reach Mahayana.', test: (S) => S.best >= 63 },
    { id: 'ascend', name: 'Through the Southern Gate', desc: 'Ascend for the first time.', test: (S) => S.ascensions >= 1 },
    { id: 'ninth', name: 'Ninth Heaven', desc: 'Ascend nine times.', test: (S) => S.ascensions >= 9 },
    { id: 'hands', name: 'Calloused Palms', desc: 'Circulate Qi by hand 500 times.', test: (S) => S.stats.clicks >= 500 },
    { id: 'slayer', name: 'Scourge of Beasts', desc: 'Defeat 1,000 foes.', test: (S) => S.stats.kills >= 1000 },
    { id: 'alchemist', name: 'Furnace Never Cold', desc: 'Refine 100 pills.', test: (S) => S.stats.pills >= 100 },
    { id: 'reborn', name: 'Wheel of Rebirth', desc: 'Live five lives.', test: (S) => S.stats.lives >= 5 },
    { id: 'heavenly', name: 'Chosen of Heaven', desc: 'Awaken a Heavenly Root or better.', test: (S) => S.stats.bestRoot >= 6 },
    { id: 'immortalItem', name: 'Treasure of the Immortals', desc: 'Find an Immortal-grade artifact.', test: (S) => S.stats.bestRarity >= 13 },
    { id: 'master', name: 'One Who Commands', desc: 'Become a Sect Master.', test: (S) => S.stats.bestRank >= 6 },
    { id: 'storm', name: 'Lightning Rod', desc: 'Survive 5 heavenly tribulations.', test: (S) => S.stats.tribs >= 5 },
    { id: 'blessed', name: 'Purple Qi from the East', desc: 'Draw a Supreme Fortune.', test: (S) => S.stats.supreme >= 1 },
    { id: 'wanderer', name: 'Rivers and Lakes', desc: 'Resolve 25 chance encounters.', test: (S) => S.stats.encounters >= 25 },
  ];

  // ---------- the immortal realms: each ascension opens one more ----------
  REALMS.push(
    { name: 'Earth Immortal', zh: '地仙', life: 5000, color: '#b8e6a0' },
    { name: 'Heaven Immortal', zh: '天仙', life: 7000, color: '#a0e6d8' },
    { name: 'True Immortal', zh: '真仙', life: 9000, color: '#a0d0ff' },
    { name: 'Golden Immortal', zh: '金仙', life: 12000, color: '#ffd76a' },
    { name: 'Taiyi Golden Immortal', zh: '太乙金仙', life: 16000, color: '#fff08a' },
    { name: 'Daluo Golden Immortal', zh: '大罗金仙', life: 21000, color: '#a8fff0' },
    { name: 'Immortal King', zh: '仙王', life: 28000, color: '#8ff0ff' },
    { name: 'Immortal Emperor', zh: '仙帝', life: 36000, color: '#c9b9ff' },
    { name: 'Dao Ancestor', zh: '道祖', life: 48000, color: '#ffe0f4' },
    { name: 'Primordial Sovereign', zh: '鸿蒙主', life: 64000, color: '#ffffff' },
  );
  QI_TECHS.push(
    ['Earth Immortal Breathing Canon', '地仙吐纳经'], ['Nine Revolutions Golden Elixir', '九转金丹诀'], ['True Spirit Sutra', '真灵经'],
    ['Golden Light Immortal Art', '金光仙诀'], ['Supreme Unity Scripture', '太乙真经'], ['Great Net of Heaven Method', '大罗天功'],
    ['Immortal King Heart Canon', '仙王心经'], ['Emperor of Stars Method', '星帝诀'], ['Three Thousand Great Daos', '三千大道经'], ['Before Heaven and Earth', '先天鸿蒙诀'],
  );
  ATK_TECHS.push(['Immortal Slaying Sword', '诛仙剑阵'], ['Palm of the Buddha Kingdom', '佛国神掌'], ['Star-Shattering Fist', '碎星拳'], ['Reincarnation Blade', '轮回刀'], ['One Sword Opens Heaven', '一剑开天']);
  HP_TECHS.push(['Immortal Jade Skin', '仙玉肌'], ['Nine Revolutions Body', '九转玄功'], ['Star-Forged Bones', '星骨诀'], ['Eternal Spring Body', '长春不老身'], ['Chaos Body', '混沌体']);
  REGIONS.push(
    { name: 'Floating Isles of Penglai', zh: '蓬莱', foes: ['Crane Immortal', 'Peach Guardian', 'Exiled Sage'] },
    { name: 'Kunlun Summit', zh: '昆仑', foes: ['Kaiming Beast', 'Jade Maiden Sentinel', 'Snow Qilin'] },
    { name: 'River of Forgetting', zh: '忘川', foes: ['Ox-Head Guard', 'Horse-Face Guard', 'Meng Po\'s Ghost'] },
    { name: 'Thirty-Three Heavens', zh: '三十三天', foes: ['Heavenly King', 'Celestial Marshal', 'Star Lord'] },
    { name: 'Fusang Tree', zh: '扶桑', foes: ['Golden Crow', 'Sun Chariot Spirit', 'Burning Roc'] },
    { name: 'Palace of Purple Tenuity', zh: '紫微宫', foes: ['Dipper Star God', 'Jade Emperor\'s Hound', 'Astral Judge'] },
    { name: 'Sea of Blood', zh: '血海', foes: ['Asura Lord', 'Blood God Avatar', 'Slaughter Incarnate'] },
    { name: 'Ruins of the First Gods', zh: '神墟', foes: ['Fallen Ancestor God', 'Bone of Pangu', 'Nameless Deity'] },
    { name: 'Boundary of All Daos', zh: '大道边境', foes: ['Dao Fragment', 'Law Incarnate', 'Causality Weaver'] },
    { name: 'Primordial Chaos', zh: '混沌海', foes: ['Hundun', 'Chaos Demon God', 'That Which Precedes'] },
  );

  // ---------- more sects: 16 in all ----------
  SECTS.push(
    { id: 'vajra', name: 'Vajra Bodhi Temple', zh: '金刚寺', motto: 'Put down the blade, and it still cuts.', desc: 'Warrior monks with unbreakable bodies and steady hearts.', fx: { hp: 0.4, atk: 0.2, dev: -0.3 } },
    { id: 'taiyi', name: 'Supreme Harmony Sect', zh: '太和派', motto: 'Softness overcomes the hard.', desc: 'Taoists of the misty mountain. Their internal arts are the purest in the land.', fx: { qi: 0.3, bt: 0.03 } },
    { id: 'beggar', name: 'Sect of Nine Pouches', zh: '九袋帮', motto: 'The whole road is our house.', desc: 'The largest gang under heaven. Their eyes are in every alley.', fx: { mission: 0.4, stones: 0.2, luck: 3 } },
    { id: 'tang', name: 'Tang Clan of Sichuan', zh: '蜀中唐门', motto: 'You will not see it coming.', desc: 'Masters of poison and hidden weapons. They strike first and only once.', fx: { atk: 0.7, hp: -0.15 } },
    { id: 'venom', name: 'Five Venoms Cult', zh: '五毒教', motto: 'Every poison is a teacher.', desc: 'Miao gu-masters of the southern jungles. Poison feeds their furnaces.', fx: { herbs: 0.4, alch: 0.08, atk: 0.2 } },
    { id: 'peach', name: 'Peach Blossom Isle', zh: '桃花岛', motto: 'The maze keeps out all but the worthy.', desc: 'Eccentric scholars of music, formations and medicine.', fx: { qi: 0.15, luck: 5, alch: 0.05 } },
    { id: 'ice', name: 'Palace of Frozen Moon', zh: '冰月宫', motto: 'A still heart does not crack.', desc: 'Cultivators in the far north whose minds never waver.', fx: { dev: -0.5, bt: 0.05 } },
    { id: 'thunder', name: 'Thunder Fort of Pili', zh: '霹雳堡', motto: 'Heaven strikes. We strike back.', desc: 'Explosive-tempered clan who temper themselves in storms.', fx: { trib: 0.5, atk: 0.25 } },
    { id: 'ghost', name: 'Ghost Valley School', zh: '鬼谷门', motto: 'The world is a board. Move first.', desc: 'Strategists and fortune tellers who bend fate.', fx: { luck: 10, stones: 0.15 } },
    { id: 'beast', name: 'Hundred Beasts Manor', zh: '万兽山庄', motto: 'Raise them well and they will rule beside you.', desc: 'Tamers of spirit beasts. Their companions are stronger.', fx: { beast: 0.75, hp: 0.15 } },
  );
  SECTS.forEach((s) => { s.align = { blood: 'Demonic', venom: 'Demonic', ghost: 'Unorthodox', tang: 'Unorthodox', beggar: 'Unorthodox', abacus: 'Unorthodox', moon: 'Unorthodox', peach: 'Unorthodox', beast: 'Unorthodox' }[s.id] || 'Righteous'; });
  SECT_RANKS.push({ name: 'Supreme Ancestor', zh: '开派祖师', need: 8e7 }, { name: 'Living Legend of the Sect', zh: '万古宗师', need: 1.2e9 });

  // ---------- combat skills ----------
  // mult: damage × attack. heal: fraction of vitality. guard: seconds of guard. stun: seconds. momentum: flat gain. loot: next kill pays double.
  const SKILLS = [
    { id: 'slash', name: 'Sword Qi Slash', zh: '剑气斩', stage: 0, cd: 6, mult: 4, desc: 'A fast blade of Qi. 4× attack.' },
    { id: 'guard', name: 'Golden Bell Guard', zh: '金钟护体', stage: 3, cd: 10, guard: 4, desc: 'Guard for 4s. Time it against a charged blow to parry it, stun the foe and gain Momentum.' },
    { id: 'burst', name: 'True Qi Burst', zh: '真气爆', stage: 9, cd: 18, mult: 10, desc: 'A release of inner force. 10× attack.' },
    { id: 'drain', name: 'Star-Absorbing Art', zh: '吸星大法', stage: 18, cd: 20, mult: 3, heal: 0.3, desc: '3× attack and restores 30% vitality.' },
    { id: 'execute', name: 'Final Form', zh: '绝杀式', stage: 27, cd: 24, mult: 3, exec: 30, desc: '3× attack, or 30× if the foe is under 30% health.' },
  ];
  const SECT_SKILLS = {
    azure: { name: 'Ten Thousand Swords Return', zh: '万剑归宗', cd: 25, mult: 18, momentum: 25, desc: '18× attack and +25 Momentum.' },
    herb: { name: 'Hundred Herb Restoration', zh: '百草回春', cd: 22, mult: 2, heal: 0.6, loot: true, desc: 'Restores 60% vitality. The next kill pays double.' },
    iron: { name: 'Immovable Mountain', zh: '不动如山', cd: 18, guard: 7, mult: 5, desc: '5× attack and guard for 7s.' },
    moon: { name: 'Moonless Assassination', zh: '无月刺杀', cd: 22, mult: 6, exec: 50, desc: '6× attack, or 50× under 30% health.' },
    blood: { name: 'River of Blood', zh: '血河大法', cd: 16, mult: 16, heal: 0.15, hurt: 0.2, desc: '16× attack, spends 20% vitality, then drains 15%.' },
    abacus: { name: 'Golden Coin Barrage', zh: '金钱镖', cd: 18, mult: 8, loot: true, desc: '8× attack. The next kill pays double.' },
    vajra: { name: 'Eighteen Dragon Vajra Palm', zh: '金刚伏魔掌', cd: 20, mult: 9, stun: 3, desc: '9× attack and stuns for 3s.' },
    taiyi: { name: 'Great Ultimate Circle', zh: '太极圆转', cd: 20, mult: 6, guard: 3, heal: 0.2, desc: '6× attack, guard 3s, heals 20%.' },
    beggar: { name: 'Dog-Beating Staff', zh: '打狗棒法', cd: 14, mult: 7, stun: 2, desc: '7× attack and stuns for 2s.' },
    tang: { name: 'Rain of Pear Blossom Needles', zh: '暴雨梨花针', cd: 24, mult: 30, desc: '30× attack from nowhere.' },
    venom: { name: 'Five Venom Mist', zh: '五毒迷雾', cd: 20, mult: 12, stun: 2, desc: '12× attack and stuns for 2s.' },
    peach: { name: 'Jade Flute Melody', zh: '碧海潮生曲', cd: 22, mult: 5, stun: 5, momentum: 20, desc: '5× attack, stuns for 5s, +20 Momentum.' },
    ice: { name: 'Frozen Soul Palm', zh: '寒魄神掌', cd: 22, mult: 8, stun: 4, desc: '8× attack and freezes for 4s.' },
    thunder: { name: 'Nine Heavens Thunderclap', zh: '九天霹雳', cd: 26, mult: 26, desc: '26× attack of pure lightning.' },
    ghost: { name: 'Calculated Death', zh: '算无遗策', cd: 24, mult: 6, exec: 40, loot: true, desc: '6× or 40× under 30% health. The next kill pays double.' },
    beast: { name: 'Beast Tide', zh: '万兽奔腾', cd: 20, mult: 14, momentum: 15, desc: '14× attack and +15 Momentum.' },
  };

  // Rivals of the Martial Tournament, weakest first.
  const RIVALS = [
    ['Lin Xiaofeng', 'Young Hero of Qingyang'], ['Su Wan', 'Jade Needle'], ['Iron Fist Zhao', 'Terror of the Canal'], ['Murong Bai', 'Prodigy of Gusu'],
    ['Abbot Wuchen', 'Dustless Monk'], ['Ye Gucheng', 'White Cloud Swordsman'], ['Madam Hua', 'Flower Who Kills'], ['Duan Tianya', 'Lord of the Horizon'],
    ['Old Man Tianji', 'Heaven\'s Abacus'], ['Dugu Wuming', 'Who Seeks Defeat'], ['Xuanyuan Mo', 'Demon Emperor'], ['The Masked Swordsman', 'First Under Heaven'],
  ];

  // Fame titles in the martial world (jianghu).
  const TITLES = [
    ['Nameless Wanderer', '无名小卒', 0], ['Road Rumour', '略有薄名', 25], ['Teahouse Tale', '茶馆传闻', 150], ['Rising Hero', '后起之秀', 800],
    ['Renowned Hero', '成名侠客', 4000], ['Hero of the Region', '一方豪杰', 2e4], ['Great Master', '一代宗师', 1e5], ['Pillar of the Jianghu', '武林砥柱', 5e5],
    ['Leader of the Martial World', '武林盟主', 3e6], ['Peerless Under Heaven', '天下无双', 2e7], ['Legend of Ten Thousand Years', '万古传说', 2e8], ['Heaven-Defying One', '逆天者', 3e9],
  ].map((t) => ({ name: t[0], zh: t[1], need: t[2] }));

  // Twelve regular meridians then the eight extraordinary vessels. Opened in order, one every 4 stages.
  const MERIDIANS = [
    ['Lung Channel', '手太阴肺经', { qi: 0.2 }], ['Large Intestine Channel', '手阳明大肠经', { atk: 0.2 }], ['Stomach Channel', '足阳明胃经', { hp: 0.25 }],
    ['Spleen Channel', '足太阴脾经', { herbs: 0.3 }], ['Heart Channel', '手少阴心经', { qi: 0.25 }], ['Small Intestine Channel', '手太阳小肠经', { stones: 0.3 }],
    ['Bladder Channel', '足太阳膀胱经', { hp: 0.3 }], ['Kidney Channel', '足少阴肾经', { life: 0.08 }], ['Pericardium Channel', '手厥阴心包经', { bt: 0.03 }],
    ['Triple Burner Channel', '手少阳三焦经', { qi: 0.3 }], ['Gallbladder Channel', '足少阳胆经', { atk: 0.35 }], ['Liver Channel', '足厥阴肝经', { alch: 0.05, herbs: 0.3 }],
    ['Conception Vessel', '任脉', { qi: 0.6 }], ['Governing Vessel', '督脉', { qi: 0.6, atk: 0.4 }], ['Thrusting Vessel', '冲脉', { atk: 0.6, hp: 0.6 }],
    ['Girdle Vessel', '带脉', { stones: 0.6, dev: -0.15 }], ['Yin Heel Vessel', '阴跷脉', { luck: 8 }], ['Yang Heel Vessel', '阳跷脉', { mission: 0.3, atk: 0.5 }],
    ['Yin Linking Vessel', '阴维脉', { life: 0.15, hp: 0.6 }], ['Yang Linking Vessel', '阳维脉', { qi: 1, trib: 0.4, bt: 0.05 }],
  ].map((m) => ({ name: m[0], zh: m[1], fx: m[2] }));

  // Technique mastery: crossing a level multiplies that technique's power (P.masteryStep).
  const MASTERY = [
    { level: 0, name: 'Beginner', zh: '初学' }, { level: 10, name: 'Familiar', zh: '熟练' }, { level: 20, name: 'Minor Success', zh: '小成' },
    { level: 35, name: 'Great Success', zh: '大成' }, { level: 50, name: 'Perfection', zh: '圆满' }, { level: 75, name: 'Transcendent', zh: '化境' }, { level: 100, name: 'Return to Simplicity', zh: '返璞归真' },
  ];

  const ABODE = [
    { id: 'array', name: 'Spirit Gathering Array', zh: '聚灵阵', cost: 12, fx: { qi: 0.12 }, desc: '+12% Qi per level.' },
    { id: 'garden', name: 'Herb Garden', zh: '药园', cost: 8, herbRate: 0.04, desc: 'Grows spirit herbs over time.' },
    { id: 'vein', name: 'Spirit Stone Vein', zh: '灵脉', cost: 10, stoneRate: 0.03, desc: 'Mines stones over time, rising with the regions you can reach.' },
    { id: 'furnace', name: 'Earth Fire Chamber', zh: '地火室', cost: 15, fx: { alch: 0.01 }, max: 25, desc: '+1% pill success per level.' },
    { id: 'hall', name: 'Sword-Testing Hall', zh: '试剑堂', cost: 14, fx: { atk: 0.1, hp: 0.1 }, desc: '+10% attack and vitality per level.' },
    { id: 'chamber', name: 'Closed-Door Chamber', zh: '闭关室', cost: 20, max: 20, desc: '+1% seclusion income and +0.4 hours of seclusion per level.' },
    { id: 'jade', name: 'Longevity Jade Bed', zh: '寒玉床', cost: 30, fx: { life: 0.02 }, max: 25, desc: '+2% lifespan per level.' },
  ];

  const BEASTS = [
    { id: 'crane', name: 'Spirit Crane', zh: '灵鹤', fx: 'qi' }, { id: 'tiger', name: 'White Tiger Cub', zh: '白虎', fx: 'atk' },
    { id: 'tortoise', name: 'Black Tortoise', zh: '玄武', fx: 'hp' }, { id: 'fox', name: 'Nine-Tailed Fox', zh: '九尾狐', fx: 'luck' },
    { id: 'toad', name: 'Golden Toad', zh: '金蟾', fx: 'stones' }, { id: 'phoenix', name: 'Vermilion Bird', zh: '朱雀', fx: 'atk' },
    { id: 'qilin', name: 'Young Qilin', zh: '麒麟', fx: 'qi' }, { id: 'dragon', name: 'Azure Dragon Hatchling', zh: '青龙', fx: 'hp' },
  ];

  ENCOUNTERS.push(
    { title: 'A Wounded Hero at the Inn', zh: '客栈侠客', text: 'A swordsman slumps over his wine, bleeding through his robe. Assassins are coming up the stairs.',
      choices: [
        { label: 'Draw your sword beside him', chance: 0.6, win: { fame: 40, item: true, text: 'Back to back, you clear the stairs. He leaves you his blade and your name travels.' }, lose: { injury: 50, fame: 5, text: 'You hold them long enough for him to flee. People do talk about it.' } },
        { label: 'Finish your tea', chance: 1, win: { text: 'The tea is good. The screams are brief.' } },
      ] },
    { title: 'Strange Egg in the Reeds', zh: '灵蛋', text: 'A warm egg sits in a burned nest. Something inside knocks twice, as if asking.',
      choices: [
        { label: 'Take it', chance: 0.8, win: { egg: 1, text: 'It hums against your chest all the way home.' }, lose: { injury: 25, text: 'Its mother returns. She is much larger than the nest suggested.' } },
        { label: 'Leave it be', chance: 1, win: { text: 'You walk on. The knocking stops.' } },
      ] },
    { title: 'Scroll in a Dead Man\'s Sleeve', zh: '残卷', text: 'A corpse by the river clutches half a manual, its pages written in reversed meridians.',
      choices: [
        { label: 'Practise it as written', chance: 0.5, win: { qiSec: 400, text: 'The reversal was the secret. Your Qi surges backward and doubles.' }, lose: { injury: 80, text: 'Your Qi surges backward. So does your dinner, and some blood.' } },
        { label: 'Bury him and burn it', chance: 1, win: { karma: 1, fame: 10, text: 'Some arts should stay lost. The river grows quiet.' } },
      ] },
    { title: 'Challenge on the Purple Summit', zh: '紫禁决战', text: 'Two masters duel at midnight on the palace roof. The whole martial world is watching, and one of them calls your name.',
      choices: [
        { label: 'Step up', chance: 0.45, win: { fame: 120, buff: 'swordheart', text: 'Your single exchange is argued over in teahouses for a decade.' }, lose: { injury: 70, fame: 15, text: 'You are thrown off the roof, gloriously.' } },
        { label: 'Watch and learn', chance: 0.9, win: { qiSec: 200, text: 'One sword moves and the moon seems to move with it.' }, lose: { text: 'It is over before you can blink.' } },
      ] },
    { title: 'Sworn Brothers Beneath the Peach Trees', zh: '桃园结义', text: 'Three travellers invite you to burn incense and swear brotherhood: not born on the same day, but to die on the same day.',
      choices: [
        { label: 'Swear the oath', chance: 0.85, win: { buff: 'brotherhood', fame: 20, text: 'You drink blood wine under the blossoms. You no longer walk alone.' }, lose: { stones: 2, text: 'They rob you in your sleep. The peaches were good, at least.' } },
        { label: 'Politely decline', chance: 1, win: { text: 'A lone cultivator has fewer debts.' } },
      ] },
    { title: 'Secret of the Wushuang Map', zh: '藏宝图', text: 'A dying thief presses half a treasure map into your hand. Half the jianghu is hunting it.',
      choices: [
        { label: 'Follow the map', chance: 0.5, win: { item: true, stones: 25, text: 'Under a dry well lies a vault that was never meant to be found.' }, lose: { injury: 60, text: 'Everyone else followed it too.' } },
        { label: 'Sell it on', chance: 1, win: { stones: 6, text: 'Let someone else be hunted.' } },
      ] },
    { title: 'Masked Assassin at Midnight', zh: '夜袭', text: 'A knife pins a note to your door: "Your head is worth ten thousand taels." A shadow moves on the roof.',
      choices: [
        { label: 'Ambush the assassin', chance: 0.6, win: { fame: 30, stones: 10, text: 'You collect the bounty on the bounty hunter.' }, lose: { injury: 55, text: 'The knife finds your ribs, but not your heart.' } },
        { label: 'Change your name and leave', chance: 1, win: { years: -1, text: 'A year of hiding in a mountain village passes.' } },
      ] },
    { title: 'Ancient Formation Awakens', zh: '古阵', text: 'A ring of stones hums with Qi. It offers to test you, and rewards those who stand still the longest.',
      choices: [
        { label: 'Stand in the centre', chance: 0.55, win: { buff: 'formation', text: 'The stars wheel around you. You step out changed.' }, lose: { years: -2, text: 'You step out two years later. It felt like an afternoon.' } },
        { label: 'Copy its pattern', chance: 0.8, win: { contribution: 40, text: 'Your sect pays well for the diagrams.' }, lose: { text: 'Your sketch looks like a duck.' } },
      ] },
  );
  ENCOUNTER_BUFFS.brotherhood = { name: 'Sworn Brotherhood', secs: 600, fx: { atk: 0.75, hp: 0.75 } };
  ENCOUNTER_BUFFS.formation = { name: 'Star Formation Insight', secs: 300, fx: { qi: 1.5, bt: 0.06 } };

  FEATS.push(
    { id: 'firstBoss', name: 'Lord of the Outskirts', desc: 'Defeat a region boss.', test: (S) => Object.keys(S.trophies).length >= 1 },
    { id: 'trophies', name: 'Hall of Trophies', desc: 'Earn 25 boss trophies.', test: (S) => Object.keys(S.trophies).length >= 25 },
    { id: 'tower30', name: 'Thirty Steps Up', desc: 'Clear floor 30 of the Tower of Trials.', test: (S) => S.towerBest >= 30 },
    { id: 'tower100', name: 'Above the Clouds', desc: 'Clear floor 100 of the Tower of Trials.', test: (S) => S.towerBest >= 100 },
    { id: 'champion', name: 'First Under Heaven', desc: 'Defeat every rival in the Martial Tournament.', test: (S) => S.duelsWon >= 12 },
    { id: 'parry', name: 'Perfect Timing', desc: 'Parry 50 charged blows.', test: (S) => S.stats.parries >= 50 },
    { id: 'streak', name: 'Unbroken', desc: 'Reach a kill streak of 200.', test: (S) => S.stats.bestStreak >= 200 },
    { id: 'meridians', name: 'All Channels Open', desc: 'Open all 20 meridians in one life.', test: (S) => (S.meridians || 0) >= 20 },
    { id: 'forge', name: 'Master Smith', desc: 'Forge an artifact to +15.', test: (S) => S.stats.bestPlus >= 15 },
    { id: 'title', name: 'Leader of the Martial World', desc: 'Earn that title through fame.', test: (S) => S.fame >= 3e6 },
    { id: 'tier15', name: 'Gift of the Golden Immortals', desc: 'Find a Golden Immortal-grade artifact.', test: (S) => S.stats.bestRarity >= 15 },
    { id: 'secluded', name: 'Ten Thousand Breaths', desc: 'Spend 100 hours in seclusion.', test: (S) => S.stats.secludedSeconds >= 360000 },
    { id: 'scholar', name: 'Scholar of the Dao', desc: 'Read 40 different entries by hovering over things.', test: (S) => Object.keys(S.lore || {}).length >= 40 },
    { id: 'idleMaster', name: 'Effortless Action', desc: 'Learn every Idle Art.', test: (S) => Object.keys(S.idleArts || {}).length >= 13 },
    { id: 'tier23', name: 'Chaos Origin', desc: 'Find the highest grade of artifact.', test: (S) => S.stats.bestRarity >= 23 },
  );

  const MAX_DEPTH = 9;

  // ---------- rolled qualities and earned ranks ----------
  // Each rolled quality is a ladder. Rolls follow a bell curve whose centre slides up with your
  // realm and heavens (see LADDER_CURVES in core.js), so yesterday's best roll becomes today's average.
  const ladder = (rows, mult) => rows.map((r, i) => ({ name: r[0], zh: r[1], mult: +mult(i).toFixed(2) }));
  const COMPREHENSION = ladder([
    ['Muddled', '混沌'], ['Shallow', '浅悟'], ['Common', '平常'], ['Clear', '明晰'], ['Deep', '深悟'], ['Keen', '通透'],
    ['Profound', '精深'], ['Insightful', '洞彻'], ['Enlightened', '顿悟'], ['Transcendent', '超凡'], ['Heaven-Touched', '天授'], ['One with the Dao', '合道'],
  ], (i) => 0.8 * Math.pow(1.14, i));
  const PILL_GRADES = ladder([
    ['Crude', '劣品'], ['Low', '下品'], ['Middle', '中品'], ['High', '上品'], ['Superior', '极品'],
    ['Refined', '精炼'], ['Spirit-Patterned', '灵纹'], ['Dao-Patterned', '道纹'], ['Immortal', '仙品'], ['Nine Revolutions', '九转'],
  ], (i) => 0.8 * Math.pow(1.3, i));
  const MISSION_RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'Earth', 'Heaven', 'Saint', 'Immortal', 'Dao'].map((name, i) => ({
    name, mult: +Math.pow(1.4, i).toFixed(2), chance: +(0.04 - 0.025 * i).toFixed(3), cores: i < 2 ? 0 : Math.round(Math.pow(1.6, i - 1)),
  }));
  const PURITY = ladder([
    ['Blocked', '阻'], ['Clogged', '滞'], ['Murky', '浊'], ['Clear', '通'], ['Pure', '纯'],
    ['Bright', '明'], ['Lustrous', '润'], ['Flawless', '无瑕'], ['Crystal', '晶'], ['Primordial', '先天'],
  ], (i) => 0.85 * Math.pow(1.07, i));
  const SITES = ladder([
    ['Barren Hollow', '贫瘠之地'], ['Rocky Cave', '石窟'], ['Quiet Valley', '清幽山谷'], ['Bamboo Glade', '竹林幽境'], ['Spirit Spring', '灵泉'],
    ['Spirit Vein Ridge', '灵脉山脊'], ['Misty Peak Grotto', '云峰洞府'], ['Blessed Land', '洞天福地'], ['Cave Heaven', '小洞天'],
    ['Dragon\'s Lair Point', '龙穴'], ['Immortal Mountain', '仙山'], ['Navel of Heaven and Earth', '天地之脐'],
  ], (i) => 0.7 * Math.pow(1.12, i));
  const CONDITIONS = ladder([
    ['Shattered', '残'], ['Cracked', '裂'], ['Worn', '旧'], ['Whole', '完'], ['Fine', '良'],
    ['Pristine', '新'], ['Flawless', '无瑕'], ['Radiant', '辉'], ['Spirit-Woven', '灵织'], ['Heaven-Wrought', '天工'],
  ], (i) => 0.85 * Math.pow(1.08, i));
  const SKILL_RANKS = [
    { name: 'Novice', use: 0 }, { name: 'Trained', use: 25 }, { name: 'Skilled', use: 100 }, { name: 'Expert', use: 300 }, { name: 'Master', use: 800 }, { name: 'Grandmaster', use: 2000 },
  ];
  const BEAST_STAGES = [
    { name: 'Hatchling', zh: '幼体', level: 0 }, { name: 'Juvenile', zh: '少年', level: 10 }, { name: 'Adult', zh: '成年', level: 25 }, { name: 'Spirit', zh: '灵体', level: 45 }, { name: 'Divine', zh: '神兽', level: 70 },
  ];
  const FOE_AFFIXES = [
    { name: 'Swift', hp: 1, dmg: 1.4, pay: 1.2 }, { name: 'Armoured', hp: 1.6, dmg: 1, pay: 1.3 }, { name: 'Gilded', hp: 1.2, dmg: 1, pay: 2.5 },
    { name: 'Venomous', hp: 1, dmg: 1.7, pay: 1.4 }, { name: 'Ancient', hp: 1.8, dmg: 1.4, pay: 1.9 },
  ];

  // Abode level caps, and the reward for finishing each building.
  const ABODE_CAPS = {
    array: [30, { qi: 0.5 }, '+50% Qi'], garden: [30, { herbs: 0.5 }, '+50% herbs'], vein: [30, { stones: 0.5 }, '+50% stones'],
    furnace: [25, { alch: 0.1 }, '+10% pill success'], hall: [30, { atk: 0.5, hp: 0.5 }, '+50% attack and vitality'],
    chamber: [20, { bt: 0.05 }, '+5% breakthrough'], jade: [25, { life: 0.25 }, '+25% lifespan'],
  };
  ABODE.forEach((a) => { const c = ABODE_CAPS[a.id]; a.max = c[0]; a.maxFx = c[1]; a.maxText = c[2]; });
  const PILL_CORES = { foundation: 2, insight: 3, longevity: 5, marrow: 12 };
  PILLS.forEach((p) => { p.cores = PILL_CORES[p.id] || 0; });

  FEATS.push(
    { id: 'firstPerfect', name: 'One Thing Done Well', desc: 'Perfect anything.', test: (S) => Object.keys(S.perfectSeen || {}).length >= 1 },
    { id: 'perfect25', name: 'Hall of Perfection', desc: 'Perfect 25 different things.', test: (S) => Object.keys(S.perfectSeen || {}).length >= 25 },
    { id: 'enlightened', name: 'Sudden Awakening', desc: 'Roll Enlightened comprehension on a technique.', test: (S) => S.stats.bestComprehension >= 8 },
    { id: 'supreme', name: 'Pill Clouds', desc: 'Refine an Immortal-grade pill.', test: (S) => S.stats.bestPillGrade >= 8 },
    { id: 'dragonLair', name: 'Dragon\'s Lair', desc: 'Settle on a Dragon\'s Lair Point or better.', test: (S) => S.stats.bestSite >= 9 },
    { id: 'chaosRoot', name: 'Born of Chaos', desc: 'Awaken a Chaos Root.', test: (S) => S.stats.bestRoot >= 11 },
    { id: 'wrought', name: 'Heaven-Wrought', desc: 'Own an artifact in Heaven-Wrought condition.', test: (S) => S.stats.bestCondition >= 9 },
    { id: 'grandmaster', name: 'Grandmaster', desc: 'Raise a skill to Grandmaster.', test: (S) => S.stats.bestSkillRank >= 5 },
    { id: 'divine', name: 'Divine Companion', desc: 'Raise a spirit beast to Divine.', test: (S) => S.stats.bestBeastStage >= 4 },
  );


  // Idle Arts: permanent automation bought with karma. They survive rebirth and ascension.
  const IDLE_ARTS = [
    { id: 'meridian', name: 'Self-Opening Channels', zh: '自通经脉', cost: 6, setting: 'autoMeridian', desc: 'Opens the next meridian as soon as you can afford it.' },
    { id: 'region', name: 'Hunter\'s Instinct', zh: '猎心', cost: 8, setting: 'autoRegion', desc: 'Moves your hunt to the toughest region and depth you can safely fight.' },
    { id: 'boss', name: 'Challenge Seeker', zh: '求战', cost: 12, setting: 'autoBoss', desc: 'Summons the region boss when its meter is full and the fight looks winnable.' },
    { id: 'pills', name: 'Furnace Spirit', zh: '炉灵', cost: 10, setting: 'autoPills', desc: 'Keeps your chosen pill stock refined. Takes Qi Gathering Pills when none are active, Bone-Mending when injured, and Foundation Pills before a breakthrough.' },
    { id: 'abode', name: 'Diligent Caretaker', zh: '勤仆', cost: 12, setting: 'autoAbode', desc: 'Builds the cheapest abode upgrade once it costs under a fifth of your stones.' },
    { id: 'beast', name: 'Beast Keeper', zh: '驯兽师', cost: 10, setting: 'autoBeast', desc: 'Hatches eggs and feeds your companion from spare herbs.' },
    { id: 'forge', name: 'Tireless Smith', zh: '铸灵', cost: 18, setting: 'autoForge', desc: 'Forges equipped artifacts whenever you have plenty of stones and cores to spare.' },
    { id: 'fate', name: 'Hand of Fate', zh: '天意', cost: 8, setting: 'autoFate', desc: 'Resolves encounters you leave waiting for 20 seconds, picking the likeliest good outcome.' },
    { id: 'rebirth', name: 'Turning Wheel', zh: '轮转', cost: 20, setting: 'autoRebirth', desc: 'Reincarnates for you when a life ends and accepts the new spirit root.' },
    { id: 'sect', name: 'Sect Loyalty', zh: '归宗', cost: 10, setting: 'autoSect', desc: 'Rejoins your last sect in each new life, accepts the best missions, and donates spare cores when a realm needs a higher rank.' },
    { id: 'major', name: 'Unwavering Heart', zh: '坚心', cost: 16, setting: 'autoMajorArt', desc: 'Attempts major breakthroughs on its own when your odds reach the threshold you set, and never while injured.' },
    { id: 'salvage', name: 'Ring Steward', zh: '戒灵', cost: 6, setting: null, desc: 'Unlocks automatic selling or dismantling of artifacts below a chosen grade.' },
    { id: 'vault', name: 'Ancestral Vault', zh: '祖库', cost: 15, setting: null, desc: 'A vault whose artifacts survive rebirth. Starts with 2 slots.' },
  ];

  WD.DATA = {
    STAGES_PER_REALM, REALMS, HEAVENS, HEAVEN_ZH, ROOT_TIERS, ELEMENTS, VARIANTS, QI_TECHS, ATK_TECHS, HP_TECHS,
    SECTS, SECT_RANKS, MISSIONS, REGIONS, RARITIES, GEAR_SLOTS, GEAR_ADJ, AFFIXES, PILLS, FORTUNES, ENCOUNTERS,
    ENCOUNTER_BUFFS, KARMA_UPS, DAO_UPS, FEATS, SKILLS, SECT_SKILLS, RIVALS, TITLES, MERIDIANS, MASTERY, ABODE, BEASTS, MAX_DEPTH, COMPREHENSION, PILL_GRADES, MISSION_RANKS, PURITY, SITES, SKILL_RANKS, BEAST_STAGES, FOE_AFFIXES, CONDITIONS, IDLE_ARTS,
  };
})();
