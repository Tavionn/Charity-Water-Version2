/* =========================================================
   Flow Quest — translations and text direction

   • English is built in below and is the fallback for any missing text.
   • Every other language lives in lang/<code>.js and is loaded only when
     someone picks it. To add a language: copy lang/es.js, translate it,
     and add one line to LANGUAGES.
   • Reading direction is NOT hard-coded per language. The browser is asked
     (Intl.Locale text info), with a backup list of right-to-left languages.

   In the HTML, elements carry data-i18n="key" (plain text),
   data-i18n-html="key" (text with <b>/<kbd> tags),
   data-i18n-aria="key" (screen-reader label) or data-i18n-title="key".
   In script.js, call I18N.t('key', { name: value }).
   ========================================================= */
(() => {
  'use strict';

  // Languages shown in the menu, by their own name
  const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'pt', name: 'Português' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'pl', name: 'Polski' },
    { code: 'sw', name: 'Kiswahili' },
    { code: 'ha', name: 'Hausa' },
    { code: 'yo', name: 'Yorùbá' },
    { code: 'am', name: 'አማርኛ' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'fil', name: 'Filipino' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'ru', name: 'Русский' },
    { code: 'uk', name: 'Українська' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'bn', name: 'বাংলা' },
    { code: 'ne', name: 'नेपाली' },
    { code: 'th', name: 'ไทย' },
    { code: 'zh', name: '中文（简体）' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
    { code: 'ar', name: 'العربية' },
    { code: 'he', name: 'עברית' },
    { code: 'fa', name: 'فارسی' },
    { code: 'ur', name: 'اردو' },
  ];

  // Backup list of languages written right to left, for browsers that
  // can't report a language's direction themselves
  const RTL_LANGUAGES = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'ks', 'ku', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi']);

  function directionOf(code) {
    try {
      const loc = new Intl.Locale(code);
      const info = typeof loc.getTextInfo === 'function' ? loc.getTextInfo() : loc.textInfo;
      if (info && (info.direction === 'rtl' || info.direction === 'ltr')) return info.direction;
    } catch (_) { /* older browser: use the list */ }
    return RTL_LANGUAGES.has(code.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr';
  }

  const STRINGS = {
    en: {
      // ----- page -----
      language: 'Language',
      tagline: 'Water for a Brighter Tomorrow',
      reset: 'Reset',
      resetAria: 'Reset game',
      resetTitle: 'Restart this game from the beginning',
      menuAria: 'Open menu',
      score: 'Score',
      lv: 'Lv',
      lives: 'Lives',
      gameArea: 'Flow Quest game area',

      eyebrow: 'A charity: water story',
      lead: 'Two sides of one mission: getting clean water to the people who need it. Choose your role.',
      villager: 'Villager',
      villagerSub: 'Living without clean water nearby',
      villagerDesc: 'Your village is running dry. Catch the rain, avoid polluted water, and purify every drop you carry home.',
      tagCatch: 'Catch rain',
      tagPurify: 'Purify',
      tagGuard: 'Avoid the guard',
      playVillager: 'Play as Villager',
      volunteer: 'Warehouse Volunteer',
      volunteerSub: 'Packing water for delivery',
      volunteerDesc: "Load cases of clean water onto the truck before it leaves for the villages. Don't let a leaking case get on board.",
      tagTimer: 'Beat the timer',
      tagInspect: 'Inspect cases',
      tagForklift: 'Dodge the forklift',
      playVolunteer: 'Play as Volunteer',
      keysDesktop: 'Move <kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd> · Jump <kbd>↑</kbd> or <kbd>Space</kbd> · Interact <kbd>E</kbd> · Pause <kbd>P</kbd>',
      keysTouch: 'Use the buttons below: ← → to move, ↑ to jump, and the hand to interact.',

      howTo: 'How to Play',
      helpVillager: 'How to Play: Villager',
      helpVolunteer: 'How to Play: Volunteer',
      hv1: '<b>Catch clean drops</b> to fill your jerry can (10 max).',
      hv2: '<b>Avoid polluted drops.</b> They cost a heart and <b>20 points</b>.',
      hv3: '<b>Use the biosand filter</b> on the bridge to turn your can into clean water.',
      hv4: '<b>Pick up litter</b> for a cleanup bonus.',
      hv5: '<b>Stay out of the Restricted Area.</b> The guard sends you back and you lose <b>25 points</b>.',
      hv6: 'Fill the village tank to <b>100</b> to level up. Clear level 5 to win.',
      hw1: '<b>Grab cases</b> at the end of the conveyor belt (carry up to 3).',
      hw2: '<b>Load the truck</b> before its timer runs out.',
      hw3: '<b>Leaking cases</b> go in the <b>recycling bin</b>. Loading one costs <b>30 points</b>.',
      hw4: '<b>Jump over the forklift.</b> A hit costs <b>25 points</b> and drops your cases.',
      hw5: '<b>Spills slow you down.</b> Interact to mop them up for a bonus.',
      hw6: 'Each full truck heads to the villages. Send <b>5 trucks</b> to win.',
      gotIt: 'Got it',

      paused: 'Paused',
      resume: 'Resume',
      restart: 'Restart',
      switchRole: 'Switch Role',
      learnMore: 'Learn about charity: water',
      gameOver: 'Game over',
      wellDone: 'Well done',
      level: 'Level',
      playAgain: 'Play Again',

      controls: 'Controls',
      interact: 'Interact',
      jump: 'Jump',
      moveLeft: 'Move left',
      moveRight: 'Move right',
      dropDown: 'Drop down',
      touchControls: 'Touch controls',
      stCollect: 'Collect',
      stDirty: 'Dirty water',
      stFilter: 'Filtering',
      stClean: 'Clean water',
      stBelt: 'Case on belt',
      stCarry: 'Carrying',
      stLoaded: 'Loaded',
      stDelivered: 'Delivered',

      // ----- role-specific labels -----
      barVillage: 'Village water',
      barTruck: 'Truck load',
      progVillage: 'Collect / Purify Progress',
      progTruck: 'Pack / Load / Deliver Progress',
      carryCan: 'Jerry can',
      carrying: 'Carrying',
      herdLivestock: 'Livestock',
      herdTrucks: 'Trucks sent',
      emptyTrucks: 'Delivered trucks appear here',

      // ----- messages -----
      startVillage: 'Catch the clean blue drops and carry them to the filter.',
      startWarehouse: 'Grab cases from the belt and load the truck.',
      resetPick: 'Pick a role to start playing.',
      resetDone: 'Game reset. Fresh start!',
      winVillage: 'The village has a steady supply of clean water. A brighter tomorrow starts here.',
      loseVillage: 'The village still needs you. Every drop counts. Try again.',
      winWarehouse: 'Five trucks of clean water are on the road to the villages. Great work.',
      loseWarehouse: 'The trucks are still waiting. Every case counts. Try again.',
      restricted: 'Restricted area. The guard sent you back. −25 points',
      polluted: 'Polluted water. Avoid the brown drops. −20 points',
      canFull: 'Jerry can full. Take it to the filter on the bridge.',
      canFullWarn: 'Your can is full. Purify it at the bridge.',
      filtered: 'Filtered. +{n} clean water for the village.',
      ranDry: 'The village ran dry. You lost a heart and an animal.',
      levelVillage: 'Level {n}. The herd grew, and the rain is getting heavier and dirtier.',
      filterBusy: 'The filter is working…',
      canEmpty: 'Your can is empty. Catch some clean drops first.',
      filterRight: 'Head right to the filter on the bridge →',
      filterLeft: '← Head left to the filter on the bridge',
      forkliftDrop: 'Forklift hit. You dropped your cases. −25 points',
      forkliftHit: 'Forklift hit. Jump over it next time. −25 points',
      levelTruck: 'Level {n}. Bigger truck, faster forklift.',
      truckLeft: 'The truck left with only {load}/{target} cases.',
      casesFine: 'These cases are fine. Load them on the truck.',
      onlyLeaking: 'Only leaking cases go in the recycling bin.',
      handsFull: 'Hands full. Take these to the truck.',
      waitingCase: 'Waiting for the next case…',
      leakingHeld: 'That case is leaking. Put it in the recycling bin.',
      truckBusy: 'The truck is on the road. Hang on.',
      handsEmpty: 'Your hands are empty. Grab cases from the belt.',
      leakLoaded: 'A leaking case got on the truck. −{n} points',
      truckFull: 'Truck full and heading to the villages. +{n}',
      truckRight: 'Head right to load the truck →',
      truckLeftDir: '← Head left to load the truck',
      beltRight: 'Grab cases from the conveyor belt →',
      beltLeft: '← Grab cases from the conveyor belt',

      // ----- status line -----
      sDelivered: 'Clean water delivered to the village tank.',
      sPouring: 'Pouring water into the biosand filter…',
      sFiltering: 'Filtering through sand and gravel…',
      sCanFull: 'Can full. Go to the filter and interact.',
      sKeepCatching: 'Keep catching, or purify now at the bridge.',
      sCatch: 'Catch clean blue drops to fill your can.',
      sTruckDelivered: 'Truck delivered. Clean water is on the way.',
      sPulling: 'A new truck is pulling in…',
      sHoldingLeak: 'You are holding a leaking case. Recycle it.',
      sHandsFull: 'Hands full. Load the truck.',
      sGrabMore: 'Grab more, or load the truck now.',
      sTruckNeeds: 'Truck needs {n} more case(s) · {s}s left',

      // ----- labels drawn in the game scene -----
      cVillage: 'VILLAGE',
      cFilter: 'BIOSAND FILTER',
      cSign1: 'RESTRICTED',
      cSign2: 'AREA',
      cDepot: 'CLEAN WATER DEPOT',
      cPickUp: 'PICK UP',
      cRecycling: 'RECYCLING',
      cTruckSide: 'CLEAN WATER',
      cSlippery: 'slippery',
      cCases: '{a}/{b} cases',
      cSecs: '{n}s',
      cOnWay: 'On the way to the villages',
      cPulling: 'Pulling in…',
      cLeaving: 'Leaving…',
      pPurify: 'Purify',
      pPickUp: 'Pick up',
      pKeepOut: 'Keep out',
      pGrab: 'Grab case',
      pRecycle: 'Recycle',
      pMop: 'Mop',
      pLoad: 'Load',
      pBeep: 'Beep',
      popCleanup: 'Cleanup +25',
      popWater: '+{n} clean water',
      popLeaking: 'Leaking case',
      popCase: '+1 case',
      popRecycled: 'Recycled +{n}',
      popMopped: 'Mopped +10',
      popLoaded: '+{n} loaded',
      popLeakPenalty: '−{n} leaking',
      popDropped: '−{n} case(s)',

      // Project 6: difficulty, milestones, sound, footer
      difficulty: 'Difficulty',
      easy: 'Easy',
      normal: 'Normal',
      hard: 'Hard',
      easyDesc: 'Smaller goals, a slower pace, and more time.',
      normalDesc: 'The standard challenge.',
      hardDesc: 'Bigger goals, a faster pace, and less time.',
      ms25: 'A quarter of the way there!',
      ms50: 'Halfway there!',
      ms75: 'Almost there, keep going!',
      soundOn: 'Sound: On',
      soundOff: 'Sound: Off',
      footerNote: 'Every drop counts. Help bring clean water to people in need.',
      visitSite: 'Visit charity: water',
      donate: 'Donate',
      close: 'Close',

      facts: [
        '100% of public donations to charity: water go directly to fund clean water projects.',
        'Millions of people around the world still live without access to clean drinking water.',
        'In many communities, women and girls spend hours every day walking to collect water.',
        'Clean water close to home means more time for school, work, and family.',
        'Biosand filters use layers of sand and gravel to remove dirt and many germs from water.',
      ],
    },
  };

  const supported = (code) => LANGUAGES.some((l) => l.code === code);

  // Load lang/<code>.js once (a plain <script> tag also works when the
  // game is opened straight from a file, with no web server)
  const pending = {};
  function load(code) {
    if (STRINGS[code]) return Promise.resolve();
    if (!pending[code]) {
      pending[code] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `lang/${code}.js`;
        s.onload = () => (STRINGS[code] ? resolve() : reject(new Error(`lang/${code}.js did not register`)));
        s.onerror = () => { delete pending[code]; reject(new Error(`Could not load lang/${code}.js`)); };
        document.head.appendChild(s);
      });
    }
    return pending[code];
  }

  // First visit: use the browser's language if we have it, otherwise English
  function pickInitial() {
    try {
      const saved = localStorage.getItem('flowquest-lang');
      if (saved && supported(saved)) return saved;
    } catch (_) { /* storage unavailable */ }
    const wanted = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (const tag of wanted) {
      let base = String(tag).split('-')[0].toLowerCase();
      if (base === 'tl') base = 'fil'; // Tagalog browsers → Filipino
      if (supported(base)) return base;
    }
    return 'en';
  }

  let lang = 'en';

  // Look up a string and fill in {placeholders}; falls back to English
  function t(key, vars) {
    let s = STRINGS[lang] && STRINGS[lang][key];
    if (s === undefined) s = STRINGS.en[key];
    if (s === undefined) return key;
    if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return s;
  }

  // Translate every marked element and set the page language + direction
  function applyPage() {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = directionOf(lang);
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.dataset.i18nTitle)); });
  }

  const listeners = [];
  async function setLang(next) {
    if (!supported(next)) return;
    try {
      await load(next);
    } catch (err) {
      console.warn(err.message);
      return; // stay in the current language
    }
    lang = next;
    try { localStorage.setItem('flowquest-lang', lang); } catch (_) { /* ignore */ }
    applyPage();
    listeners.forEach((fn) => fn(lang));
  }

  function init() {
    applyPage();
    const first = pickInitial();
    if (first !== lang) setLang(first);
  }

  window.I18N = {
    t,
    setLang,
    applyPage,
    init,
    directionOf,
    languages: LANGUAGES,
    register: (code, strings) => { STRINGS[code] = strings; },
    onChange: (fn) => listeners.push(fn),
    get lang() { return lang; },
    get dir() { return directionOf(lang); },
    get rtl() { return directionOf(lang) === 'rtl'; },
  };
})();
