'use strict';
/* ============================================================
   ENGINE · LVE_6 v3.4
   RNG · время · tick мира · генерация · автономные NPC ·
   слухи · артефакты · охрана.
   ============================================================ */

/* ============================================================
   §15 · RNG
   ============================================================ */
class RNG{
  constructor(seed){ this.s = (seed >>> 0) || 1; }
  next(){
    let x = this.s;
    x ^= (x << 13); x >>>= 0;
    x ^= (x >>> 17);
    x ^= (x << 5);  x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  int(a,b){ return Math.floor(this.next() * (b - a + 1)) + a; }
  pick(arr){ return arr[this.int(0, arr.length - 1)]; }
  chance(p){ return this.next() < p; }
  d20(){ return this.int(1, 20); }
}

/* ============================================================
   ФОРМАТ
   ============================================================ */
function fmtClock(t){
  const d  = Math.floor(t / 1440) + 1;
  const hh = Math.floor((t % 1440) / 60);
  const mm = t % 60;
  return 'Д' + d + ' ' + String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
}
function fmtDur(min){
  min = Math.max(0, Math.floor(min));
  if(min < 60) return min + ' мин';
  const hh = Math.floor(min / 60), mm = min % 60;
  return hh + ' ч' + (mm ? ' ' + mm + ' мин' : '');
}
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function esc(s){
  return String(s).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}

/* ============================================================
   §2.1 · ХАРАКТЕРИСТИКИ
   ============================================================ */
function statMod(v){
  let m = Math.floor((v - 5) / 2);
  if(G && G.player && G.player.stressPenalty) m -= 1;
  return m;
}
function modStr(v){ const m = statMod(v); return (m >= 0 ? '+' : '') + m; }
function modLabel(stat, val){ return stat + ' ' + modStr(val); }

/* ============================================================
   §5.8 · ГЕНДЕР И РОЛЬ
   ============================================================ */
function isF(npc){ return npc && npc.gender === 'f'; }
function heShe(npc){ return isF(npc) ? 'Она' : 'Он'; }
function heSheL(npc){ return isF(npc) ? 'она' : 'он'; }
function hisHer(npc){ return isF(npc) ? 'Её' : 'Его'; }
function hisHerL(npc){ return isF(npc) ? 'её' : 'его'; }
function saidL(npc){ return isF(npc) ? 'сказала' : 'сказал'; }
function wasL(npc){ return isF(npc) ? 'была' : 'был'; }

const ROLE_FEMALE_MAP = {
  'Паломник':'Паломница','Торговец':'Торговка','Странник':'Странница',
  'Помощник':'Помощница','Приёмщик груза':'Приёмщица груза',
  'Проповедник':'Проповедница','Повар':'Повариха','Стюард':'Стюардесса',
  'Начальник охраны':'Начальница охраны','Рабочий-ветеран':'Работница-ветеран',
  'Смотритель':'Смотритель','Инспектор Administratum':'Инспектор Administratum',
};
function roleF(npc, role){
  role = role || (npc.publicRole || npc.role);
  if(!isF(npc)) return role;
  return ROLE_FEMALE_MAP[role] || role;
}

/* ============================================================
   §2.1.8 · ЖУРНАЛ, ИСТОРИЯ, ЗНАНИЯ
   ============================================================ */
function log(text, cls){
  if(!G) return;
  G.log.push({ t: G.time, text, cls: cls || '' });
  if(G.log.length > 500) G.log.shift();
}

function historyEvent(actor, action, target, severity, witnesses){
  const ev = {
    id: 'ev' + (G.history.length + 1),
    time: G.time, area: G.area, loc: G.location,
    actor, action, target,
    severity: severity || 'minor',
    witnesses: witnesses || [],
    spread: 0,
  };
  G.history.push(ev);
  return ev;
}

function kEntry(subjectId, attribute, value, level, source, confidence, evidence){
  if(!G.playerKnowledge) G.playerKnowledge = [];
  const now = G.time;
  const key = subjectId + '|' + attribute;
  const existing = G.playerKnowledge.find(x => x.key === key && x.status === 'active');

  if(existing && existing.value === value){
    existing.epistemic_state = level;
    existing.source_type = source || existing.source_type;
    existing.confidence = confidence == null ? existing.confidence
      : Math.max(existing.confidence || 0, confidence);
    existing.last_verified_at = now;
    if(evidence) existing.evidence = [...new Set([...(existing.evidence || []), ...evidence])];
    return existing;
  }
  if(existing && existing.value !== value){
    existing.status = 'superseded';
    existing.invalidated_by = [...(existing.invalidated_by || []), 'superseded_at_' + now];
  }
  const e = {
    id: 'ke' + (G.playerKnowledge.length + 1),
    key, subjectId, attribute,
    proposition: attribute + ' = ' + value,
    value, kind: 'OBSERVATION',
    epistemic_state: level,
    source_type: source || 'SELF',
    source_id: source || null,
    observed_at: now,
    confidence: confidence == null ? 0.5 : confidence,
    scope: { area: G.area, location: G.location, time: now },
    derived_from: [],
    contradicts: existing ? [existing.id] : [],
    invalidated_by: [],
    last_verified_at: now,
    visibility: 'PLAYER_KNOWLEDGE',
    evidence: evidence ? [...evidence] : [],
    status: 'active', notes: '',
  };
  G.playerKnowledge.push(e);
  return e;
}

/* ============================================================
   §3 · ГЕНЕРАЦИЯ · destination
   ============================================================ */
function genDestination(){
  const r = G.rng;
  const sys = r.pick(WORLD_TREE);
  const planet = r.pick(sys.planets);
  const stationName = r.pick(planet.stations);
  G.destination = {
    system: sys.system,
    planet: planet.name,
    station: 'Станция «' + stationName + '»',
    resource: r.pick(['Продовольствие','Вода','Топливо','Металлы','Медикаменты']),
    required: r.int(30, 45),
    travelSmall: r.int(10, 16) * 60,
    travelLarge: r.int(16, 24) * 60,
    stationState: r.pick(['рабочая','изношенная','частично аварийная']),
    stationMood: r.pick(['лояльное','напряжённое','на грани']),
    hierarchy: { system: sys.system, planet: planet.name, station: stationName },
  };
  G.destination.deadline =
    G.time + G.destination.travelSmall + G.destination.travelLarge + r.int(6, 12) * 60;
  G.prologue.deadline = G.destination.deadline;
}

/* ============================================================
   §2.1.4 · СОЦИАЛЬНЫЙ ПРОФИЛЬ NPC
   ============================================================ */
function roleSocial(role, faction){
  const map = {
    'Капитан':         { authority:85, rank:'командование',            courage:65, obedience:50, violence:45 },
    'Пилот':           { authority:50, rank:'экипаж',                  courage:60, obedience:65, violence:35 },
    'Механик':         { authority:45, rank:'технический персонал',    courage:55, obedience:55, violence:25 },
    'Стюардесса':      { authority:25, rank:'обслуживающий персонал',  courage:55, obedience:60, violence:40 },
    'Помощник':        { authority:10, rank:'подчинённый',             courage:55, obedience:70, violence:30 },
    'Смотритель':      { authority:92, rank:'административное руководство', courage:70, obedience:88, violence:35 },
    'Инспектор Administratum': { authority:75, rank:'административная проверка', courage:55, obedience:90, violence:20 },
    'Торговый посредник':{ authority:38, rank:'контрагент',            courage:50, obedience:35, violence:20 },
    'Торговец':        { authority:36, rank:'контрагент',              courage:50, obedience:35, violence:25 },
    'Диспетчер доков': { authority:62, rank:'портовая власть',         courage:45, obedience:75, violence:20 },
    'Офицер':          { authority:74, rank:'силовой контур',          courage:78, obedience:82, violence:55 },
    'Зам':             { authority:90, rank:'административное руководство', courage:50, obedience:72, violence:25 },
    'Начальник охраны':{ authority:88, rank:'силовое руководство',     courage:90, obedience:88, violence:75 },
    'Экзаменатор':     { authority:71, rank:'экзаменационная власть',  courage:40, obedience:76, violence:10 },
    'Врач':            { authority:40, rank:'медицинская линия',       courage:50, obedience:55, violence:10 },
    'Проповедник':     { authority:55, rank:'церковная линия',         courage:50, obedience:50, violence:15 },
    'Техник':          { authority:48, rank:'технический персонал',    courage:55, obedience:60, violence:20 },
    'Рабочий-ветеран': { authority:20, rank:'рабочий',                 courage:55, obedience:50, violence:35 },
    'Приёмщик груза':  { authority:60, rank:'приёмка',                 courage:45, obedience:70, violence:15 },
    'Старший механик': { authority:60, rank:'техническое руководство', courage:60, obedience:65, violence:30 },
    'Повар':           { authority:20, rank:'бытовой',                 courage:45, obedience:50, violence:15 },
    'Паломник':        { authority:15, rank:'гражданский',             courage:45, obedience:30, violence:10 },
    'Клерк':           { authority:35, rank:'административный',        courage:35, obedience:70, violence:5 },
    'Писарь':          { authority:30, rank:'административный',        courage:35, obedience:70, violence:5 },
    'Гвардеец':        { authority:55, rank:'военный',                 courage:75, obedience:80, violence:65 },
    'Странник':        { authority:10, rank:'гражданский',             courage:50, obedience:20, violence:15 },
    'Пассажир':        { authority:15, rank:'гражданский',             courage:50, obedience:40, violence:15 },
  };
  const x = map[role] || { authority:20, rank: faction || 'гражданский', courage:50, obedience:40, violence:20 };
  return Object.assign({}, x);
}

function ensureProfiles(npc){
  if(npc.profileReady) return;
  npc.social = Object.assign(roleSocial(npc.role, npc.faction), {
    loyaltyToFaction: G.rng.int(25, 90),
    riskTolerance:    G.rng.int(20, 85),
    honesty:          G.rng.int(25, 85),
    influence:        0,
    obedienceToPlayer: 0,
    notes: [],
  });
  npc.social.influence = clamp(npc.social.authority + G.rng.int(-12, 15), 0, 100);

  npc.hierarchy = {
    superior:
      npc.faction === 'Administratum' ? 'административная линия' :
      npc.faction === 'Guard'         ? 'военная линия' :
      npc.faction === 'Mechanicus'    ? 'техническая линия' :
      npc.faction === 'Trade Houses'  ? 'контрактная линия' :
                                        'неопределённая'
  };

  npc.companionMode = null;
  npc.combatProfile = npc.combatProfile || G.rng.pick([
    { kind:'приземлённый', bravery:55, loyalty:70, violence:35, values:['выживание','дисциплина'] },
    { kind:'верный',       bravery:78, loyalty:88, violence:45, values:['долг','защита своих'] },
    { kind:'трус',         bravery:28, loyalty:55, violence:12, values:['выживание','избегание риска'] },
    { kind:'религиозный',  bravery:62, loyalty:72, violence:10, values:['долг','не убивать без крайней необходимости'] },
    { kind:'жесткач',      bravery:82, loyalty:68, violence:82, values:['сила','страх'] },
  ]);

  if(!npc.needs) initNpcNeeds(npc);
  if(!npc.wounds) npc.wounds = [];
  npc.profileReady = true;
}

function ensureTradeProfile(npc){
  if(npc.tradeProfile) return;
  if(npc.role !== 'Торговец' && npc.role !== 'Торговый посредник') return;
  npc.tradeProfile = {
    cash: G.rng.int(120, 450),
    marketKnowledge: G.rng.int(35, 90),
    urgency: G.rng.int(15, 85),
    riskTolerance: G.rng.int(25, 80),
    stock: {
      medkit: G.rng.int(1, 5),
      tool: G.rng.int(0, 2),
      ammo: G.rng.int(1, 4),
    },
    inventoryValue: { medkit:80, tool:120, ammo:100, junk:30 },
    needs: ['кредиты', 'стабильные клиенты'],
  };
}

function initNpcNeeds(npc){
  npc.needs = {
    rest:   G.rng.int(10, 40),
    food:   G.rng.int(10, 50),
    social: G.rng.int(20, 60),
  };
}

/* ============================================================
   §5.8 · РАБОЧИЕ ЛОКАЦИИ
   ============================================================ */
const WORK_LOC_MAP = {
  'Смотритель':       { planet:'arrival_terminal' },
  'Инспектор Administratum': { planet:'arrival_terminal' },
  'Капитан':          { small_ship:'bridge', large_ship:'tech_zone' },
  'Пилот':            { small_ship:'bridge', large_ship:'tech_zone' },
  'Механик':          { small_ship:'engine', large_ship:'tech_zone' },
  'Старший механик':  { large_ship:'tech_zone' },
  'Стюардесса':       { small_ship:'common' },
  'Врач':             { small_ship:'medbay', large_ship:'medbay', station:'medbay_st' },
  'Повар':            { large_ship:'kitchen' },
  'Диспетчер доков':  { planet:'dock_area' },
  'Экзаменатор':      { planet:'exam_hall' },
  'Приёмщик груза':   { planet:'arrival_terminal', station:'cargo_reception' },
  'Торговый посредник':{ planet:'tavern' },
  'Торговец':         { large_ship:'trade_row', station:'trade_row_st' },
  'Проповедник':      { planet:'tavern' },
  'Зам':              { station:'accounting' },
  'Начальник охраны': { station:'guard_sector' },
  'Техник':           { station:'tech_sector', planet:'dock_area' },
  'Рабочий-ветеран':  { station:'tavern_st' },
};
function inferWorkLocation(role, area){
  const m = WORK_LOC_MAP[role];
  return m ? (m[area] || null) : null;
}

/* ============================================================
   ФАБРИКА NPC
   ============================================================ */
function mkNpc(id, role, faction, area, loc, opts){
  opts = opts || {};
  const r = G.rng;
  const gender = opts.gender || r.pick(['m','f']);
  const firstPool = gender === 'f' ? NAMES.female : NAMES.male;
  const name = opts.name || (r.pick(firstPool) + ' ' + r.pick(NAMES.last));
  const hp = opts.hp || 8;

  const npc = {
    id, name, gender, role, faction,
    publicRole: opts.publicRole || role,
    homeSystem: opts.homeSystem || r.pick(HOME_SYSTEMS),
    hobby: opts.hobby || r.pick(HOBBIES).text,
    factionStatus: opts.factionStatus ||
      (faction && FACTIONS[faction] ? r.pick(FACTIONS[faction]) : null),

    area, location: loc,
    workLocation: opts.workLocation || inferWorkLocation(role, area),

    goal: opts.goal || 'Неизвестно',
    goalTarget: opts.goalTarget || null,
    access: opts.access || 'low',
    items: opts.items || [],
    sleeping: opts.sleeping || false,
    isHelper: opts.isHelper || false,
    following: false,
    awareOfPlayer: false,
    relation: opts.relation || 0,
    secret: opts.secret || null,

    greeted: false, generalAsked: 0, personalAsked: 0,
    askedCounts: {}, shownItems: {},
    askedBack: 0, askedMeBackAt: null,

    hp, maxHp: hp,
    state: 'alive',
    evasion: opts.evasion || 0,
    weapon: opts.weapon || 'fist',
    wounded: false, woundTime: 0, seekingHelp: false, bodyHidden: false,
    wounds: [],
    searched: false,
    seenAsCorpse: false,

    carryingBody: null,
    carryTarget: null,
    carriedBy: null,

    memory: [], relationships: {},
    lastClaim: null,
    claimedFacts: [],
    pendingQuestions: [],
    returnedQuestion: null,

    obligations: opts.obligations || null,
    taskOffered: false,
  };

  ensureProfiles(npc);
  ensureTradeProfile(npc);
  return npc;
}

/* ============================================================
   §3 · ГЕНЕРАЦИЯ NPC
   ============================================================ */
function genAllNpcs(){
  const r = G.rng;
  G.npcs = {};

  const arche = r.pick(ASSISTANT_ARCHETYPES);
  G.assistantArchetype = arche.id;

  /* Малый корабль */
  G.npcs.captain = mkNpc('captain','Капитан','Trade Houses','small_ship','bridge',{
    goal:'Довезти пассажиров и не получить взыскание',
    access:'high', items:['keycard_A'], hp:15, evasion:4, weapon:'pistol', gender:'m',
    obligations:['пассажиры','работодатель','безопасность','расписание'] });
  G.npcs.pilot = mkNpc('pilot','Пилот','Trade Houses','small_ship','bridge',{
    goal:'Не опоздать в порт', access:'high', hp:10, evasion:2, weapon:'knife' });
  G.npcs.mechanic = mkNpc('mechanic','Механик','Mechanicus','small_ship','engine',{
    goal:'Дотянуть до ремонта', access:'high', items:['tool'], hp:12, evasion:2, weapon:'tool' });
  G.npcs.steward = mkNpc('steward','Стюардесса',null,'small_ship','common',{
    goal:'Сдать смену', access:'medium', hp:8, evasion:1, gender:'f' });

  G.npcs.helper1 = mkNpc('helper1','Помощник',null,'small_ship','common',{
    goal:'Выполнить поручение', isHelper:true, access:'low', relation:12, hp:9, evasion:1 });
  G.npcs.helper1.name =
    arche.title === 'Тихоня'  ? 'Кай '  + r.pick(NAMES.last) :
    arche.title === 'Мазурик' ? 'Рэм '  + r.pick(NAMES.last) :
    arche.title === 'Вдова'   ? 'Мара ' + r.pick(NAMES.last) :
                                'Сол '  + r.pick(NAMES.last);
  G.npcs.helper1.gender = arche.title === 'Вдова' ? 'f' : 'm';
  G.npcs.helper1.archetypeData = arche;
  G.npcs.helper1.isSocialGuide = true;
  G.assistantId = 'helper1';

  const pCount = r.int(4, 6);
  for(let i = 0; i < pCount; i++){
    const tmpl = r.pick(PASSENGERS);
    G.npcs['p' + i] = mkNpc('p' + i, tmpl.role, tmpl.faction, 'small_ship',
      r.pick(['common','common','hall','medbay']),
      { goal:tmpl.goal, sleeping:r.chance(0.3),
        access:r.pick(['low','low','medium']),
        secret: r.chance(0.35) ? 'Скрывает настоящую цель' : null,
        hp: r.int(6, 9), evasion:0 });
  }

  /* Планета (док) */
  G.npcs.holt = mkNpc('holt','Экзаменатор','Administratum','planet','exam_hall',{
    goal:'Не пропустить неподготовленного', access:'medium', hp:9, evasion:1, relation:2 });
  G.npcs.senn = mkNpc('senn','Приёмщик груза','Administratum','planet','arrival_terminal',{
    goal:'Закрыть смену без недостачи', access:'medium', hp:10, evasion:1 });
  G.npcs.dispatcher = mkNpc('dispatcher','Диспетчер доков','Administratum','planet','dock_area',{
    goal:'Не потерять очередь', access:'medium', hp:9, evasion:1 });
  G.npcs.trader = mkNpc('trader','Торговый посредник','Trade Houses','planet','tavern',{
    goal:'Найти новых клиентов', access:'medium', hp:8, evasion:1 });
  G.npcs.preacher = mkNpc('preacher','Проповедник','Ecclesiarchy','planet','tavern',{
    goal:'Наставить на путь', access:'medium', hp:9, evasion:1 });

  G.npcs.dock_tech = mkNpc('dock_tech','Техник','Mechanicus','planet','dock_area',{
    goal:'Следить за сервиторами дока', access:'medium', hp:10, evasion:1, weapon:'tool' });
  G.npcs.dock_tech.isDockMechanicus = true;

  /* Смотритель */
  const overseerName = r.pick(OVERSEER_NAMES);
  const overseerFeature = r.pick([
    { kind:'scar',   text:'шрам через левую щёку' },
    { kind:'cane',   text:'лёгкая трость в правой руке' },
    { kind:'object', text:'мелкий металлический предмет, вертит в пальцах' },
  ]);
  G.npcs.overseer = mkNpc('overseer','Смотритель','Administratum','planet','arrival_terminal',{
    goal:'Не выпускать ситуацию из-под контроля',
    access:'high', hp:11, evasion:2, gender:'m', relation:3,
    name: overseerName,
    obligations:['контроль','отбор','проверка'] });
  G.npcs.overseer.publicRole = 'Смотритель';
  G.npcs.overseer.trueRole   = 'Смотритель';
  G.npcs.overseer.age        = r.int(50, 60);
  G.npcs.overseer.feature    = overseerFeature;
  G.npcs.overseer.isOverseer = true;
  G.npcs.overseer.addressAs  = 'Смотритель';

  /* Большой корабль */
  G.npcs.large_captain = mkNpc('large_captain','Капитан','Trade Houses','large_ship','tech_zone',{
    goal:'Провести рейс без потерь', access:'high', hp:15, evasion:3, weapon:'pistol',
    obligations:['пассажиры','работодатель','безопасность','расписание'] });
  G.npcs.ship_medic = mkNpc('ship_medic','Врач',null,'large_ship','medbay',{
    goal:'Лечить всех', access:'medium', hp:8, evasion:1 });
  G.npcs.ship_cook = mkNpc('ship_cook','Повар',null,'large_ship','kitchen',{
    goal:'Прокормить всех', access:'low', hp:7, evasion:0 });
  G.npcs.ship_mechanic = mkNpc('ship_mechanic','Старший механик','Mechanicus','large_ship','tech_zone',{
    goal:'Не дать системам отказать', access:'high', hp:11, evasion:2, weapon:'tool' });
  G.npcs.ship_trader = mkNpc('ship_trader','Торговец','Trade Houses','large_ship','trade_row',{
    goal:'Продать товар', access:'medium', hp:8, evasion:1 });
  G.npcs.ship_officer = mkNpc('ship_officer','Офицер','Guard','large_ship','corridor',{
    goal:'Сохранить порядок', access:'high', hp:13, evasion:3, weapon:'pistol' });
  for(let i = 0; i < 4; i++){
    const t = r.pick(PASSENGERS);
    G.npcs['lp' + i] = mkNpc('lp' + i, t.role, t.faction, 'large_ship',
      r.pick(['dorm','leisure','kitchen','corridor']),
      { goal:'Добраться до станции', sleeping:r.chance(0.2), hp:8, evasion:0 });
  }

  /* Станция */
  G.npcs.deputy = mkNpc('deputy','Зам','Administratum','station','accounting',{
    goal:'Удержать станцию в порядке', access:'high', hp:10, evasion:2, relation:5 });
  G.npcs.receiver = mkNpc('receiver','Приёмщик груза','Administratum','station','cargo_reception',{
    goal:'Закрыть приёмку', access:'medium', hp:10, evasion:1 });
  G.npcs.station_guard = mkNpc('station_guard','Начальник охраны','Guard','station','guard_sector',{
    goal:'Поддерживать порядок', access:'high', hp:16, evasion:4, weapon:'pistol' });
  G.npcs.station_medic = mkNpc('station_medic','Врач','Administratum','station','medbay_st',{
    goal:'Держать медблок', access:'medium', hp:8, evasion:1 });
  G.npcs.station_tech = mkNpc('station_tech','Техник','Mechanicus','station','tech_sector',{
    goal:'Не дать реактору упасть', access:'high', hp:11, evasion:2, weapon:'tool' });
  G.npcs.station_trader = mkNpc('station_trader','Торговец','Trade Houses','station','trade_row_st',{
    goal:'Продать партию', access:'medium', hp:8, evasion:1 });
  G.npcs.veteran = mkNpc('veteran','Рабочий-ветеран',null,'station','tavern_st',{
    goal:'Пережить смену', access:'low', hp:9, evasion:1 });

  /* Навигационный псайкер */
  const psyOnShip = r.chance(0.5);
  const psy = mkNpc('navigator_psyker','Паломник',null,
    psyOnShip ? 'large_ship' : 'planet',
    psyOnShip ? 'tech_zone' : 'dock_area',
    { goal: r.pick(['Вернуться домой','Не попасть под надзор','Заработать на переход']),
      access:'medium', hp:9, evasion:2, relation:-1 });
  psy.name = r.pick(['Морн','Кайр','Эзра','Сев','Тал']) + ' ' + r.pick(NAMES.last);
  psy.gender = 'm';
  psy.trueRole = 'Навигационный псайкер';
  psy.publicRole = 'Паломник';
  psy.navigationSkill = r.int(65, 95);
  psy.priceExpectation = r.int(100, 300);
  psy.willingness = r.int(35, 80);
  psy.navigationDiscovered = false;
  G.npcs.navigator_psyker = psy;

  /* Бывший знакомый */
  if(r.chance(0.7)){
    const g = r.pick(['m','f']);
    const firstPool = g === 'f'
      ? ['Лена','Саша','Марина','Ольга']
      : ['Илья','Матвей','Роман','Саша','Виктор'];
    const old = mkNpc('old_friend','Пассажир',null,'planet',
      r.pick(['arrival_terminal','dock_area','tavern']),
      { goal:'Понять, почему лицо кажется знакомым',
        access:'low', relation:0, hp:8, evasion:1,
        gender:g, name: r.pick(firstPool) + ' ' + r.pick(NAMES.last) });
    old.formerFriend = true;
    old.memoryState = 'fragmented';
    old.sharedPast = r.pick(['старый цех','двор','учёба','плохая работа']);
    G.npcs.old_friend = old;
  }

  /* Соцсвязи */
  const ids = Object.keys(G.npcs).filter(id => G.npcs[id].state === 'alive');
  for(const npc of Object.values(G.npcs)){
    const count = r.int(1, Math.min(3, ids.length));
    for(let i = 0; i < count; i++){
      const other = r.pick(ids);
      if(other !== npc.id) npc.relationships[other] = r.int(-35, 65);
    }
  }

  /* §3.3.3 · Случайный скрытый убийца */
  const femaleCandidates = Object.values(G.npcs).filter(n =>
    n.gender === 'f' &&
    n.id !== G.assistantId &&
    n.state === 'alive' &&
    (n.area === 'small_ship' || n.area === 'large_ship')
  );
  if(femaleCandidates.length > 0){
    const killer = r.pick(femaleCandidates);
    const victims = Object.values(G.npcs).filter(n =>
      n.id !== killer.id &&
      n.id !== 'captain' &&
      n.id !== G.assistantId &&
      n.state === 'alive' &&
      n.area === killer.area
    );
    killer.cheerful = true;
    killer.publicBehavior =
      'улыбается всем, напевает что-то себе под нос. Слишком радостно для этого места.';
    killer.isHiddenKiller = true;
    killer.hiddenIntent = {
      active: true,
      targetId: victims.length ? r.pick(victims).id : null,
      cause: r.pick(KILLER_CAUSES),
      method: 'яд',
      riskTolerance: r.int(30, 80),
      stage: 'observing',
      progress: 0, attempts: 0, witnesses: 0,
    };
  }
}

/* ============================================================
   ВРЕМЯ
   ============================================================ */
function adv(minutes, reason, cls){
  if(!G) return;
  G.time += minutes;
  if(reason) log(reason, cls || 'action');
  tickPlayerState(minutes);
  tickWorld(minutes);
  if(typeof checkArrival === 'function') checkArrival();
  if(typeof render === 'function') render();
}

function silentAdv(minutes){
  if(!G) return;
  G.time += minutes;
  tickPlayerState(minutes);
  tickWorld(minutes);
  if(typeof checkArrival === 'function') checkArrival();
}

function tickPlayerState(minutes){
  const p = G.player;
  if(!p || !p.state) return;

  const end = p.stats.end;
  const endFatigue = 1 - (statMod(end) * 0.08);
  const endHunger  = 1 - (statMod(end) * 0.06);

  p.state.fatigue   = clamp(p.state.fatigue   + minutes / 60 * endFatigue, 0, 100);
  p.state.hunger    = clamp(p.state.hunger    + minutes / 60 * endHunger,  0, 100);
  p.state.sleepDebt = clamp(p.state.sleepDebt + minutes / 30,              0, 100);

  if(G.rng.chance(0.15 * minutes / 60)){
    p.state.stress = clamp(p.state.stress + 1 - statMod(end) * 0.5, 0, 100);
  }

  p.stressPenalty = p.state.stress > 80;

  checkFaint(minutes);
}

function checkFaint(minutes){
  const s = G.player.state;
  if(s.sleepDebt < SLEEP.THRESHOLD_FAINT) return;
  const chance = SLEEP.FAINT_CHANCE_PER_HOUR * (minutes / 60);
  if(!G.rng.chance(chance)) return;

  const fainted = G.rng.int(30, 90);
  log('Вы отключились. Прямо здесь. ' + fmtDur(fainted) + ' прошло без вас.', 'danger');
  historyEvent('player', 'faint', null, 'notable', []);
  silentAdv(fainted);

  if(G.rng.chance(0.4)){
    if(G.assets.inventory.length > 0){
      const idx = G.rng.int(0, G.assets.inventory.length - 1);
      const lost = G.assets.inventory.splice(idx, 1)[0];
      log('Пропало: ' + (lost.name || lost.type) + '.', 'danger');
    } else if(G.assets.money > 20){
      const lost = Math.floor(G.assets.money * 0.2);
      G.assets.money -= lost;
      log('Пропало ' + lost + '₡.', 'danger');
    }
  }
}

/* ============================================================
   §2.1.3 · МИР · tickWorld
   ============================================================ */
function tickWorld(minutes){
  if(!G || !G.npcs) return;
  for(const npc of Object.values(G.npcs)) tickNpc(npc, minutes);
  tickLoading(minutes);
  tickWarp(minutes);
  tickAmbient(minutes);
  tickWeather(minutes);
  tickHistorySpread();
  tickPendingQuestions(minutes);
  tickPendingLunch(minutes);
  tickOverseerAlive();
  tickGossip(minutes);
  tickArtifacts(minutes);
  if(typeof tickEconomy === 'function') tickEconomy(minutes);
  if(typeof tickKiller === 'function')  tickKiller(minutes);
  if(typeof tickFinal === 'function')   tickFinal(minutes);
}

/* ============================================================
   NPC · БАЗОВЫЙ ТИК
   ============================================================ */
function tickNpc(npc, minutes){
  if(!npc) return;
  if(npc.state === 'dead'){
    /* Труп остаётся, где упал. Не двигается сам. */
    return;
  }
  tickNpcNeeds(npc, minutes);
  tickNpcWounds(npc, minutes);
  tickNpcSleep(npc, minutes);
  tickSecurityCarry(npc, minutes);
  tickNpcMovement(npc, minutes);
}

function tickNpcNeeds(npc, minutes){
  if(!npc.needs) initNpcNeeds(npc);
  const n = npc.needs;
  const hours = minutes / 60;

  n.rest = npc.sleeping ? clamp(n.rest + hours * 12, 0, 100)
                        : clamp(n.rest + hours * 3, 0, 100);
  n.food = clamp(n.food + hours * 2.4, 0, 100);

  const sameLoc = Object.values(G.npcs).filter(o =>
    o.id !== npc.id && o.area === npc.area && o.location === npc.location && o.state === 'alive');
  if(sameLoc.length > 0){
    n.social = clamp(n.social - hours * 6, 0, 100);
  } else {
    n.social = clamp(n.social + hours * 1.8, 0, 100);
  }
}

function tickNpcWounds(npc, minutes){
  if(!npc.wounded || npc.hp <= 0 || npc.state === 'dead') return;
  const woundAge = G.time - (npc.woundTime || G.time);

  if(woundAge >= 120 && !npc.seekingHelp){
    npc.seekingHelp = true;
    const medLoc =
      npc.area === 'small_ship' ? 'medbay' :
      npc.area === 'large_ship' ? 'medbay' :
      npc.area === 'station'    ? 'medbay_st' : null;
    if(medLoc && AREAS[npc.area] && AREAS[npc.area].locs[medLoc]){
      npc.location = medLoc;
      log(npc.name + ' (' + roleF(npc) + ') ' + wasL(npc) + ' в медблоке. Идёт тяжело.', 'warn');
      historyEvent('npc', 'seek_help', npc.id, 'notable', []);
    }
  }

  if(woundAge < 120) return;
  const hp = npc.hp;
  const perHour = hp <= 5 ? 0.5 : hp <= 15 ? 0.15 : 0.05;
  if(G.rng.chance((minutes / 60) * perHour)){
    npc.state = 'dead';
    npc.hp = 0;
    onNpcDeath(npc);
  }
}

function onNpcDeath(npc){
  log('☠ ' + npc.name + ' (' + roleF(npc) + ') ' +
      (isF(npc) ? 'умерла' : 'умер') + '. Тело лежит там, где упало.', 'danger');
  historyEvent('npc', 'death', npc.id, 'grave', []);

  if(npc.area === 'station' && G.station){
    if(G.station.alert !== 'ORGANIZED'){
      G.station.alert = 'ORGANIZED';
      log('Смерть на станции: охрана перекрыла сектор.', 'danger');
    }
  }

  for(const other of Object.values(G.npcs)){
    if(other.id === npc.id) continue;
    if(other.area !== npc.area) continue;
    other.awareOfPlayer = true;
    other.memory.push('death_of_' + npc.id);
  }
  G.flags.investigationActive = true;
}

function tickNpcSleep(npc, minutes){
  /* Не спит, пока тащит тело */
  if(npc.carryingBody) return;

  const hour = Math.floor((G.time % 1440) / 60);
  const isNight = hour >= 22 || hour < 6;

  if(npc.sleeping){
    if(npc.needs.rest <= 5 || (!isNight && G.rng.chance(0.02 * (minutes / 10)))){
      npc.sleeping = false;
    }
    return;
  }

  let sleepChance;
  if(npc.needs.rest > 70) sleepChance = 0.10 * (minutes / 10);
  else if(isNight)        sleepChance = 0.02 * (minutes / 10);
  else                    sleepChance = 0.003 * (minutes / 10);

  if(!G.rng.chance(sleepChance)) return;

  const area = AREAS[npc.area];
  if(!area) return;
  const sleepLocs = ['dorm','quarters','common']
    .filter(l => area.locs[l] && !area.locs[l].restrict);
  if(sleepLocs.length){
    npc.location = G.rng.pick(sleepLocs);
    npc.sleeping = true;
  }
}

/* ============================================================
   §4.5 · ОХРАНА ПОДБИРАЕТ ТЕЛА И РАНЕНЫХ
   ============================================================ */
function tickSecurityCarry(npc, minutes){
  const allowed = ['ship_officer','station_guard','large_captain','captain'];
  if(!allowed.includes(npc.role)) return;
  if(npc.state !== 'alive') return;
  if(npc.carriedBy) return;

  const area = AREAS[npc.area];
  if(!area) return;

  /* Уже тащит — идём к цели */
  if(npc.carryingBody){
    const body = G.npcs[npc.carryingBody];
    if(!body){ npc.carryingBody = null; npc.carryTarget = null; return; }

    const targetLoc = npc.carryTarget;
    if(!targetLoc || !area.locs[targetLoc]){
      body.carriedBy = null;
      npc.carryingBody = null;
      npc.carryTarget = null;
      return;
    }

    if(npc.location === targetLoc){
      /* Прибыли */
      body.location = targetLoc;
      body.carriedBy = null;
      if(G.area === npc.area){
        log(npc.name + ' положил ' + body.name + ' в ' + area.locs[targetLoc].n + '.', 'info');
      }
      historyEvent('npc', 'carry_done', body.id, 'notable', []);
      npc.carryingBody = null;
      npc.carryTarget = null;
      return;
    }

    /* Продвижение к цели */
    if(G.rng.chance(0.35 * (minutes / 10))){
      const path = findShortPath(area, npc.location, targetLoc);
      if(path && path.length > 1){
        npc.location = path[1];
        body.location = path[1];
        if(G.area === npc.area){
          log(npc.name + ' тащит ' + body.name + ' (' + area.locs[path[1]].n + ').', 'ambient');
        }
      } else {
        npc.location = targetLoc;
        body.location = targetLoc;
      }
    }
    return;
  }

  /* Ищем тело/раненого в текущей локации */
  const candidates = Object.values(G.npcs).filter(n =>
    n.id !== npc.id &&
    n.area === npc.area &&
    n.location === npc.location &&
    !n.carriedBy &&
    (n.state === 'dead' || n.state === 'unconscious')
  );
  if(!candidates.length) return;

  const dead = candidates.find(n => n.state === 'dead');
  const unconscious = candidates.find(n => n.state === 'unconscious');
  const target = dead || unconscious;
  const isDead = target.state === 'dead';

  const targetLoc = isDead
    ? (area.locs['sanitation'] ? 'sanitation'
      : area.locs['san_block'] ? 'san_block' : null)
    : (area.locs['medbay'] ? 'medbay'
      : area.locs['medbay_st'] ? 'medbay_st' : null);

  if(!targetLoc) return;

  target.carriedBy = npc.id;
  npc.carryingBody = target.id;
  npc.carryTarget = targetLoc;

  if(G.area === npc.area && G.location === npc.location){
    log(npc.name + ' ' + (isDead ? 'забрал тело ' : 'подобрал раненого ') +
      target.name + '.', 'warn');
    historyEvent('npc', 'carry_start', target.id, 'notable', []);
  }
}

/* Простой BFS по локациям области */
function findShortPath(area, from, to){
  if(from === to) return [from];
  const visited = { [from]: true };
  const queue = [[from]];
  while(queue.length){
    const path = queue.shift();
    const last = path[path.length - 1];
    const loc = area.locs[last];
    if(!loc) continue;
    for(const next of (loc.ex || [])){
      if(visited[next]) continue;
      if(!area.locs[next]) continue;
      const newPath = [...path, next];
      if(next === to) return newPath;
      visited[next] = true;
      queue.push(newPath);
    }
  }
  return null;
}

/* ============================================================
   ДВИЖЕНИЕ NPC
   ============================================================ */
function tickNpcMovement(npc, minutes){
  if(npc.sleeping) return;
  if(npc.following && npc.isHelper && npc.area === G.area) return;
  if(npc.carryingBody) return;
  if(npc.carriedBy) return;

  let baseChance = 0.06 * (minutes / 10);
  const n = npc.needs;
  if(n.rest > 70 || n.food > 70 || n.social > 70) baseChance += 0.10 * (minutes / 10);
  if(n.social > 50) baseChance += 0.05 * (minutes / 10);

  if(!G.rng.chance(baseChance)) return;

  const target = npcChooseLocation(npc);
  if(target && target !== npc.location) npc.location = target;
}

function npcChooseLocation(npc){
  const area = AREAS[npc.area];
  if(!area) return npc.location;

  const hour = Math.floor((G.time % 1440) / 60);
  const isWorkHours = hour >= 8 && hour < 20;

  const roleLock = {
    'Смотритель':       ['arrival_terminal','dock_area','checkpoint','exam_hall'],
    'Инспектор Administratum': ['arrival_terminal','dock_area','checkpoint','exam_hall'],
    'Экзаменатор':      ['exam_hall'],
    'Пилот':            ['bridge','hall','common','sanitation'],
    'Капитан':          ['bridge','common'],
    'Механик':          ['engine','hall','common'],
    'Старший механик':  ['tech_zone','corridor','cargo_zone'],
    'Повар':            ['kitchen','corridor','leisure'],
    'Врач':             ['medbay','corridor','medbay_st'],
    'Стюардесса':       ['common','hall','leisure','kitchen'],
  }[npc.role];

  const forbidden = new Set(['cabin','quarters']);
  if(npc.area === 'small_ship') forbidden.add('cabin');

  const candidates = [];

  if(npc.workLocation && area.locs[npc.workLocation] && isWorkHours){
    candidates.push({ loc: npc.workLocation, weight: 5 });
  }

  const hobby = HOBBIES.find(h => h.text === npc.hobby);
  if(hobby){
    for(const locId of hobby.locs){
      if(forbidden.has(locId)) continue;
      if(area.locs[locId] && !area.locs[locId].restrict){
        candidates.push({ loc: locId, weight: 3 });
      }
    }
  }

  if(npc.needs.rest > 60){
    for(const locId of ['dorm','quarters']){
      if(forbidden.has(locId)) continue;
      if(area.locs[locId] && !area.locs[locId].restrict) candidates.push({ loc: locId, weight: 4 });
    }
  }
  if(npc.needs.food > 60){
    for(const locId of ['kitchen','tavern','tavern_st','leisure']){
      if(area.locs[locId] && !area.locs[locId].restrict) candidates.push({ loc: locId, weight: 4 });
    }
  }
  if(npc.needs.social > 60){
    for(const locId of ['leisure','common','tavern','tavern_st','corridor']){
      if(area.locs[locId] && !area.locs[locId].restrict) candidates.push({ loc: locId, weight: 3 });
    }
  }

  let filtered = candidates;
  if(roleLock) filtered = filtered.filter(c => roleLock.includes(c.loc));
  filtered = filtered.filter(c => !forbidden.has(c.loc));

  if(!filtered.length){
    const open = Object.keys(area.locs).filter(l =>
      !area.locs[l].restrict && !forbidden.has(l));
    return open.length ? G.rng.pick(open) : npc.location;
  }

  const total = filtered.reduce((s,c) => s + c.weight, 0);
  let roll = G.rng.next() * total;
  for(const c of filtered){
    roll -= c.weight;
    if(roll <= 0) return c.loc;
  }
  return filtered[0].loc;
}

/* ============================================================
   §3.4 · ПОГРУЗКА
   ============================================================ */
function tickLoading(minutes){
  const L = G.prologue.loadingBg;
  if(!L || !L.active) return;
  if(L.phase !== 'active') return;

  /* Поломка оборудования */
  if(G.rng.chance(0.001 * minutes)){
    const eq = G.rng.pick(Object.values(L.equipment));
    if(!eq.broken && eq.condition > 0){
      eq.broken = true;
      eq.condition = Math.max(0, eq.condition - 30);
      log('⚠ ' + eq.name + ' отказал. Работа встала на этом участке.', 'danger');
    }
  }

  /* Усталость бригады */
  for(const c of L.crew){
    if(c.working) c.fatigue = Math.min(100, c.fatigue + minutes * 0.08);
  }

  /* Сервиторы выбирают, что грузить */
  const plan = L.plan;
  let activeServitors = 0;
  for(const s of Object.values(L.servitors)){
    if(s.condition <= 0){ s.lastAction = 'сломан'; continue; }
    if(!s.task){
      for(const pid of s.priority){
        if(pid === 'mission' && L.currentTons < plan.missionTarget){ s.task = 'mission'; break; }
        if(pid === 'extra' && plan.extraResource && L.extraTons < plan.extraTarget){ s.task = 'extra'; break; }
      }
    }
    if(s.task){
      activeServitors++;
      s.lastAction = 'грузит ' + (s.task === 'mission' ? 'основной ресурс' : 'доп. ресурс');
    }
  }

  /* Скорость */
  const workingCrew = L.crew.filter(c => c.working && c.fatigue < 90).length;
  const equipmentOK = (L.equipment.crane.broken ? 0 : 1) +
                      (L.equipment.loader.broken ? 0 : 1);
  L.rate = (activeServitors * 0.25 + workingCrew * 0.10) * (equipmentOK / 2);

  /* Прогресс */
  const eff = L.rate * (minutes / 10);
  const activeList = Object.values(L.servitors).filter(s => s.task && s.condition > 0);
  for(const s of activeList){
    const share = eff / Math.max(1, activeList.length);
    if(s.task === 'mission' && L.currentTons < plan.missionTarget){
      L.currentTons = Math.min(plan.missionTarget, L.currentTons + share);
    } else if(s.task === 'extra' && plan.extraResource && L.extraTons < plan.extraTarget){
      L.extraTons = Math.min(plan.extraTarget, L.extraTons + share);
    }
    s.condition = Math.max(0, s.condition - minutes * 0.02);
  }

  L.progress = ((L.currentTons + L.extraTons + L.smuggledTons) /
                Math.max(1, plan.missionTarget + plan.extraTarget + L.smuggledTons)) * 100;

  /* Инцидент — один раз */
  if(!L.incidentShown && G.time >= L.nextIncidentAt){
    L.incidentShown = true;
    triggerLoadingIncident();
  }

  /* Инцидент ждёт решения — авто-разрешение */
  if(L.pendingIncident && !L.pendingIncident.resolved && G.time >= L.incidentAutoResolveAt){
    autoResolveLoadingIncident();
    /* Если игрок так и не открыл — снимаем флаг, чтобы не висла модалка */
    if(G.flags.showLoadingIncident) G.flags.showLoadingIncident = null;
  }

  /* Завершение */
  const targetReached = L.currentTons >= plan.missionTarget &&
    (!plan.extraResource || L.extraTons >= plan.extraTarget);
  if(targetReached && !G.prologue.missionLoaded){
    G.prologue.missionLoaded = true;
    L.active = false;
    L.phase = 'done';
    log('Погрузка завершена: ' + L.currentTons.toFixed(1) +
      (plan.extraResource ? ' + ' + L.extraTons.toFixed(1) + ' доп.' : '') +
      ' т.', 'good');
    historyEvent('world', 'loading_complete', null, 'notable', []);
  }
}

/* ============================================================
   §3.4.5 · ИНЦИДЕНТ ПРИ ПОГРУЗКЕ · через КПК
   ============================================================ */
   function triggerLoadingIncident(){
    const L = G.prologue.loadingBg;
    if(!L) return;
  
    const types = ['smuggle','servitor_break','worker_injury','equipment_break','discipline'];
    const type = G.rng.pick(types);
  
    const incident = buildLoadingIncident(type, L);
    if(!incident) return;
  
    L.pendingIncident = {
      type,
      data: incident.data,
      at: G.time,
      resolved: false,
    };
    L.incidentAutoResolveAt = G.time + 30;
  
    sendPdaMessage({
      id: 'inc_' + Date.now(),
      time: G.time,
      from: 'Док · площадка погрузки',
      title: incident.title,
      body: incident.body,
      type: 'incident',
      payload: { incidentType: type },
    });
  
    /* Флаг: показать модалку при ближайшем render(),
       только если игрок на площадке или в доковой зоне. */
    G.flags.showLoadingIncident = type;
  
    log('⚠ Инцидент на площадке погрузки. Откройте КПК или подойдите.', 'warn');
  }

function buildLoadingIncident(type, L){
  const r = G.rng;

  if(type === 'smuggle'){
    const pick = r.pick([
      { resource:'Оружие',         icon:'🔫' },
      { resource:'Медикаменты',    icon:'💊' },
      { resource:'Продовольствие', icon:'🍞' },
      { resource:'Топливо',        icon:'⚗' },
    ]);
    return {
      title: '⚠ Сервитор ?02 — не по плану',
      body: 'Сервитор ?02 отклонился от задачи. Тащит в трюм ящик, ' +
        'которого нет в накладной. Метка: ' + pick.icon + ' ' + pick.resource + '. ' +
        'Он не отвечает на команды.',
      data: { resource: pick.resource },
    };
  }

  if(type === 'servitor_break'){
    const sid = r.pick(Object.keys(L.servitors));
    return {
      title: '⚠ ' + sid + ' — отказ',
      body: sid + ' дёрнулся и замер. Дымок из корпуса. Он больше не грузит.',
      data: { sid },
    };
  }

  if(type === 'worker_injury'){
    const w = r.pick(L.crew);
    return {
      title: '⚠ Несчастный случай',
      body: w.name + ' упал с поддона. Тянет ногу. Бригада приостановила работу.',
      data: { workerId: w.id, workerName: w.name },
    };
  }

  if(type === 'equipment_break'){
    const eid = r.pick(Object.keys(L.equipment));
    const eq = L.equipment[eid];
    return {
      title: '⚠ ' + eq.name + ' — отказ',
      body: eq.name + ' заклинило. Работа встала на этом участке.',
      data: { eid },
    };
  }

  if(type === 'discipline'){
    const w = r.pick(L.crew);
    const reason = r.pick([
      'требует доплаты за переработку',
      'отказывается работать, пока не выдадут паёк',
      'ругается с бригадиром',
      'просто бросил работу',
    ]);
    return {
      title: '⚠ Нарушение дисциплины',
      body: w.name + ' ' + reason + '. Остальные смотрят.',
      data: { workerId: w.id, workerName: w.name, reason },
    };
  }

  return null;
}

function openLoadingIncidentModal(type){
  const L = G.prologue.loadingBg;
  if(!L || !L.pendingIncident) return;
  const data = L.pendingIncident.data;

  if(type === 'smuggle')             openIncidentSmuggle(L, data);
  else if(type === 'servitor_break') openIncidentServitorBreak(L, data);
  else if(type === 'worker_injury')  openIncidentWorkerInjury(L, data);
  else if(type === 'equipment_break') openIncidentEquipmentBreak(L, data);
  else if(type === 'discipline')     openIncidentDiscipline(L, data);
}

function resolveLoadingIncident(){
  const L = G.prologue.loadingBg;
  if(!L || !L.pendingIncident) return;
  L.pendingIncident.resolved = true;
  const msgs = G.pda.messages || [];
  const last = msgs.find(m => m.type === 'incident' && !m.resolved);
  if(last) last.resolved = true;
  L.phase = 'active';
}

function openIncidentSmuggle(L, data){
  G.modal = { type:'action',
    title:'⚠ Сервитор ?02 — не по плану',
    desc:'Сервитор ?02 тащит ящик с меткой ' + data.resource + '. Не по накладной.',
    methods:[
      { label:'Остановить сервитора', time:10,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          log('Сервитор остановлен. Ящик выгружен обратно.', 'warn');
          adv(10, null);
        }},
      { label:'Посмотреть, что в ящике', time:5,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          log('В ящике: ' + data.resource + '. 5–9 т. Не по накладной.', 'warn');
          kEntry('loading_incident', 'cargo',
            data.resource + ' в трюме, не по накладной',
            'OBSERVED', 'наблюдение', 0.9);
          adv(5, null);
        }},
      { label:'Оставить как есть', time:0,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          const tons = G.rng.int(5, 9);
          L.smuggledTons += tons;
          G.prologue.smuggledTons = L.smuggledTons;
          G.prologue.smuggledResource = data.resource;
          log('Сервитор загрузил ' + tons + ' т ' + data.resource + '. Не по накладной.', 'danger');
          historyEvent('player', 'smuggle_allow', null, 'grave', []);
          adv(0, null);
        }},
    ]};
  renderModal();
}

