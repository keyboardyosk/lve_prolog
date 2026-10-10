'use strict';
/* ============================================================
   FINAL · LVE_6 v3.4 · §11
   Финал пролога: пять параллельных обстоятельств, главная
   проверка, отчёт Смотрителю, приговор.
   ============================================================ */

/* ============================================================
   §11 · ГЕНЕРАЦИЯ
   ============================================================ */
function genFinalSetup(){
  const r = G.rng;

  G.final.deputyWant = r.pick(['partial','rewrite','none']);

  /* §13.5 · Тексты обстоятельств адаптируются под роль станции */
  G.final.roleLabels = {
    conflictSource:    typeof roleConflictSource    === 'function' ? roleConflictSource()    : 'Зам',
    contrabandSubject: typeof roleContrabandSubject === 'function' ? roleContrabandSubject() : 'Лишний груз',
    equipmentFocus:    typeof roleEquipmentFocus    === 'function' ? roleEquipmentFocus()    : 'Оборудование',
  };

  const scale = r.pick(['nothing','cosmetic','serious','critical']);
  G.station.equipmentReport = genEquipmentReport(scale);
  G.final.obstacles.contraband.kind = r.pick(['none','none','approved','unapproved']);
  G.final.obstacles.sidequests.list = genSidequests();
}

function genEquipmentReport(scale){
  const r = G.rng;
  const pool = [
    { id:'reactor',    name:'Реактор',           weight:5 },
    { id:'docks',      name:'Причалы',           weight:3 },
    { id:'terminals',  name:'Терминалы',         weight:2 },
    { id:'lights',     name:'Освещение',         weight:1 },
    { id:'ventilation',name:'Вентиляция',        weight:2 },
    { id:'lifts',      name:'Лифты',             weight:2 },
    { id:'warehouse',  name:'Складские системы', weight:2 },
  ];

  let count = 0;
  if(scale === 'nothing')       count = 0;
  else if(scale === 'cosmetic') count = 1;
  else if(scale === 'serious')  count = 2;
  else                          count = 3;

  const broken = [];
  const used = new Set();
  for(let i = 0; i < count; i++){
    let pick, guard = 0;
    do { pick = r.pick(pool); guard++; } while(used.has(pick.id) && guard < 10);
    if(used.has(pick.id)) continue;
    used.add(pick.id);
    broken.push({
      id: pick.id,
      name: pick.name,
      severity: r.pick(['низкая','средняя','высокая']),
      needs: r.pick(['детали','люди','время']),
      fixed: false,
    });
  }

  return {
    scale,
    items: broken,
    summary:
      scale === 'nothing'  ? 'Оборудование в рабочем состоянии.' :
      scale === 'cosmetic' ? 'Одна мелочь. Не критично.' :
      scale === 'serious'  ? 'Есть проблемы. Требуют внимания.' :
                             'Критическое состояние. Требуется вмешательство.',
  };
}

function genSidequests(){
  const r = G.rng;
  const templates = [
    { id:'deliver',   title:'Лишний груз',
      desc:'У тебя в доке остался лишний ящик. Кому-то на станции он нужен.' },
    { id:'hire',      title:'Нанять в штат',
      desc:'Кто-то из рабочих дока хотел бы перевестись на станцию.' },
    { id:'memory',    title:'Дело знакомого',
      desc:'Бывший знакомый с потерей памяти должен что-то узнать здесь.' },
    { id:'debt',      title:'Долг',
      desc:'Кто-то ждёт возврата. Долг перешёл с тобой.' },
  ];
  const count = r.int(1, 3);
  const shuffled = [...templates].sort(() => r.next() - 0.5);
  return shuffled.slice(0, count).map(t => ({
    id: t.id, title: t.title, desc: t.desc,
    resolved: false, outcome: null,
  }));
}

/* ============================================================
   §11.2 · СТАРТ ФИНАЛА
   ============================================================ */
function startFinal(){
  if(G.final.started) return;
  G.final.started = true;
  G.final.arrivalAt = G.time;
  G.final.deadline = G.prologue.deadline || (G.time + 12 * 60);

  G.final.conflictAt   = G.time + 45;
  G.final.equipmentAt  = G.time + 90;
  G.final.contrabandAt = G.time + 150;
  G.final.sidequestsAt = G.time + 210;
  G.final.reportAt     = Math.max(G.time + 240, G.final.deadline - 60);

  log('Финал начался. Пять обстоятельств идут параллельно.', 'action');
  log('Дедлайн: ' + fmtClock(G.final.deadline) + '.', 'warn');
}

/* ============================================================
   §11.3 · ТИК ФИНАЛА
   ============================================================ */
function tickFinal(minutes){
  if(!G.final.started) return;
  const F = G.final;
  const obstacles = F.obstacles;

  /* §6.11 · Смотритель убит при свидетелях — сцена ареста при переходе,
     здесь только страховка */
  if(G.flags.overseerArrested && G.scene === 'area'){
    G.scene = 'overseer_arrest';
    render();
    return;
  }

  const canTrigger = () =>
    G.area === 'station' &&
    G.scene === 'area' &&
    !G.modal &&
    !(G.combat && G.combat.active);

  if(!obstacles.conflict.triggered && G.time >= F.conflictAt){
    obstacles.conflict.triggered = true;
    if(canTrigger()) triggerObstacleConflict();
    else queueObstacle('conflict');
  }

  if(!obstacles.equipment.triggered && G.time >= F.equipmentAt){
    obstacles.equipment.triggered = true;
    if(canTrigger()) triggerObstacleEquipment();
    else queueObstacle('equipment');
  }

  if(!obstacles.contraband.triggered && G.time >= F.contrabandAt){
    obstacles.contraband.triggered = true;
    if(canTrigger()) triggerObstacleContraband();
    else queueObstacle('contraband');
  }

  if(!obstacles.sidequests.triggered && G.time >= F.sidequestsAt){
    obstacles.sidequests.triggered = true;
    if(canTrigger()) triggerObstacleSidequests();
    else queueObstacle('sidequests');
  }

  if(!obstacles.report.triggered && G.time >= F.reportAt){
    obstacles.report.triggered = true;
    triggerObstacleReport();
  }

  if(!F.mainCheck && G.time >= F.deadline){
    runMainCheck();
  }
}

function queueObstacle(id){
  if(!G.final.pendingObstacles) G.final.pendingObstacles = [];
  if(!G.final.pendingObstacles.includes(id)) G.final.pendingObstacles.push(id);
}

