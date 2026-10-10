'use strict';
/* ============================================================
   KILLER · LVE_6 v3.4 · §3.3.3/§3.4
   Скрытый убийца и параллельный заказчик.
   ============================================================ */

/* ============================================================
   ТИК · убийца развивается по стадиям
   ============================================================ */
function tickKiller(minutes){
  for(const npc of Object.values(G.npcs)){
    if(!npc.isHiddenKiller || !npc.hiddenIntent) continue;
    if(!npc.hiddenIntent.active) continue;
    if(npc.state === 'dead'){ npc.hiddenIntent.active = false; continue; }

    const hi = npc.hiddenIntent;
    const target = G.npcs[hi.targetId];
    if(!target || target.state === 'dead'){ hi.active = false; continue; }

    /* Развитие замедляется, если убийца получил предупреждение */
    const slowFactor = hi.warned ? 0.5 : 1;
    hi.progress = Math.min(100, hi.progress + minutes * 0.08 * slowFactor);

    /* Смена стадий — без оповещения игрока.
       Оповещает только наблюдение (tickKillerObservation). */
    if(hi.stage === 'observing' && hi.progress >= 25)   hi.stage = 'stalking';
    if(hi.stage === 'stalking' && hi.progress >= 55)    hi.stage = 'opportunity';
    if(hi.stage === 'opportunity' && hi.progress >= 85) hi.stage = 'attempt';

    /* Покушение */
    if(hi.stage === 'attempt' && hi.progress >= 95){
      killerAttempt(npc);
      hi.progress = 0;
      hi.attempts++;
      if(hi.active && hi.attempts >= 3){
        hi.active = false;
        log(npc.name + ' оставил(а) попытки.', 'info');
      } else if(hi.active && hi.stage === 'attempt'){
        hi.stage = 'opportunity';
      }
    }
  }

  /* Игрок замечает что-то только если физически рядом с убийцей и целью */
  tickKillerObservation(minutes);

  /* §3.3.4 · Параллельный заказчик — только если игрок уже знает об убийце */
  if(G.flags.knowsKiller && !G.flags.secondContractOffered &&
     G.prologue.part === 'small_ship' && G.rng.chance(0.04 * (minutes / 10))){
    G.flags.secondContractOffered = true;
    openSecondContractModal();
  }
}

/* ============================================================
   §3.3.3 · НАБЛЮДЕНИЕ · игрок должен присутствовать
   ============================================================ */
function tickKillerObservation(minutes){
  const killer = Object.values(G.npcs).find(n =>
    n.isHiddenKiller && n.hiddenIntent && n.hiddenIntent.active);
  if(!killer) return;
  const hi = killer.hiddenIntent;
  const target = G.npcs[hi.targetId];
  if(!target || target.state === 'dead') return;

  /* Игрок должен быть в той же локации, что убийца И жертва */
  if(G.area !== killer.area) return;
  if(G.location !== killer.location) return;
  if(G.location !== target.location) return;

  /* Шанс заметить за 10 минут — зависит от стадии */
  const noticeChance = {
    observing:   0.03,
    stalking:    0.12,
    opportunity: 0.28,
    attempt:     0.65,
  }[hi.stage] || 0;

  if(!G.rng.chance(noticeChance * (minutes / 10))) return;

  G.flags.killerObservations = (G.flags.killerObservations || 0) + 1;

  if(!G.flags.knowsKiller){
    G.flags.knowsKiller = true;
    G.flags.knowsKillerAt = G.time;
    log('Что-то не так. ' + killer.name + ' ведёт себя странно рядом с ' + target.name + '.', 'warn');
    historyEvent('world', 'killer_detected', killer.id, 'notable', []);
  }

  kEntry(killer.id, 'behavior',
    'подозрительное поведение рядом с ' + target.name,
    'OBSERVED', 'наблюдение',
    Math.min(0.9, 0.5 + G.flags.killerObservations * 0.15));
}

/* ============================================================
   §3.3.3 · ПОКУШЕНИЕ · с фильтром по области
   ============================================================ */