function openIncidentServitorBreak(L, data){
  const sid = data.sid;
  const s = L.servitors[sid];
  if(!s){ resolveLoadingIncident(); return; }

  G.modal = { type:'action',
    title:'⚠ ' + sid + ' — отказ',
    desc: sid + ' дёрнулся и замер. Дымок из корпуса.',
    methods:[
      { label:'Починить самому', time:20,
        mod: modLabel('ИНТ', G.player.stats.int),
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          const roll = G.rng.d20() + statMod(G.player.stats.int) + (hasItem('tool') ? 4 : 0);
          if(roll >= 12){
            s.condition = 60;
            s.task = null;
            log(sid + ': восстановлен. Состояние 60%. (d20 → ' + roll + ')', 'good');
          } else {
            s.condition = 0; s.task = null; s.lastAction = 'сломан';
            log(sid + ': не получилось. (d20 → ' + roll + ')', 'warn');
          }
          adv(20, null);
        }},
      { label:'Позвать техника', time:30,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          const dockTech = G.npcs.dock_tech;
          if(dockTech && dockTech.state === 'alive'){
            s.condition = 75; s.task = null;
            log(dockTech.name + ' починил ' + sid + '.', 'good');
          } else {
            s.condition = 0; s.task = null; s.lastAction = 'сломан';
            log('Техника рядом нет. Сервитор простаивает.', 'warn');
          }
          adv(30, null);
        }},
      { label:'Оставить', time:0,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          s.condition = 0; s.task = null; s.lastAction = 'сломан';
          log(sid + ' остаётся сломанным. Скорость упала.', 'warn');
          adv(0, null);
        }},
    ]};
  renderModal();
}

