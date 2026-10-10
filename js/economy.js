'use strict';
/* ============================================================
   ECONOMY · LVE_6 v3.4 · §12–13
   Иерархия · квота · производство · потоки · роль станции.
   ============================================================ */

/* ============================================================
   §12.2 · ГЕНЕРАЦИЯ · иерархия и квота
   ============================================================ */
function genEconomy(){
  const r = G.rng;
  const systemName  = G.destination.system;
  const planetName  = G.destination.planet;
  const stationName = G.destination.station;

  const systemId  = 'sys_' + slug(systemName);
  const planetId  = 'pln_' + slug(planetName);
  const stationId = 'sta_' + slug(stationName);

  const systemSpec  = r.pick(SPECIALIZATIONS);
  const planetSpec  = r.pick(SPECIALIZATIONS);
  const stationSpec = roleToSpecialization(G.station.role);

  G.economy.hierarchy = {
    imperium: { id:'imperium', level:'imperium', name:'Империум',
      parentId:null, specialization:null, stability:100, reputation:0 },
    sector:   { id:'sector', level:'sector',
      name:'Сектор ' + r.pick(['Северный','Южный','Западный','Восточный','Центральный']),
      parentId:'imperium', specialization: r.pick(SPECIALIZATIONS),
      stability: r.int(60, 95), reputation: 0 },
    system:   { id:systemId, level:'system', name:systemName,
      parentId:'sector', specialization: systemSpec,
      stability: r.int(50, 90), reputation: r.int(-3, 6) },
    planet:   { id:planetId, level:'planet', name:planetName,
      parentId:systemId, specialization: planetSpec,
      stability: r.int(50, 90), reputation: r.int(-2, 5) },
    station:  { id:stationId, level:'station', name:stationName,
      parentId:planetId, specialization: stationSpec,
      stability: G.station.stability || 100, reputation: r.int(-2, 4) },
  };

  /* §12.3 · Квота станции */
  const qRes = roleToQuotaResource(G.station.role);
  G.economy.quota = {
    id: 'q_' + Date.now(),
    fromId: stationId,
    toId: planetId,
    resourceType: qRes.type,
    resourceSubtype: qRes.subtype,
    volume: calcQuotaVolume(G.station.role, G.station.scale),
    unit: 'т',
    deadline: G.time + 30 * 1440,
    titheGrade: 'exactis_prima',
    status: 'assigned',
    progress: r.int(15, 60),
    consequences_fail: [
      { type:'reputation', delta:-2 },
      { type:'fine', amount: 200 },
    ],
    consequences_success: [
      { type:'reputation', delta:+1 },
    ],
  };

  /* §12.4 · Производство и потоки */
  G.economy.production = genStationProduction();
  G.economy.flows      = genFlows();

  G.economy.log = [];
  G.economy.nextEventAt = G.time + r.int(180, 480);
  G.economy.priceModifier = 1;
}

function slug(s){
  return String(s).toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '_')
    .replace(/^_|_$/g, '');
}

/* ============================================================
   §13.2 · РОЛЬ СТАНЦИИ · маппинги
   ============================================================ */
function roleToSpecialization(role){
  const map = {
    trade:      'trade',
    industrial: 'industrial',
    military:   'military',
    mining:     'mining',
    admin:      'mixed',
  };
  return map[role] || 'mixed';
}

function roleToQuotaResource(role){
  const map = {
    trade:      { type:'production', subtype:'Goods' },
    industrial: { type:'production', subtype:'Metal' },
    military:   { type:'military',   subtype:'Weapons' },
    mining:     { type:'raw',        subtype:'Ore' },
    admin:      { type:'people',     subtype:'Workers' },
  };
  return map[role] || { type:'raw', subtype:'Food' };
}

function calcQuotaVolume(role, scale){
  const r = G.rng;
  const scaleMul = { small:1, medium:2, large:4 }[scale] || 1;
  const base = { trade:100, industrial:150, military:80, mining:120, admin:60 }[role] || 100;
  return base * scaleMul + r.int(-20, 20);
}