function killerAttempt(killer){
  const hi = killer.hiddenIntent;
  const target = G.npcs[hi.targetId];
  if(!target || target.state !== 'alive'){ hi.active = false; return; }

  const playerPresent = G.area === killer.area && G.location === killer.location;
  const playerAware = G.flags.knowsKiller;
  const playerInArea = G.area === killer.area;

  /* Игрок рядом и в курсе — срываем */
  if(playerPresent && playerAware){
    log('Покушение на ' + target.name + ' сорвано: ' + killer.name + ' отступил(а).', 'warn');
    historyEvent('player', 'foil_kill', killer.id, 'notable', [target.id]);
    G.assets.reputation.workers = clamp(G.assets.reputation.workers + 3, 0, 100);
    return;
  }

  const waryBonus = target.wary ? 3 : 0;
  const roll = G.rng.d20() + Math.floor(hi.riskTolerance / 10) + (target.sleeping ? 4 : 0);
  const dc = 12 + waryBonus;

  if(roll >= dc){
    target.state = 'dead';
    target.hp = 0;
    target.wounds = target.wounds || [];
    target.wounds.push({ weapon: hi.method, time: G.time });

    /* Лог только если игрок в той же области */
    if(playerInArea){
      const cause = hi.method === 'яд'
        ? 'Признаков насилия нет. Что-то в напитке.'
        : 'Следы насилия.';
      log('☠ ' + target.name + ' найден(а) мёртвым(ой). ' + cause, 'danger');
    }
    historyEvent('npc', 'killer_success', target.id, 'grave', []);
    applyDeathConsequences(target);
    hi.active = false;

    if(G.area === 'small_ship' || G.area === 'large_ship'){
      if(G.ship && G.ship.alert !== 'ORGANIZED'){
        G.ship.alert = 'ORGANIZED';
        if(playerInArea) log('Смерть на борту. Тревога ORGANIZED.', 'danger');
      }
    } else if(G.area === 'station' && G.station){
      G.station.alert = 'ORGANIZED';
    }
  } else {
    target.hp = Math.max(1, target.hp - 3);
    target.wounded = true;
    target.woundTime = G.time;
    if(playerInArea){
      log('Попытка убийства ' + target.name + '. Выжил(а). Ранен(а). (d20 → ' + roll + ')', 'danger');
    }
    historyEvent('npc', 'killer_fail', target.id, 'grave', []);
    target.wary = true;
  }
}

/* ============================================================
   §3.3.3 · ТОПИКИ ДИАЛОГА С УБИЙЦЕЙ
   Доступны только после наблюдений.
   ============================================================ */
function killerTopics(npc){
  const topics = [];
  if(!npc.isHiddenKiller) return topics;
  if(!G.flags.knowsKiller) return topics;

  const obs = G.flags.killerObservations || 0;
  if(obs < 1) return topics;

  const hi = npc.hiddenIntent;
  const target = G.npcs[hi.targetId];
  if(!target) return topics;

  /* Прямое обвинение — только после двух наблюдений */
  if(obs >= 2 && !hi.killerConfronted){
    topics.push({
      id:'killer_confront', tag:'danger',
      label:'«Я знаю, что ты готовишь»',
      response:() => {
        hi.killerConfronted = true;
        hi.warned = true;
        npc.relation -= 5;
        historyEvent('player', 'confront_killer', npc.id, 'notable', []);
        log(npc.name + ' молчит. Пальцы на секунду сжимаются в кулак.', 'danger');
        return '«Ты ошибаешься.»';
      },
    });
  }

  /* Попытка отговорить — после двух наблюдений */
  if(obs >= 2 && !hi.dissuaded){
    topics.push({
      id:'killer_dissuade', tag:'request',
      label:'Попытаться отговорить',
      mod: modLabel('ХАР', G.player.stats.cha),
      response:() => {
        const roll = G.rng.d20() + statMod(G.player.stats.cha);
        if(roll >= 14){
          hi.dissuaded = true;
          hi.active = false;
          log(npc.name + ' отступил(а). План отменён. (d20 → ' + roll + ')', 'good');
          historyEvent('player', 'dissuade_killer', npc.id, 'notable', []);
          return '«...Ладно. Ты прав.»';
        }
        log(npc.name + ' не слушает. (d20 → ' + roll + ')', 'warn');
        return '«Не лезь.»';
      },
    });
  }

  return topics;
}

/* ============================================================
   §3.3.3 · ДОКЛАД ОХРАНЕ / ЦЕРКВИ
   Приходит от лица охраны и церковников. Не от убийцы.
   ============================================================ */
function reportSuspiciousTopics(npc){
  const topics = [];
  if(!G.flags.knowsKiller) return topics;

  const allowed = ['ship_officer','station_guard','captain','large_captain','preacher'];
  if(!allowed.includes(npc.id)) return topics;

  const killer = Object.values(G.npcs).find(n =>
    n.isHiddenKiller && n.hiddenIntent && n.hiddenIntent.active);
  if(!killer) return topics;
  if(killer.hiddenIntent.reported) return topics;

  topics.push({
    id:'report_suspicious', tag:'request',
    label:'«Есть человек. Ведёт себя странно»',
    response:null,
    action:() => { G.modal = null; openReportSuspicious(npc); },
  });

  return topics;
}

