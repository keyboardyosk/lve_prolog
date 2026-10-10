'use strict';
/* ============================================================
   LOGIC · LVE_6 v3.4
   Диалоги · действия · бой · торговля · помощник · Смотритель ·
   перенос тел · трюм · артефакт.
   ============================================================ */

/* ============================================================
   §5.1 · СОЦИАЛЬНАЯ ЛЕСТНИЦА
   ============================================================ */
function dialogueStage(npc){
  if(!npc.greeted) return 'stranger';
  if(npc.relation >= 5 && npc.personalAsked >= 1) return 'trusted';
  if(npc.generalAsked >= 2) return 'acquainted';
  return 'greeted';
}

/* ============================================================
   ГЛАВНЫЙ ВХОД В ДИАЛОГ
   ============================================================ */
function startDialogue(npcId){
  const npc = G.npcs[npcId];
  if(!npc) return;
  if(npc.state === 'dead' || npc.state === 'unconscious'){ openNpcMenu(npcId); return; }
  if(npc.id === 'overseer'){ return openOverseerDialog(); }
  if(npc.sleeping){ openNpcMenu(npcId); return; }
  npc.awareOfPlayer = true;

  if(!G.playerKnowledge.some(e => e.subjectId === npc.id && e.attribute === 'role' && e.status === 'active')){
    kEntry(npc.id, 'role', roleF(npc), 'OBSERVED', 'контакт', 0.8);
  }
  if(npc.faction && !G.playerKnowledge.some(e => e.subjectId === npc.id && e.attribute === 'faction' && e.status === 'active')){
    kEntry(npc.id, 'faction', npc.faction, 'OBSERVED', 'контакт', 0.85);
  }

  if(npc.id === G.assistantId && !G.flags.pleaShown && canTriggerPlea(npc)){
    return triggerPlea(npc);
  }

  let history = [];
  if(npc.returnedQuestion){
    history.push({ speaker:'npc', text:'«Я тут подумал про то, о чём мы говорили...»' });
    history.push({ speaker:'npc', text:npc.returnedQuestion.question });
    npc.pendingQuestionAnswer = npc.returnedQuestion;
    npc.returnedQuestion = null;
  } else {
    const cb = tryCallback(npc);
    if(cb) history.push({ speaker:'callback', text: cb });
    else if(!npc.greeted) history.push({ speaker:'sys', text:'Смотрит на вас. Ждёт, что скажете.' });
    else history.push({ speaker:'npc', text: G.rng.pick(['Слушаю.','Ну.','Чего?','Говори.']) });
  }

  openModal({ type:'dialogue', npcId, history, asked: new Set() });
}

/* ============================================================
   §5.2 L1 · CALLBACK
   ============================================================ */
function tryCallback(npc){
  if(G.time - G.dialogue.lastCallbackAt < 240) return null;
  const relevant = G.history.filter(e =>
    e.severity !== 'minor' &&
    e.actor === 'player' &&
    !npc.memory.includes(e.id) &&
    G.time - e.time > 60 &&
    (e.witnesses.includes(npc.id) || e.spread >= 2)
  );
  if(!relevant.length) return null;
  const ev = relevant[relevant.length - 1];
  G.dialogue.lastCallbackAt = G.time;
  G.dialogue.callbacksShown++;
  npc.memory.push(ev.id);

  const lines = {
    kill:       '«Говорят, ты убил. Это правда?»',
    murder:     '«Слышал про смерть. Люди говорят о тебе.»',
    steal:      '«Говорят, ты берёшь чужое.»',
    steal_fail: '«Говорят, тебя поймали.»',
    bully:      '«Говорят, ты грубо обошёлся с человеком.»',
    help:       '«Говорили, ты помог. Запомню.»',
    heal:       '«Кто-то сказал, ты лечил. Уважаю.»',
    combat_start:'«Слышал, ты дрался.»',
    knockout:   '«Слышал, ты вырубил человека.»',
  };
  const text = lines[ev.action] || ('«Говорят, ты ' + ev.action + '.»');
  log('CALLBACK · ' + npc.name + ' знает про ' + ev.action + '.', 'callback');

  if(ev.action === 'help' || ev.action === 'heal') npc.relation += 1;
  else if(['kill','murder','steal','knockout'].includes(ev.action)) npc.relation -= 1;
  return text;
}

/* ============================================================
   §5.4 · СПЛЕТНИ
   ============================================================ */
function gossipLine(npc){
  const others = Object.values(G.npcs).filter(n =>
    n.id !== npc.id && n.area === npc.area && n.state === 'alive');
  if(!others.length) return 'Тут мало кого знаю.';
  const target = G.rng.pick(others);
  const rel = (npc.relationships && npc.relationships[target.id]) || 0;

  const opener = G.rng.pick([
    'С ' + target.name + ' виделись пару раз.',
    'Знаю ' + target.name + '.',
    target.name + '? Пересекались.',
    target.name + ' — ' + roleF(target).toLowerCase() + (target.faction ? ', ' + target.faction : '') + '.',
  ]);

  let relText;
  if(rel <= -20)      relText = 'Не в ладах.';
  else if(rel <= -5)  relText = 'Держит дистанцию.';
  else if(rel <= 5)   relText = 'Здороваемся при встрече.';
  else if(rel <= 25)  relText = 'Общие дела были.';
  else if(rel <= 50)  relText = 'В хороших отношениях.';
  else                relText = 'Приятели.';

  const extra = G.rng.pick(['', ' Больше добавить нечего.', ' Особо не общались.', '']);
  return opener + ' ' + relText + extra;
}

/* ============================================================
   §5 · ТОПИКИ ДИАЛОГА
   ============================================================ */
function buildTopics(npc){
  const topics = [];
  const st = dialogueStage(npc);

  if(st === 'stranger'){
    topics.push({ id:'greet', tag:'talk', label:'Поздороваться и представиться',
      response:() => {
        npc.greeted = true;
        const bonus = statMod(G.player.stats.cha);
        if(bonus !== 0) npc.relation += bonus;
        return 'Здравствуйте. ' + npc.name + '.';
      }});
    topics.push({ id:'bye', tag:'end', label:'Уйти, не знакомясь', response:null });
    return topics;
  }

  if(st === 'greeted'){
    topics.push({ id:'work', tag:'talk', label:'Чем занимаетесь?',
      response:() => {
        npc.generalAsked++;
        let s = 'Я ' + roleF(npc).toLowerCase() + '.';
        if(npc.faction) s += ' Числюсь в ' + npc.faction + '.';
        return s;
      }});
    topics.push({ id:'origin', tag:'talk', label:'Откуда вы?',
      response:() => { npc.generalAsked++; return 'Из системы ' + npc.homeSystem + '.'; }});
    topics.push({ id:'here', tag:'talk', label:'Как вам здесь?',
      response:() => {
        npc.generalAsked++;
        return G.rng.pick(['Терпимо.','Как всегда.','Лучше бы дома.','Здесь сойдёт.','Не в восторге.','Привычно.']);
      }});
  }

  if(st === 'acquainted' || st === 'trusted'){
    topics.push({ id:'status', tag:'talk', label:'Кем вы числитесь?',
      response:() => {
        npc.generalAsked++;
        if(npc.faction && npc.factionStatus) return 'В ' + npc.faction + ' я ' + npc.factionStatus + '.';
        if(npc.faction) return 'Числюсь в ' + npc.faction + '.';
        return 'Сам по себе.';
      }});
    topics.push({ id:'hobby', tag:'talk', label:'Чем занимаетесь в свободное время?',
      response:() => {
        npc.generalAsked++;
        return G.rng.pick([
          'Свободное время? В основном ' + npc.hobby + '.',
          'Что тут делать... ' + npc.hobby + ' — и всё.',
          npc.hobby.charAt(0).toUpperCase() + npc.hobby.slice(1) + '. Больше нечем.',
        ]);
      }});
    topics.push({ id:'personal', tag:'personal', label:'Чего вы хотите лично?',
      response:() => { npc.personalAsked++; npc.relation += 1; return npc.goal + '.'; }});
    topics.push({ id:'gossip', tag:'talk', label:'Что знаете о других?', repeatable:true,
      response:() => gossipLine(npc) });
  }

  if(st === 'trusted'){
    if(!G.assets.contacts.includes(npc.id)){
      topics.push({ id:'contact', tag:'personal', label:'Обменяться контактами',
        response:() => { G.assets.contacts.push(npc.id); return 'Записываю.'; }});
    }
    topics.push({ id:'secret', tag:'personal', label:'Что вы скрываете?',
      response:() => {
        if(npc.secret){ npc.secretRevealed = true; return '...Ладно. Есть одна вещь.'; }
        return 'Ничего важного.';
      }});
    if(npc.faction === 'Trade Houses'){
      topics.push({ id:'buy_medkit', tag:'faction', label:'[Trade] Купить аптечку — 80₡',
        response:() => {
          if(G.assets.money < 80) return 'Не хватает.';
          G.assets.money -= 80;
          G.assets.inventory.push(makeItem('medkit'));
          return 'Держи.';
        }});
    }
    if(npc.faction === 'Mechanicus'){
      topics.push({ id:'buy_tool', tag:'faction', label:'[Mech] Купить инструмент — 120₡',
        response:() => {
          if(G.assets.money < 120) return 'Не хватает.';
          G.assets.money -= 120;
          G.assets.inventory.push(makeItem('tool'));
          return 'Инструмент твой.';
        }});
    }
  }

  if(st !== 'stranger'){
    topics.push({ id:'apply', tag:'request', label:'Применить предмет', response:null,
      action:() => { G.modal = null; openApplyItem(npc.id); }});
    topics.push({ id:'gift', tag:'request', label:'Подарить предмет', response:null,
      action:() => { G.modal = null; openGift(npc.id); }});
  }

  if(npc.tradeProfile && (st === 'acquainted' || st === 'trusted')){
    topics.push({ id:'real_trade', tag:'faction', label:'Торговаться о товаре', response:null,
      action:() => { G.modal = null; openTrade(npc.id); }});
  }

  if(npc.isHelper && npc.id === G.assistantId){
    topics.push({ id:'follow', tag:'order', label:'Следуй за мной',
      response:() => { npc.following = true; npc.companionMode = 'JOIN_ACTIVE'; return 'Понял. Иду с тобой.'; }});
    topics.push({ id:'stay', tag:'order', label:'Оставайся здесь',
      response:() => { npc.following = false; npc.companionMode = 'WAIT'; return 'Хорошо. Жду.'; }});
  } else if(npc.isHelper){
    topics.push({ id:'follow', tag:'order', label:'Следуй за мной',
      response:() => { npc.following = true; npc.companionMode = 'JOIN_ACTIVE'; return 'Есть.'; }});
    topics.push({ id:'stay', tag:'order', label:'Оставайся здесь',
      response:() => { npc.following = false; npc.companionMode = 'WAIT'; return 'Как скажете.'; }});
  }

  if(npc.id === 'navigator_psyker'){
    topics.push({ id:'nav_clue', tag:'talk', label:'Почему ты так следишь за маршрутами?',
      response:() => {
        if(npc.relation >= 2){
          npc.navigationDiscovered = true;
          kEntry(npc.id, 'true_role', 'умеет проводить межсистемные переходы', 'CONFIRMED', 'разговор', 0.92);
          return 'Потому что я умею больше, чем рассказывают пассажирам.';
        }
        return 'Я слежу за тем, куда лечу. Это преступление?';
      }});
  }

  if(npc.formerFriend){
    topics.push({ id:'former_friend_memory', tag:'personal', label:'«Мы раньше знакомы?»',
      response:() => {
        npc.memoryState = 'recognizes_face';
        kEntry(npc.id, 'memory', 'узнаёт лицо, но не может восстановить общую историю',
          'CONFIRMED', 'разговор', 0.9);
        return G.rng.pick([
          '«Лицо — да. Остальное как будто кто-то вырезал.»',
          '«Мне кажется, я должен вас знать. Но имя не приходит.»',
          '«Знакомо. И от этого становится хуже.»',
        ]);
      }});
  }

  /* §10.18 · Установка модуля КПК */
  const TECH_IDS = ['mechanic','ship_mechanic','station_tech','dock_tech'];
  if(TECH_IDS.includes(npc.id) && G.pda.pendingModule){
    topics.push({
      id:'install_module', tag:'request',
      label:'Установить модуль КПК (флешка)',
      response:null,
      action:() => { G.modal = null; installPdaModule(npc); }
    });
  }

  /* §3.4 · Ускорение полёта */
  if(npc.id === 'pilot' && typeof getFlightArrival === 'function'){
    const arr = getFlightArrival();
    if(arr != null && arr - G.time > 60){
      topics.push({
        id:'push_flight', tag:'request',
        label:'Попросить ускорить полёт',
        response:null,
        action:() => { G.modal = null; openPilotPush(npc); }
      });
    }
  }

  /* §3.4.6 · Стимуляция погрузки */
  if(npc.id === 'dispatcher' && G.prologue.loadingBg && G.prologue.loadingBg.active){
    topics.push({
      id:'boost_loading', tag:'request',
      label:'Ускорить погрузку',
      response:null,
      action:() => { G.modal = null; openBoostLoading(npc); }
    });
  }

  if((hasItem('pistol') || hasItem('knife')) && st !== 'stranger'){
    topics.push({ id:'attack', tag:'danger', label:'Напасть', response:null,
      action:() => { G.modal = null; startCombat(npc.id, 'assault'); }});
  }

  /* §3.3.3 / §3.4.6 · Скрытый убийца */
  if(typeof killerTopics === 'function'){
    for(const t of killerTopics(npc)) topics.push(t);
  }
  if(typeof victimWarningTopics === 'function'){
    for(const t of victimWarningTopics(npc)) topics.push(t);
  }
  if(typeof reportSuspiciousTopics === 'function'){
    for(const t of reportSuspiciousTopics(npc)) topics.push(t);
  }

  topics.push({ id:'bye', tag:'end', label:'Закончить разговор', response:null });
  return topics;
}