/* ============================================================
   §12.4 · ПРОИЗВОДСТВО
   ============================================================ */
function genStationProduction(){
  const r = G.rng;
  const pool = {
    trade:      ['Склад A','Склад B','Сортировочный узел','Погрузочный терминал'],
    industrial: ['Пресс','Плавильня','Сборочный цех','Формовочный участок'],
    military:   ['Оружейный цех','Ремонтный ангар','Ракетная мастерская','Склад боеприпасов'],
    mining:     ['Буровая установка','Обогатительный цех','Дробилка','Сортировка руды'],
    admin:      ['Архив','Терминал учёта','Курьерская служба','Отдел сверки'],
  };
  const names = pool[G.station.role] || pool.trade;
  const count = r.int(2, 4);
  const used = new Set();
  const out = [];
  for(let i = 0; i < count; i++){
    let name, guard = 0;
    do { name = r.pick(names); guard++; } while(used.has(name) && guard < 10);
    if(used.has(name)) continue;
    used.add(name);

    const broken = r.chance(0.15);
    const idle   = !broken && r.chance(0.10);

    out.push({
      id: 'pr_' + i,
      name,
      type: 'production',
      capacity: r.int(60, 100),
      efficiency: r.next() * 0.5 + 0.5,
      output_per_cycle: r.int(5, 20),
      status: broken ? 'broken' : idle ? 'idle' : 'active',
      workers: r.int(3, 12),
      cycleProgress: 0,
    });
  }
  return out;
}

/* ============================================================
   §12.5 · ПОТОКИ
   ============================================================ */
function genFlows(){
  const r = G.rng;
  const count = r.int(2, 4);
  const out = [];
  const goods = ['Food','Water','Metal','Goods','Medicine','Weapons','Ore','Fuel','Workers'];
  for(let i = 0; i < count; i++){
    out.push({
      id: 'fl_' + i,
      resource: r.pick(goods),
      volume: r.int(10, 80),
      fromId: r.pick(['sector','system','planet']),
      toId:   r.pick(['station','planet','system']),
      status: r.pick(['planned','in_transit','in_transit','delivered','delayed']),
      duration: r.int(6 * 60, 72 * 60),
      startedAt: G.time - r.int(0, 24 * 60),
    });
  }
  return out;
}

/* ============================================================
   §12.6 · ТИК · раз в минуту (вызывается из tickWorld)
   ============================================================ */
function tickEconomy(minutes){
  const e = G.economy;
  if(!e || !e.production) return;

  const hourFraction = minutes / 60;

  /* Производство */
  for(const pr of e.production){
    if(pr.status !== 'active') continue;
    pr.cycleProgress += hourFraction;
    if(pr.cycleProgress >= 1){
      pr.cycleProgress -= 1;
      if(e.quota && (e.quota.status === 'assigned' || e.quota.status === 'in_progress')){
        const produced = Math.round(pr.output_per_cycle * pr.efficiency);
        e.quota.progress = Math.min(100, e.quota.progress + produced / 10);
      }
    }
  }

  /* Потоки */
  for(const fl of e.flows){
    if(fl.status !== 'in_transit') continue;
    if(G.time - fl.startedAt >= fl.duration){
      fl.status = 'delivered';
      pushEconomyLog('Поток доставлен: ' + fl.resource + ' ×' + fl.volume);
    }
  }

  /* События */
  if(!e.nextEventAt) e.nextEventAt = G.time + 240;
  if(G.time >= e.nextEventAt){
    triggerEconomyEvent();
    e.nextEventAt = G.time + G.rng.int(180, 480);
  }

  /* Статус квоты */
  if(e.quota){
    if(e.quota.status === 'assigned' && e.quota.progress > 0){
      e.quota.status = 'in_progress';
    }
    if(e.quota.progress >= 100 && e.quota.status !== 'fulfilled'){
      e.quota.status = 'fulfilled';
      pushEconomyLog('Квота выполнена.');
    }
  }
}