function openIncidentWorkerInjury(L, data){
  const w = L.crew.find(c => c.id === data.workerId) || L.crew[0];
  if(!w){ resolveLoadingIncident(); return; }

  G.modal = { type:'action',
    title:'⚠ Несчастный случай',
    desc: w.name + ' упал с поддона. Тянет ногу.',
    methods:[
      { label:'Оказать помощь (аптечка)', time:10,
        disabled: !hasItem('medkit'),
        onClick:() => {
          const idx = G.assets.inventory.findIndex(x => x.type === 'medkit');
          if(idx >= 0) G.assets.inventory.splice(idx, 1);
          closeModal();
          resolveLoadingIncident();
          w.working = true;
          w.fatigue = Math.max(0, w.fatigue - 10);
          log(w.name + ': перевязали. Вернулся в строй.', 'good');
          historyEvent('player', 'heal', null, 'notable', []);
          adv(10, null);
        }},
      { label:'Отправить к врачу', time:30,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          w.working = false;
          log(w.name + ' ушёл к врачу. На смену не вернётся.', 'warn');
          adv(30, null);
        }},
      { label:'Игнорировать', time:0,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          w.working = true;
          w.fatigue = Math.min(100, w.fatigue + 15);
          log(w.name + ' продолжает хромать.', 'warn');
          adv(0, null);
        }},
    ]};
  renderModal();
}