/* ============================================================
   ОБРАБОТКА ТОПИКА
   ============================================================ */
const TOPICS_NO_COUNTER = [
  'bye','follow','stay','attack','apply','gift','real_trade','nav_clue',
  'install_module','push_flight','boost_loading',
  'killer_confront','killer_dissuade',
  'report_suspicious','warn_victim',
];
const TOPICS_ATTENTION = ['personal','secret','gossip'];

function askTopic(topic, npc){
  if(topic.id === 'bye'){ closeModal(); return; }
  const m = G.modal;
  if(!m) return;

  if(TOPICS_ATTENTION.includes(topic.id)){
    npc.askedCounts[topic.id] = (npc.askedCounts[topic.id] || 0) + 1;
    const cnt = npc.askedCounts[topic.id];
    if(cnt === 3){ npc.relation -= 1; log(npc.name + ' раздражается. −1.', 'warn'); }
    else if(cnt >= 4){ npc.relation -= 2; log(npc.name + ' раздражён(а). −2.', 'danger'); }
  }
  m.asked.add(topic.id);

  const totalAsked = (npc.generalAsked || 0) + (npc.personalAsked || 0);
  const canCounter = !TOPICS_NO_COUNTER.includes(topic.id) &&
    totalAsked >= 2 && !npc.askedMeBackAt;

  if(canCounter && G.rng.chance(0.35)){
    if(!topic.action){
      const resp = topic.response();
      m.history.push({ speaker:'npc', text: resp });
      adv(2, null);
    } else {
      topic.action();
      return;
    }
    npc.askedMeBackAt = G.time;
    const stage = dialogueStage(npc);
    const pool = getCounterQuestionPool(stage);
    m.counterQuestion = G.rng.pick(pool);
    renderModal();
    return;
  }

  if(topic.action){ topic.action(); return; }
  const resp = topic.response();
  m.history.push({ speaker:'npc', text: resp });
  adv(2, null);
  renderModal();
}

/* ============================================================
   §5.3 · ВСТРЕЧНЫЙ ВОПРОС
   ============================================================ */
function getCounterQuestionPool(stage){
  const pools = {
    greeted: [
      { q:'«А вы? Из какой системы?»', options:[
        { l:'«Из ' + (G.player && G.player.homeSystem || 'дальних') + '»', rel:+1 },
        { l:'«Издалека. Это долгая история»',         rel: 0 },
        { l:'«Не ваше дело»',                         rel:-2 },
        { l:'«Скажите лучше, куда едете?»',           rel:+1 },
      ]},
      { q:'«Вы тут впервые или возвращаетесь?»', options:[
        { l:'«Впервые»',  rel:+1 },
        { l:'«Возвращаюсь»', rel: 0 },
        { l:'«Не помню»',  rel:-1 },
      ]},
    ],
    acquainted: [
      { q:'«А вы сами чего хотите от этого рейса?»', options:[
        { l:'«Доставить груз и закрыть тему»', rel:+1 },
        { l:'«Присматриваюсь к людям»',        rel:+2 },
        { l:'«Пока не решил»',                  rel: 0 },
      ]},
      { q:'«Как вы смотрите на здешние порядки?»', options:[
        { l:'«Как на неизбежное»',           rel:+1 },
        { l:'«Никак. Не моё дело»',           rel: 0 },
        { l:'«Считаю их неправильными»',      rel:-1 },
      ]},
    ],
    trusted: [
      { q:'«Если бы всё пошло не так — что бы вы сделали?»', options:[
        { l:'«Доделал бы работу»',            rel:+1 },
        { l:'«Ушёл бы сам»',                  rel:-1 },
        { l:'«Спросил бы совета у вас»',      rel:+2 },
      ]},
      { q:'«Можно вам доверять?»', options:[
        { l:'«Да»',                            rel:+1 },
        { l:'«Смотря в чём»',                  rel: 0 },
        { l:'«Это взаимный вопрос»',           rel:+2 },
      ]},
    ],
  };
  return pools[stage] || pools.greeted;
}

function answerCounterQuestion(npc, optIdx){
  const m = G.modal;
  if(!m || !m.counterQuestion) return;
  const opt = m.counterQuestion.options[optIdx];
  if(!opt) return;
  npc.relation += opt.rel;
  if(opt.rel > 0) log(npc.name + ' одобрительно кивнул(а). +' + opt.rel + ' к отношению.', 'good');
  else if(opt.rel < 0) log(npc.name + ' нахмурился(ась). ' + opt.rel + ' к отношению.', 'warn');
  m.history.push({ speaker:'player', text: opt.l });
  m.history.push({ speaker:'sys', text: npc.name + ' кивает и возвращается к прежнему.' });
  m.counterQuestion = null;
  adv(3, null);
  renderModal();
}

/* ============================================================
   §5 · ОПИСАНИЕ СОСТОЯНИЯ NPC
   ============================================================ */
function describeNpcState(npc){
  const wounds = npc.wounds || [];
  const counts = {};
  for(const w of wounds) counts[w.weapon] = (counts[w.weapon] || 0) + 1;

  const parts = [];
  if(counts.pistol) parts.push('огнестрельное ранение');
  if(counts.knife)  parts.push(counts.knife > 2 ? 'множественные порезы' : 'ножевые порезы');
  if(counts.tool)   parts.push('следы ударов инструментом');
  if(counts.fist)   parts.push(counts.fist > 2 ? 'сильные побои' : 'ушибы');
  if(counts.other)  parts.push('следы насилия');

  const woundText = parts.length
    ? 'Повреждения: ' + parts.join(', ') + '.'
    : 'Внешних повреждений нет.';

  if(npc.state === 'dead') return 'Мёртв(а). ' + woundText;
  if(npc.state === 'unconscious'){
    const hpPct = npc.hp / npc.maxHp;
    const state = hpPct < 0.3 ? 'Едва дышит.' : 'Дышит ровно.';
    return 'Без сознания. ' + woundText + ' ' + state;
  }
  const hpPct = npc.hp / npc.maxHp;
  if(hpPct >= 0.9 && wounds.length === 0) return 'Почти невредим(а).';
  return woundText;
}

/* ============================================================
   §4.3 · Стресс и свидетели
   ============================================================ */
function applyStress(delta, reason){
  if(!G.player || !G.player.state) return;
  G.player.state.stress = clamp(G.player.state.stress + delta, 0, 100);
  if(reason && delta > 0) log('Стресс +' + delta + ' (' + reason + ').', 'warn');
}

function applyCrimeWitnesses(target, severity){
  const delta = { murder:-15, knockout:-6, combat:-4, steal:-3 }[severity] || 0;
  if(!delta) return;
  const witnesses = [];
  for(const w of Object.values(G.npcs)){
    if(w.id === target.id || w.area !== G.area) continue;
    if(w.location !== G.location) continue;
    if(w.state === 'dead') continue;
    w.relation += delta;
    w.memory.push('witnessed_' + severity + ':' + target.id);
    w.awareOfPlayer = true;
    witnesses.push(w.id);
  }
  if(witnesses.length > 0){
    log('Свидетели запомнили. ' + witnesses.length + ' чел. ' + delta + ' к отношению.',
      severity === 'murder' ? 'danger' : 'warn');
  }
}

/* ============================================================
   КОНТЕКСТНОЕ МЕНЮ NPC
   ============================================================ */
function openNpcMenu(npcId){
  const npc = G.npcs[npcId];
  if(!npc) return;

  if(npc.state === 'dead' || npc.state === 'unconscious'){ return openDownNpc(npcId); }
  if(npc.sleeping){ return openSleepingNpc(npcId); }

  const methods = [];
  methods.push({ label:'Поговорить', time:2,
    onClick:() => { closeModal(); startDialogue(npc.id); }});
  methods.push({ label:'Осмотреть', time:1,
    onClick:() => {
      closeModal();
      adv(1, 'Осмотр: ' + npc.name + '. ' + roleF(npc) +
        (npc.faction ? ', ' + npc.faction : '') + '. ' +
        describeNpcState(npc), 'info');
    }});
  if(G.assets.inventory.length){
    methods.push({ label:'Применить предмет', time:3,
      onClick:() => { closeModal(); openApplyItem(npc.id); }});
    methods.push({ label:'Подарить предмет', time:3,
      onClick:() => { closeModal(); openGift(npc.id); }});
  }
  if(hasItem('pistol') || hasItem('knife')){
    methods.push({ label:'Напасть', time:5,
      onClick:() => { closeModal(); startCombat(npc.id, 'assault'); }});
  }
  if(npc.isHelper && npc.following){
    methods.push({ label:'Поручить работу', time:5,
      onClick:() => { closeModal(); openCompanionWork(npc); }});
  }
  methods.push({ label:'Уйти', time:0, onClick: closeModal });

  openModal({ type:'action', title: npc.name + ' · ' + roleF(npc),
    desc: 'HP ' + npc.hp + '/' + npc.maxHp + ' · отн. ' + npc.relation + '. ' +
      describeNpcState(npc), methods });
}

function openSleepingNpc(npcId){
  const npc = G.npcs[npcId];
  openModal({ type:'action', title: npc.name + ' · спит',
    desc:'HP: ' + npc.hp + '/' + npc.maxHp + '.',
    methods:[
      { label:'Обшарить карманы', time:5, mod: modLabel('ХАР', G.player.stats.cha),
        desc:'тихо. Риск разбудить.',
        onClick:() => doSearchPockets(npc) },
      { label:'Разбудить пинком', time:1, desc:'резко. Отношение −2.',
        onClick:() => {
          closeModal(); npc.sleeping = false; npc.relation -= 2;
          log('Вы разбудили ' + npc.name + ' пинком.', 'warn');
          historyEvent('player', 'bully', npc.id, 'minor', []);
          adv(1, null);
        }},
      { label:'Разбудить аккуратно', time:2,
        onClick:() => { closeModal(); npc.sleeping = false;
          log('Вы разбудили ' + npc.name + ' аккуратно.', 'info'); adv(2, null); }},
      { label:'Убить', time:5, desc:'Выбрать способ.',
        onClick:() => { closeModal(); openAssassinationMenu(npc); }},
      { label:'Уйти', time:0, onClick: closeModal },
    ]});
}

function openAssassinationMenu(target){
  const methods = [];

  methods.push({
    label:'Задушить голыми руками', time:5,
    mod: modLabel('СИЛ', G.player.stats.str),
    desc:'Тихо. Долго. Проверка СИЛ.',
    onClick:() => { closeModal(); attemptAssassination(target, 'fist'); }
  });

  if(hasItem('knife')){
    methods.push({
      label:'Ударить ножом', time:3,
      desc:'Тихо. Быстро. Если попадёшь.',
      onClick:() => { closeModal(); attemptAssassination(target, 'knife'); }
    });
  }

  if(hasItem('pistol') && hasAmmo()){
    methods.push({
      label:'Выстрел в упор', time:2,
      desc:'Шумно. Поднимет всех.',
      onClick:() => { closeModal(); attemptAssassination(target, 'pistol'); }
    });
  }

  methods.push({ label:'Отмена', time:0, onClick:() => {
    closeModal();
    openSleepingNpc(target.id);
  }});

  openModal({ type:'action', title:'Убить спящего · ' + target.name,
    desc:'Он не проснётся сам. Вопрос — как ты это сделаешь.',
    methods});
}

