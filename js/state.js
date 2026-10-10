'use strict';
/* ============================================================
   STATE · LVE_6 v3.4
   Структура мира, сохранение/загрузка, миграции.
   ============================================================ */

let G = null;

function freshState(){
  return {
    /* ---------- ЯДРО ---------- */
    version: LS_VERSION,
    seed: 0,
    rngSeed: 0,
    time: CORE.START_TIME,

    scene: 'title',
    modal: null,
    log: [],

    player: null,

    area: 'small_ship',
    location: 'common',
    destination: null,
    worldTree: null,

    /* ---------- §4.3 · WARP ---------- */
    warp: {
      exposure: 0,
      whisperActive: false,
      factions: [],
      knowledge: false,
    },

    /* ---------- §4.4 · АРТЕФАКТЫ ---------- */
    artifacts: {
      slots: 0,
      held: [],
      hidden: [],
    },

    /* ---------- §3 · ПРОЛОГ ---------- */
    prologue: {
      part: null,
      deadline: null,
      smallBoardedAt: null,
      largeBoardedAt: null,
      loadingBg: null,
      missionLoaded: false,
      examPassed: false,
      prologueDone: false,
      /* §3.4 · контрабанда сервитором */
      smuggledResource: null,
      smuggledTons: 0,
    },

    /* §3.4 · Экзамен */
    exam: null,

    /* ---------- §11 · ФИНАЛ ---------- */
    final: {
      started: false,
      arrivalAt: null,
      deadline: null,
      conflictAt: null,
      contrabandAt: null,
      equipmentAt: null,
      sidequestsAt: null,
      reportAt: null,

      deputyMet: false,
      deputyWant: null,
      equipmentViewed: false,

      /* §13.5 · адаптация текстов под роль станции */
      roleLabels: null,

      obstacles: {
        conflict:   { triggered: false, resolved: false, outcome: null },
        contraband: { triggered: false, resolved: false, outcome: null, kind: null },
        equipment:  { triggered: false, resolved: false, outcome: null },
        sidequests: { triggered: false, resolved: false, outcome: null, list: [] },
        report:     { triggered: false, resolved: false, outcome: null, mode: null },
      },

      reportAnswers: [],
      mainCheck: null,
      verdict: null,
      verdictText: null,
      hiddenOutcome: null,
      pendingObstacles: [],
    },

    /* §11.4 · Разгрузка — отдельный активный объект */
    unload: null,

    /* ---------- §12 · ЭКОНОМИКА ---------- */
    economy: {
      hierarchy: null,
      quota: null,
      production: [],
      flows: [],
      log: [],
      nextEventAt: 0,
      priceModifier: 1,
    },

    /* ---------- §13 · СТАНЦИЯ ---------- */
    station: {
      role: null,
      roleData: null,
      secondary: null,
      scale: null,
      age: null,
      condition: 0,
      equipmentReport: null,
      alert: 'LOW',
      stability: 100,
    },

    /* ---------- NPC ---------- */
    npcs: {},
    assistantId: null,
    assistantArchetype: null,

    /* ---------- §2.1.8 · KNOWLEDGE ---------- */
    knowledge: {},
    playerKnowledge: [],

    /* ---------- §9 · АКТИВЫ ---------- */
    assets: {
      money: 0,
      inventory: [],
      contacts: [],
      reputation: {
        workers: 50, officials: 50, criminals: 50,
        military: 50, church: 50, mechanicus: 50,
      },
    },

    /* ---------- §9.3 · ОБЯЗАТЕЛЬСТВА ---------- */
    obligations: {
      orders: [],
      favors: [],
      debts: [],
      words: [],
      letters: [],
    },

    /* ---------- §10 · КПК ---------- */
    pda: {
      tab: 'map',
      feed: [],
      messages: [],
      marks: [],
      modules: [],
      pendingModule: null,
    },

    /* ---------- §5.2 · ДИАЛОГИ ---------- */
    dialogue: {
      lastCallbackAt: 0,
      callbacksShown: 0,
      pendingQuestions: [],
    },

    /* ---------- РАЗНОЕ ---------- */
    flags: {},
    history: [],
    ambientTick: 0,
    weather: 'ясно',
  };
}

/* ============================================================
   SAVE / LOAD
   ============================================================ */
function saveGame(){
  if(!G) return false;
  try{
    const copy = JSON.parse(JSON.stringify(G));
    delete copy.rng;
    copy.version = LS_VERSION;
    localStorage.setItem(LS_KEY, JSON.stringify(copy));
    return true;
  } catch(e){
    console.error('save failed', e);
    return false;
  }
}