function flushPendingObstacles(){
  if(!G.final.pendingObstacles || !G.final.pendingObstacles.length) return;
  if(G.modal) return;
  if(G.area !== 'station' || G.scene !== 'area') return;
  const id = G.final.pendingObstacles.shift();
  if(id === 'conflict')   triggerObstacleConflict();
  if(id === 'equipment')  triggerObstacleEquipment();
  if(id === 'contraband') triggerObstacleContraband();
  if(id === 'sidequests') triggerObstacleSidequests();
}

/* ============================================================
   §11.6 · ОБСТОЯТЕЛЬСТВО 1 · КОНФЛИКТ ИНТЕРЕСОВ
   ============================================================ */
function triggerObstacleConflict(){
  const deputy = G.npcs.deputy;
  if(!deputy) return;
  const want = G.final.deputyWant;

  const wantText = {
    partial: '«Не всё принимать. Часть — на склад, под мою подпись.»',
    rewrite: '«Перепишем документы. Груз — тот же, бумаги — другие.»',
    none:    '«Просто зайди. Поговорим, пока никого нет.»',
  }[want];

  G.modal = { type:'action',
    title: (G.final.roleLabels?.conflictSource || deputy.name) + ' — вызов',
    desc: 'Зам звонит на КПК. Голос ровный.\n\n' + wantText,
    methods:[
      { label:'«Иду»', time:5,
        onClick:() => {
          closeModal();
          G.location = 'accounting';
          adv(5, 'Вы подошли к кабинету Зама.', 'info');
          setTimeout(openDeputyConversation, 100);
        }},
      { label:'«Позже»', time:0,
        onClick:() => {
          closeModal();
          log('Зам не любит ждать. Но вы отложили.', 'warn');
          G.final.obstacles.conflict.resolved = false;
          G.final.conflictAt = G.time + 30;
          G.final.obstacles.conflict.triggered = false;
          render();
        }},
    ]};
  renderModal();
}

function openDeputyConversation(){
  const deputy = G.npcs.deputy;
  const want = G.final.deputyWant;

  const wantText = {
    partial: '«Прими не весь груз. Мне нужно придержать часть. Скажем так — до выяснения.»',
    rewrite: '«Перепиши накладные. Объёмы сойдутся, но по бумагам будет другое.»',
    none:    '«Слушай. У меня к тебе разговор. Не по бумагам.»',
  }[want];

  const offer = {
    partial: 'Деньги вперёд. Плюс — я прикрою тебя перед Смотрителем, если что.',
    rewrite: 'Услуга. Ты получаешь доступ к складу без вопросов.',
    none:    'Молчание. Ты не видел меня здесь. Я — тебя.',
  }[want];

  G.modal = { type:'action',
    title: 'Зам',
    desc: wantText + '\n\n' + offer,
    methods:[
      { label:'Согласиться', time:10,
        onClick:() => {
          closeModal();
          G.final.obstacles.conflict.resolved = true;
          G.final.obstacles.conflict.outcome = 'agreed';
          if(want === 'partial'){
            G.assets.money += 200;
            log('Зам заплатил 200₡. Груз будет принят частично.', 'warn');
            G.prologue.forcePartial = true;
          } else if(want === 'rewrite'){
            log('Документы переписаны. Это может выйти боком.', 'danger');
            G.flags.docsForged = true;
          } else {
            log('Вы согласились молчать. Пока.', 'info');
          }
          adv(10, null);
        }},
      { label:'Отказаться', time:5,
        onClick:() => {
          closeModal();
          G.final.obstacles.conflict.resolved = true;
          G.final.obstacles.conflict.outcome = 'refused';
          deputy.relation -= 5;
          log('Зам холодно кивнул. Запомнит.', 'danger');
          historyEvent('player', 'refuse_deputy', deputy.id, 'notable', []);
          adv(5, null);
        }},
      { label:'Торговаться', time:15,
        mod: modLabel('ХАР', G.player.stats.cha),
        onClick:() => {
          closeModal();
          const roll = G.rng.d20() + statMod(G.player.stats.cha);
          if(roll >= 13){
            G.final.obstacles.conflict.resolved = true;
            G.final.obstacles.conflict.outcome = 'haggled';
            G.assets.money += 400;
            deputy.relation += 2;
            log('Зам поднял ставку до 400₡. Сделка.', 'good');
          } else {
            deputy.relation -= 3;
            log('Зам: «Не наглей. Или вообще ничего не получишь.»', 'warn');
          }
          adv(15, null);
        }},
      { label:'Пригрозить', time:10,
        mod: modLabel('ХАР', G.player.stats.cha),
        onClick:() => {
          closeModal();
          const roll = G.rng.d20() + statMod(G.player.stats.cha);
          if(roll >= 15){
            G.final.obstacles.conflict.resolved = true;
            G.final.obstacles.conflict.outcome = 'threatened';
            deputy.relation -= 8;
            log('Зам отступил. Но он теперь враг.', 'danger');
            historyEvent('player', 'threaten_deputy', deputy.id, 'notable', []);
          } else {
            deputy.relation -= 10;
            log('Зам: «Ты пожалеешь.»', 'danger');
            historyEvent('player', 'threaten_fail', deputy.id, 'notable', [deputy.id]);
          }
          adv(10, null);
        }},
    ]};
  renderModal();
}

/* ============================================================
   §11.8 · ОБСТОЯТЕЛЬСТВО 3 · ОБОРУДОВАНИЕ
   ============================================================ */
function triggerObstacleEquipment(){
  const report = G.station.equipmentReport;
  if(!report || report.scale === 'nothing'){
    G.final.obstacles.equipment.resolved = true;
    G.final.obstacles.equipment.outcome = 'nothing';
    return;
  }
  const engineer = G.npcs.station_tech;

  G.modal = { type:'action',
    title: 'Жалобы на оборудование',
    desc: report.summary,
    methods:[
      { label:'Смотреть отчёт', time:5,
        onClick:() => {
          closeModal();
          G.final.equipmentViewed = true;
          openEquipmentReport();
        }},
      { label:'Позвать техника', time:10,
        onClick:() => {
          closeModal();
          if(engineer){
            engineer.relation += 1;
            log(engineer.name + ' объяснил ситуацию. Понадобится время и детали.', 'info');
          }
          G.final.obstacles.equipment.resolved = true;
          G.final.obstacles.equipment.outcome = 'delegated';
          adv(10, null);
        }},
      { label:'Игнорировать', time:0,
        onClick:() => {
          closeModal();
          G.final.obstacles.equipment.resolved = true;
          G.final.obstacles.equipment.outcome = 'ignored';
          G.station.stability = clamp(G.station.stability - 5, 0, 100);
          log('Жалобы остались без ответа. Станция не прощает.', 'warn');
          adv(0, null);
        }},
    ]};
  renderModal();
}

