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
  const ROOT_TIERS = [
    { id: 'five', name: 'Five-Spirit Root', zh: '五灵根', weight: 44, mult: 1, count: 5, power: 0.1 },
    { id: 'four', name: 'Four-Spirit Root', zh: '四灵根', weight: 28, mult: 1.35, count: 4, power: 0.2 },
    { id: 'three', name: 'Three-Spirit Root', zh: '三灵根', weight: 16, mult: 1.9, count: 3, power: 0.35 },
    { id: 'dual', name: 'Dual-Spirit Root', zh: '双灵根', weight: 8.5, mult: 2.8, count: 2, power: 0.55 },
    { id: 'heavenly', name: 'Heavenly Root', zh: '天灵根', weight: 3, mult: 4.5, count: 1, power: 0.9 },
    { id: 'variant', name: 'Variant Root', zh: '异灵根', weight: 0.5, mult: 7.5, count: 1, power: 1.4, variant: true },
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

  const RARITIES = [
    { name: 'Mortal', zh: '凡', weight: 62, mult: 1, color: '#b6bdb4' },
    { name: 'Spirit', zh: '灵', weight: 25, mult: 1.6, color: '#7fcf9e' },
    { name: 'Treasure', zh: '宝', weight: 9.5, mult: 2.6, color: '#74b6ea' },
    { name: 'Earth', zh: '地', weight: 2.8, mult: 4.5, color: '#c896ec' },
    { name: 'Heaven', zh: '天', weight: 0.6, mult: 8, color: '#f0bf5c' },
    { name: 'Immortal', zh: '仙', weight: 0.1, mult: 15, color: '#ff7f6b' },
  ];

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
    { id: 'heavenly', name: 'Chosen of Heaven', desc: 'Awaken a Heavenly or Variant Root.', test: (S) => S.stats.bestRoot >= 4 },
    { id: 'immortalItem', name: 'Treasure of the Immortals', desc: 'Find an Immortal-grade artifact.', test: (S) => S.stats.bestRarity >= 5 },
    { id: 'master', name: 'One Who Commands', desc: 'Become a Sect Master.', test: (S) => S.stats.bestRank >= 6 },
    { id: 'storm', name: 'Lightning Rod', desc: 'Survive 5 heavenly tribulations.', test: (S) => S.stats.tribs >= 5 },
    { id: 'blessed', name: 'Purple Qi from the East', desc: 'Draw a Supreme Fortune.', test: (S) => S.stats.supreme >= 1 },
    { id: 'wanderer', name: 'Rivers and Lakes', desc: 'Resolve 25 chance encounters.', test: (S) => S.stats.encounters >= 25 },
  ];

  WD.DATA = {
    STAGES_PER_REALM, REALMS, HEAVENS, HEAVEN_ZH, ROOT_TIERS, ELEMENTS, VARIANTS, QI_TECHS, ATK_TECHS, HP_TECHS,
    SECTS, SECT_RANKS, MISSIONS, REGIONS, RARITIES, GEAR_SLOTS, GEAR_ADJ, AFFIXES, PILLS, FORTUNES, ENCOUNTERS,
    ENCOUNTER_BUFFS, KARMA_UPS, DAO_UPS, FEATS,
  };
})();