/* ============================================================
   §12.6 · СОБЫТИЯ
   ============================================================ */
function triggerEconomyEvent(){
  const r = G.rng;
  const events = [
    { text:'Поток задержан: погодные условия на маршруте.',
      apply:() => {
        const fl = r.pick(G.economy.flows);
        if(fl && fl.status === 'in_transit') fl.status = 'delayed';
      }},
    { text:'Цены на ресурс выросли. Сектор в дефиците.',
      apply:() => { G.economy.priceModifier = (G.economy.priceModifier || 1) * 1.1; }},
    { text:'Поломка на производстве.',
      apply:() => {
        const pr = r.pick(G.economy.production);
        if(pr) pr.status = 'broken';
      }},
    { text:'Квота уточнена сверху: объёмы пересматриваются.',
      apply:() => {
        if(G.economy.quota){
          G.economy.quota.volume = Math.round(G.economy.quota.volume * (0.9 + r.next() * 0.2));
        }
      }},
    { text:'Новый поток запланирован системой.',
      apply:() => {
        G.economy.flows.push({
          id: 'fl_' + Date.now(),
          resource: r.pick(['Food','Water','Metal','Goods']),
          volume: r.int(10, 80),
          fromId: 'system',
          toId: 'station',
          status: 'planned',
          duration: r.int(6 * 60, 72 * 60),
          startedAt: G.time,
        });
      }},
  ];
  const e = r.pick(events);
  e.apply();
  pushEconomyLog(e.text);
}

function pushEconomyLog(text){
  if(!G.economy.log) G.economy.log = [];
  G.economy.log.push({ t: G.time, text });
  if(G.economy.log.length > 30) G.economy.log.shift();
}

/* ============================================================
   §13.4 · АТМОСФЕРА СТАНЦИИ
   ============================================================ */
function stationAtmosphere(){
  const roleData = STATION_ROLES.find(r => r.id === G.station.role);
  return roleData ? roleData.atmosphere : null;
}

function atmosphereLine(){
  const a = stationAtmosphere();
  if(!a) return null;
  /* Фоновая проза — редко, не на каждой локации */
  if(G.rng.next() < 0.55) return null;
  return G.rng.pick([
    'Воздух здесь: ' + a.smell.toLowerCase() + '.',
    'Откуда-то доносится: ' + a.sound.toLowerCase() + '.',
    'Вокруг в основном ' + a.people.toLowerCase() + '.',
    'Гудит оборудование. Пахнет ' + a.smell.toLowerCase() + '.',
    'Пара прохожих — ' + a.people.toLowerCase() + ' — прошли мимо.',
  ]);
}

/* ============================================================
   §13.5 · АДАПТАЦИЯ ОБСТОЯТЕЛЬСТВ ФИНАЛА ПОД РОЛЬ
   ============================================================ */
function roleConflictSource(){
  return {
    trade:      'Таможня',
    industrial: 'Губернатор',
    military:   'Guard',
    mining:     'Транспортники',
    admin:      'Администратум',
  }[G.station.role] || 'Зам';
}

function roleContrabandSubject(){
  return {
    trade:      'Ксено-технологии',
    industrial: 'Подпольная продукция',
    military:   'Оружие',
    mining:     'Неучтённая руда',
    admin:      'Поддельные документы',
  }[G.station.role] || 'Лишний груз';
}

function roleEquipmentFocus(){
  return {
    trade:      'Причалы',
    industrial: 'Реактор',
    military:   'Доки',
    mining:     'Буровые',
    admin:      'Терминалы',
  }[G.station.role] || 'Оборудование';
}

/* ============================================================
   §10.11 · КПК · вкладка «Экономика»
   ============================================================ */