function openIncidentEquipmentBreak(L, data){
  const eq = L.equipment[data.eid];
  if(!eq){ resolveLoadingIncident(); return; }
  eq.broken = true;
  eq.condition = Math.max(0, eq.condition - 30);

  G.modal = { type:'action',
    title:'⚠ ' + eq.name + ' — отказ',
    desc: eq.name + ' заклинило.',
    methods:[
      { label:'Починить', time:20,
        mod: modLabel('ИНТ', G.player.stats.int),
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          const roll = G.rng.d20() + statMod(G.player.stats.int) + (hasItem('tool') ? 4 : 0);
          if(roll >= 12){
            eq.broken = false;
            eq.condition = Math.min(100, eq.condition + 15);
            log(eq.name + ': починен. (d20 → ' + roll + ')', 'good');
          } else {
            log(eq.name + ': не получилось. (d20 → ' + roll + ')', 'warn');
          }
          adv(20, null);
        }},
      { label:'Позвать механика', time:30,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          const dockTech = G.npcs.dock_tech;
          if(dockTech && dockTech.state === 'alive'){
            eq.broken = false;
            eq.condition = Math.min(100, eq.condition + 20);
            log(dockTech.name + ' запустил ' + eq.name + '.', 'good');
          } else {
            log('Механик занят. Оборудование стоит.', 'warn');
          }
          adv(30, null);
        }},
      { label:'Ждать', time:60,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          log(eq.name + ' стоит час.', 'warn');
          adv(60, null);
        }},
    ]};
  renderModal();
}