function openEquipmentReport(){
  const report = G.station.equipmentReport;
  if(!report) return;
  const items = report.items.length
    ? report.items.map(it =>
        h('div', { class:'pda-row' },
          h('span', { class:'k' }, it.name),
          h('span', { class:'v', style:{ color:'var(--orange)' } },
            it.severity + ' · ' + it.needs)))
    : [h('div', { class:'hint' }, 'Ничего не сломано.')];

  const body = h('div', { class:'modal-body' },
    h('div', { class:'result-box' }, report.summary),
    ...items);
  const box = el('modal-box');
  box.innerHTML = '';
  mhead(box, 'Отчёт: ' + (G.final.roleLabels?.equipmentFocus || 'оборудование'));
  box.appendChild(body);
  const actions = h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick:() => {
      closeModal();
      G.final.obstacles.equipment.resolved = true;
      G.final.obstacles.equipment.outcome = 'viewed';
      adv(5, null);
    }}, 'Понятно'));
  body.appendChild(actions);
}

/* ============================================================
   §11.7 · ОБСТОЯТЕЛЬСТВО 2 · КОНТРАБАНДА
   ============================================================ */
function triggerObstacleContraband(){
  const kind = G.final.obstacles.contraband.kind;
  if(kind === 'none'){
    G.final.obstacles.contraband.resolved = true;
    G.final.obstacles.contraband.outcome = 'clean';
    log('Приёмщик осмотрел груз. Всё чисто.', 'info');
    return;
  }

  const receiver = G.npcs.receiver;

  if(kind === 'approved'){
    G.modal = { type:'action',
      title:'Приёмщик · груз',
      desc:'Приёмщик: «Кое-что в твоём грузе не по накладным. Но у меня есть бумага. Всё согласовано.»',
      methods:[
        { label:'«Понял»', time:5,
          onClick:() => {
            closeModal();
            G.final.obstacles.contraband.resolved = true;
            G.final.obstacles.contraband.outcome = 'approved';
            adv(5, null);
          }},
      ]};
  } else {
    G.modal = { type:'action',
      title:'Приёмщик · проблема',
      desc:'Приёмщик: «Тут лишнее. ' +
        (G.final.roleLabels?.contrabandSubject || 'Оформлено неправильно') +
        '. Это уже не моя зона.»\n\nОн смотрит прямо.',
      methods:[
        { label:'Дать взятку (150₡)', time:10, disabled: G.assets.money < 150,
          onClick:() => {
            G.assets.money -= 150;
            closeModal();
            G.final.obstacles.contraband.resolved = true;
            G.final.obstacles.contraband.outcome = 'bribed';
            log('Приёмщик убрал бумаги в ящик. 150₡.', 'warn');
            adv(10, null);
          }},
        { label:'Сослаться на Зама', time:5,
          onClick:() => {
            closeModal();
            if(G.final.deputyWant !== 'none' && G.final.obstacles.conflict.outcome !== 'refused'){
              G.final.obstacles.contraband.resolved = true;
              G.final.obstacles.contraband.outcome = 'deputy_cover';
              log('Приёмщик кивнул. Зам прикрыл.', 'info');
            } else {
              log('Приёмщик: «Зам тут ни при чём.»', 'warn');
            }
            adv(5, null);
          }},
        { label:'Согласиться на изъятие', time:5,
          onClick:() => {
            closeModal();
            G.final.obstacles.contraband.resolved = true;
            G.final.obstacles.contraband.outcome = 'seized';
            if(G.prologue.loadingBg){
              G.prologue.loadingBg.currentTons = Math.max(0, G.prologue.loadingBg.currentTons - 5);
            }
            log('Часть груза изъята. 5 т ушло.', 'danger');
            historyEvent('player', 'contraband_seized', receiver?.id || null, 'notable', []);
            adv(5, null);
          }},
        { label:'Угрожать', time:5, mod: modLabel('ХАР', G.player.stats.cha),
          onClick:() => {
            closeModal();
            const roll = G.rng.d20() + statMod(G.player.stats.cha);
            if(roll >= 14){
              G.final.obstacles.contraband.resolved = true;
              G.final.obstacles.contraband.outcome = 'threatened_ok';
              log('Приёмщик отступил.', 'warn');
            } else {
              G.final.obstacles.contraband.resolved = true;
              G.final.obstacles.contraband.outcome = 'threatened_fail';
              log('Приёмщик вызвал охрану.', 'danger');
              G.station.alert = 'SUSPICION';
            }
            adv(5, null);
          }},
      ]};
  }
  renderModal();
}

/* ============================================================
   §11.9 · ОБСТОЯТЕЛЬСТВО 4 · ПОБОЧНЫЕ ЗАДАНИЯ
   ============================================================ */
function triggerObstacleSidequests(){
  const list = G.final.obstacles.sidequests.list;
  if(!list.length){
    G.final.obstacles.sidequests.resolved = true;
    G.final.obstacles.sidequests.outcome = 'none';
    return;
  }

  G.modal = { type:'action',
    title:'Сообщения КПК',
    desc:'Побочные дела возвращаются. Через сообщения. Никто не спрашивает, удобно ли тебе.',
    methods:[
      { label:'Ответить на все', time:30,
        onClick:() => {
          closeModal();
          G.final.obstacles.sidequests.resolved = true;
          G.final.obstacles.sidequests.outcome = 'handled';
          for(const sq of list){ sq.resolved = true; sq.outcome = 'handled'; }
          G.assets.reputation.workers = clamp(G.assets.reputation.workers + 5, 0, 100);
          log('Вы ответили на побочные. Рабочие запомнят.', 'good');
          adv(30, null);
        }},
      { label:'Отложить', time:0,
        onClick:() => {
          closeModal();
          G.final.obstacles.sidequests.resolved = true;
          G.final.obstacles.sidequests.outcome = 'ignored';
          for(const sq of list){ sq.resolved = false; sq.outcome = 'ignored'; }
          log('Побочные остались без ответа. В основной игре это даст о себе знать.', 'warn');
          adv(0, null);
        }},
    ]};
  renderModal();
}

/* ============================================================
   §11.10 · ОБСТОЯТЕЛЬСТВО 5 · ОТЧЁТ СМОТРИТЕЛЮ
   ============================================================ */