function pdaEconomyFull(root){
  const e = G.economy;
  const row = (k, v) => root.appendChild(h('div', { class:'pda-row' },
    h('span', { class:'k' }, k), h('span', { class:'v' }, v)));

  if(!e || !e.hierarchy){
    root.appendChild(h('div', { class:'hint' }, 'Экономические данные недоступны.'));
    return;
  }

  /* Иерархия */
  root.appendChild(h('div', {
    style:{ color:'var(--cyan)', marginBottom:'8px', fontSize:'11px' }
  }, 'ИЕРАРХИЯ'));
  row('Империум', 'Лорды Терры');
  row('Сектор',   e.hierarchy.sector.name);
  row('Система',  e.hierarchy.system.name + ' · ' + e.hierarchy.system.specialization);
  row('Планета',  e.hierarchy.planet.name + ' · ' + e.hierarchy.planet.specialization);
  row('Станция',  e.hierarchy.station.name + ' · ' + e.hierarchy.station.specialization);

  /* Роль станции */
  const roleData = STATION_ROLES.find(r => r.id === G.station.role);
  if(roleData){
    root.appendChild(h('div', {
      style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
    }, 'РОЛЬ СТАНЦИИ'));
    row('Основная', roleData.label);
    if(G.station.secondary){
      const sec = STATION_ROLES.find(r => r.id === G.station.secondary);
      if(sec) row('Дополнительная', sec.label);
    }
    row('Масштаб',   G.station.scale);
    row('Возраст',   G.station.age);
    row('Состояние', G.station.condition + '%');
    const a = stationAtmosphere();
    if(a){
      row('Запах', a.smell);
      row('Звук',  a.sound);
    }
  }

  /* Квота */
  if(e.quota){
    root.appendChild(h('div', {
      style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
    }, 'КВОТА СТАНЦИИ'));
    row('Ресурс', e.quota.resourceSubtype + ' (' + e.quota.resourceType + ')');
    row('Объём',  e.quota.volume + ' ' + e.quota.unit);
    row('Прогресс', Math.floor(e.quota.progress) + '%');
    row('Срок',   fmtClock(e.quota.deadline));
    row('Статус', e.quota.status);

    root.appendChild(h('div', { class:'exam-cargo-bar', style:{ marginTop:'6px' } },
      h('i', { style:{
        width: e.quota.progress + '%',
        background: e.quota.status === 'fulfilled' ? 'var(--green)' : 'var(--cyan)'
      } })));
  }

  /* Производство */
  if(e.production && e.production.length){
    root.appendChild(h('div', {
      style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
    }, 'ПРОИЗВОДСТВО'));
    for(const pr of e.production){
      const color = pr.status === 'active' ? 'var(--green)'
                  : pr.status === 'broken' ? 'var(--red)'
                  : 'var(--dim)';
      root.appendChild(h('div', { class:'pda-row' },
        h('span', { class:'k' }, pr.name),
        h('span', { class:'v', style:{ color } },
          pr.status + ' · ' + Math.round(pr.efficiency * 100) + '%')));
    }
  }

  /* Потоки */
  if(e.flows && e.flows.length){
    root.appendChild(h('div', {
      style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
    }, 'ПОТОКИ'));
    for(const fl of e.flows){
      const color = fl.status === 'delivered' ? 'var(--green)'
                  : fl.status === 'delayed'   ? 'var(--orange)'
                  : fl.status === 'lost'      ? 'var(--red)'
                  : 'var(--muted)';
      root.appendChild(h('div', { class:'pda-row' },
        h('span', { class:'k' }, fl.resource + ' ×' + fl.volume),
        h('span', { class:'v', style:{ color } },
          fl.fromId + ' → ' + fl.toId + ' · ' + fl.status)));
    }
  }

  /* Журнал */
  if(e.log && e.log.length){
    root.appendChild(h('div', {
      style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
    }, 'СОБЫТИЯ'));
    const lg = h('div', { class:'exam-log' });
    for(const line of e.log.slice(-6)) lg.appendChild(h('div', {}, line.text));
    root.appendChild(lg);
  }
}