function openIncidentDiscipline(L, data){
  const w = L.crew.find(c => c.id === data.workerId) || L.crew[0];
  if(!w){ resolveLoadingIncident(); return; }

  G.modal = { type:'action',
    title:'⚠ Нарушение дисциплины',
    desc: w.name + ' ' + (data.reason || 'отказывается работать') + '.',
    methods:[
      { label:'Пригрозить', time:5, mod: modLabel('ХАР', G.player.stats.cha),
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          const roll = G.rng.d20() + statMod(G.player.stats.cha);
          if(roll >= 12){
            w.working = true;
            w.fatigue = Math.max(0, w.fatigue - 5);
            log(w.name + ' вернулся к работе. (d20 → ' + roll + ')', 'good');
          } else {
            w.working = false;
            log(w.name + ' огрызнулся и отошёл.', 'warn');
          }
          adv(5, null);
        }},
      { label:'Доплатить (30₡)', time:5, disabled: G.assets.money < 30,
        onClick:() => {
          G.assets.money -= 30;
          closeModal();
          resolveLoadingIncident();
          w.working = true;
          w.fatigue = Math.max(0, w.fatigue - 20);
          log('Бригада получила 30₡. ' + w.name + ' вернулся.', 'good');
          adv(5, null);
        }},
      { label:'Уволить', time:10,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          w.working = false;
          L.crew = L.crew.filter(c => c.id !== w.id);
          log(w.name + ' снят со смены.', 'warn');
          adv(10, null);
        }},
      { label:'Отпустить', time:0,
        onClick:() => {
          closeModal();
          resolveLoadingIncident();
          w.working = false;
          log(w.name + ' ушёл. Работа встала.', 'warn');
          adv(0, null);
        }},
    ]};
  renderModal();
}