function loadGame(){
  const raw = localStorage.getItem(LS_KEY);
  if(!raw) return false;
  try{
    const data = JSON.parse(raw);
    G = migrate(data);
    /* Обязательно: восстановить RNG. Иначе тики падают. */
    if(!G.rng){
      G.rng = new RNG(G.rngSeed || G.seed || ((Math.random() * 0xFFFFFFFF) >>> 0));
    }
    return true;
  } catch(e){
    console.error('load failed', e);
    return false;
  }
}

function hasSave(){
  return !!localStorage.getItem(LS_KEY);
}

/* ============================================================
   МИГРАЦИИ
   ============================================================ */
function migrate(data){
  const from = data.version || 0;
  const to = LS_VERSION;

  if(from < 33){
    data = migrateV28toV33(data);
  }

  data.version = to;
  data.rngSeed = data.rngSeed || data.seed || ((Math.random() * 0xFFFFFFFF) >>> 0);

  /* Защиты от старых сейвов: добить отсутствующие поля новыми значениями */
  ensureStructure(data);

  return data;
}

function migrateV28toV33(old){
  const s = freshState();
  s.seed = old.seed || 0;
  s.rngSeed = old.rngSeed || s.seed;
  s.time = old.time || CORE.START_TIME;
  s.scene = old.scene || 'title';
  s.area = old.area || 'small_ship';
  s.location = old.location || 'common';
  s.destination = old.destination || null;
  s.npcs = old.npcs || {};
  s.assistantId = old.assistantId || null;
  s.assistantArchetype = old.assistantArchetype || null;
  s.flags = old.flags || {};
  s.history = old.history || [];

  if(old.player){
    s.player = old.player;
    s.assets.money = old.player.money || 0;
    s.assets.inventory = old.inventory || [];
    s.assets.contacts = old.player.contacts || [];
  }
  if(old.warpExposure != null) s.warp.exposure = old.warpExposure;
  if(old.reputation) s.assets.reputation = old.reputation;

  return s;
}

/* Добиваем отсутствующие поля из шаблона.
   Не затирает существующие значения — только заполняет пустые. */
function ensureStructure(data){
  const fresh = freshState();

  /* Верхний уровень */
  for(const key in fresh){
    if(data[key] === undefined) data[key] = fresh[key];
  }

  /* prologue */
  for(const key in fresh.prologue){
    if(data.prologue[key] === undefined) data.prologue[key] = fresh.prologue[key];
  }

  /* final */
  for(const key in fresh.final){
    if(data.final[key] === undefined) data.final[key] = fresh.final[key];
  }
  if(!data.final.obstacles) data.final.obstacles = fresh.final.obstacles;
  for(const key in fresh.final.obstacles){
    if(data.final.obstacles[key] === undefined){
      data.final.obstacles[key] = fresh.final.obstacles[key];
    }
  }

  /* economy */
  for(const key in fresh.economy){
    if(data.economy[key] === undefined) data.economy[key] = fresh.economy[key];
  }

  /* station */
  for(const key in fresh.station){
    if(data.station[key] === undefined) data.station[key] = fresh.station[key];
  }

  /* assets */
  for(const key in fresh.assets){
    if(data.assets[key] === undefined) data.assets[key] = fresh.assets[key];
  }

  /* obligations */
  for(const key in fresh.obligations){
    if(data.obligations[key] === undefined) data.obligations[key] = fresh.obligations[key];
  }

  /* pda */
  for(const key in fresh.pda){
    if(data.pda[key] === undefined) data.pda[key] = fresh.pda[key];
  }

  /* dialogue */
  for(const key in fresh.dialogue){
    if(data.dialogue[key] === undefined) data.dialogue[key] = fresh.dialogue[key];
  }
}

/* ============================================================
   ХЕЛПЕРЫ · активы и обязательства
   ============================================================ */
function addAsset(kind, value){
  if(!G) return;
  if(kind === 'money'){ G.assets.money += value; return; }
  if(kind === 'inventory' && value){ G.assets.inventory.push(value); return; }
  if(kind === 'contact' && value && !G.assets.contacts.includes(value)){
    G.assets.contacts.push(value);
  }
}

function addObligation(kind, payload){
  if(!G) return;
  const bucket = {
    order:'orders', favor:'favors', debt:'debts',
    word:'words', letter:'letters',
  }[kind];
  if(!bucket) return;
  G.obligations[bucket].push(Object.assign({
    id: kind + '_' + Date.now(),
    created: G.time,
  }, payload || {}));
}

function removeObligation(id){
  if(!G) return false;
  for(const bucket of ['orders','favors','debts','words','letters']){
    const idx = G.obligations[bucket].findIndex(o => o.id === id);
    if(idx >= 0){ G.obligations[bucket].splice(idx, 1); return true; }
  }
  return false;
}