function attemptAssassination(target, weapon){
  if(!target || target.state !== 'alive') return;
  weapon = weapon || 'fist';

  const weaponMod = weapon === 'pistol' ? 6 : weapon === 'knife' ? 4 : 1;
  const strMod = Math.max(0, statMod(G.player.stats.str));

  const witnesses = Object.values(G.npcs).filter(n =>
    n.id !== target.id && n.area === G.area && n.location === G.location &&
    !n.sleeping && n.state === 'alive');

  const roll = G.rng.d20() + weaponMod + strMod;
  const dc = 10 + (target.maxHp > 12 ? 3 : 0) + (witnesses.length > 0 ? 2 : 0);

  if(weapon === 'pistol' && !consumeAmmo()){
    log('Патронов нет.', 'warn');
    render();
    return;
  }

  if(roll >= dc){
    target.state = 'dead';
    target.hp = 0;
    target.sleeping = false;
    target.wounds = target.wounds || [];
    target.wounds.push({ weapon, time:G.time });
    log(target.name + ' убит(а) во сне. Тихо. (d20 → ' + roll + ')', 'danger');
    applyDeathConsequences(target);
    historyEvent('player', 'murder', target.id, 'grave', witnesses.map(w => w.id));
    applyCrimeWarp('murder');
    applyCrimeWitnesses(target, 'murder');
    applyStress(10, 'убийство');

    if(weapon === 'pistol') noiseFromShot();
    adv(5, null);
  } else {
    target.sleeping = false;
    log(target.name + ' проснулся(ась) в последний момент! (d20 → ' + roll + ')', 'danger');
    adv(2, null);
    startCombat(target.id, 'assault');
  }
}

function applyCrimeWarp(action){
  const add = {
    murder: 8, kill: 8, assassination: 8,
    threaten_fail: 4, combat_start: 2,
  }[action] || 0;
  if(!add) return;
  G.warp.exposure = clamp(G.warp.exposure + add, 0, WARP.SCALE_MAX);
  log('✦ Кровь притягивает внимание. Warp +' + add + '.', 'warp');
}

/* ============================================================
   ТЕЛА · осмотр, обыск, добивание, спрятать, тащить
   ============================================================ */
function openDownNpc(npcId){
  const npc = G.npcs[npcId];
  if(!npc) return;
  const isDead = npc.state === 'dead';

  if(isDead && !npc.seenAsCorpse){
    npc.seenAsCorpse = true;
    applyStress(5, 'вид трупа');
  }

  const methods = [];

  methods.push({ label:'Осмотреть', time:2,
    onClick:() => {
      closeModal();
      adv(2, 'Осмотр: ' + npc.name + '. ' + describeNpcState(npc), 'info');
    }});

  /* Тащить тело — доступно в обеих ветках */
  const carriedId = G.flags.carryingBody;
  if(carriedId === npc.id){
    methods.push({ label:'Положить тело', time:1,
      desc:'Опустить здесь.',
      onClick:() => { closeModal(); dropCarriedBody('manual'); }});
  } else if(!carriedId){
    methods.push({ label:'Взять тело', time:3,
      mod: modLabel('СИЛ', G.player.stats.str),
      desc:'Тащить в другую локацию.',
      onClick:() => { closeModal(); pickUpBody(npc); }});
  } else {
    methods.push({ label:'Взять тело (уже тащите другого)', time:0, disabled:true });
  }

  if(!isDead){
    methods.push({ label:'Оказать помощь (аптечка)', time:10, req:'Аптечка',
      disabled: !hasItem('medkit'),
      onClick:() => {
        const idx = G.assets.inventory.findIndex(x => x.type === 'medkit');
        if(idx < 0) return;
        G.assets.inventory.splice(idx, 1);
        const heal = 5 + Math.max(0, statMod(G.player.stats.int));
        npc.hp = Math.min(npc.maxHp, npc.hp + heal);
        if(npc.hp > 0) npc.state = 'injured';
        npc.wounded = false; npc.seekingHelp = false;
        closeModal();
        adv(10, 'Вы помогли ' + npc.name + '. +' + heal + ' HP.', 'good');
        npc.relation += 3;
        historyEvent('player', 'heal', npc.id, 'notable', []);
      }});

    if(!npc.searched){
      methods.push({ label:'Обыскать', time:5,
        onClick:() => {
          closeModal();
          npc.searched = true;
          const items = npc.items && npc.items.length ? npc.items.splice(0) : [];
          if(items.length){
            for(const it of items) G.assets.inventory.push(makeItem(it));
            log('Забрали: ' + items.map(t => ITEMS[t]?.n || t).join(', ') + '.', 'good');
          } else {
            G.assets.inventory.push(makeItem('junk'));
            log('Мелочь из карманов.', 'good');
          }
          historyEvent('player', 'steal', npc.id, 'notable', []);
          adv(5, null);
        }});
    } else {
      methods.push({ label:'Обыскать (уже)', time:0, disabled:true });
    }

    methods.push({ label:'Добить', time:3, desc:'Короче.',
      onClick:() => {
        closeModal();
        npc.state = 'dead';
        npc.hp = 0;
        npc.wounds = npc.wounds || [];
        npc.wounds.push({ weapon:'other', time:G.time });
        log(npc.name + ' ' + (isF(npc) ? 'мертва' : 'мёртв') + '.', 'danger');
        historyEvent('player', 'murder', npc.id, 'grave', []);
        applyDeathConsequences(npc);
        applyCrimeWarp('murder');
        applyCrimeWitnesses(npc, 'murder');
        applyStress(10, 'убийство');
        if(G.area === 'station' && G.station) G.station.alert = 'ORGANIZED';
        adv(3, null);
      }});
  } else {
    if(!npc.searched){
      methods.push({ label:'Обыскать тело', time:5,
        onClick:() => {
          closeModal();
          npc.searched = true;
          const items = npc.items && npc.items.length ? npc.items.splice(0) : [];
          if(items.length){
            for(const it of items) G.assets.inventory.push(makeItem(it));
            log('Забрали: ' + items.map(t => ITEMS[t]?.n || t).join(', ') + '.', 'good');
          } else {
            G.assets.inventory.push(makeItem('junk'));
            log('Мелочь из карманов мертвеца.', 'good');
          }
          historyEvent('player', 'steal', npc.id, 'notable', []);
          adv(5, null);
        }});
    } else {
      methods.push({ label:'Обыскать (уже)', time:0, disabled:true });
    }

    /* Спрятать в ящик — только если в локации есть ящик */
    const area = AREAS[G.area];
    const loc = area && area.locs[G.location];
    const hasCrate = loc && loc.has && loc.has.includes('crate');
    const crateKey = 'crate_body_' + G.area + '_' + G.location;
    const crateUsed = G.flags[crateKey];

    if(hasCrate && !crateUsed){
      methods.push({ label:'Спрятать тело в ящик', time:20,
        onClick:() => {
          closeModal();
          npc.bodyHidden = true;
          npc.area = null;
          npc.location = null;
          G.flags[crateKey] = true;
          log('Тело спрятано в ящик. Один ящик — одно тело.', 'warn');
          adv(20, null);
        }});
    } else if(hasCrate && crateUsed){
      methods.push({ label:'Спрятать тело (ящик занят)', time:0, disabled:true });
    } else {
      methods.push({ label:'Спрятать тело (нет ящика)', time:0, disabled:true });
    }
  }
  methods.push({ label:'Уйти', time:0, onClick: closeModal });

  openModal({ type:'action',
    title: npc.name + (isDead ? ' · мёртв' : ' · без сознания'),
    desc: describeNpcState(npc), methods });
}

/* ============================================================
   §5 · ТАЩИТЬ ТЕЛО
   ============================================================ */
function pickUpBody(npc){
  if(G.flags.carryingBody) return;
  if(!npc || npc.area !== G.area || npc.location !== G.location) return;
  G.flags.carryingBody = npc.id;
  npc.carriedBy = 'player';
  log('Вы взвалили ' + npc.name + ' на плечо.', 'action');
  historyEvent('player', 'carry_start', npc.id, 'notable', []);
  adv(3, null);
}

function dropCarriedBody(reason){
  const id = G.flags.carryingBody;
  if(!id) return;
  const npc = G.npcs[id];
  G.flags.carryingBody = null;
  if(npc){
    npc.carriedBy = null;
    if(reason === 'manual'){
      log('Вы опустили тело ' + npc.name + '.', 'info');
    } else if(reason === 'left'){
      log('Пришлось оставить тело ' + npc.name + ' на ' +
        (AREAS[G.area]?.locs[G.location]?.n || '?') + '.', 'warn');
    } else if(reason === 'dropped'){
      log('Тело ' + npc.name + ' больше не с вами.', 'warn');
    }
  }
  adv(1, null);
}

function doSearchPockets(npc){
  closeModal();
  if(npc.searched){
    log(npc.name + ' уже обыскан(а).', 'info');
    adv(2, null);
    return;
  }
  npc.searched = true;
  const wit = Object.values(G.npcs).filter(n =>
    n.area === G.area && n.location === G.location &&
    !n.sleeping && !n.following && n.id !== npc.id && n.state === 'alive');
  let seen = false;
  for(const w of wit){ if(G.rng.d20() >= 12){ seen = true; w.awareOfPlayer = true; } }
  const roll = G.rng.d20() + statMod(G.player.stats.cha);

  if(roll >= 10){
    if(npc.items.length > 0){
      const items = npc.items.splice(0);
      for(const it of items) G.assets.inventory.push(makeItem(it));
      log('Забрали: ' + items.map(t => ITEMS[t]?.n || t).join(', ') + '. (d20 → ' + roll + ')', 'good');
    } else {
      const junk = makeItem('junk');
      junk.name = 'Мелочь из кармана';
      G.assets.inventory.push(junk);
      log('Мелочь из кармана. (d20 → ' + roll + ')', 'good');
    }
    historyEvent('player', 'steal', npc.id, 'notable', seen ? ['witness'] : []);
    if(seen) applyCrimeWitnesses(npc, 'steal');
  } else {
    npc.sleeping = false;
    npc.relation -= 2;
    log('Провал. ' + npc.name + ' проснулся(ась). (d20 → ' + roll + ')', 'danger');
    historyEvent('player', 'steal_fail', npc.id, 'notable', [npc.id]);
  }
  if(seen) log('Вас заметили.', 'danger');
  adv(5, null);
}

/* ============================================================
   §5.5 · ПРИМЕНИТЬ / ПОДАРИТЬ
   ============================================================ */
function openApplyItem(npcId){
  const npc = G.npcs[npcId];
  const applicable = G.assets.inventory.filter(it =>
    ['medkit','pistol','knife','credit','family_doc','service_doc','trade_pass','tech_doc','local_doc','signet','tool']
      .includes(it.type));
  if(!applicable.length){
    closeModal();
    log('Нет подходящих предметов.', 'info');
    render();
    return;
  }
  const methods = applicable.map(it => {
    let desc = '', mod = null;
    if(it.type === 'medkit'){ desc = npc.hp < npc.maxHp || npc.wounded ? 'оказать помощь' : 'он не ранен'; mod = modLabel('ИНТ', G.player.stats.int); }
    else if(it.type === 'pistol' || it.type === 'knife'){ desc = 'угрожать'; mod = modLabel('ХАР', G.player.stats.cha); }
    else if(it.type === 'credit') desc = 'предложить деньги';
    else if(it.type === 'signet') desc = 'знак статуса';
    else if(['family_doc','service_doc','trade_pass','tech_doc','local_doc'].includes(it.type)){
      desc = (npc.shownItems && npc.shownItems[it.type]) ? 'уже видел' : 'показать документ';
      mod = modLabel('ХАР', G.player.stats.cha);
    }
    else if(it.type === 'tool') desc = 'предложить помощь';
    return { label: 'Использовать: ' + it.icon + ' ' + it.name, time:3, desc, mod,
      onClick:() => { closeModal(); applyItemToNpc(it, npc); }};
  });
  methods.push({ label:'Отмена', time:0, onClick:() => { closeModal(); startDialogue(npc.id); }});
  openModal({ type:'action', title:'Применить предмет — ' + npc.name, methods });
}