function autoResolveLoadingIncident(){
  const L = G.prologue.loadingBg;
  if(!L || !L.pendingIncident || L.pendingIncident.resolved) return;

  const type = L.pendingIncident.type;
  const data = L.pendingIncident.data;

  if(type === 'smuggle'){
    const tons = G.rng.int(5, 9);
    L.smuggledTons += tons;
    G.prologue.smuggledTons = L.smuggledTons;
    G.prologue.smuggledResource = data.resource;
    log('Пока вы не отвечали, сервитор загрузил ' + tons + ' т ' + data.resource + '.', 'danger');
  } else if(type === 'servitor_break'){
    const s = L.servitors[data.sid];
    if(s){ s.condition = 0; s.task = null; s.lastAction = 'сломан'; }
    log('Сервитор ' + data.sid + ' остаётся сломанным.', 'warn');
  } else if(type === 'worker_injury'){
    const w = L.crew.find(c => c.id === data.workerId);
    if(w){ w.working = false; }
    log((data.workerName || 'Рабочий') + ' сам ушёл к врачу.', 'warn');
  } else if(type === 'equipment_break'){
    const eq = L.equipment[data.eid];
    log((eq ? eq.name : 'Оборудование') + ' остаётся сломанным.', 'warn');
  } else if(type === 'discipline'){
    const w = L.crew.find(c => c.id === data.workerId);
    if(w){ w.working = false; }
    log((data.workerName || 'Рабочий') + ' ушёл с площадки.', 'warn');
  }

  L.pendingIncident.resolved = true;
  const last = (G.pda.messages || []).find(m => m.type === 'incident' && !m.resolved);
  if(last){ last.resolved = true; last.autoResolved = true; }
}