function triggerObstacleReport(){
  const isSubstitute = G.npcs.overseer && G.npcs.overseer.isSubstitute;
  const hasCallsModule = G.pda.modules && G.pda.modules.some(m => m.id === 'calls');
  /* Заменённый Смотритель не звонит — только пишет */
  const hasCalls = hasCallsModule && !isSubstitute;

  G.modal = { type:'action',
    title: hasCalls ? 'КПК · входящий звонок' : 'КПК · новое сообщение',
    desc: hasCalls
      ? 'Смотритель. Не спрашивает, удобно ли. Не спрашивает, готов ли ты.'
      : isSubstitute
        ? 'Инспектор Administratum. Формальный запрос. Устный контакт не предусмотрен.'
        : 'Формальный запрос от Administratum. Требуется письменный отчёт.',
    methods:[
      { label: hasCalls ? 'Ответить' : 'Открыть форму', time:0,
        onClick:() => {
          closeModal();
          G.final.obstacles.report.triggered = true;
          G.final.obstacles.report.mode = hasCalls ? 'call' : 'letter';
          G.scene = 'final_report';
          render();
        }},
    ]};
  renderModal();
}

/* ============================================================
   §11.10 · ВОПРОСЫ ОТЧЁТА
   ============================================================ */
function buildFinalQuestions(mode){
  const base = [
    { q:'«Какие были проблемы?»',
      answers:[
        { l:'«Стандартные. Справлюсь.»',           tag:'calm',    bonus:+1 },
        { l:'«Были. Перечисляю по пунктам.»',      tag:'precise', bonus:+2 },
        { l:'«Никаких серьёзных.»',                 tag:'vague',   bonus:0  },
        { l:'«Зам создавал сложности.»',           tag:'risky',   bonus:-1 },
      ]},
    { q:'«Готов ли ты служить Империуму?»',
      answers:[
        { l:'«Да. Без оговорок.»',                  tag:'loyal',   bonus:+2 },
        { l:'«Да, в меру возможностей.»',           tag:'honest',  bonus:+1 },
        { l:'«Служу. Это моя работа.»',             tag:'neutral', bonus:0  },
        { l:'«Сначала — доделать начатое.»',        tag:'focused', bonus:+1 },
      ]},
    { q:'«Как ты оцениваешь себя?»',
      answers:[
        { l:'«Справился.»',                          tag:'confident', bonus:+1 },
        { l:'«Мог бы лучше.»',                       tag:'humble',    bonus:+2 },
        { l:'«Оценка — ваша.»',                      tag:'deferent',  bonus:+1 },
        { l:'«Не мне судить.»',                      tag:'evasive',   bonus:0  },
      ]},
  ];

  /* §3.4.5 · Контрабанда */
  const smuggledQ = [];
  if(G.prologue.smuggledTons > 0){
    smuggledQ.push({
      q:'«В трюме — ' + G.prologue.smuggledTons + ' т лишнего. Что это?»',
      answers:[
        { l:'«Не знал. Проверю.»',                    tag:'honest',  bonus:+1 },
        { l:'«Свой груз. Оформлю.»',                  tag:'lie',     bonus:-2 },
        { l:'«Контрабанда. Изъял.» (утаить)',         tag:'lie',     bonus:-1 },
        { l:'«Дополнительный. Не по миссии.»',        tag:'half',    bonus:0  },
      ],
    });
  } else if(G.flags.smuggleWitnessed){
    smuggledQ.push({
      q:'«Мне донесли, что у тебя было лишнее. Куда делось?»',
      answers:[
        { l:'«Нашёл и убрал. Не по накладной.»',      tag:'honest',  bonus:+2 },
        { l:'«Не было ничего.»',                       tag:'lie',     bonus:-2 },
        { l:'«Ошибка бригады. Исправил.»',             tag:'half',    bonus:0  },
        { l:'«Откуда данные? Уточните.»',              tag:'risky',   bonus:-1 },
      ],
    });
  }

  /* Письмо — только существо, бонусы режутся */
  if(mode === 'letter'){
    const all = base.concat(smuggledQ);
    return all.map(q => ({
      q: q.q,
      answers: q.answers.map(a => ({
        l: a.l, tag: a.tag,
        bonus: Math.floor(a.bonus / 2),
      })),
    }));
  }

  /* Звонок — доп. вопросы */
  const extra = [];

  if(G.pda.pendingModule){
    extra.push({
      q:'«Модуль звонков — статус?»',
      answers:[
        { l:'«Установлен. Работает.» (соврать)',    tag:'lie',       bonus:-2 },
        { l:'«Не успел. Инструментов нет.»',       tag:'honest',    bonus:+1 },
        { l:'«Устанавливаю прямо сейчас.»',         tag:'stalling',  bonus:0  },
        { l:'«Потерял.»',                            tag:'vague',     bonus:-1 },
      ],
    });
  }

  /* §3.3.3 · Вопрос про убийцу */
  if(G.flags.knowsKiller){
    const killer = Object.values(G.npcs).find(n => n.isHiddenKiller);
    const target = killer && killer.hiddenIntent ? G.npcs[killer.hiddenIntent.targetId] : null;
    const targetDead = target && target.state === 'dead';
    const reported = killer && killer.hiddenIntent && killer.hiddenIntent.reported;

    if(targetDead){
      extra.push({
        q:'«На борту погиб человек. Ты знал?»',
        answers:[
          { l:'«Знал. Не успел вмешаться.»',        tag:'honest',  bonus:0  },
          { l:'«Знал. Сообщил, куда следует.»',     tag:'precise', bonus:+2 },
          { l:'«Не знал.» (соврать)',                tag:'lie',     bonus:-2 },
          { l:'«Это не моя зона.»',                  tag:'risky',   bonus:-1 },
        ],
      });
    } else if(reported){
      extra.push({
        q:'«Докладывали о готовящемся?»',
        answers:[
          { l:'«Да. Принял меры.»',                  tag:'precise', bonus:+2 },
          { l:'«Были подозрения. Не подтвердились.»',tag:'half',    bonus:0  },
          { l:'«Нет.»',                              tag:'lie',     bonus:-1 },
        ],
      });
    } else {
      extra.push({
        q:'«Странности на борту замечал?»',
        answers:[
          { l:'«Один человек вёл себя подозрительно.»', tag:'honest', bonus:+1 },
          { l:'«Ничего серьёзного.»',                     tag:'vague',  bonus:0  },
          { l:'«Не моё дело.»',                            tag:'risky',  bonus:-1 },
        ],
      });
    }
  }

  extra.push({
    q:'«Помощник как?»',
    answers:[
      { l:'«Работает. Не мешает.»',                tag:'neutral',  bonus:+1 },
      { l:'«Приглядывает. Я в курсе.»',           tag:'aware',    bonus:+2 },
      { l:'«Не доверяю ему.»',                     tag:'honest',   bonus:0  },
      { l:'«Не ваше дело.»',                       tag:'risky',    bonus:-1 },
    ],
  });

  return base.concat(smuggledQ, extra);
}