function applyItemToNpc(item, npc){
  let text = '', cls = 'info';
  if(item.type === 'medkit'){
    if(npc.hp < npc.maxHp || npc.wounded){
      const heal = 5 + Math.max(0, statMod(G.player.stats.int));
      npc.hp = Math.min(npc.maxHp, npc.hp + heal);
      npc.wounded = false; npc.seekingHelp = false;
      G.assets.inventory = G.assets.inventory.filter(x => x.id !== item.id);
      npc.relation += 3;
      text = 'Вы помогли ' + npc.name + '. +' + heal + ' HP.'; cls = 'good';
      historyEvent('player', 'heal', npc.id, 'notable', []);
    } else { npc.relation += 1; text = 'Аптечка не нужна.'; }
  } else if(item.type === 'pistol' || item.type === 'knife'){
    const roll = G.rng.d20() + statMod(G.player.stats.cha);
    if(roll >= 12){ npc.relation -= 3; text = 'Угрожали. Слушает. (d20 → ' + roll + ')'; cls = 'warn'; }
    else { npc.relation -= 4; text = npc.name + ' испугался(ась). Запомнит. (d20 → ' + roll + ')'; cls = 'danger'; }
    historyEvent('player', 'bully', npc.id, 'notable', []);
  } else if(item.type === 'credit'){
    npc.relation += 2;
    text = 'Предложили кредиты. Задумался(ась).';
  } else if(['family_doc','service_doc','trade_pass','tech_doc','local_doc','signet'].includes(item.type)){
    if(!npc.shownItems) npc.shownItems = {};
    if(npc.shownItems[item.type]){
      text = npc.name + ' уже видел(а) этот документ. Больше не смотрит.';
    } else {
      npc.shownItems[item.type] = true;
      npc.relation += 2;
      text = 'Показали документ. ' + npc.name + ' изучил(а) внимательно.';
      cls = 'good';
    }
  } else if(item.type === 'tool'){
    text = 'Предложили инструмент. Отказался(ась).';
  } else { text = 'Ничего не произошло.'; }
  adv(3, text, cls);
  G.modal = { type:'dialogue', npcId: npc.id,
    history:[{ speaker:'sys', text }], asked:new Set() };
  renderModal();
}

function openGift(npcId){
  const npc = G.npcs[npcId];
  if(!G.assets.inventory.length){ closeModal(); log('Инвентарь пуст.', 'info'); render(); return; }
  const methods = G.assets.inventory.map(it => ({
    label: 'Подарить: ' + it.icon + ' ' + it.name, time:3,
    mod: modLabel('ХАР', G.player.stats.cha),
    onClick:() => {
      const idx = G.assets.inventory.findIndex(x => x.id === it.id);
      if(idx < 0) return;
      G.assets.inventory.splice(idx, 1);

      let bonus = 2 + Math.max(0, statMod(G.player.stats.cha));
      const hobbyMatch = it.type === 'sedative' || it.type === 'alcohol' ||
        (it.name && npc.hobby && it.name.toLowerCase().includes(npc.hobby.split(' ')[0]));
      if(hobbyMatch) bonus += 2;
      npc.relation += bonus;

      closeModal();
      adv(3, 'Подарили ' + npc.name + ' ' + it.name + '. (+' + bonus + ' к отношению)',
        hobbyMatch ? 'good' : 'info');
      G.modal = { type:'dialogue', npcId: npc.id,
        history:[{ speaker:'sys', text: 'Вы подарили ' + it.name + '.' }],
        asked:new Set() };
      renderModal();
    }
  }));
  methods.push({ label:'Отмена', time:0, onClick:() => { closeModal(); startDialogue(npc.id); }});
  openModal({ type:'action', title:'Подарить предмет — ' + npc.name, methods });
}

/* ============================================================
   §5.6 · МОЛИТВА
   ============================================================ */
function openPray(){
  const chaMod = statMod(G.player.stats.cha);
  openModal({ type:'action', title:'Молитва', desc:'Икона Императора.',
    methods:[
      { label:'Помолиться молча', time:15,
        onClick:() => {
          closeModal();
          G.player.state.stress = clamp(G.player.state.stress - 10, 0, 100);
          adv(15, 'Помолчали.', 'good');
        }},
      { label:'Молитва на коленях', time:60,
        mod: modLabel('ХАР', G.player.stats.cha),
        desc:'Утомляет. Сон ближе. Может укрепить дух. (Укреплений: ' +
             (G.player.prayerBonus || 0) + '/3)',
        onClick:() => {
          closeModal();
          G.player.state.sleepDebt += 30;
          G.player.state.stress = clamp(G.player.state.stress - 15, 0, 100);
          const r = G.rng.d20() + chaMod;
          if(r >= 13){
            if(!G.player.prayerBonus) G.player.prayerBonus = 0;
            if(G.player.prayerBonus < 3){
              G.player.stats.cha += 1;
              G.player.prayerBonus++;
              log('Молитва укрепила дух. ХАР → ' + G.player.stats.cha + '. (d20 → ' + r + ')', 'good');
            } else {
              log('Молитва успокоила, но нового не открыла. (d20 → ' + r + ')', 'info');
            }
          } else {
            log('Молитва прошла впустую. (d20 → ' + r + ')', 'info');
          }
          if(G.warp.exposure > 0){
            const before = G.warp.exposure;
            const reduce = G.warp.whisperActive ? 4 : 2;
            G.warp.exposure = Math.max(0, G.warp.exposure - reduce);
            log('Warp-воздействие: ' + before + ' → ' + G.warp.exposure + '.', 'good');
            G.warp.whisperActive = false;
          }
          adv(60, null);
        }},
      { label:'Уйти', time:0, onClick: closeModal },
    ]});
}

/* ============================================================
   §5.11 · ДОСУГ
   ============================================================ */
function openLeisure(){
  openModal({ type:'action', title:'Досуг',
    methods:[
      { label:'Подкачаться', time:60, desc:'+1 СИЛ. Усталость +10, дефицит сна +20.',
        onClick:() => { closeModal(); G.player.stats.str += 1;
          G.player.state.fatigue = clamp(G.player.state.fatigue + 10, 0, 100);
          G.player.state.sleepDebt = clamp(G.player.state.sleepDebt + 20, 0, 100);
          adv(60, 'СИЛ → ' + G.player.stats.str + ' (' + modStr(G.player.stats.str) + ').', 'good'); }},
      { label:'Почитать книгу', time:60, desc:'+1 ИНТ. Усталость +15, дефицит сна +30, голод +5.',
        onClick:() => { closeModal(); G.player.stats.int += 1;
          G.player.state.fatigue = clamp(G.player.state.fatigue + 15, 0, 100);
          G.player.state.sleepDebt = clamp(G.player.state.sleepDebt + 30, 0, 100);
          G.player.state.hunger = clamp(G.player.state.hunger + 5, 0, 100);
          if(G.player.pathologies.some(p => p.id === 'eye_strain')){
            G.player.state.stress = clamp(G.player.state.stress + 3, 0, 100);
          }
          adv(60, 'ИНТ → ' + G.player.stats.int + ' (' + modStr(G.player.stats.int) + ').', 'good'); }},
      { label:'Тренировка', time:90, desc:'+1 ВЫН. Усталость +15, дефицит сна +30.',
        onClick:() => { closeModal(); G.player.stats.end += 1;
          G.player.state.fatigue = clamp(G.player.state.fatigue + 15, 0, 100);
          G.player.state.sleepDebt = clamp(G.player.state.sleepDebt + 30, 0, 100);
          adv(90, 'ВЫН → ' + G.player.stats.end + ' (' + modStr(G.player.stats.end) + ').', 'good'); }},
      { label:'Уйти', time:0, onClick: closeModal },
    ]});
}

function openCabinRest(){
  openModal({ type:'action', title:'Отдых и сон',
    methods:[
      { label:'Отдохнуть (час)', time:60,
        onClick:() => { closeModal(); G.player.state.stress = clamp(G.player.state.stress - 5, 0, 100);
          adv(60, 'Побыли одни.', 'info'); }},
      { label:'Спать — быстрый (2 ч)', time:120,
        onClick:() => { closeModal(); shortSleep(120); }},
      { label:'Спать — короткий (4 ч)', time:240,
        onClick:() => { closeModal(); shortSleep(240); }},
      { label:'Спать — средний (6 ч)', time:360,
        onClick:() => { closeModal(); shortSleep(360); }},
      { label:'Спать — полный (8 ч)', time:480,
        onClick:() => { closeModal(); shortSleep(480); }},
      { label:'Уйти', time:0, onClick: closeModal },
    ]});
}

function openEat(){
  const st = G.npcs.steward;
  const canServe = st && st.state === 'alive' && !st.sleeping &&
                   st.area === G.area;

  const methods = [];

  methods.push({ label:'Пайок', time:15,
    onClick:() => {
      closeModal();
      G.player.state.hunger = clamp(G.player.state.hunger - 30, 0, 100);
      adv(15, 'Съели паёк.', 'good');
    }});

  if(canServe){
    methods.push({
      label:'Заказать обед (15₡ · принесёт ' + st.name + ')',
      time:15, disabled: G.assets.money < 15,
      desc:'Стюардесса улыбнётся и принесёт через 15 минут.',
      onClick:() => {
        G.assets.money -= 15;
        closeModal();
        G.flags.pendingLunch = { at: G.time + 15, served: false };
        log(st.name + ' улыбнулась и ушла за обедом.', 'info');
        adv(15, null);
      }
    });
  } else {
    methods.push({
      label:'Обед (15₡)', time:45, disabled: G.assets.money < 15,
      onClick:() => {
        G.assets.money -= 15; closeModal();
        G.player.state.hunger = clamp(G.player.state.hunger - 50, 0, 100);
        G.player.state.stress = clamp(G.player.state.stress - 5, 0, 100);
        adv(45, 'Обед.', 'good');
      }
    });
  }

  methods.push({ label:'Уйти', time:0, onClick: closeModal });
  openModal({ type:'action', title:'Поесть', methods });
}

function openBuyAlcohol(){
  openModal({ type:'action', title:'Выпивка (20₡)',
    methods:[
      { label:'Выпить', time:20, disabled: G.assets.money < 20,
        onClick:() => { G.assets.money -= 20; closeModal();
          G.player.state.stress = clamp(G.player.state.stress - 25, 0, 100);
          G.player.state.sleepDebt += 40;
          G.player.state.sleepQuality = 'alcohol';
          log('Выпили.', 'warn'); adv(20, null); }},
      { label:'Уйти', time:0, onClick: closeModal },
    ]});
}

function openHide(){
  openModal({ type:'action', title:'Уединиться',
    methods:[
      { label:'Побыть одному', time:20,
        onClick:() => { closeModal(); G.player.state.stress = clamp(G.player.state.stress - 8, 0, 100);
          adv(20, 'Стресс ниже.', 'good'); }},
      { label:'Уйти', time:0, onClick: closeModal },
    ]});
}

function openEavesdrop(){
  openModal({ type:'action', title:'Подслушать',
    methods:[
      { label:'Слушать 10 минут', time:10, mod: modLabel('ИНТ', G.player.stats.int),
        onClick:() => {
          closeModal();
          const roll = G.rng.d20() + statMod(G.player.stats.int);
          if(roll >= 10){
            const g = ['о нехватке продовольствия','о конфликте фракций','о человеке на станции',
              'о смерти в жилом секторе','о слухах про Warp'];
            log('Подслушали: ' + G.rng.pick(g) + '. (d20 → ' + roll + ')', 'good');
          } else log('Не разобрать. (d20 → ' + roll + ')', 'info');
          adv(10, null);
        }},
      { label:'Уйти', time:0, onClick: closeModal },
    ]});
}

/* ============================================================
   §4.2 · СОН · с эффектом камня
   ============================================================ */
function canSleepNow(){
  const s = G.player.state;
  if(s.sleepDebt > 20 || s.fatigue > 60) return true;
  if(G.assets.inventory.some(x => x.type === 'sedative' || x.type === 'alcohol')) return true;
  return false;
}

function shortSleep(min){
  const s = G.player.state;
  if(!canSleepNow()){ log('Слишком свеж, чтобы заснуть.', 'warn'); render(); return; }

  let quality = 1.0;
  const alcIdx = G.assets.inventory.findIndex(x => x.type === 'alcohol');
  if(alcIdx >= 0){ quality = 0.5; G.assets.inventory.splice(alcIdx, 1); }
  const sedIdx = G.assets.inventory.findIndex(x => x.type === 'sedative');
  if(sedIdx >= 0){ quality = 1.0; G.assets.inventory.splice(sedIdx, 1); }

  const endBonus = 1 + Math.max(0, statMod(G.player.stats.end)) * 0.15;
  const restore = min * quality * endBonus;

  s.fatigue   = clamp(s.fatigue   - restore / 60 * 40, 0, 100);
  s.sleepDebt = clamp(s.sleepDebt - restore / 60 * 60, 0, 100);
  s.stress    = clamp(s.stress    - 10 * quality, 0, 100);

  adv(min, 'Поспали ' + fmtDur(min) + '.', 'info');

  /* §4.4 · Артефакт при сне */
  if(typeof applySleepStoneEffect === 'function'){
    const eff = applySleepStoneEffect();
    if(eff){
      const parts = [];
      if(eff.extra.cha)       parts.push(eff.extra.cha);
      if(eff.extra.hp)        parts.push(eff.extra.hp);
      if(eff.extra.stress)    parts.push(eff.extra.stress);
      if(eff.extra.fatigue)   parts.push(eff.extra.fatigue);
      if(eff.extra.warp)      parts.push(eff.extra.warp);
      if(eff.extra.nightmare) parts.push('кошмар');
      if(parts.length){
        log('Камень: ' + parts.join(', ') + '.', 'warp');
      }
    }
  }
}