function openReportSuspicious(guard){
  const killer = Object.values(G.npcs).find(n =>
    n.isHiddenKiller && n.hiddenIntent && n.hiddenIntent.active);
  if(!killer) return;
  const obs = G.flags.killerObservations || 0;
  const isClergy = guard.faction === 'Ecclesiarchy' || guard.id === 'preacher';

  /* Уверенный доклад — 3+ наблюдения */
  if(obs >= 3){
    G.modal = {
      type:'action',
      title: isClergy ? 'Разговор с ' + roleF(guard) : 'Доклад · ' + guard.name,
      desc: 'Ты называешь имя. Рассказываешь, что видел.\n\n' +
        (isClergy
          ? guard.name + ' слушает молча. Потом кивает: «Проверим.»'
          : guard.name + ' смотрит на тебя, потом на планшет. «Хорошо. Я подойду.»'),
      methods: [
        { label:'Подтвердить', time:15,
          onClick:() => {
            closeModal();
            killer.hiddenIntent.active = false;
            killer.hiddenIntent.reported = true;
            killer.hiddenIntent.reportedTo = guard.id;

            if(isClergy){
              log('Церковники увели ' + killer.name + ' с собой.', 'warn');
              const area = AREAS[killer.area];
              if(area && area.locs['chapel']) killer.location = 'chapel';
              else if(area && area.locs['chapel_st']) killer.location = 'chapel_st';
            } else {
              log(guard.name + ' задержал ' + killer.name + '.', 'danger');
              killer.state = 'unconscious';
              killer.hp = 1;
            }
            historyEvent('player', 'report_killer', killer.id, 'grave', [guard.id]);
            adv(15, null);
          }
        },
        { label:'Отменить', time:0, onClick: closeModal },
      ],
    };
    renderModal();
    return;
  }

  /* Недостаточно оснований */
  G.modal = {
    type:'action',
    title: isClergy ? 'Разговор' : 'Доклад',
    desc: 'Ты говоришь осторожно. Не уверен.\n\n' +
      (isClergy
        ? guard.name + ': «Подозрения — это не грех. Но и не повод. Молись.»'
        : guard.name + ': «Мало данных. Если что-то ещё заметишь — приходи.»'),
    methods: [
      { label:'Уйти', time:0, onClick: closeModal },
    ],
  };
  renderModal();
}

/* ============================================================
   §3.3.3 · ПРЕДУПРЕЖДЕНИЕ ЖЕРТВЫ
   ============================================================ */
function victimWarningTopics(npc){
  const topics = [];
  const killer = Object.values(G.npcs).find(n =>
    n.isHiddenKiller && n.hiddenIntent && n.hiddenIntent.targetId === npc.id);
  if(!killer || !G.flags.knowsKiller) return topics;
  if(npc.wary) return topics;
  if((G.flags.killerObservations || 0) < 1) return topics;

  topics.push({
    id:'warn_victim', tag:'request',
    label:'«Будь осторожен. Тебя могут убить»',
    response:() => {
      npc.wary = true;
      npc.relation += 2;
      log(npc.name + ' напрягся. Он будет осторожен.', 'good');
      historyEvent('player', 'warn_victim', npc.id, 'notable', []);
      return '«Кто? Ты знаешь?»';
    },
  });
  return topics;
}

/* ============================================================
   §3.3.4 · ВТОРОЙ ЗАКАЗЧИК
   Параллельное задание — убить ту же жертву.
   ============================================================ */
function openSecondContractModal(){
  const killer = Object.values(G.npcs).find(n => n.isHiddenKiller && n.hiddenIntent?.active);
  if(!killer) return;
  const target = G.npcs[killer.hiddenIntent.targetId];
  if(!target) return;

  const candidates = Object.values(G.npcs).filter(n =>
    n.id !== killer.id && n.id !== target.id &&
    n.id !== G.assistantId && n.id !== 'overseer' &&
    n.area === killer.area && n.state === 'alive');
  if(!candidates.length) return;
  const client = G.rng.pick(candidates);

  G.modal = { type:'action',
    title: client.name + ' — разговор',
    desc: client.name + ' подходит к тебе. Голос тихий.\n\n' +
      '«Есть человек. ' + target.name + '. Мне нужно, чтобы его не стало. ' +
      'Ты можешь. Я вижу. Плачу 400₡.»',
    methods:[
      { label:'Согласиться', time:5,
        onClick:() => {
          closeModal();
          G.flags.secondContractAccepted = true;
          G.flags.secondContractClient = client.id;
          G.flags.secondContractTarget = target.id;
          addObligation('favor', {
            title:'Контракт: ' + target.name,
            desc:'Убить ' + target.name + ' для ' + client.name + '. 400₡.',
            giver: client.name,
          });
          log(client.name + ': «Найдёшь момент. Я прикрою.»', 'action');
          adv(5, null);
        }},
      { label:'Отказаться', time:2,
        onClick:() => {
          closeModal();
          client.relation -= 3;
          log(client.name + ': «Забудь этот разговор.»', 'warn');
          adv(2, null);
        }},
      { label:'«Это он тебя попросил?»', time:2,
        onClick:() => {
          closeModal();
          const roll = G.rng.d20() + statMod(G.player.stats.cha);
          if(roll >= 13){
            log(client.name + ': «...Да. Или что-то в этом роде. Не спрашивай.»', 'info');
            kEntry(client.id, 'contract',
              'связан с готовящимся убийством ' + target.name,
              'CONFIRMED', 'разговор', 0.9);
          } else {
            log(client.name + ': «Не твоё дело.»', 'warn');
          }
          adv(2, null);
        }},
    ]};
  renderModal();
}