function sceneFinalReport(root){
  const mode = G.final.obstacles.report.mode || 'call';
  const q = G.final.reportAnswers.length;

  root.appendChild(h('h2', { class:'title' },
    mode === 'call' ? 'ЗВОНОК СМОТРИТЕЛЮ' : 'ПИСЬМЕННЫЙ ОТЧЁТ'));
  root.appendChild(h('p', { class:'subtitle' },
    mode === 'call' ? 'КПК. Канал связи. Голос ровный.' :
                     'Форма. Только по существу.'));

  const allQuestions = buildFinalQuestions(mode);

  if(q >= allQuestions.length){
    G.final.obstacles.report.resolved = true;
    G.final.obstacles.report.outcome = 'done';
    runVerdict();
    return;
  }

  const current = allQuestions[q];
  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp' },
      mode === 'call' ? 'КАНАЛ СВЯЗИ · СМОТРИТЕЛЬ' : 'ФОРМА ОТЧЁТА'),
    h('div', { style:{ fontSize:'13px', marginBottom:'14px' } }, current.q)));

  const actions = h('div', { class:'actions' });
  current.answers.forEach((a, idx) => {
    actions.appendChild(h('button', { class:'btn', onclick:() => {
      G.final.reportAnswers.push({ qIndex:q, idx, tag:a.tag, bonus:a.bonus });
      adv(3, 'Ответ: ' + a.l, 'info');
      render();
    }}, a.l));
  });
  root.appendChild(actions);
}

/* ============================================================
   §11.4 · ГЛАВНАЯ ПРОВЕРКА
   ============================================================ */
function runMainCheck(){
  const F = G.final;
  if(F.mainCheck) return;

  const L = G.prologue.loadingBg;
  const loaded = L ? L.currentTons : 0;
  const required = G.destination.required;

  const ratio = loaded / required;
  const onTime = G.time <= F.deadline;

  if(ratio >= 1 && onTime)                F.mainCheck = 'passed';
  else if(ratio >= 0.9 && onTime)         F.mainCheck = 'partial';
  else if(!onTime && ratio >= 0.5)        F.mainCheck = 'missed';
  else                                    F.mainCheck = 'failed';

  log('═══ ГЛАВНАЯ ПРОВЕРКА ═══', 'action');
  log('Груз: ' + loaded.toFixed(1) + '/' + required + ' т. ' +
      (onTime ? 'В срок.' : 'С опозданием.'), 'info');
  log('Результат: ' + F.mainCheck.toUpperCase(), F.mainCheck === 'passed' ? 'good' : 'warn');
}

/* ============================================================
   §11.15 · ПРИГОВОР
   ============================================================ */
function runVerdict(){
  const F = G.final;
  if(F.verdict) return;

  const check = F.mainCheck;
  const conflictOut = F.obstacles.conflict.outcome;
  const contrabandOut = F.obstacles.contraband.outcome;
  const equipmentOut = F.obstacles.equipment.outcome;
  const reportBonus = F.reportAnswers.reduce((s, a) => s + (a.bonus || 0), 0);

  let score = 0;
  if(check === 'passed')        score += 5;
  else if(check === 'partial')  score += 3;
  else if(check === 'missed')   score += 1;
  else                          score -= 2;

  if(conflictOut === 'refused') score += 2;
  if(conflictOut === 'agreed')  score -= 1;
  if(conflictOut === 'haggled') score -= 1;

  if(contrabandOut === 'clean')         score += 1;
  if(contrabandOut === 'approved')      score += 1;
  if(contrabandOut === 'bribed')        score -= 1;
  if(contrabandOut === 'seized')        score -= 1;
  if(contrabandOut === 'threatened_fail') score -= 2;

  if(equipmentOut === 'ignored')        score -= 1;

  score += reportBonus;

  if(score >= 8)      F.verdict = 'approved';
  else if(score >= 4) F.verdict = 'partial';
  else                F.verdict = 'failed';

  /* §11.14 · Скрытые исходы */
  if(contrabandOut === 'threatened_fail' && G.station.alert === 'ORGANIZED'){
    F.hiddenOutcome = 'pirate';
  } else if(G.warp.exposure >= 400){
    F.hiddenOutcome = 'warp';
  } else if(G.flags.docsForged){
    F.hiddenOutcome = 'faction';
  }

  F.verdictText = {
    approved: 'Принято. Должность — твоя. Довольствие начислено. Следующий рейс — из штата станции.',
    partial:  'Принято условно. Проблемы записаны. Следующий рейс — с сопровождением.',
    failed:   'Отказ. Задержание. Разбирательство.',
  }[F.verdict];

  log('═══ ПРИГОВОР ═══', 'action');
  log(F.verdictText, F.verdict === 'approved' ? 'good' :
                      F.verdict === 'partial'  ? 'warn' : 'danger');

  G.scene = 'final_verdict';
  render();
}

function sceneFinalVerdict(root){
  const F = G.final;

  const title = {
    approved: 'УТВЕРЖДЕНИЕ',
    partial:  'УСЛОВНОЕ УТВЕРЖДЕНИЕ',
    failed:   'ОТКАЗ',
  }[F.verdict];

  const color = F.verdict === 'approved' ? 'var(--green)' :
                F.verdict === 'partial'  ? 'var(--orange)' : 'var(--red)';

  root.appendChild(h('h2', { class:'title', style:{ color } }, title));
  root.appendChild(h('p', { class:'subtitle' }, F.verdictText || ''));

  const L = G.prologue.loadingBg;
  const loaded = L ? L.currentTons : 0;
  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp', style:{ color } }, 'ИТОГИ'),
    kvl('Главная проверка', F.mainCheck || '—'),
    kvl('Груз сдан', loaded.toFixed(1) + ' / ' + G.destination.required + ' т'),
    kvl('Конфликт', F.obstacles.conflict.outcome || '—'),
    kvl('Контрабанда', F.obstacles.contraband.outcome || '—'),
    kvl('Оборудование', F.obstacles.equipment.outcome || '—'),
    kvl('Побочные', F.obstacles.sidequests.outcome || '—'),
    kvl('Отчёт', F.obstacles.report.outcome || '—'),
    kvl('Warp', String(G.warp.exposure)),
    kvl('Деньги', '₡' + G.assets.money)));

  if(F.hiddenOutcome){
    const txt = {
      pirate: 'Побочный исход: пираты. Слухи о станции дойдут до них раньше, чем ты успеешь освоиться.',
      warp:   'Побочный исход: разлом Варпа. Что-то в пустоте заметило тебя.',
      faction:'Побочный исход: фракция. Документы, которые ты подписал, уже кому-то интересны.',
    }[F.hiddenOutcome];
    root.appendChild(h('div', { class:'notice warp' }, txt));
  }

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick:() => {
      G.scene = 'end';
      render();
    }}, 'КОНЕЦ ПРОЛОГА')));
}