/* ============================================================
   §4.4 · ОСМОТР ОБЪЕКТОВ
   ============================================================ */
function inspectObject(kind){
  if(kind === 'crate'){
    const key = 'crate_loot_' + G.area + '_' + G.location;
    const hasLoot = key in G.flags;
    const left = G.flags[key] || 0;

    const methods = [
      { label:'Обшарить руками', time:15, desc:'шумно. Риск травмы.',
        disabled: hasLoot && left <= 0,
        onClick:() => doCrateSearch('hands') },
      { label:'Использовать инструмент', time:10, req:'Инструмент',
        mod: modLabel('ИНТ', G.player.stats.int),
        disabled: !hasItem('tool') || (hasLoot && left <= 0),
        onClick:() => doCrateSearch('tool') },
      { label:'Осмотреть', time:1,
        onClick:() => { closeModal();
          adv(1, hasLoot ? (left > 0 ? 'Внутри что-то есть.' : 'Пусто.') : 'Пломбы сорваны. Замок цел.', 'info'); }},
    ];

    /* §4.4 · Секретное дно — только в служебной зоне малого корабля */
    if(G.area === 'small_ship' && G.location === 'service' && !G.flags.stoneFound){
      methods.push({
        label:'Поискать двойное дно', time:20,
        mod: modLabel('ИНТ', G.player.stats.int),
        desc:'Внимательно осмотреть корпус.',
        onClick:() => { closeModal(); searchSecretCompartment(); }
      });
    }

    methods.push({ label:'Уйти', time:0, onClick: closeModal });
    openModal({ type:'action', title:'Ящик',
      desc: hasLoot
        ? (left > 0 ? 'Внутри что-то есть.' : 'Пусто.')
        : 'Закрыт. Пломбы сорваны.',
      methods });
  } else if(kind === 'terminal'){
    openModal({ type:'action', title:'Терминал', desc:'Маршрут и груз.',
      methods:[
        { label:'Проверить маршрут', time:5,
          onClick:() => {
            closeModal();
            adv(5, 'Маршрут: ' + G.destination.system + ' → ' +
              G.destination.planet + ' → ' + G.destination.station + '.', 'info');
          }},
        { label:'Проверить груз', time:5,
          onClick:() => {
            closeModal();
            adv(5, 'Груз: ' + G.destination.resource + ' ' + G.destination.required + ' т.', 'info');
          }},
        { label:'Уйти', time:0, onClick: closeModal },
      ]});
  } else if(kind === 'medscanner'){
    const disc = G.player.pathologies.filter(p => p.discovered && !p.treated).length;
    const intMod = statMod(G.player.stats.int);
    const scanTime = Math.max(15, 30 - intMod * 5);
    const hpMissing = G.player.state.maxHp - G.player.state.hp;
    openModal({ type:'action', title:'Медсканнер',
      desc:'Сканирование ' + scanTime + ' мин, бесплатно. ' +
        'Лечение патологий — 40₡ за патологию. ' +
        'Лечение ран — 20₡ за HP.' +
        (disc ? ' К лечению: ' + disc + ' патологий.' : '') +
        (hpMissing ? ' Потеряно HP: ' + hpMissing + '.' : ''),
      methods:[
        { label:'Сканирование (' + scanTime + ' мин)', time:scanTime,
          onClick:() => {
            let found = 0; const newOnes = [];
            for(const p of G.player.pathologies){
              if(!p.discovered){ p.discovered = true; found++; newOnes.push(p); }
            }
            closeModal();
            if(found > 0){
              log('Сканирование выявило ' + found + ' патологий:', 'info');
              for(const p of newOnes) log('  · ' + p.name, 'warn');
            } else log('Новых патологий нет.', 'info');
            adv(scanTime, null);
          }},
        { label:'Лечение патологий', time:45,
          desc: disc ? (disc * 40) + '₡' : 'нечего лечить',
          disabled: disc === 0,
          onClick:() => doTreat() },
        { label:'Лечение ран (HP)', time:30,
          desc: hpMissing > 0 ? (hpMissing * 20) + '₡ · восстановить ' + hpMissing + ' HP' : 'нечего лечить',
          disabled: hpMissing === 0,
          onClick:() => doHealWounds() },
        { label:'Уйти', time:0, onClick: closeModal },
      ]});
  } else if(kind === 'sedative_shop'){
    openModal({ type:'action', title:'Снотворное', desc:'Одноразовое.',
      methods:[
        { label:'Купить (40₡)', time:5, disabled: G.assets.money < 40,
          onClick:() => { G.assets.money -= 40;
            G.assets.inventory.push(makeItem('sedative'));
            closeModal(); adv(5, 'Куплено снотворное.', 'good'); }},
        { label:'Уйти', time:0, onClick: closeModal },
      ]});
  } else if(kind === 'cargo_hold'){
    inspectCargoHold();
  }
}

/* ============================================================
   §3.4 · ТРЮМ · осмотр и выгрузка контрабанды
   ============================================================ */
function inspectCargoHold(){
  const L = G.prologue.loadingBg;
  if(!L){
    openModal({ type:'action', title:'Трюм',
      desc:'Пусто. Погрузка ещё не начиналась.',
      methods:[{ label:'Уйти', time:0, onClick: closeModal }]});
    return;
  }

  const smuggled = L.smuggledTons || 0;

  if(smuggled <= 0){
    openModal({ type:'action', title:'Трюм',
      desc:'Груз по накладной. Лишнего нет.\n\n' +
        'Основной: ' + L.currentTons.toFixed(1) + ' т.',
      methods:[{ label:'Закрыть', time:0, onClick: closeModal }]});
    return;
  }

  openModal({ type:'action',
    title:'Трюм · не по накладной',
    desc: 'В трюме ' + smuggled.toFixed(1) + ' т ' +
      (G.prologue.smuggledResource || 'неопознанного груза') + '. ' +
      'Это не по накладной. Пока корабль в доке — можно выгрузить.\n\n' +
      'После отлёта — только признание Смотрителю.',
    methods:[
      { label:'Выгрузить', time:60,
        mod: modLabel('ИНТ', G.player.stats.int) + ', ' + modLabel('СИЛ', G.player.stats.str),
        desc:'Найти бригаду. Убрать лишнее. Тихо.',
        onClick:() => { closeModal(); unloadSmuggledCargo(); }},
      { label:'Оставить как есть', time:0,
        desc:'Пусть уезжает.',
        onClick:() => {
          closeModal();
          log('Вы решили не трогать. Лишнее уедет с вами.', 'warn');
        }},
      { label:'Осмотреть подробнее', time:5,
        onClick:() => {
          closeModal();
          adv(5, 'В трюме ' + smuggled.toFixed(1) + ' т ' +
            (G.prologue.smuggledResource || 'неизвестного') +
            '. Метки сорваны.', 'info');
        }},
    ]});
}

function unloadSmuggledCargo(){
  const L = G.prologue.loadingBg;
  if(!L || (L.smuggledTons || 0) <= 0) return;

  const smuggled = L.smuggledTons;
  const intMod = statMod(G.player.stats.int);
  const strMod = statMod(G.player.stats.str);

  const witnesses = Object.values(G.npcs).filter(n =>
    n.area === 'planet' && n.location === 'dock_area' && n.state === 'alive'
  ).length;

  const time = Math.max(20, 30 + Math.floor(smuggled * 5) - strMod * 3);
  const dc = Math.max(6, 10 + Math.floor(smuggled / 3) - intMod - Math.floor(strMod / 2));
  const roll = G.rng.d20() + intMod + strMod;

  if(roll >= dc){
    L.smuggledTons = 0;
    G.prologue.smuggledTons = 0;
    G.prologue.smuggledResource = null;
    log('Вы тихо убрали ' + smuggled.toFixed(1) + ' т лишнего. Груз — по накладной. (d20 → ' + roll + ')', 'good');
    historyEvent('player', 'unload_smuggle', null, 'notable', []);
    adv(time, 'Работа заняла ' + fmtDur(time) + '.', 'action');
    render();
  } else if(roll >= dc - 3){
    const removed = Math.max(1, Math.round(smuggled * 0.6));
    const left = smuggled - removed;
    L.smuggledTons = left;
    G.prologue.smuggledTons = left;
    log('Убрали ' + removed.toFixed(1) + ' т. Остаток ' + left.toFixed(1) + ' т ' +
      'не удаётся вытащить. (d20 → ' + roll + ')', 'warn');
    adv(time, null);
    render();
  } else {
    log('Вас заметили за разгрузкой лишнего. Слух пойдёт. (d20 → ' + roll + ')', 'danger');
    if(witnesses > 0){
      G.flags.smuggleWitnessed = true;
      historyEvent('player', 'unload_smuggle_witnessed', null, 'grave', ['witness']);
    }
    adv(time, null);
    render();
  }
}

/* ============================================================
   §4.4 · ДВОЙНОЕ ДНО
   ============================================================ */
function searchSecretCompartment(){
  const roll = G.rng.d20() + statMod(G.player.stats.int);
  if(roll >= 10){
    if(!G.flags.stoneFound){
      G.flags.stoneFound = true;
      openSleepStoneBox();
      return;
    } else {
      adv(20, 'Ничего нового. Двойное дно уже раскрыто. (d20 → ' + roll + ')', 'info');
      return;
    }
  }
  adv(20, 'Ничего не нашли. Может, ещё раз? (d20 → ' + roll + ')', 'warn');
}

function openSleepStoneBox(){
  openModal({ type:'action',
    title:'Коробка в коробке',
    desc:'В ящике — второе дно. Под ним маленькая коробка, обёрнутая в тряпку.\n\n' +
      'Внутри — записка и что-то тяжёлое.',
    methods:[
      { label:'Открыть', time:5,
        onClick:() => {
          closeModal();
          const stone = genSleepStoneArtifact();
          G.assets.inventory.push(stone);
          log('Найден камень. Записка: «Как ты и просил, артефакт для хорошего сна».', 'action');
          historyEvent('player', 'found_artifact', stone.id, 'notable', []);

          openModal({ type:'action',
            title:'Камень из коробки',
            desc:'Большой камень. Плоский, тёплый на ощупь. Не надеть.\n\n' +
              'Записка: «Как ты и просил, артефакт для хорошего сна.»',
            methods:[
              { label:'Взять с собой', time:2,
                onClick:() => {
                  closeModal();
                  log('Камень теперь у вас. Пока не активирован.', 'info');
                  adv(2, null);
                }},
              { label:'Оставить в ящике', time:2,
                onClick:() => {
                  closeModal();
                  const idx = G.assets.inventory.findIndex(i => i.id === stone.id);
                  if(idx >= 0) G.assets.inventory.splice(idx, 1);
                  log('Камень оставлен в ящике. Кто-нибудь найдёт.', 'info');
                  historyEvent('player', 'abandon_artifact', stone.id, 'notable', []);
                  adv(2, null);
                }},
            ]});
          render();
        }},
    ]});
}

function doCrateSearch(method){
  method = method || 'hands';
  const key = 'crate_loot_' + G.area + '_' + G.location;

  if(!(key in G.flags)){
    G.flags[key] = G.rng.int(0, 3);
  }
  const left = G.flags[key];

  const wit = countWitnesses();
  closeModal();

  if(left <= 0){
    log('Ящик пуст. Больше ничего нет.', 'info');
    adv(5, null);
    return;
  }

  if(method === 'hands' && G.rng.chance(0.2)){
    G.player.pathologies.push({
      id:'hand_pinch', name: PATHS.hand_pinch.n, symptom: PATHS.hand_pinch.s,
      source:'Ящик', discovered:false, treated:false
    });
    log('Прищемили руку.', 'danger');
    adv(15, null);
    return;
  }

  if(wit > 0 && method === 'hands'){
    log('Вас заметили. Ничего не взяли.', 'danger');
    historyEvent('player', 'steal', null, 'notable', ['witness']);
    adv(15, null);
    return;
  }

  const roll = method === 'tool'
    ? G.rng.d20() + statMod(G.player.stats.int) + Math.floor(statMod(G.player.stats.str) / 2)
    : G.rng.d20();
  const dc = method === 'tool' ? 6 : 10;

  if(roll >= dc){
    G.assets.inventory.push(makeItem('junk'));
    G.flags[key]--;
    const rest = G.flags[key];
    log('Забрали хлам. (d20 → ' + roll + ')' +
      (rest > 0 ? ' Осталось ещё.' : ' Больше нет.'), 'good');
    historyEvent('player', 'steal', null, 'notable', wit > 0 ? ['witness'] : []);
  } else {
    log('Не получилось. (d20 → ' + roll + ')', 'warn');
  }
  adv(method === 'tool' ? 10 : 15, null);
}