/* ============================================================
   §10.14 · КПК · сообщения
   ============================================================ */
function sendPdaMessage(msg){
  if(!G.pda.messages) G.pda.messages = [];
  G.pda.messages.push(Object.assign({
    read: false,
    resolved: false,
  }, msg));
  if(G.pda.messages.length > 50) G.pda.messages.shift();
}

/* ============================================================
   §4.3 · WARP
   ============================================================ */
function warpStage(exposure){
  const t = WARP.THRESHOLDS;
  for(let i = t.length - 1; i >= 0; i--){
    if(exposure >= t[i].at) return t[i];
  }
  return t[0];
}

function tickWarp(minutes){
  const pressure = (G.warp.exposure > 0 ? 0.008 : 0.002) +
    ((G.player && G.player.state.stress > 60) ? 0.004 : 0);
  if(G.rng.chance(pressure * (minutes / 10))){
    triggerWarpWhisper();
  }
}

const WARP_WHISPERS = [
  { text:'На секунду кажется, что стены сдвинулись на палец в сторону.', add:1 },
  { text:'Чей-то шёпот. Не разобрать слов, но интонация — знакомая.',    add:2 },
  { text:'Отражение в металле смотрит на вас чуть дольше, чем должно.',  add:1 },
  { text:'Из вентиляции тянет холодом. Не бытовым — другим.',            add:2 },
  { text:'Все звуки пропадают на полсекунды. Потом возвращаются.',       add:1 },
  { text:'В углу зрения что-то стоит. Когда поворачиваешься — пусто.',   add:3 },
  { text:'Пальцы на секунду забывают, как держать предмет.',             add:1 },
  { text:'Кто-то произносит ваше имя. Никого рядом нет.',                add:4 },
];

function triggerWarpWhisper(){
  const w = G.rng.pick(WARP_WHISPERS);
  G.warp.exposure = clamp(G.warp.exposure + w.add, 0, WARP.SCALE_MAX);
  G.warp.whisperActive = true;
  log('✦ ' + w.text + ' (warp +' + w.add + ', всего ' + G.warp.exposure + ')', 'warp');
  historyEvent('world', 'warp_touch', null, 'notable', []);

  if(G.warp.exposure >= 50 && !G.flags.warpWarning){
    G.flags.warpWarning = true;
    log('Warp больше не шепчет. Он смотрит.', 'danger');
  }
}

/* ============================================================
   AMBIENT · ПОГОДА · СЛУХИ
   ============================================================ */
function tickAmbient(minutes){
  G.ambientTick = (G.ambientTick || 0) + minutes;
  if(G.ambientTick < 60) return;
  G.ambientTick = 0;
  if(G.rng.chance(0.45)) log(G.rng.pick(AMBIENT), 'ambient');
}

function tickWeather(minutes){
  if(G.area !== 'planet') return;
  if(!G.rng.chance(0.01 * (minutes / 10))) return;
  const list = ['ясно','облачно','пыль','кислотный дождь','гроза'];
  const nw = G.rng.pick(list);
  if(nw !== G.weather){
    G.weather = nw;
    log('Погода сменилась: ' + nw + '. Как обычно, не вовремя.', 'ambient');
  }
}

function tickHistorySpread(){
  for(const ev of G.history){
    if(ev.spread >= 3) continue;
    const age = G.time - ev.time;
    if(age >  60 && ev.spread < 1) ev.spread = 1;
    if(age > 180 && ev.spread < 2) ev.spread = 2;
    if(age > 360 && ev.spread < 3) ev.spread = 3;
  }
}

/* ============================================================
   §5.2 L3 · ОТЛОЖЕННЫЕ ВОПРОСЫ
   ============================================================ */
function scheduleNpcQuestion(npc, question, thinkMinutes){
  if(!npc) return;
  if(!npc.pendingQuestions) npc.pendingQuestions = [];
  const think = thinkMinutes || G.rng.int(60, 240);
  npc.pendingQuestions.push({
    id: 'pq_' + Date.now() + '_' + G.rng.int(0, 999),
    question,
    askedAt: G.time,
    answerAt: G.time + think,
    contextArea: npc.area,
  });
}

function tickPendingQuestions(minutes){
  for(const npc of Object.values(G.npcs)){
    if(!npc.pendingQuestions || !npc.pendingQuestions.length) continue;
    if(npc.state === 'dead' || npc.sleeping) continue;

    for(let i = npc.pendingQuestions.length - 1; i >= 0; i--){
      const q = npc.pendingQuestions[i];
      if(G.time < q.answerAt) continue;
      if(npc.area !== G.area) continue;
      if(G.combat && G.combat.active) continue;
      if(G.modal && G.modal.type === 'dialogue') continue;

      npc.returnedQuestion = q;
      log(npc.name + ' возвращается к прежнему разговору: «Я подумал...»', 'callback');
      historyEvent('npc', 'question_return', npc.id, 'notable', []);
      npc.pendingQuestions.splice(i, 1);
    }
  }
}

/* ============================================================
   §3.3 · ОБЕД ОТ СТЮАРДЕССЫ
   ============================================================ */
function tickPendingLunch(minutes){
  const pl = G.flags.pendingLunch;
  if(!pl || pl.served) return;
  if(G.time < pl.at) return;

  const st = G.npcs.steward;
  if(st && st.state === 'alive' && st.area === G.area){
    G.assets.inventory.push(makeItem('lunch'));
    log(st.name + ' вернулась с обедом и поставила его рядом.', 'good');
    if(typeof applyStress === 'function') applyStress(-5, 'горячая еда');
    pl.served = true;
  } else if(G.time > pl.at + 30){
    log('Обед так и не принесли. Стюардесса где-то задержалась.', 'warn');
    pl.served = true;
  }
}

/* ============================================================
   §6.11 · ЗАМЕНА СМОТРИТЕЛЯ
   ============================================================ */
function tickOverseerAlive(){
  const os = G.npcs.overseer;
  if(!os) return;
  if(os.state !== 'dead') return;
  if(G.flags.overseerReplaced) return;

  G.flags.overseerReplaced = true;
  G.flags.overseerKilledAt = G.time;
  G.flags.overseerKilledIn = G.area;

  const witnesses = (G.history || []).filter(e =>
    e.actor === 'player' &&
    e.action === 'murder' &&
    e.target === 'overseer' &&
    e.witnesses && e.witnesses.length > 0
  );
  const witnessed = witnesses.length > 0;

  if(witnessed){
    G.flags.overseerWitnessed = true;
    if(G.area === 'small_ship' && G.ship){
      G.ship.alert = 'ORGANIZED';
    } else if(G.area === 'large_ship' && G.ship){
      G.ship.alert = 'ORGANIZED';
    } else if(G.area === 'station' && G.station){
      G.station.alert = 'ORGANIZED';
    } else {
      G.flags.planetAlert = true;
    }
    log('Тревога. Смерть Смотрителя. Кто-то видел. Свидетели уже говорят.', 'danger');
    log('Убийца на борту. Опасность.', 'danger');
    historyEvent('world', 'overseer_investigation', 'overseer', 'grave', []);
  } else {
    const newName = G.rng.pick(OVERSEER_SUBSTITUTE_NAMES);
    G.npcs.overseer.publicRole = 'Инспектор Administratum';
    G.npcs.overseer.trueRole   = 'Инспектор Administratum';
    G.npcs.overseer.addressAs  = 'Инспектор';
    G.npcs.overseer.name       = newName;
    G.npcs.overseer.isSubstitute = true;
    G.npcs.overseer.isOverseer = false;
    G.npcs.overseer.state = 'alive';
    G.npcs.overseer.hp = 11;
    G.npcs.overseer.maxHp = 11;
    G.npcs.overseer.wounds = [];
    G.npcs.overseer.location = 'arrival_terminal';
    G.npcs.overseer.area = 'planet';
    G.npcs.overseer.relation = 0;
    G.npcs.overseer.greeted = false;
    G.npcs.overseer.generalAsked = 0;
    G.npcs.overseer.personalAsked = 0;
    G.npcs.overseer.askedCounts = {};
    G.npcs.overseer.workLocation = 'arrival_terminal';

    log('Смотрителя нет. Вместо него — представитель Administratum. ' +
        'Другой человек, другая должность.', 'warn');
    log(newName + ' прибыл на смену.', 'info');
    historyEvent('world', 'overseer_replaced', 'overseer', 'notable', []);
  }
}

/* ============================================================
   §5.4 · СЛУХИ · NPC делятся увиденным
   ============================================================ */
function tickGossip(minutes){
  const byLoc = {};
  for(const npc of Object.values(G.npcs)){
    if(npc.state !== 'alive') continue;
    if(npc.sleeping) continue;
    if(npc.carryingBody || npc.carriedBy) continue;
    if(npc.following && npc.isHelper) continue;
    const key = npc.area + '|' + npc.location;
    if(!byLoc[key]) byLoc[key] = [];
    byLoc[key].push(npc);
  }

  for(const key in byLoc){
    const group = byLoc[key];
    if(group.length < 2) continue;

    const meetingChance = 0.08 * (minutes / 10);
    if(!G.rng.chance(meetingChance)) continue;

    const a = G.rng.pick(group);
    const b = G.rng.pick(group.filter(n => n.id !== a.id));
    if(!a || !b) continue;

    trySpreadGossip(a, b);
  }

  /* Раз в ~4 часа — проверка пропаж */
  if(!G.flags.nextMissingCheck || G.time >= G.flags.nextMissingCheck){
    G.flags.nextMissingCheck = G.time + 4 * 60;
    checkMissingNpcs();
  }
}