/* ============================================================
   СЦЕНА · ПРИБЫТИЕ НА СТАНЦИЮ
   ============================================================ */
function sceneStationArrival(root){
  const deputy = G.npcs.deputy;
  const d = G.destination;

  root.appendChild(h('h2', { class:'title' }, d.station));
  root.appendChild(h('p', { class:'subtitle' }, 'Прибытие. Док ждёт.'));

  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp' }, 'ВСТРЕЧА'),
    h('div', {}, 'Док не пустует. Рабочие, сервиторы, надзор.'),
    h('div', { style:{ marginTop:'10px' } },
      deputy
        ? deputy.name + ' стоит у причала. Не улыбается.'
        : 'У причала тебя ждёт человек.',
      ' Это Зам.'),
    h('div', { style:{ marginTop:'10px', color:'var(--dim)', fontStyle:'italic' } },
      '«Прибыл. Хорошо. Пойдём, покажу, что у нас есть.»')));

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick:() => {
      if(deputy){ deputy.relation += 1; G.final.deputyMet = true; }
      G.scene = 'deputy_office';
      adv(10, 'Зам ведёт в кабинет.', 'info');
      render();
    }}, 'ИДТИ ЗА ЗАМОМ')));
}

/* ============================================================
   СЦЕНА · КАБИНЕТ ЗАМА
   ============================================================ */
function sceneDeputyOffice(root){
  const deputy = G.npcs.deputy;
  const report = G.station.equipmentReport;

  root.appendChild(h('h2', { class:'title' }, 'КАБИНЕТ ЗАМА'));
  root.appendChild(h('p', { class:'subtitle' }, 'Передача дел.'));

  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp' }, 'ЗАМ · ПЕРЕДАЧА ДЕЛ'),
    h('div', { style:{ marginBottom:'12px' } },
      'Зам садится. Кладёт перед тобой планшет. Не спрашивает, готов ли ты.'),
    h('div', { style:{ color:'var(--amber)', fontSize:'12px' } },
      '«Станция — твоя. С этого момента. У меня свои дела.»'),
    h('div', { style:{ marginTop:'10px', color:'var(--muted)', fontSize:'11px' } },
      '«Отчёт оборудования получишь у техника. Дедлайн помнишь.»')));

  if(report){
    root.appendChild(h('div', { class:'card', style:{ marginTop:'12px' } },
      h('div', { class:'stamp' }, 'ОТЧЁТ ОБОРУДОВАНИЯ'),
      h('div', { style:{ marginBottom:'8px' } }, report.summary),
      ...report.items.map(it =>
        h('div', { class:'pda-row' },
          h('span', { class:'k' }, it.name),
          h('span', { class:'v', style:{ color:'var(--orange)' } },
            it.severity + ' · ' + it.needs)))));
  }

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick:() => {
      G.final.equipmentViewed = true;
      if(deputy) deputy.relation += 1;
      log('Дела переданы. Дедлайн: ' + fmtClock(G.final.deadline) + '.', 'warn');
      G.area = 'station';
      G.location = 'dock_arrival';
      G.scene = 'area';
      adv(15, 'Вы вышли в док. Станция работает вокруг вас.', 'info');
      render();
    }}, 'ПРИНЯТЬ ДЕЛА')));
}

/* ============================================================
   §11.11 · ПРИЁМКА ГРУЗА · многостадийная
   ============================================================ */