function doTreat(){
  const disc = G.player.pathologies.filter(p => p.discovered && !p.treated);
  if(!disc.length){ closeModal(); adv(0, 'Нечего лечить.', 'info'); return; }
  const total = disc.length * 40;
  if(G.assets.money >= total){
    G.assets.money -= total;
    disc.forEach(p => p.treated = true);
    log('Лечение: ' + disc.length + ' патологий за ' + total + '₡.', 'good');
    closeModal(); adv(45, null); return;
  }
  const aff = Math.floor(G.assets.money / 40);
  if(aff === 0){
    closeModal();
    log('Нужно ' + total + '₡. У вас ' + G.assets.money + '₡.', 'danger');
    adv(0, null); return;
  }
  const toTreat = disc.slice(0, aff);
  G.assets.money -= aff * 40;
  toTreat.forEach(p => p.treated = true);
  closeModal();
  log('Частичное лечение: ' + aff + ' из ' + disc.length + '.', 'warn');
  adv(45, null);
}

function doHealWounds(){
  const p = G.player;
  const missing = p.state.maxHp - p.state.hp;
  if(missing <= 0){ closeModal(); log('Нечего лечить.', 'info'); adv(0, null); return; }
  const cost = missing * 20;
  if(G.assets.money < cost){
    closeModal();
    log('Нужно ' + cost + '₡. У вас ' + G.assets.money + '₡.', 'danger');
    adv(0, null); return;
  }
  G.assets.money -= cost;
  p.state.hp = p.state.maxHp;
  closeModal();
  log('Лечение ран: +' + missing + ' HP. −' + cost + '₡.', 'good');
  adv(30, null);
}

/* ============================================================
   ПЕРЕМЕЩЕНИЕ · с переносом тела
   ============================================================ */
function moveTo(locId){
  const area = AREAS[G.area];
  if(!area || !area.locs[locId]) return;
  const tgt = area.locs[locId];
  if(tgt.restrict && G.player.access === 'low'){
    log('Доступ к ' + tgt.n + ' закрыт.', 'danger');
    render();
    return;
  }

  if(G.scene !== 'area') G.scene = 'area';

  G.location = locId;
  for(const n of Object.values(G.npcs)){
    if(n.following && n.area === G.area) n.location = locId;
  }

  /* Тащим тело — своя стоимость */
  const carriedId = G.flags.carryingBody;
  if(carriedId){
    const body = G.npcs[carriedId];
    if(body && body.area === G.area){
      body.location = locId;
      const strMod = statMod(G.player.stats.str);
      const endMod = statMod(G.player.stats.end);
      const timeCost    = Math.max(2, 5 - strMod);
      const fatigueCost = Math.max(1, 4 - endMod);
      G.player.state.fatigue = clamp(G.player.state.fatigue + fatigueCost, 0, 100);
      adv(timeCost, 'Тащите ' + body.name + ' в ' + tgt.n + '. +' + fatigueCost + ' усталости.',
        'action');
    } else {
      G.flags.carryingBody = null;
      adv(2, 'Перемещение: ' + tgt.n, 'info');
    }
  } else {
    adv(2, 'Перемещение: ' + tgt.n, 'info');
  }
}

/* ============================================================
   §5.2 L3 · Отложенные вопросы
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

/* ============================================================
   §5.5 · ТОРГОВЛЯ
   ============================================================ */
function openTrade(npcId){
  const npc = G.npcs[npcId];
  if(!npc || !npc.tradeProfile) return;
  G.modal = { type:'trade', npcId, step:'choose', history:[], round:0, side:null, typeGood:null, price:null };
  renderModal();
}

function beginTrade(m, side, type){
  const npc = G.npcs[m.npcId], p = npc.tradeProfile;
  const buying = side === 'buy';
  const base = p.inventoryValue[type] || 30;
  let f = 1;
  f += ((p.urgency - 50) / 300);
  f += ((50 - p.marketKnowledge) / 600);
  f -= (clamp(npc.relation, -20, 20) / 500);
  if(buying) f -= (statMod(G.player.stats.cha) * 0.04);
  else f += (statMod(G.player.stats.cha) * 0.04);
  f = clamp(f, 0.72, 1.35);

  const ask = Math.max(5, Math.round(base * f));
  const reserve = buying
    ? Math.round(ask * (0.78 + ((100 - p.riskTolerance) / 900)))
    : Math.round(ask * (1.05 + (p.urgency / 200)));

  m.step = 'bargain'; m.side = side; m.typeGood = type;
  m.ask = ask; m.reserve = reserve; m.round = 0;
  m.history.push({ speaker:'npc',
    text: buying ? '«' + ask + ' кредитов.»' : '«За твой хлам дам ' + ask + '.»' });
  renderModal();
}

function submitOffer(m, value){
  const npc = G.npcs[m.npcId], p = npc.tradeProfile;
  const buying = m.side === 'buy';
  value = Math.max(1, Math.round(value));
  m.round++;

  const intBonus = statMod(G.player.stats.int) * 0.02;
  const accepted = buying
    ? value >= m.reserve * (1 - intBonus)
    : value <= m.reserve * (1 + intBonus);

  if(accepted){
    if(buying){
      if(G.assets.money < value){
        m.history.push({ speaker:'npc', text:'«Денег у тебя не хватает.»' });
        renderModal(); return;
      }
      G.assets.money -= value;
      p.cash += value;
      p.stock[m.typeGood]--;
      G.assets.inventory.push(makeItem(m.typeGood));
    } else {
      const idx = G.assets.inventory.findIndex(x => x.type === 'junk');
      if(idx < 0){
        m.history.push({ speaker:'npc', text:'«У тебя и продавать нечего.»' });
        renderModal(); return;
      }
      G.assets.inventory.splice(idx, 1);
      G.assets.money += value;
    }
    npc.relation += 1;
    m.history.push({ speaker:'npc', text: buying ? '«Договорились.»' : '«Ладно. По рукам.»' });
    m.step = 'done'; m.finalPrice = value;
    historyEvent('player', 'trade_bargain', npc.id, 'notable', []);
    renderModal(); return;
  }

  if(m.round >= 4){
    m.history.push({ speaker:'npc', text:'«Хватит. Больше не двигаюсь.»' });
    m.step = 'done'; m.finalPrice = null; renderModal(); return;
  }

  let counter = Math.round((value + m.ask) / 2);
  if(buying)  counter = Math.max(counter, m.reserve);
  else        counter = Math.min(counter, m.reserve);

  if(counter === m.ask){
    m.history.push({ speaker:'player', text:'«' + value + '».' });
    m.history.push({ speaker:'npc', text:'«Это моя последняя цена. Либо да, либо нет.»' });
    m.step = 'done'; m.finalPrice = null;
    renderModal(); return;
  }

  m.history.push({ speaker:'player', text:'«' + value + '».' });
  m.history.push({ speaker:'npc',
    text: buying ? '«' + counter + '. И это почти подарок.»' : '«' + counter + '. Последняя цена.»' });
  m.ask = counter;
  renderModal();
}

/* ============================================================
   §9 · БОЙ
   ============================================================ */
function startCombat(enemyId, reason){
  const enemyNpc = G.npcs[enemyId];
  if(!enemyNpc || !G.player) return;
  if(['dead','unconscious'].includes(enemyNpc.state)) return;

  const me = {
    id:'player', npcId:null, name:'Вы', isPlayer:true, team:'player',
    hp: G.player.state.hp, maxHp: G.player.state.maxHp, state:'alive',
    evasion: 2 + Math.floor(G.player.stats.str / 3),
    weapon: hasItem('pistol') && hasAmmo() ? 'pistol'
           : hasItem('knife') ? 'knife'
           : hasItem('tool')  ? 'tool' : 'fist',
    defending: false,
  };

  const allies = Object.values(G.npcs).filter(n =>
    n.isHelper && n.following && n.area === G.area && n.location === G.location &&
    n.state === 'alive' && n.companionMode === 'JOIN_ACTIVE');

  const participants = [me];
  for(const a of allies){
    participants.push({ id:a.id, npcId:a.id, name:a.name, isPlayer:false, team:'player',
      hp:a.hp, maxHp:a.maxHp, state:'alive', evasion:a.evasion || 1,
      weapon:a.weapon || 'fist', defending:false });
  }
  participants.push({ id:enemyNpc.id, npcId:enemyNpc.id, name:enemyNpc.name,
    isPlayer:false, team:'enemy', hp:enemyNpc.hp, maxHp:enemyNpc.maxHp, state:'alive',
    evasion: enemyNpc.evasion || 0, weapon: enemyNpc.weapon || 'fist', defending:false });

  const order = [...participants].sort(() => G.rng.next() - 0.5).map(x => x.id);
  const witnesses = Object.values(G.npcs).filter(n =>
    n.area === G.area && n.location === G.location &&
    !n.sleeping && !n.following && n.state === 'alive');

  G.combat = {
    active: true, round: 1, participants, order,
    turnIdx: order.indexOf('player'),
    log: [{ cls:'', text: allies.length
      ? allies.map(a => a.name).join(', ') + ' рядом. Каждый решает сам.'
      : 'Стычка. Вы одни.' }],
    context: { reason, enemyId },
    seen: witnesses.length > 0,
    outcome: null,
    lastWeapon: null,
  };

  historyEvent('player', 'combat_start', enemyId, 'notable', witnesses.map(w => w.id));
  log('СТЫЧКА: ' + enemyNpc.name +
    (allies.length ? ' · рядом ' + allies.map(a => a.name).join(', ') : ''), 'combat');

  applyCrimeWarp('combat_start');
  applyStress(2, 'драка');
  render();

  if(combatCurrent() && !combatCurrent().isPlayer) setTimeout(combatNpcTurn, 350);
}

function combatCurrent(){ return G.combat?.participants.find(p => p.id === G.combat.order[G.combat.turnIdx]); }
function combatMe(){ return G.combat?.participants.find(p => p.isPlayer); }
function combatEnemy(){ return G.combat?.participants.find(p => p.team === 'enemy' && p.hp > 0); }
function combatAllies(){ return G.combat?.participants.filter(p => p.team === 'player'); }

function combatPlayerAttack(weaponType){
  const me = combatMe(), enemy = combatEnemy(), w = WEAPONS[weaponType];
  if(!me || !enemy || !w) return;

  if(weaponType === 'pistol' && !hasAmmo()){
    G.combat.log.push({ cls:'miss', text:'Патронов нет.' });
    combatNextTurn(); return;
  }

  const roll = G.rng.d20();
  const total = roll + w.mod + me.evasion - enemy.evasion;
  const dc = 10 + enemy.evasion;
  G.combat.log.push({ cls:'you', text:'Вы: ' + w.n + ' · d20 ' + roll + ' → ' + total });
  G.combat.lastWeapon = weaponType;

  if(total >= dc){
    let dmg = G.rng.int(w.dmg[0], w.dmg[1]);
    const strBonus = weaponType === 'fist' ? Math.max(0, statMod(G.player.stats.str)) : 0;
    dmg += strBonus;
    enemy.hp -= dmg;

    const enemyNpcRef = G.npcs[enemy.npcId];
    if(enemyNpcRef){
      enemyNpcRef.wounds = enemyNpcRef.wounds || [];
      enemyNpcRef.wounds.push({ weapon: weaponType, time: G.time });
    }

    G.combat.log.push({ cls:'hit', text: enemy.name + ' получает ' + dmg + ' урона.' });

    if(weaponType === 'pistol'){
      consumeAmmo();
      noiseFromShot();
    }
    if(enemy.hp <= 0){ finishCombat('win'); return; }
  } else G.combat.log.push({ cls:'miss', text:'Промах.' });

  combatNextTurn();
}

function noiseFromShot(){
  for(const n of Object.values(G.npcs)){
    if(n.area !== G.area || n.state !== 'alive') continue;
    if(n.sleeping){
      n.sleeping = false;
      log(n.name + ' проснулся(ась) от выстрела.', 'warn');
    }
    n.awareOfPlayer = true;
  }
  if(G.area === 'station' && G.station){
    G.station.alert = 'ALERT';
    log('Выстрел на станции. Тревога ALERT.', 'danger');
  } else {
    log('Выстрел на борту. Кто-то услышал.', 'danger');
  }
}

function combatPlayerDefend(){
  const m = combatMe(); if(!m) return;
  m.defending = true;
  G.combat.log.push({ cls:'you', text:'Вы прикрылись.' });
  combatNextTurn();
}