function trySpreadGossip(from, to){
  const rel = (from.relationships && from.relationships[to.id]) || 0;
  const relBonus = rel >= 20 ? 0.25 : rel >= 0 ? 0.10 : rel <= -20 ? -0.20 : 0;
  const hobbyBonus = (from.hobby || '').includes('сплетни') ? 0.15 : 0;
  const honestyPenalty = from.social && from.social.honesty < 30 ? -0.15 : 0;
  const base = 0.35;

  const chance = clamp(base + relBonus + hobbyBonus + honestyPenalty, 0.05, 0.85);
  if(!G.rng.chance(chance)) return;

  if(!from.memory) from.memory = [];
  if(!to.memory) to.memory = [];

  const now = G.time;
  const freshEvents = G.history.filter(e =>
    from.memory.includes(e.id) &&
    !to.memory.includes(e.id) &&
    now - e.time <= 4 * 60 &&
    e.severity !== 'minor'
  );

  if(freshEvents.length){
    const ev = freshEvents[freshEvents.length - 1];
    to.memory.push(ev.id);
    G.flags.gossipTotal = (G.flags.gossipTotal || 0) + 1;

    if(G.area === from.area && G.location === from.location){
      if(G.rng.chance(0.15)){
        const title = gossipTitle(ev);
        log(from.name + ' тихо рассказывает ' + to.name + ': ' + title, 'ambient');
      }
    }
  }
}

function gossipTitle(ev){
  const map = {
    kill:       'про убийство',
    murder:     'про смерть',
    steal:      'про кражу',
    steal_fail: 'про то, что кого-то поймали',
    bully:      'про грубость',
    help:       'про помощь',
    heal:       'про лечение',
    combat_start:'про драку',
    knockout:   'про драку',
    smuggle_allow:'про странный груз',
    unload_smuggle:'про разгрузку',
    killer_success:'про смерть',
    killer_fail:'про попытку убийства',
    overseer_replaced:'про смену власти',
    overseer_investigation:'про расследование',
  };
  return map[ev.action] || 'про что-то';
}

function getGossipSpread(evId){
  let count = 0;
  for(const npc of Object.values(G.npcs)){
    if(npc.memory && npc.memory.includes(evId)) count++;
  }
  return count;
}

/* ============================================================
   §5.4 · ПРОПАЖА · если NPC давно не видели
   ============================================================ */
function checkMissingNpcs(){
  for(const dead of Object.values(G.npcs)){
    if(dead.state !== 'dead') continue;
    if(dead.bodyHidden) continue;
    if(dead.missingReported) continue;

    const sinceDeath = G.time - (dead.woundTime || dead.deathAt || 0);
    if(!dead.seenAsCorpse && G.rng.chance(0.15)){
      const areaNpcs = Object.values(G.npcs).filter(n =>
        n.area === dead.area && n.state === 'alive' && !n.sleeping
      );
      if(!areaNpcs.length) continue;
      const observer = G.rng.pick(areaNpcs);
      observer.memory = observer.memory || [];
      const ev = historyEvent('npc', 'missing_reported', dead.id, 'notable', []);
      observer.memory.push(ev.id);
      dead.missingReported = true;
      if(G.area === dead.area){
        log(observer.name + ': «А где ' + dead.name + '? Давно не видел(а).»', 'warn');
      }
    }
  }
}

/* ============================================================
   §4.4 · АРТЕФАКТЫ
   ============================================================ */
function genSleepStoneArtifact(){
  const r = G.rng;
  const buff = r.pick(SLEEP_STONE_BUFFS);
  const debuff = r.pick(SLEEP_STONE_DEBUFFS);
  return {
    id: 'sleep_stone_' + r.int(100, 999),
    type: 'sleep_stone',
    name: 'Камень из коробки',
    icon: '🪨',
    desc: 'Тяжёлый. Тёплый. Не надеть.',
    artifact: true,
    artifactType: 'warp',
    source: 'find',
    attunement: 0,
    charge: clamp(50 + r.int(-20, 20), 10, 100),
    warp_level: clamp(30 + r.int(-10, 20), 5, 80),
    effects: [buff],
    hidden_effects: [debuff],
    known_by: {},
    state: 'dormant',
    location: 'inventory',
    activationAt: null,
  };
}

function tickArtifacts(minutes){
  const arts = (G.assets.inventory || []).filter(it =>
    it.artifact && it.state === 'active' && it.location === 'inventory');
  if(!arts.length) return;

  for(const art of arts){
    if(!art.activationAt) art.activationAt = G.time;
    const hoursActive = (G.time - art.activationAt) / 60;

    if(hoursActive >= 24 && !art.notified24h){
      art.notified24h = true;
      sendPdaMessage({
        id: 'art24_' + art.id,
        time: G.time,
        from: 'Неизвестный источник',
        title: 'С вами что-то не так',
        body: 'Кто-то спрашивал про вас. Про ваши вещи.\n\n' +
          '«Камень. Откуда он у вас?»',
        type: 'artifact_warning',
      });
      log('КПК: странное сообщение про вещи.', 'warn');
    }

    if(hoursActive >= 48 && !art.notified48h){
      art.notified48h = true;
      const faction = pickFactionForArtifact(art);
      if(faction){
        sendPdaMessage({
          id: 'art48_' + art.id,
          time: G.time,
          from: faction,
          title: 'Хотим взглянуть',
          body: 'У нас есть вопросы к вашему имуществу.\n\n' +
            'Мы будем на связи.',
          type: 'artifact_faction',
        });
        log(faction + ': вопросы к вашим вещам.', 'danger');
      }
    }
  }
}

function pickFactionForArtifact(art){
  if(art.artifactType !== 'warp') return null;
  const hasEccl = Object.values(G.npcs).some(n =>
    n.faction === 'Ecclesiarchy' && n.state === 'alive' && n.area === G.area);
  if(hasEccl) return 'Ecclesiarchy';
  const hasMech = Object.values(G.npcs).some(n =>
    n.faction === 'Mechanicus' && n.state === 'alive' && n.area === G.area);
  if(hasMech) return 'Mechanicus';
  const hasGuard = Object.values(G.npcs).some(n =>
    n.faction === 'Guard' && n.state === 'alive' && n.area === G.area);
  if(hasGuard) return 'Guard';
  return null;
}

function getActiveSleepStone(){
  return (G.assets.inventory || []).find(it =>
    it.artifact && it.type === 'sleep_stone' &&
    it.state === 'active' && it.location === 'inventory') || null;
}

function applySleepStoneEffect(){
  const stone = getActiveSleepStone();
  if(!stone) return null;

  const buff = stone.effects[0];
  const debuff = stone.hidden_effects[0];
  const result = { buff: buff?.id || null, debuff: debuff?.id || null, extra: {} };

  if(buff){
    if(buff.id === 'cha_sleep'){
      const roll = G.rng.d20();
      if(roll >= 12){
        G.player.stats.cha += 1;
        result.extra.cha = '+1 ХАР';
      }
    } else if(buff.id === 'hp_regen'){
      G.player.state.hp = Math.min(G.player.state.maxHp, G.player.state.hp + 1);
      result.extra.hp = '+1 HP';
    } else if(buff.id === 'calm'){
      G.player.state.stress = clamp(G.player.state.stress - 10, 0, 100);
      result.extra.stress = '−10 стресса';
    } else if(buff.id === 'rest'){
      G.player.state.fatigue = clamp(G.player.state.fatigue - 5, 0, 100);
      result.extra.fatigue = '−5 усталости';
    }
  }

  if(debuff){
    if(debuff.id === 'warp_more'){
      G.warp.exposure = clamp(G.warp.exposure + 3, 0, WARP.SCALE_MAX);
      result.extra.warp = '+3 warp';
    } else if(debuff.id === 'nightmare'){
      if(G.rng.chance(0.25)){
        G.player.state.stress = clamp(G.player.state.stress + 10, 0, 100);
        result.extra.nightmare = 'кошмар';
      }
    } else if(debuff.id === 'stress_up'){
      G.player.state.stress = clamp(G.player.state.stress + 5, 0, 100);
      result.extra.stress = (result.extra.stress ? result.extra.stress + ', ' : '') + '+5 стресса';
    } else if(debuff.id === 'fatigue_up'){
      G.player.state.fatigue = clamp(G.player.state.fatigue + 5, 0, 100);
      result.extra.fatigue = (result.extra.fatigue ? result.extra.fatigue + ', ' : '') + '+5 усталости';
    }
  }

  const extraWarp = Math.floor(stone.warp_level / 20);
  if(extraWarp > 0){
    G.warp.exposure = clamp(G.warp.exposure + extraWarp, 0, WARP.SCALE_MAX);
    result.extra.warp = (result.extra.warp ? result.extra.warp + ', ' : '') +
      '+' + extraWarp + ' warp';
  }

  return result;
}

/* ============================================================
   §13 · СТАНЦИЯ · РОЛЬ
   ============================================================ */
function genStationRole(){
  const r = G.rng;
  const role = r.pick(STATION_ROLES);
  const secondary = r.chance(0.4)
    ? r.pick(STATION_ROLES.filter(x => x.id !== role.id))
    : null;
  G.station.role = role.id;
  G.station.roleData = role;
  G.station.secondary = secondary ? secondary.id : null;
  G.station.scale = r.pick(STATION_SCALES);
  G.station.age   = r.pick(STATION_AGES);
  G.station.condition = r.int(40, 90);
  G.station.stability = 100;
  G.station.equipmentReport = null;
  if(typeof genFinalSetup === 'function') genFinalSetup();
}