function sceneUnload(root){
  const U = G.unload;
  if(!U){ G.scene = 'area'; render(); return; }
  const d = G.destination;
  const L = G.prologue.loadingBg;
  const loaded = L ? L.currentTons : 0;
  const extra = L ? (L.extraTons || 0) : 0;
  const extraResource = L && L.plan ? L.plan.extraResource : null;
  const receiver = G.npcs.receiver;

  /* Стадия 1: подход */
  if(U.stage === 1){
    root.appendChild(h('h2', { class:'title' }, 'РАЗГРУЗКА · ' + d.station));
    root.appendChild(h('p', { class:'subtitle' },
      'Зона приёмки. Приёмщик смотрит в планшет и не поднимает глаз.'));

    root.appendChild(h('div', { class:'card' },
      h('div', { class:'stamp' }, 'ПРИЁМКА ГРУЗА'),
      kvl('Поставка', loaded.toFixed(1) + ' / ' + d.required + ' т'),
      extraResource ? kvl(extraResource, extra.toFixed(1) + ' т') : null,
      L && L.smuggledTons > 0 ? kvl('Не по накладной', L.smuggledTons.toFixed(1) + ' т') : null,
      h('div', { style:{ marginTop:'10px', color:'var(--dim)', fontSize:'12px' } },
        'Приёмщик ждёт накладную и подпись. Слова здесь не помогают.')));

    const actions = h('div', { class:'actions' });
    actions.appendChild(h('button', { class:'btn primary', onclick:() => {
      U.stage = 2; render();
    }}, 'ПОДОЙТИ К ПРИЁМЩИКУ'));
    actions.appendChild(h('button', { class:'btn', onclick:() => {
      G.scene = 'area'; render();
    }}, 'ОТЛОЖИТЬ'));
    root.appendChild(actions);
    return;
  }

  /* Стадия 2: документы */
  if(U.stage === 2){
    root.appendChild(h('h2', { class:'title' }, 'ПРИЁМЩИК'));
    root.appendChild(h('p', { class:'subtitle' },
      receiver ? receiver.name : 'Приёмщик груза'));

    root.appendChild(h('div', { class:'card' },
      h('div', { class:'dlg-line' },
        h('span', { class:'who' }, (receiver ? receiver.name : 'Приёмщик') + ':'),
        h('span', { class:'txt' }, ' «Накладная. Подпись. И разгружай. Всё просто.»'))));

    const actions = h('div', { class:'actions' });
    actions.appendChild(h('button', { class:'btn primary', onclick:() => {
      const chaMod = statMod(G.player.stats.cha);
      const intMod = statMod(G.player.stats.int);
      const roll = G.rng.d20() + chaMod + intMod;
      if(roll >= 12){
        log('Приёмщик кивнул. Бумаги в порядке. (d20 → ' + roll + ')', 'good');
        U.docsOK = true;
      } else {
        log('Приёмщик нашёл придирку. Спор затянулся. (d20 → ' + roll + ')', 'warn');
        U.docsOK = false;
        adv(30, 'Пришлось спорить 30 минут.', 'warn');
      }
      U.stage = 3;
      render();
    }}, 'ОТДАТЬ ДОКУМЕНТЫ'));

    if(G.assets.money >= 50){
      actions.appendChild(h('button', { class:'btn', onclick:() => {
        G.assets.money -= 50;
        U.docsOK = true;
        U.bribed = true;
        log('Приёмщик убрал бумаги в ящик. 50₡.', 'warn');
        U.stage = 3;
        render();
      }}, 'ДАТЬ НА ЛАПУ (50₡)'));
    }

    actions.appendChild(h('button', { class:'btn', onclick:() => {
      U.stage = 1; render();
    }}, 'ШАГ НАЗАД'));
    root.appendChild(actions);
    return;
  }

  /* Стадия 3: физическая разгрузка */
  if(U.stage === 3){
    if(!U.crew){
      U.crew = [
        { id:'d1', name:'Разгрузчик 1', fatigue:5,  working:true, skill:5 },
        { id:'d2', name:'Разгрузчик 2', fatigue:10, working:true, skill:4 },
        { id:'d3', name:'Разгрузчик 3', fatigue:15, working:true, skill:5 },
      ];
      U.equipment = {
        crane:{ name:'Кран',  broken:false },
        belt: { name:'Лента', broken:false },
      };
      U.incidentLog = [];
      U.nextIncident = G.time + G.rng.int(60, 120);
      U.progress = U.progress || 0;
    }

    if(G.time >= U.nextIncident && U.progress < 100){
      triggerUnloadIncident(U);
      U.nextIncident = G.time + G.rng.int(90, 180);
    }

    const progress = U.progress || 0;
    const rate = computeUnloadRate(U);

    root.appendChild(h('h2', { class:'title' }, 'РАЗГРУЗКА'));
    root.appendChild(h('p', { class:'subtitle' },
      'Сервиторы и бригада работают. Ты управляешь темпом.'));

    root.appendChild(h('div', { class:'exam-sum' },
      h('div', { class:'prow' },
        h('div', {}, 'Поставка'),
        h('div', { class:'bar' },
          h('i', { style:{ width: progress + '%', background:'var(--green)' } })),
        h('div', {}, Math.floor(progress) + '%')),
      h('div', { style:{ marginTop:'8px', fontSize:'11px', color:'var(--muted)' } },
        'Скорость: ' + rate.toFixed(1) + '% / 30 мин.')));

    root.appendChild(h('h3', {
      style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'6px', fontSize:'12px' }
    }, 'БРИГАДА'));
    for(const c of U.crew){
      root.appendChild(h('div', { class:'method' },
        h('div', { style:{ flex:'1' } },
          h('div', {}, c.name),
          h('div', { style:{ fontSize:'10px', color:'var(--dim)' } },
            'Усталость: ' + Math.round(c.fatigue) + ' · навык ' + c.skill)),
        c.working
          ? h('button', { class:'btn mini', onclick:() => { c.working = false; render(); }}, 'Перерыв')
          : h('button', { class:'btn mini primary', onclick:() => { c.working = true; render(); }}, 'На смену')
      ));
    }

    root.appendChild(h('h3', {
      style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'6px', fontSize:'12px' }
    }, 'ОБОРУДОВАНИЕ'));
    for(const eid in U.equipment){
      const eq = U.equipment[eid];
      if(eq.broken){
        root.appendChild(h('div', { class:'method dis' },
          h('div', { style:{ flex:'1' } }, eq.name + ' — СЛОМАН'),
          h('button', { class:'btn mini primary', onclick:() => {
            const roll = G.rng.d20() + statMod(G.player.stats.int) + (hasItem('tool') ? 4 : 0);
            if(roll >= 12){
              eq.broken = false;
              log(eq.name + ': починен. (d20 → ' + roll + ')', 'good');
            } else {
              log(eq.name + ': не получилось. (d20 → ' + roll + ')', 'warn');
            }
            adv(20, null);
          }}, 'Починить')));
      } else {
        root.appendChild(h('div', { class:'method' },
          h('div', { style:{ flex:'1' } }, eq.name + ' — работает')));
      }
    }

    if(U.incidentLog && U.incidentLog.length){
      root.appendChild(h('h3', {
        style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'6px', fontSize:'12px' }
      }, 'СОБЫТИЯ'));
      const lg = h('div', { class:'exam-log' });
      for(const line of U.incidentLog.slice(-5)) lg.appendChild(h('div', {}, line));
      root.appendChild(lg);
    }

    const actions = h('div', { class:'actions' });
    actions.appendChild(h('button', { class:'btn', onclick:() => {
      const r = computeUnloadRate(U);
      U.progress = Math.min(100, U.progress + r);
      for(const c of U.crew) if(c.working) c.fatigue = Math.min(100, c.fatigue + 5);
      adv(30, null);
      if(U.progress >= 100){
        U.stage = 4;
        log('Разгрузка завершена.', 'good');
      }
      render();
    }}, '▶ ЖДАТЬ 30 МИН'));

    actions.appendChild(h('button', { class:'btn', onclick:() => {
      let safety = 0;
      while(U.progress < 100 && safety < 30){
        const r = computeUnloadRate(U);
        U.progress = Math.min(100, U.progress + r);
        for(const c of U.crew) if(c.working) c.fatigue = Math.min(100, c.fatigue + 5);
        silentAdv(30);
        safety++;
      }
      U.progress = 100;
      U.stage = 4;
      log('Разгрузка завершена.', 'good');
      render();
    }}, '▶▶ ДО КОНЦА'));

    if(G.assets.money >= 50){
      actions.appendChild(h('button', { class:'btn primary', onclick:() => {
        G.assets.money -= 50;
        for(const c of U.crew){ c.fatigue = Math.max(0, c.fatigue - 20); c.working = true; }
        log('Бригада получила доплату. Усталость снижена.', 'good');
        adv(10, null);
        render();
      }}, 'СТИМУЛИРОВАТЬ (50₡)'));
    }

    root.appendChild(actions);
    return;
  }

  /* Стадия 4: доп. груз */
  if(U.stage === 4){
    root.appendChild(h('h2', { class:'title' }, 'ДОПОЛНИТЕЛЬНЫЙ ГРУЗ'));
    root.appendChild(h('p', { class:'subtitle' },
      'Основной груз сдан. Осталось решить с дополнительным.'));

    root.appendChild(h('div', { class:'card' },
      kvl('Объём', extra.toFixed(1) + ' т' + (extraResource ? ' ' + extraResource : '')),
      h('div', { style:{ marginTop:'10px', color:'var(--dim)', fontSize:'12px' } },
        extra > 0
          ? 'Дополнительный груз можно продать приёмщику или оставить себе.'
          : 'Ничего дополнительного не везли.')));

    const actions = h('div', { class:'actions' });

    if(extra > 0){
      actions.appendChild(h('button', { class:'btn', onclick:() => {
        const price = Math.floor(extra * 15);
        G.assets.money += price;
        if(L) L.extraTons = 0;
        log('Дополнительный груз сдан приёмщику. +' + price + '₡.', 'good');
        U.stage = 5;
        render();
      }}, 'СДАТЬ ПРИЁМЩИКУ (+' + Math.floor(extra * 15) + '₡)'));
      actions.appendChild(h('button', { class:'btn', onclick:() => {
        log('Дополнительный груз оставлен себе.', 'info');
        U.stage = 5;
        render();
      }}, 'ОСТАВИТЬ СЕБЕ'));
    } else {
      actions.appendChild(h('button', { class:'btn primary', onclick:() => {
        U.stage = 5;
        render();
      }}, 'ПРОДОЛЖИТЬ'));
    }

    root.appendChild(actions);
    return;
  }

  /* Стадия 5: к отчёту */
  if(U.stage === 5){
    if(!G.final.mainCheck) runMainCheck();
    if(!G.final.verdict){
      G.scene = 'after_unload';
      render();
    }
  }
}