function combatPlayerTry(kind){
  const me = combatMe(), enemy = combatEnemy();
  if(!me || !enemy) return;
  if(kind === 'flee'){
    const r = G.rng.d20() + me.evasion;
    if(r >= 12 + enemy.evasion){ finishCombat('flee'); return; }
    G.combat.log.push({ cls:'miss', text:'Вырваться не получилось.' });
  } else if(kind === 'intimidate' || kind === 'negotiate'){
    const r = G.rng.d20() + statMod(G.player.stats.cha) + 5;
    if(r >= 14){ finishCombat('talk'); return; }
    G.combat.log.push({ cls:'miss', text:'Не сработало. (d20 → ' + r + ')' });
  } else if(kind === 'heal'){
    const i = G.assets.inventory.findIndex(x => x.type === 'medkit');
    if(i >= 0){
      G.assets.inventory.splice(i, 1);
      me.hp = Math.min(me.maxHp, me.hp + 5);
      G.combat.log.push({ cls:'you', text:'Аптечка. +5 HP.' });
    }
  } else if(kind === 'disarm'){
    const r = G.rng.d20() + me.evasion;
    if(r >= 13 + enemy.evasion){ enemy.weapon = 'fist'; G.combat.log.push({ cls:'hit', text:'Оружие выбито.' }); }
    else G.combat.log.push({ cls:'miss', text:'Не вышло.' });
  } else if(kind === 'knockdown'){
    const r = G.rng.d20() + me.evasion;
    if(r >= 12 + enemy.evasion){ enemy.knockedDown = true; G.combat.log.push({ cls:'hit', text:'Противник сбит с ног.' }); }
    else G.combat.log.push({ cls:'miss', text:'Не вышло.' });
  }
  combatNextTurn();
}

function combatNextTurn(){
  const c = G.combat;
  if(!c || c.outcome) return;
  const old = c.turnIdx;
  let found = null;
  for(let i = 1; i <= c.order.length; i++){
    const idx = (old + i) % c.order.length;
    const p = c.participants.find(x => x.id === c.order[idx]);
    if(p && p.hp > 0 && p.state !== 'unconscious' && p.state !== 'retreated'){
      c.turnIdx = idx; found = p; break;
    }
  }
  if(!found) return;
  if(c.turnIdx <= old) c.round++;
  render();
  if(!found.isPlayer) setTimeout(combatNpcTurn, 400);
}

function combatNpcTurn(){
  const c = G.combat;
  if(!c || c.outcome || !c.active) return;
  const cur = combatCurrent();
  if(!cur) return;

  if(cur.knockedDown){
    cur.knockedDown = false;
    c.log.push({ cls:'miss', text: cur.name + ' поднимается.' });
    combatNextTurn(); return;
  }

  if(cur.team === 'player' && !cur.isPlayer){
    const npc = G.npcs[cur.npcId];
    const enemy = combatEnemy();
    if(!enemy) return finishCombat('win');
    const dec = decideCompanionAction(npc, { hp:cur.hp, maxHp:cur.maxHp, enemy });
    c.log.push({ cls:'ally', text: npc.name + ' решает: ' + dec.action + ' (' + dec.reason + ').' });
    if(dec.action === 'retreat'){
      cur.state = 'retreated';
      npc.companionMode = 'STAY_NEAR';
      npc.following = false;
      c.log.push({ cls:'ally', text: npc.name + ' отступает.' });
      combatNextTurn(); return;
    }
    if(dec.action === 'defend'){ cur.defending = true; combatNextTurn(); return; }
    if(dec.action === 'threaten'){
      const r = G.rng.d20() + (npc.combatProfile?.bravery || 50);
      if(r >= 14){ c.log.push({ cls:'ally', text: npc.name + ' требует остановиться.' }); finishCombat('talk'); return; }
      combatNextTurn(); return;
    }
    const w = WEAPONS[cur.weapon] || WEAPONS.fist;
    const r = G.rng.d20();
    const tot = r + w.mod + cur.evasion - enemy.evasion;
    if(tot >= 10 + enemy.evasion){
      const dmg = G.rng.int(w.dmg[0], w.dmg[1]);
      enemy.hp -= dmg;
      const enemyNpcRef = G.npcs[enemy.npcId];
      if(enemyNpcRef){
        enemyNpcRef.wounds = enemyNpcRef.wounds || [];
        enemyNpcRef.wounds.push({ weapon: cur.weapon, time: G.time });
      }
      c.log.push({ cls:'ally', text: npc.name + ' попадает. −' + dmg });
    } else c.log.push({ cls:'miss', text: npc.name + ' промахивается.' });
    if(enemy.hp <= 0){ finishCombat('win'); return; }
    combatNextTurn(); return;
  }

  if(cur.team === 'enemy'){
    const targets = combatAllies().filter(x => x.hp > 0 && x.state !== 'unconscious' && x.state !== 'retreated');
    if(!targets.length){ finishCombat('lose'); return; }
    const target = [...targets].sort((a,b) =>
      (a.defending ? 1 : 0) - (b.defending ? 1 : 0) || a.hp - b.hp)[0];
    const w = WEAPONS[cur.weapon] || WEAPONS.fist;
    const r = G.rng.d20();
    const tot = r + w.mod + cur.evasion - target.evasion - (target.defending ? 2 : 0);
    if(tot >= 10 + target.evasion){
      const dmg = G.rng.int(w.dmg[0], w.dmg[1]);
      target.hp -= dmg;
      c.log.push({ cls:'enemy', text: cur.name + ' атакует ' + target.name + ' · −' + dmg });
      if(target.isPlayer) applyStress(3, 'получил урон');
    } else c.log.push({ cls:'miss', text: cur.name + ' промахивается.' });
    target.defending = false;
    if(target.hp <= 0){
      target.state = 'unconscious';
      if(target.isPlayer){ G.player.state.hp = 0; finishCombat('lose'); return; }
      const nn = G.npcs[target.npcId];
      if(nn){ nn.hp = 0; nn.state = 'unconscious'; }
    }
    combatNextTurn(); return;
  }
}

function decideCompanionAction(npc, state){
  const p = npc.combatProfile || { bravery:50, loyalty:50, violence:30, values:[] };
  const hpRatio = state.hp / state.maxHp;
  const enemy = state.enemy;
  const values = p.values || [];
  if(values.includes('не убивать без крайней необходимости') && enemy.hp <= 2){
    return { action:'threaten', reason:'не хочет добивать' };
  }
  if(hpRatio < 0.3 && p.bravery < 55) return { action:'retreat', reason:'слишком опасно' };
  if(p.loyalty < 40 && p.bravery < 45) return { action:'retreat', reason:'не считает это своей дракой' };
  if(hpRatio < 0.45 && p.bravery < 55) return { action:'defend', reason:'держит позицию' };
  return { action:'attack', reason:'вступает в бой' };
}

function finishCombat(outcome){
  const c = G.combat;
  if(!c || c.outcome) return;
  c.outcome = outcome; c.active = false;
  const enemy = c.participants.find(p => p.team === 'enemy');
  const enemyNpc = enemy && G.npcs[enemy.npcId];

  if(enemyNpc){
    enemyNpc.hp = Math.max(0, enemy.hp);
    if(enemy.hp <= 0){
      const lethal =
        c.context.reason === 'assassination' ||
        c.context.reason === 'takeover' ||
        c.context.reason === 'murder' ||
        c.lastWeapon === 'knife' ||
        c.lastWeapon === 'pistol' ||
        enemyNpc.state === 'unconscious';

      enemyNpc.state = lethal ? 'dead' : 'unconscious';
      enemyNpc.sleeping = false;
      if(!enemyNpc.wounds) enemyNpc.wounds = [];

      if(enemyNpc.state === 'dead'){
        historyEvent('player', 'murder', enemyNpc.id, 'grave', c.seen ? ['witness'] : []);
        applyDeathConsequences(enemyNpc);
        applyCrimeWarp('murder');
        applyStress(10, 'убийство');
        log('☠ ' + enemyNpc.name + ' ' + (isF(enemyNpc) ? 'мертва' : 'мёртв') + '.', 'danger');
        if(c.seen) applyCrimeWitnesses(enemyNpc, 'murder');
      } else {
        historyEvent('player', 'knockout', enemyNpc.id, 'notable', c.seen ? ['witness'] : []);
        log(enemyNpc.name + ' без сознания. Живой.', 'warn');
        if(c.seen) applyCrimeWitnesses(enemyNpc, 'knockout');
      }
      if(c.lastWeapon === 'pistol') noiseFromShot();
    } else {
      enemyNpc.state = enemy.hp < enemy.maxHp * 0.5 ? 'injured' : 'alive';
      enemyNpc.wounded = enemy.hp < enemy.maxHp;
      enemyNpc.woundTime = G.time;
    }
  }

  const me = combatMe();
  if(me) G.player.state.hp = Math.max(0, me.hp);
  for(const a of c.participants.filter(p => p.team === 'player' && !p.isPlayer)){
    const n = G.npcs[a.npcId];
    if(n){ n.hp = Math.max(0, a.hp); n.wounded = n.hp < n.maxHp; if(n.hp <= 0) n.state = 'unconscious'; }
  }
  const txt = {
    takeover:'Управление кораблём перешло к вам.',
    win:'Противник повержен.',
    flee:'Вы вырвались.',
    talk:'Стычка закончилась разговором.',
    lose:'Вы без сознания.',
  }[outcome] || 'Стычка закончена.';
  G.modal = { type:'combat_result', title:'Стычка кончилась',
    text: txt, cls: outcome === 'lose' ? 'bad' : 'good', outcome, enemyId: enemyNpc?.id };
  render();
}

function applyDeathConsequences(npc){
  if(npc.area === 'station' && G.station){
    G.station.alert = 'ORGANIZED';
    log('Смерть на станции: охрана поднимает ORGANIZED.', 'danger');
  }
  for(const other of Object.values(G.npcs)){
    if(other.id === npc.id) continue;
    if(other.area === npc.area){ other.memory.push('death:' + npc.id); }
  }
}

/* ============================================================
   §7 · ПОМОЩНИК · PLEA
   ============================================================ */
function canTriggerPlea(npc){
  if(npc.relation < 3) return false;
  const st = dialogueStage(npc);
  if(st === 'stranger' || st === 'greeted') return false;
  if(npc.area !== 'small_ship') return false;
  const wit = Object.values(G.npcs).filter(n =>
    n.area === G.area && n.location === G.location &&
    n.id !== npc.id && !n.sleeping && !n.following && n.state === 'alive');
  return wit.length === 0;
}

function triggerPlea(npc){
  const arche = npc.archetypeData || ASSISTANT_ARCHETYPES[0];
  openModal({
    type:'action',
    title: npc.name + ' · разговор',
    desc:'Помощник долго молчит. Потом смотрит в сторону: «Шеф. Есть разговор. Не тут.»',
    methods:[
      { label:'«Пойдём в каюту»', time:5,
        onClick:() => {
          closeModal();
          G.location = 'cabin';
          npc.location = 'cabin';
          G.flags.pleaShown = true;
          G.modal = null;
          openModal({ type:'action', title: npc.name,
            desc: arche.plea,
            methods:[
              { label:'«Расскажи подробнее»', time:5,
                onClick:() => {
                  closeModal();
                  const roll = G.rng.d20() + Math.floor(npc.relation / 2) + statMod(G.player.stats.cha);
                  if(roll >= 12){ G.flags.pleaAsked = true;
                    log('Детали сходятся.', 'good'); }
                  else log('Замолкает. «Не могу.»', 'warn');
                  resolvePlea(npc, 'asked');
                }},
              { label:'«Достану тебе направление» (−150₡)', time:5,
                onClick:() => { closeModal(); resolvePlea(npc, 'passage'); }},
              { label:'«Оформлю как постоянного помощника» (−200₡)', time:5,
                onClick:() => { closeModal(); resolvePlea(npc, 'permanent'); }},
              { label:'«Решу твоё дело сам»', time:5,
                onClick:() => { closeModal(); resolvePlea(npc, 'handle'); }},
              { label:'«Прости. Не могу»', time:2,
                onClick:() => { closeModal(); resolvePlea(npc, 'refuse'); }},
            ]});
        }},
      { label:'«Не сейчас»', time:2,
        onClick:() => { closeModal(); log(npc.name + ' кивнул(а) и отошёл(ла).', 'info'); }},
      { label:'«Говори здесь»', time:2,
        onClick:() => { closeModal(); npc.relation -= 1; log('Вы отказались идти.', 'warn'); }},
    ]});
}