/* ============================================================
   СЦЕНА · ПОСЛЕ РАЗГРУЗКИ
   ============================================================ */
function sceneAfterUnload(root){
  const isSubstitute = G.npcs.overseer && G.npcs.overseer.isSubstitute;
  const hasCallsModule = G.pda.modules && G.pda.modules.some(m => m.id === 'calls');
  const hasCalls = hasCallsModule && !isSubstitute;
  const reportDone = G.final.obstacles.report && G.final.obstacles.report.resolved;

  root.appendChild(h('h2', { class:'title' }, 'ПОСЛЕ РАЗГРУЗКИ'));
  root.appendChild(h('p', { class:'subtitle' },
    hasCalls
      ? 'Модуль звонков установлен. Смотритель ждёт отчёта.'
      : isSubstitute
        ? 'Модуль звонков не поможет: инспектор ждёт только письменный отчёт.'
        : 'Модуль звонков не установлен. Связь — только письмом.'));

  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp' }, 'ОТЧЁТ СМОТРИТЕЛЮ'),
    h('div', {}, 'Контракт идёт к завершению. Ты должен отчитаться.'),
    hasCalls
      ? h('div', { style:{ marginTop:'8px', color:'var(--cyan)' } },
          '«Звони. Не тяни.»')
      : h('div', { style:{ marginTop:'8px', color:'var(--orange)' } },
          '«Пиши. Устно — не считается.»'),
    h('div', { style:{ marginTop:'10px', color:'var(--muted)', fontSize:'11px' } },
      hasCalls
        ? 'Смотритель может спросить не только по делу.'
        : 'Письменный отчёт — только по существу. Без лишнего.')));

  const actions = h('div', { class:'actions' });

  if(!reportDone){
    if(hasCalls){
      actions.appendChild(h('button', { class:'btn primary', onclick:() => {
        G.final.obstacles.report.mode = 'call';
        G.scene = 'final_report';
        adv(3, 'Звонок Смотрителю.', 'action');
        render();
      }}, '📞 ПОЗВОНИТЬ СМОТРИТЕЛЮ'));
    } else {
      actions.appendChild(h('button', { class:'btn primary', onclick:() => {
        G.final.obstacles.report.mode = 'letter';
        G.scene = 'final_report';
        adv(15, 'Письменный отчёт отправлен.', 'action');
        render();
      }}, '✉ ОТПРАВИТЬ ПИСЬМЕННЫЙ ОТЧЁТ'));
    }
  }

  actions.appendChild(h('button', { class:'btn', onclick:() => {
    G.scene = 'area';
    render();
  }}, 'ВЕРНУТЬСЯ В ДОК'));

  root.appendChild(actions);
}

/* ============================================================
   ВСПОМОГАТЕЛЬНЫЕ · разгрузка
   ============================================================ */
function computeUnloadRate(U){
  let base = 0;
  for(const c of U.crew){
    if(!c.working) continue;
    if(c.fatigue < 50) base += 10;
    else if(c.fatigue < 80) base += 7;
    else base += 3;
  }
  let eqOK = 0, eqTotal = 0;
  for(const eid in U.equipment){
    eqTotal++;
    if(!U.equipment[eid].broken) eqOK++;
  }
  const eqMult = eqTotal ? (0.4 + 0.6 * (eqOK / eqTotal)) : 1;
  return base * eqMult;
}

function triggerUnloadIncident(U){
  const r = G.rng;
  const pool = [
    { text:'Кран заклинило.', apply:(U) => { U.equipment.crane.broken = true; } },
    { text:'Один из рабочих упал.', apply:(U) => {
      const c = r.pick(U.crew);
      c.fatigue = Math.min(100, c.fatigue + 25);
      c.working = false;
    }},
    { text:'Инспектор остановил работы. Проверка бумаг.', apply:(U) => {
      U.nextIncident += 60;
    }},
    { text:'Лента встала. Пришлось перезапускать.', apply:(U) => {
      U.equipment.belt.broken = true;
    }},
    { text:'Ссора среди рабочих.', apply:(U) => {
      for(const c of U.crew) c.working = false;
    }},
    { text:'Сервитор уронил ящик. Помял борт.', apply:(U) => {
      U.progress = Math.max(0, U.progress - 3);
    }},
  ];
  const p = r.pick(pool);
  p.apply(U);
  log('⚠ ' + p.text, 'warn');
  if(!U.incidentLog) U.incidentLog = [];
  U.incidentLog.push(p.text);
  if(U.incidentLog.length > 10) U.incidentLog.shift();
}