function resolvePlea(npc, choice){
  G.flags.pleaShown = true;
  G.flags.pleaChoice = choice;
  if(choice === 'passage'){
    if(G.assets.money >= 150 || G.flags.pleaAsked){
      if(G.assets.money >= 150) G.assets.money -= 150;
      G.flags.assistantPassage = true;
      log('Обещали устроить ' + npc.name + ' пропуск.', 'action');
      npc.relation += 2;
      historyEvent('player', 'help', npc.id, 'notable', []);
    } else { log('Нужно 150₡. У вас ' + G.assets.money + '₡.', 'warn'); G.flags.pleaShown = false; }
  } else if(choice === 'permanent'){
    if(G.assets.money >= 200 || npc.relation >= 5){
      if(G.assets.money >= 200) G.assets.money -= 200;
      G.flags.assistantPermanent = true;
      npc.isHelper = true; npc.relation += 3;
      log(npc.name + ' теперь ваш постоянный помощник.', 'good');
      historyEvent('player', 'help', npc.id, 'notable', []);
    } else { log('Нужно 200₡ или большее доверие.', 'warn'); G.flags.pleaShown = false; }
  } else if(choice === 'handle'){
    G.flags.assistantHandled = true;
    addObligation('favor', {
      title: 'Дело ' + npc.name,
      desc: 'Дело помощника: ' + (npc.archetypeData?.request_target || '?'),
      giver: npc.name,
    });
    npc.relation += 2;
    log('Взяли дело ' + npc.name + ' на себя.', 'good');
  } else if(choice === 'refuse'){
    npc.relation -= 3;
    log('Отказали ' + npc.name + '.', 'warn');
    historyEvent('player', 'refuse', npc.id, 'notable', [npc.id]);
  }
  adv(5, null);
}

function openCompanionWork(comp){
  const methods = [];
  if(G.location === 'engine' || G.location === 'tech_zone'){
    methods.push({ label:'Диагностика и ремонт', time:10, mod: modLabel('ИНТ', G.player.stats.int),
      onClick:() => {
        closeModal();
        const roll = G.rng.d20() + statMod(G.player.stats.int);
        if(roll >= 10){
          log(comp.name + ' осмотрел двигатель и нашёл слабое место. (d20 → ' + roll + ')', 'good');
        } else log(comp.name + ' покачал(а) головой: «Не моё». (d20 → ' + roll + ')', 'info');
        adv(10, null);
      }});
  }
  if(!methods.length){
    methods.push({ label:'Наблюдать за обстановкой', time:5,
      onClick:() => { closeModal(); adv(5, comp.name + ' остаётся рядом.', 'info'); }});
  }
  methods.push({ label:'Уйти', time:0, onClick: closeModal });
  openModal({ type:'action', title:'Поручить работу · ' + comp.name, methods });
}

/* ============================================================
   ПАТРОНЫ
   ============================================================ */
function hasAmmo(){
  return G.assets.inventory.some(x => x.type === 'ammo' && (x.charges || 0) > 0);
}
function consumeAmmo(){
  const idx = G.assets.inventory.findIndex(x => x.type === 'ammo' && (x.charges || 0) > 0);
  if(idx < 0) return false;
  const it = G.assets.inventory[idx];
  it.charges--;
  it.name = 'Патроны ×' + it.charges;
  if(it.charges <= 0){
    G.assets.inventory.splice(idx, 1);
    log('Патроны кончились.', 'warn');
  }
  return true;
}

/* ============================================================
   СЛУЖЕБНЫЕ
   ============================================================ */
function hasItem(type){ return G.assets.inventory.some(x => x.type === type); }
function countWitnesses(){
  return Object.values(G.npcs).filter(n =>
    n.area === G.area && n.location === G.location &&
    !n.sleeping && !n.following && !n.isHelper && n.state === 'alive').length;
}
function makeItem(type){
  const d = ITEMS[type] || { n:type, i:'❔', d:'' };
  const it = {
    id: type + '_' + Math.floor(Math.random() * 10000),
    type, name: d.n, icon: d.i, desc: d.d,
    artifact: d.artifact || false,
  };
  if(type === 'ammo'){
    it.charges = 12;
    it.name = 'Патроны ×12';
    it.desc = 'Шумные.';
  }
  return it;
}

function givePdaModule(){
  if(G.pda.pendingModule) return;
  G.pda.pendingModule = PDA_MODULES.calls;
  G.assets.inventory.push({
    id:'usb_' + Date.now(), type:'usb_module',
    name: PDA_MODULES.calls.name, icon:'💾',
    desc:'Флешка с модулем. 0.1 кг.',
  });
  addObligation('order', {
    title:'Установить модуль КПК',
    desc:'Смотритель дал флешку и сказал идти к технику.',
    giver:'Смотритель',
  });
  log('Получена флешка с модулем звонков. Нужно найти техника.', 'action');
}

/* ============================================================
   §6.10 · ДИАЛОГ СО СМОТРИТЕЛЕМ
   ============================================================ */
function openOverseerDialog(){
  const os = G.npcs.overseer;
  if(!os) return;
  if(os.state === 'dead'){
    log('Смотрителя нет. Обращаться некуда.', 'warn');
    render();
    return;
  }

  if(!G.flags.overseerMet){
    G.scene = 'overseer_meeting';
    render();
    return;
  }

  const methods = [];

  methods.push({
    label:'«Согласуй груз на станцию»', time:10,
    desc:'Он может ускорить оформление.',
    onClick:() => {
      closeModal();
      const roll = G.rng.d20() + statMod(G.player.stats.cha) + Math.floor(os.relation / 2);
      if(roll >= 12){
        G.flags.modsApproved = true;
        os.relation += 1;
        log(os.addressAs + ': «Согласую. Разгрузка пойдёт быстрее.»', 'good');
      } else {
        log(os.addressAs + ': «Не в этот раз.»', 'warn');
      }
      adv(10, null);
    }});

  if(!G.flags.workerTransfer){
    methods.push({
      label:'«Дай специалиста в штат»', time:10,
      desc:'Рабочий или техник с дока.',
      onClick:() => {
        closeModal();
        const roll = G.rng.d20() + statMod(G.player.stats.cha) + Math.floor(os.relation / 2);
        if(roll >= 13){
          G.flags.workerTransfer = true;
          os.relation += 1;
          addObligation('favor', {
            title:'Специалист с дока',
            desc:'Смотритель обещал прислать человека.',
            giver: os.addressAs,
          });
          log(os.addressAs + ': «Пришлю одного. Оформишь как штат.»', 'good');
        } else {
          log(os.addressAs + ': «Не сейчас.»', 'warn');
        }
        adv(10, null);
      }});
  }

  methods.push({
    label:'«Помоги — нужен доступ»', time:10,
    onClick:() => {
      closeModal();
      const roll = G.rng.d20() + statMod(G.player.stats.cha);
      if(roll >= 15){
        G.player.access = 'high';
        os.relation += 1;
        log(os.addressAs + ': «Разовый допуск. Больше не проси.»', 'good');
        kEntry(os.id, 'service', 'выдал разовый допуск', 'CONFIRMED', 'разговор', 0.95);
      } else {
        log(os.addressAs + ': «Иди по бумагам.»', 'info');
      }
      adv(10, null);
    }});

  methods.push({ label:'«Что ещё нужно от меня?»', time:2,
    onClick:() => {
      closeModal();
      if(G.prologue.examPassed && !G.prologue.missionLoaded){
        log(os.addressAs + ': «Погрузка. Дедлайн. Без фокусов.»', 'info');
      } else if(G.prologue.missionLoaded){
        log(os.addressAs + ': «Довезти. Сдать. Отчитаться.»', 'info');
      } else {
        log(os.addressAs + ': «Сначала — экзамен.»', 'info');
      }
      adv(2, null);
    }});

  methods.push({ label:'Осмотреть', time:1,
    onClick:() => {
      closeModal();
      const f = os.feature && os.feature.text ? os.feature.text : 'ничего необычного';
      adv(1, (os.addressAs || 'Смотритель') + '. Одежда Administratum, потрёпанная. ' +
        'Смотрит на руки, не в глаза. ' +
        f.charAt(0).toUpperCase() + f.slice(1) + '.', 'info');
    }});

  methods.push({ label:'Уйти', time:0, onClick: closeModal });

  openModal({
    type:'action',
    title: os.addressAs,
    desc: 'Он не поднимает глаз. Ждёт.',
    methods,
  });
}

/* ============================================================
   §10.18 · УСТАНОВКА МОДУЛЯ КПК
   ============================================================ */
function installPdaModule(npc){
  closeModal();
  if(!G.pda.pendingModule){
    log('Нечего устанавливать.', 'info');
    render();
    return;
  }

  const skill = (npc.social && npc.social.authority)
    ? Math.floor(npc.social.authority / 10)
    : 5;
  const toolBonus = (npc.items && npc.items.includes('tool')) ? 3 : 0;
  const roll = G.rng.d20() + skill + toolBonus;

  if(roll >= 12){
    G.pda.modules.push(PDA_MODULES.calls);
    G.pda.pendingModule = null;
    const idx = G.assets.inventory.findIndex(x => x.type === 'usb_module');
    if(idx >= 0) G.assets.inventory.splice(idx, 1);
    for(const o of G.obligations.orders){
      if(o.title === 'Установить модуль КПК'){ o.done = true; o.state = 'fulfilled'; }
    }
    log(npc.name + ': «Готово. Звонки подключены.» (d20 → ' + roll + ')', 'good');
    historyEvent('player', 'install_module', npc.id, 'notable', []);
    npc.relation += 2;
    adv(30, 'Модуль КПК установлен. КПК теперь может звонить.', 'good');
  } else {
    log(npc.name + ': «Инструменты нужны. Не сейчас.» (d20 → ' + roll + ')', 'warn');
    npc.relation -= 1;
    adv(30, null);
  }
}

/* ============================================================
   §3.4 · УСКОРЕНИЕ ПОЛЁТА ПИЛОТОМ
   ============================================================ */
function openPilotPush(npc){
  const isSmall = G.area === 'small_ship';
  const travelKey = isSmall ? 'travelSmall' : 'travelLarge';

  openModal({ type:'action', title:'Ускорение полёта',
    desc: 'Пилот смотрит на панель, не на тебя.',
    methods:[
      { label:'«Можно быстрее?»', time:5,
        mod: modLabel('ХАР', G.player.stats.cha),
        onClick:() => {
          closeModal();
          const roll = G.rng.d20() + statMod(G.player.stats.cha);
          if(roll >= 13){
            const save = Math.floor(G.destination[travelKey] * 0.15);
            G.destination[travelKey] -= save;
            G.flags.flightPushed = true;
            log('Пилот согласился ускориться. Экономия ' + fmtDur(save) +
              '. (d20 → ' + roll + ')', 'good');
            historyEvent('player', 'help', npc.id, 'notable', []);
          } else {
            log('Пилот: «Не могу. Регламент.» (d20 → ' + roll + ')', 'warn');
          }
          adv(10, null);
        }},
      { label:'Дать 100₡', time:5, disabled: G.assets.money < 100,
        onClick:() => {
          G.assets.money -= 100;
          closeModal();
          const save = Math.floor(G.destination[travelKey] * 0.2);
          G.destination[travelKey] -= save;
          G.flags.flightPushed = true;
          log('Пилот взял деньги. Экономия ' + fmtDur(save) + '.', 'good');
          historyEvent('player', 'bribe', npc.id, 'notable', []);
          adv(10, null);
        }},
      { label:'Уйти', time:0, onClick: closeModal },
    ]});
}

/* ============================================================
   §3.4.6 · СТИМУЛЯЦИЯ ПОГРУЗКИ
   ============================================================ */
function openBoostLoading(npc){
  const L = G.prologue.loadingBg;
  if(!L) return;
  const hasMoney = G.assets.money >= 50;

  openModal({ type:'action', title:'Ускорить погрузку',
    desc: 'Диспетчер смотрит на бригаду у причала.',
    methods:[
      { label:'«Дай людей побольше»', time:10,
        mod: modLabel('ХАР', G.player.stats.cha),
        onClick:() => {
          closeModal();
          const roll = G.rng.d20() + statMod(G.player.stats.cha);
          if(roll >= 12){
            L.rate += 0.2;
            log('Диспетчер добавил рабочих. Скорость выросла. (d20 → ' + roll + ')', 'good');
          } else {
            log('Диспетчер: «Все заняты.» (d20 → ' + roll + ')', 'warn');
          }
          adv(10, null);
        }},
      { label:'Доплатить бригаде (50₡)', time:5, disabled: !hasMoney,
        onClick:() => {
          G.assets.money -= 50;
          closeModal();
          for(const c of L.crew){ c.fatigue = Math.max(0, c.fatigue - 20); c.working = true; }
          L.rate += 0.15;
          log('Бригада получила доплату. Скорость выросла.', 'good');
          adv(10, null);
        }},
      { label:'Оставить как есть', time:0, onClick: closeModal },
    ]});
}
