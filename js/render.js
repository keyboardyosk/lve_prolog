'use strict';
/* ============================================================
   RENDER · LVE_6 v3.4
   HUD · сцены · модалки. КПК — в pda.js.
   ============================================================ */

/* ============================================================
   DOM helper
   ============================================================ */
function h(tag, attrs, ...kids){
  const e = document.createElement(tag);
  if(attrs) for(const k in attrs){
    const v = attrs[k];
    if(v == null || v === false) continue;
    if(k === 'class') e.className = v;
    else if(k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if(k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for(const c of kids){
    if(c == null || c === false) continue;
    e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return e;
}
function el(id){ return document.getElementById(id); }

/* ============================================================
   ГЛАВНЫЙ РЕНДЕР
   ============================================================ */
   function render(){
    if(!G) return;
    renderHUD();
    renderScene();
    renderLog();
    renderStatus();
    renderModal();
    addLocalObservations(null);
    if(typeof flushPendingObstacles === 'function') flushPendingObstacles();
    checkPendingIncidentDisplay();
  }
  
  /* ============================================================
     §3.4.5 · Показ инцидента при погрузке
     Флаг взводится в triggerLoadingIncident.
     Модалка открывается, когда игрок на площадке или в доковой зоне.
     ============================================================ */
  function checkPendingIncidentDisplay(){
    if(!G.flags.showLoadingIncident) return;
    if(G.modal) return;
  
    const L = G.prologue.loadingBg;
    if(!L || !L.pendingIncident || L.pendingIncident.resolved){
      G.flags.showLoadingIncident = null;
      return;
    }
  
    /* Игрок должен быть на площадке или в доковой зоне планеты */
    const onSpot = G.area === 'planet' &&
      (G.scene === 'loading' || G.location === 'dock_area');
    if(!onSpot) return;
  
    const type = G.flags.showLoadingIncident;
    G.flags.showLoadingIncident = null;
    if(typeof openLoadingIncidentModal === 'function'){
      openLoadingIncidentModal(type);
    }
  }

/* ============================================================
   HUD
   ============================================================ */
function renderHUD(){
  const hud = el('hud');
  if(!hud) return;
  hud.innerHTML = '';

  const area = AREAS[G.area];
  const loc = area && area.locs[G.location] ? area.locs[G.location].n : '';

  /* ---------- LEFT ---------- */
  const left = h('div', { class:'left-part' });
  const row1 = h('div', { class:'row1' });
  row1.appendChild(h('span', { class:'brand' }, 'СМЕХ В ПУСТОТЕ'));
  row1.appendChild(h('span', { class:'time' }, fmtClock(G.time)));
  if(area){
    row1.appendChild(h('span', { class:'ctx' }, area.title + ' · ' + loc));
  }
  left.appendChild(row1);

  /* ---------- ROW2 ---------- */
  const row2 = h('div', { class:'row1' });

  const arrival = getFlightArrival();
  if(arrival != null){
    const rem = arrival - G.time;
    const target = G.area === 'small_ship' ? G.destination.planet : G.destination.station;
    row2.appendChild(h('span', { class:'flight' },
      rem > 0 ? '✈ до ' + target + ': ' + fmtDur(rem) : '✈ прибытие'));
  }

  if(G.prologue.deadline && G.prologue.part !== 'station'){
    const leftT = G.prologue.deadline - G.time;
    row2.appendChild(h('span', {
      class:'alert',
      style:{ color: leftT < 180 ? 'var(--red)' : leftT < 720 ? 'var(--orange)' : 'var(--muted)' }
    }, 'Срок: ' + fmtClock(G.prologue.deadline)));
  }

  if(G.station.alert && G.station.alert !== 'LOW'){
    const color = G.station.alert === 'SUSPICION' ? 'var(--orange)' : 'var(--red)';
    row2.appendChild(h('span', { style:{ color } }, 'станция: ' + G.station.alert));
  }

  if(G.prologue.loadingBg && G.prologue.loadingBg.active){
    row2.appendChild(h('span', { class:'loading' },
      '⚙ погрузка ' + Math.floor(G.prologue.loadingBg.progress) + '%'));
  }

  if(G.warp.exposure > 0){
    row2.appendChild(h('span', { class:'warp' },
      '✦ warp ' + G.warp.exposure + '/' + WARP.SCALE_MAX));
  }

  if(G.combat && G.combat.active){
    row2.appendChild(h('span', { class:'combat' }, '⚔ раунд ' + G.combat.round));
  }

  if(row2.childNodes.length) left.appendChild(row2);

  /* ---------- STATE BLOCK ---------- */
  if(G.player){
    const s = G.player.state;
    const block = h('div', { class:'state-block' },
      h('div', {}, h('span', { class:'state-k' }, 'Усталость'),
        h('span', { class:'state-v' + (s.fatigue > 80 ? ' danger' : s.fatigue > 60 ? ' warn' : '') },
          String(Math.floor(s.fatigue)))),
      h('div', {}, h('span', { class:'state-k' }, 'Стресс'),
        h('span', { class:'state-v' + (s.stress > 80 ? ' danger' : s.stress > 60 ? ' warn' : '') },
          String(Math.floor(s.stress)))),
      h('div', {}, h('span', { class:'state-k' }, 'Голод'),
        h('span', { class:'state-v' + (s.hunger > 80 ? ' danger' : s.hunger > 60 ? ' warn' : '') },
          String(Math.floor(s.hunger)))),
      h('div', {}, h('span', { class:'state-k' }, 'HP'),
        h('span', { class:'state-v' }, s.hp + '/' + s.maxHp)),
      h('div', {}, h('span', { class:'state-k' }, 'Деф. сна'),
        h('span', { class:'state-v' + (s.sleepDebt > 60 ? ' warn' : '') },
          String(Math.floor(s.sleepDebt)))),
      h('div', {}, h('span', { class:'state-k' }, 'Кредиты'),
        h('span', { class:'state-v' }, '₡' + G.assets.money)),
    );
    left.appendChild(block);
  }

  /* ---------- RIGHT ---------- */
  const right = h('div', { class:'right-part' });
  const mr = h('div', { class:'row1', style:{ justifyContent:'flex-end' } });

  const unreadCount = (G.pda.messages || []).filter(m => !m.read).length;
  mr.appendChild(h('button', {
    class: (G.modal && G.modal.type === 'pda' ? 'on' : '') +
           (unreadCount ? ' alert' : ''),
    onclick: togglePDA
  }, 'КПК' + (unreadCount ? ' (' + unreadCount + ')' : '')));

  mr.appendChild(h('button', { onclick: openInv }, 'Инв.'));
  mr.appendChild(h('button', { onclick: openHelp }, '?'));
  mr.appendChild(h('button', {
    onclick: () => { if(saveGame()){ log('Сохранено.', 'good'); render(); } }
  }, 'Сохр'));
  mr.appendChild(h('button', {
    onclick: () => { if(loadGame()){ log('Загружено.', 'info'); render(); } }
  }, 'Загр'));
  right.appendChild(mr);

  hud.appendChild(left);
  hud.appendChild(right);
}

/* ============================================================
   ROUTER СЦЕН
   ============================================================ */
function renderScene(){
  const s = el('scene');
  if(!s) return;
  s.innerHTML = '';
  if(G.combat && G.combat.active){ sceneCombat(s); return; }

  const routes = {
    title:      sceneTitle,
    assignment: sceneAssignment,
    background: sceneBackground,
    package:    scenePackage,
    area:       sceneArea,
    loading:    sceneLoading,
    loading_setup: sceneLoadingSetup,
    arrival_planet: sceneArrivalPlanet,
    arrival_ship:   sceneArrivalShip,
    approach:   sceneApproach,
    end:        sceneEnd,
    debug:      sceneDebug,

    exam1:      sceneExam1,
    exam2:      sceneExam2,
    exam3:      sceneExam3,

    overseer_meeting: sceneOverseerMeeting,
    unload:           sceneUnload,
    board_large:      sceneBoardLargeShip,
    after_unload:     sceneAfterUnload,
    station_arrival:  sceneStationArrival,
    deputy_office:    sceneDeputyOffice,
    final_report:     sceneFinalReport,
    final_verdict:    sceneFinalVerdict,
    overseer_arrest:  sceneOverseerArrest,
  };
  const fn = routes[G.scene];
  if(fn) fn(s);
  else s.textContent = 'scene: ' + G.scene + ' (нет обработчика)';
}

/* ============================================================
   LOG / STATUS
   ============================================================ */
function renderLog(){
  const elog = el('log');
  if(!elog) return;
  elog.innerHTML = G.log.slice(-120).map(e =>
    '<div class="log-e ' + (e.cls || '') + '"><span class="t">' +
    fmtClock(e.t) + '</span>' + esc(e.text) + '</div>'
  ).join('');
  elog.scrollTop = elog.scrollHeight;
}

function renderStatus(){
  const s = el('status');
  if(!s) return;
  if(!G.player){ s.innerHTML = ''; return; }
  const p = G.player;
  const hidden = p.pathologies.filter(x => !x.discovered).length;
  const disc = p.pathologies.filter(x => x.discovered && !x.treated).length;
  const knowActive = (G.playerKnowledge || []).filter(e => e.status === 'active').length;
  const activeTasks = (G.obligations.orders.length + G.obligations.favors.length +
                       G.obligations.debts.length + G.obligations.words.length +
                       G.obligations.letters.length);

  s.innerHTML =
    '<div class="row"><span class="k">СИЛ/ИНТ</span><span class="v">' + p.stats.str + ' (' + modStr(p.stats.str) + ') / ' + p.stats.int + ' (' + modStr(p.stats.int) + ')</span></div>' +
    '<div class="row"><span class="k">ХАР/ВЫН</span><span class="v">' + p.stats.cha + ' (' + modStr(p.stats.cha) + ') / ' + p.stats.end + ' (' + modStr(p.stats.end) + ')</span></div>' +
    '<div class="row"><span class="k">Патологии</span><span class="v">скрыто ' + hidden + ' · активно ' + disc + '</span></div>' +
    '<div class="row"><span class="k">Наблюдений</span><span class="v">' + knowActive + '</span></div>' +
    '<div class="row"><span class="k">Обязательства</span><span class="v">' + activeTasks + '</span></div>' +
    '<div class="row"><span class="k">Контакты</span><span class="v">' + G.assets.contacts.length + '</span></div>';
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal(m){ G.modal = m; renderModal(); }
function closeModal(){ G.modal = null; render(); }
function shadeClick(e){
  if(e.target && e.target.id === 'modal'){ G.modal = null; render(); }
}

function renderModal(){
  const shade = el('modal');
  const box = el('modal-box');
  if(!shade || !box) return;

  if(!G.modal){
    shade.classList.remove('open');
    box.innerHTML = '';
    return;
  }
  shade.classList.add('open');
  box.className = 'modal' + (G.modal.warp ? ' warp' : '');
  box.innerHTML = '';

  const m = G.modal;
  const renderers = {
    action:        renderAction,
    dialogue:      renderDialogue,
    trade:         renderTrade,
    inventory:     renderInvModal,
    help:          renderHelp,
    combat_result: renderCombatResult,
    pda:           renderPDA,
    sleep_event:   renderSleepEvent,
  };
  const fn = renderers[m.type];
  if(fn) fn(box, m);
}

function mhead(box, title){
  box.appendChild(h('div', { class:'modal-head' },
    h('h2', {}, title),
    h('button', { class:'x', onclick: closeModal }, '✕')));
}

/* ============================================================
   ACTION MODAL
   ============================================================ */
function renderAction(box, m){
  mhead(box, m.title);
  const body = h('div', { class:'modal-body' });
  if(m.desc) body.appendChild(h('div', {
    class:'hint',
    style:{ marginBottom:'10px', fontStyle:'normal', color:'var(--text)', whiteSpace:'pre-line' }
  }, m.desc));

  const list = h('div', { class:'methods' });
  (m.methods || []).forEach((method, idx) => {
    if(!method) return;
    list.appendChild(h('div', {
      class:'method' + (method.disabled ? ' dis' : ''),
      onclick: () => { if(!method.disabled && method.onClick) method.onClick(); }
    },
      h('div', { style:{ flex:'1' } },
        h('span', { class:'key' }, String(idx + 1)),
        h('span', { class:'label' }, method.label),
        method.mod ? h('span', { class:'mod' }, '[' + method.mod + ']') : null,
        method.req ? h('div', { class:'req' }, 'Требуется: ' + method.req) : null,
        method.desc ? h('div', { class:'desc' }, method.desc) : null),
      method.time != null ? h('div', { class:'time' },
        method.time === 0 ? '—' : method.time + ' мин') : null
    ));
  });
  body.appendChild(list);
  box.appendChild(body);
}

/* ============================================================
   DIALOGUE MODAL
   ============================================================ */
function renderDialogue(box, m){
  const npc = G.npcs[m.npcId];
  if(!npc){ closeModal(); return; }
  mhead(box, npc.name + ' · ' + roleF(npc));
  const body = h('div', { class:'modal-body' });

  const st = dialogueStage(npc);
  body.appendChild(h('div', { class:'dlg-stage' },
    'Стадия: ', h('b', {}, CONTACT_STAGE_LABEL[st] || st),
    ' · отн. ' + npc.relation +
    ' · общих ' + npc.generalAsked + ' · личных ' + npc.personalAsked +
    (npc.hp < npc.maxHp ? ' · HP ' + npc.hp + '/' + npc.maxHp : '')));

  const hist = h('div', { class:'dlg-hist' });
  for(const line of m.history){
    const cls = line.speaker === 'npc' ? 'npc'
              : line.speaker === 'sys' ? 'sys'
              : line.speaker === 'callback' ? 'callback'
              : 'player';
    const who = line.speaker === 'npc' ? npc.name + ':'
              : line.speaker === 'sys' ? '—'
              : line.speaker === 'callback' ? '—'
              : 'Вы:';
    hist.appendChild(h('div', { class:'dlg-line ' + cls },
      h('span', { class:'who' }, who),
      h('span', { class:'txt' }, ' ' + line.text)));
  }
  body.appendChild(hist);

  if(m.counterQuestion){
    body.appendChild(h('div', { class:'result-box' }, m.counterQuestion.q));
    const list = h('div', { class:'dlg-topics' });
    m.counterQuestion.options.forEach((opt, idx) => {
      list.appendChild(h('div', {
        class:'dlg-topic',
        onclick:() => answerCounterQuestion(npc, idx)
      },
        h('span', { class:'tag talk' }, '[' + (idx + 1) + ']'),
        h('span', { class:'lbl' }, opt.l)));
    });
    body.appendChild(list);
    box.appendChild(body);
    return;
  }

  const topics = buildTopics(npc);
  const list = h('div', { class:'dlg-topics' });
  topics.forEach(t => {
    const locked = m.asked.has(t.id) && t.id !== 'bye' && !t.repeatable;
    list.appendChild(h('div', {
      class:'dlg-topic' + (locked ? ' locked' : ''),
      onclick:() => { if(!locked) askTopic(t, npc); }
    },
      h('span', { class:'tag ' + (t.tag || '') }, '[' + (t.tag || 'talk') + ']'),
      h('span', { class:'lbl' }, t.label)));
  });
  body.appendChild(list);
  box.appendChild(body);
}

/* ============================================================
   TRADE MODAL
   ============================================================ */
function renderTrade(box, m){
  const npc = G.npcs[m.npcId];
  const p = npc && npc.tradeProfile;
  if(!p){ closeModal(); return; }
  mhead(box, 'Торг · ' + npc.name);
  const body = h('div', { class:'modal-body' });

  if(m.step === 'choose'){
    body.appendChild(h('div', { class:'hint', style:{ marginBottom:'10px' } },
      'Товар — повод. Цена зависит от нужды, знаний, отношений.'));
    for(const type of ['medkit','tool','ammo']){
      if((p.stock[type] || 0) <= 0) continue;
      const base = p.inventoryValue[type] || 50;
      body.appendChild(h('div', { class:'trade-choice' },
        h('div', { class:'trade-choice-head' },
          h('b', { style:{ flex:'1', marginRight:'14px' } },
            ITEMS[type] ? ITEMS[type].n : type),
          h('span', { class:'trade-stock', style:{ whiteSpace:'nowrap' } },
            'в наличии: ' + p.stock[type])),
        h('div', { class:'trade-choice-actions' },
          h('button', { class:'btn', onclick:() => beginTrade(m, 'buy', type) },
            'Купить · около ' + base + '₡'))));
    }
    if(G.assets.inventory.some(x => x.type === 'junk')){
      body.appendChild(h('div', { class:'trade-choice' },
        h('div', { class:'trade-choice-head' },
          h('b', { style:{ flex:'1', marginRight:'14px' } }, 'Хлам'),
          h('span', { class:'trade-stock', style:{ whiteSpace:'nowrap' } },
            'у вас: ' + G.assets.inventory.filter(x => x.type === 'junk').length)),
        h('div', { class:'trade-choice-actions' },
          h('button', { class:'btn', onclick:() => beginTrade(m, 'sell', 'junk') },
            'Продать · старт от 30₡'))));
    }
    body.appendChild(h('div', { class:'actions' },
      h('button', { class:'btn', onclick: closeModal }, 'Уйти')));
  } else if(m.step === 'bargain'){
    body.appendChild(h('div', { class:'trade-profile' },
      h('div', {}, 'Рынок: ' + (p.marketKnowledge > 65 ? 'хорошо осведомлён' : 'есть люфт')),
      h('div', {}, 'Срочность: ' + p.urgency + '/100'),
      h('div', {}, 'ХАР: ' + modStr(G.player.stats.cha) + ' · ИНТ: ' + modStr(G.player.stats.int)),
      h('div', {}, 'Отношение: ' + (npc.relation >= 5 ? 'хорошее' : npc.relation >= 0 ? 'нейтральное' : 'плохое'))));

    const hist = h('div', { class:'dlg-hist' });
    for(const line of m.history){
      hist.appendChild(h('div', { class:'dlg-line ' + line.speaker },
        h('span', { class:'who' }, line.speaker === 'npc' ? npc.name + ':' : 'Вы:'),
        h('span', { class:'txt' }, ' ' + line.text)));
    }
    body.appendChild(hist);

    const def = Math.max(1, Math.round(m.ask * (m.side === 'buy' ? 0.85 : 1.15)));
    const field = h('input', { type:'number', min:'1', value:String(def), class:'price-input' });
    body.appendChild(h('div', { class:'price-row' },
      h('label', {}, 'Твоя цена:'), field));
    body.appendChild(h('div', { class:'actions' },
      h('button', { class:'btn primary', onclick:() => submitOffer(m, Number(field.value)) }, 'ПРЕДЛОЖИТЬ'),
      h('button', { class:'btn', onclick:() => submitOffer(m, m.ask) }, 'СОГЛАСИТЬСЯ НА ' + m.ask + '₡'),
      h('button', { class:'btn', onclick:() => { m.step = 'done'; m.finalPrice = null; renderModal(); } }, 'ЗАКРЫТЬ СДЕЛКУ')));
    body.appendChild(h('div', { class:'hint', style:{ marginTop:'8px' } }, 'Раунд ' + m.round + '/4.'));
  } else {
    body.appendChild(h('div', { class:'result-box ' + (m.finalPrice != null ? 'good' : 'bad') },
      m.finalPrice != null ? 'Сделка состоялась: ' + m.finalPrice + '₡.' : 'Сделки не будет.'));
    body.appendChild(h('div', { class:'actions' },
      h('button', { class:'btn primary', onclick:() => { m.step = 'choose'; m.history = []; m.round = 0; renderModal(); } }, 'ЕЩЁ ТОРГОВАТЬ'),
      h('button', { class:'btn', onclick: closeModal }, 'УЙТИ')));
  }
  box.appendChild(body);
}

/* ============================================================
   COMBAT
   ============================================================ */
function sceneCombat(root){
  const c = G.combat;
  const cur = combatCurrent();
  root.appendChild(h('div', { class:'combat-scene' },
    h('div', { class:'combat-title' }, '⚔ СТЫЧКА'),
    h('div', { class:'combat-sub' },
      'Раунд ' + c.round + ' · ' +
      (cur && cur.isPlayer ? 'ваш ход' : 'ход: ' + (cur ? cur.name : '?'))),
    h('div', { class:'combat-arena' },
      ...c.participants.map(p => {
        let cls = '';
        if(p.team === 'player' && !p.isPlayer) cls += ' ally';
        if(p.isPlayer) cls += ' player';
        if(p.hp <= 0) cls += ' down';
        else if(p.hp < p.maxHp * 0.3) cls += ' serious';
        else if(p.hp < p.maxHp) cls += ' injured';
        return h('div', { class:'combatant' + cls },
          h('div', { class:'who' }, p.name,
            h('small', {}, (p.isPlayer ? 'вы · ' : '') + (WEAPONS[p.weapon]?.n || '—'))),
          h('div', { class:'hp-wrap' },
            h('div', { class:'hp-bar' },
              h('i', { style:{ width: Math.max(0, p.hp / p.maxHp * 100) + '%' } })),
            h('div', { class:'hp-num' }, Math.max(0, p.hp) + ' / ' + p.maxHp)));
      })),
    (cur && cur.isPlayer && !c.outcome) ? combatActionsUI() : null,
    h('div', { class:'combat-log' },
      ...c.log.slice(-14).map(l => h('div', { class: l.cls || '' }, l.text)))));
}

function combatActionsUI(){
  const actions = [];
  const avail = ['fist'];
  if(hasItem('knife')) avail.push('knife');
  if(hasItem('tool')) avail.push('tool');
  if(hasItem('pistol') && hasAmmo()) avail.push('pistol');
  for(const w of avail){
    const wd = WEAPONS[w];
    const strBonus = w === 'fist' ? Math.max(0, statMod(G.player.stats.str)) : 0;
    actions.push(h('button', { class:'btn', onclick:() => combatPlayerAttack(w) },
      'Атака: ' + wd.n,
      h('small', {}, 'Урон ' + (wd.dmg[0] + strBonus) + '–' + (wd.dmg[1] + strBonus))));
  }
  actions.push(h('button', { class:'btn', onclick: combatPlayerDefend }, 'Уклониться'));
  actions.push(h('button', { class:'btn', onclick:() => combatPlayerTry('disarm') }, 'Обезоружить'));
  actions.push(h('button', { class:'btn', onclick:() => combatPlayerTry('knockdown') }, 'Сбить с ног'));
  actions.push(h('button', { class:'btn', onclick:() => combatPlayerTry('intimidate') }, 'Угрожать (' + modLabel('ХАР', G.player.stats.cha) + ')'));
  actions.push(h('button', { class:'btn', onclick:() => combatPlayerTry('negotiate') }, 'Договориться (' + modLabel('ХАР', G.player.stats.cha) + ')'));
  if(G.assets.inventory.some(x => x.type === 'medkit')){
    actions.push(h('button', { class:'btn', onclick:() => combatPlayerTry('heal') }, 'Аптечка (+5 HP)'));
  }
  actions.push(h('button', { class:'btn danger', onclick:() => combatPlayerTry('flee') }, 'Убежать'));
  return h('div', { class:'combat-actions' }, ...actions);
}

function renderCombatResult(box, m){
  mhead(box, m.title);
  const body = h('div', { class:'modal-body' });
  body.appendChild(h('div', { class:'result-box ' + (m.cls || '') }, m.text));
  body.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick:() => {
      closeModal();
      G.combat = null;
      if(m.outcome === 'lose'){
        G.time += 60;
        G.player.state.hp = Math.max(5, G.player.state.hp);
      }
      render();
    }}, 'Продолжить')));
  box.appendChild(body);
}

/* ============================================================
   INVENTORY / HELP
   ============================================================ */
function openInv(){ if(G.modal) return; openModal({ type:'inventory' }); }
function renderInvModal(box, m){
  mhead(box, 'ИНВЕНТАРЬ');
  const body = h('div', { class:'modal-body' });

  const inv = (G.assets.inventory || []).filter(it => (it.location || 'inventory') === 'inventory');
  if(!inv.length){
    body.appendChild(h('div', { class:'hint' }, 'Пусто.'));
  } else {
    for(const it of inv){
      const line = h('div', { class:'pkg-item' },
        it.icon + ' ' + it.name + ' — ' + (it.desc || ''));
      if(it.artifact){
        line.style.cursor = 'pointer';
        line.style.borderLeft = '3px solid var(--purple)';
        line.style.paddingLeft = '8px';
        line.onclick = () => { closeModal(); openArtifactMenu(it); };
      }
      body.appendChild(line);
    }
  }
  box.appendChild(body);
}

/* ============================================================
   §4.4 · МЕНЮ АРТЕФАКТА
   ============================================================ */
function openArtifactMenu(art){
  const methods = [];
  const buff = art.effects && art.effects[0];
  const debuff = art.hidden_effects && art.hidden_effects[0];

  if(art.state === 'dormant'){
    methods.push({ label:'Активировать', time:5,
      desc:'Разбудить камень. Влияет на сон.',
      onClick:() => {
        closeModal();
        art.state = 'active';
        art.activationAt = G.time;
        log(art.name + ': активирован.', 'warn');
        historyEvent('player', 'activate_artifact', art.id, 'notable', []);
        adv(5, null);
      }});
  } else if(art.state === 'active'){
    methods.push({ label:'Уснуть (деактивировать)', time:5,
      desc:'Убрать влияние.',
      onClick:() => {
        closeModal();
        art.state = 'dormant';
        log(art.name + ': деактивирован.', 'info');
        adv(5, null);
      }});
  }

  methods.push({ label:'Осмотреть', time:5,
    onClick:() => {
      closeModal();
      const text = art.name + '.\n\n' +
        'Тип: ' + art.artifactType + '.\n' +
        'Источник: ' + art.source + '.\n' +
        'Заряд: ' + art.charge + ' / 100.\n' +
        'Warp-уровень: ' + art.warp_level + ' / 100.\n' +
        'Состояние: ' + art.state + '.\n\n' +
        'Видимые эффекты: ' + (buff ? buff.label + ' — ' + buff.desc : '—') + '\n' +
        'Скрытые эффекты: ' + (debuff ? 'возможны' : 'не обнаружены');
      openModal({ type:'action', title: art.name, desc: text,
        methods: [{ label:'Закрыть', time:0, onClick: closeModal }]});
    }});

  methods.push({ label:'Выбросить', time:2,
    onClick:() => {
      closeModal();
      const idx = G.assets.inventory.findIndex(i => i.id === art.id);
      if(idx >= 0) G.assets.inventory.splice(idx, 1);
      log(art.name + ': выброшен.', 'warn');
      historyEvent('player', 'drop_artifact', art.id, 'notable', []);
      adv(2, null);
    }});

  methods.push({ label:'Отмена', time:0, onClick: closeModal });
  openModal({ type:'action', title: art.name, methods });
}

function openHelp(){ if(G.modal) return; openModal({ type:'help' }); }
function renderHelp(box, m){
  mhead(box, 'Справка');
  const body = h('div', { class:'modal-body' });
  const tips = [
    'Клик по плитке — действие. Дверь ведёт в соседнюю локацию.',
    'Клик по NPC — контекстное меню.',
    'КПК: Tab — открыть, Esc — закрыть.',
    'Диалог: незнакомец → поздоровались → знакомые → доверие.',
    'ХАР/ИНТ/СИЛ/ВЫН — модификаторы к d20.',
    'Документ показывается человеку один раз.',
    'NPC иногда задаёт встречный вопрос.',
    'Молитва на коленях снижает Warp.',
    'Спящего можно обшарить, разбудить или убить.',
    'Кулаки не убивают. Нож и пистолет — да.',
    'Выстрел будит всех.',
    'Тело можно взять и перенести. СИЛ — скорость, ВЫН — усталость.',
    'Спрятать тело можно только в ящик. Один ящик — одно тело.',
    'Стресс > 60: Warp-шёпоты чаще.',
    'Стресс > 80: −1 ко всем d20.',
    'Погрузка идёт в фоне. Инциденты приходят на КПК.',
  ];
  for(const t of tips) body.appendChild(h('div', { style:{ marginBottom:'6px' } }, '· ' + t));
  box.appendChild(body);
}

/* ============================================================
   SCENE · TITLE
   ============================================================ */
function sceneTitle(root){
  const wrap = h('div', { class:'title-scr' },
    h('h1', {}, 'СМЕХ В ПУСТОТЕ'),
    h('div', { class:'sub' }, 'LVE_6 v' + VERSION + ' · Living Social Sandbox'),
    h('div', { class:'flavor' },
      h('div', {}, 'Administratum выдал назначение.'),
      h('div', {}, 'Ты его принял. Отказаться было нельзя.'),
      h('div', {}, 'Дальше — как получится.')),
    h('button', { class:'btn primary', onclick: newGame }, 'НОВАЯ ИГРА'),
    h('div', { class:'hint' }, 'Tab — КПК · Esc — закрыть · 1–9 — выбор'));
  root.appendChild(wrap);
}

/* ============================================================
   SCENE · ASSIGNMENT
   ============================================================ */
function sceneAssignment(root){
  const d = G.destination;
  root.appendChild(h('h2', { class:'title' }, 'ВХОДЯЩЕЕ УВЕДОМЛЕНИЕ'));
  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp' }, 'ADMINISTRATUM · СРОЧНО · ОТКАЗ НЕ ПРЕДУСМОТРЕН'),
    kvl('Система', d.system),
    kvl('Планета', d.planet),
    kvl('Получатель', d.station),
    kvl('Ресурс', d.resource),
    kvl('Требуется', d.required + ' т'),
    kvl('До планеты', fmtDur(d.travelSmall)),
    kvl('До станции', fmtDur(d.travelLarge)),
    h('div', { style:{ marginTop:'10px', color:'var(--red)', fontSize:'12px' } },
      'Причина: нехватка ресурса на принимающей станции.'),
    h('div', { style:{ marginTop:'8px', color:'var(--dim)', fontSize:'11px', fontStyle:'italic' } },
      'Запросов было три. Ответа не было ни на один.')));
  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick:() => {
      G.scene = 'background'; render();
    }}, 'ПРИНЯТЬ НАЗНАЧЕНИЕ')));
}

/* ============================================================
   SCENE · BACKGROUND
   ============================================================ */
function sceneBackground(root){
  root.appendChild(h('h2', { class:'title' }, 'ПРЕДЫСТОРИЯ'));
  root.appendChild(h('p', { class:'subtitle' },
    'Кем вы были до назначения? Планета уже определена.'));

  const grid = h('div', { class:'bg-grid' });
  for(const key in BACKGROUNDS){
    const bg = BACKGROUNDS[key];
    const sel = G.player && G.player.background === key;
    grid.appendChild(h('div', {
      class:'bg-card' + (sel ? ' sel' : ''),
      onclick:() => selectBackground(key)
    },
      h('h4', {}, bg.name),
      ...bg.good.map(g => h('div', { class:'good' }, '+ ' + g)),
      ...bg.bad.map(b => h('div', { class:'bad' }, '− ' + b)),
      h('div', { class:'hint' }, bg.path ? 'Скрыто: ' + PATHS[bg.path].s : 'Чистый старт')));
  }
  root.appendChild(grid);

  if(G.player && G.player.background){
    const actions = h('div', { class:'actions' },
      h('button', { class:'btn primary', onclick: buildPackage }, 'ПОСМОТРЕТЬ СТАРТОВЫЙ ПАКЕТ'),
      h('button', { class:'btn', onclick:() => {
        G.player.background = null; render();
      }}, 'СБРОСИТЬ ВЫБОР'));
    root.appendChild(actions);
  }
}

function selectBackground(key){
  if(!G.player){
    G.player = {
      name:'', background:null, access:'medium',
      stats:{ str:5, int:5, cha:5, end:5 },
      state:{ fatigue:20, stress:15, hunger:30, hp:10, maxHp:10, sleepDebt:30, sleepQuality:null },
      pathologies:[], contacts:[], prayerBonus:0,
      stressPenalty:false,
    };
  }
  G.player.background = key;
  G.player.name = BACKGROUNDS[key].name;
  render();
}

function buildPackage(){
  const bg = BACKGROUNDS[G.player.background];
  G.assets.money = bg.money;
  G.player.access = bg.access;
  G.assets.inventory = bg.items.map(makeItem);
  G.player.pathologies = [];
  if(bg.path){
    const p = PATHS[bg.path];
    G.player.pathologies.push({
      id:bg.path, name:p.n, symptom:p.s, source:p.src,
      discovered:false, treated:false,
    });
  }
  G.scene = 'package';
  render();
}

/* ============================================================
   SCENE · PACKAGE
   ============================================================ */
function scenePackage(root){
  const p = G.player, bg = BACKGROUNDS[p.background];
  root.appendChild(h('h2', { class:'title' }, 'СТАРТОВЫЙ ПАКЕТ'));
  root.appendChild(h('p', { class:'subtitle' }, 'Всё, что у вас есть.'));

  root.appendChild(h('div', { class:'pkg' },
    h('h4', {}, 'ПРЕДЫСТОРИЯ'),
    h('div', { class:'pkg-item' }, bg.name)));
  root.appendChild(h('div', { class:'pkg' },
    h('h4', {}, 'РЕСУРСЫ'),
    h('div', { class:'pkg-item' }, 'Кредиты: ₡' + G.assets.money),
    h('div', { class:'pkg-item' }, 'Доступ: ' + p.access)));
  root.appendChild(h('div', { class:'pkg' },
    h('h4', {}, 'ПРЕДМЕТЫ'),
    ...G.assets.inventory.map(it =>
      h('div', { class:'pkg-item' }, it.icon + ' ' + it.name + ' — ' + (it.desc || '')))));
  if(p.pathologies.length){
    root.appendChild(h('div', { class:'pkg' },
      h('h4', {}, 'СКРЫТЫЕ ПАТОЛОГИИ'),
      ...p.pathologies.map(pa => h('div', { class:'pkg-item hidden' }, '? ' + pa.symptom))));
  }

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn', onclick:() => {
      G.player.background = null;
      G.assets.money = 0;
      G.assets.inventory = [];
      G.player.pathologies = [];
      G.scene = 'background'; render();
    }}, '← ИЗМЕНИТЬ ПРЕДЫСТОРИЮ'),
    h('button', { class:'btn primary', onclick: boardSmallShip }, 'ОТПРАВИТЬСЯ')));
}

function boardSmallShip(){
  G.area = 'small_ship';
  G.location = 'common';
  G.prologue.part = 'small_ship';
  G.prologue.smallBoardedAt = G.time;

  if(G.npcs[G.assistantId]){
    G.npcs[G.assistantId].location = 'common';
  }

  G.scene = 'area';

  log('Погрузка на малый корабль.', 'info');
  log('Корабль отходит от причала. Никто не машет вслед.', 'ambient');

  render();
}

/* ============================================================
   SCENE · AREA · с секциями
   ============================================================ */
function sceneArea(root){
  const area = AREAS[G.area];
  const loc = area.locs[G.location];
  if(!area || !loc){ root.textContent = 'ошибка локации'; return; }

  root.appendChild(h('h2', { class:'title' }, area.title + ' · ' + loc.n));
  root.appendChild(h('p', { class:'subtitle' }, loc.d || ''));

  /* §13.4 · Атмосфера станции */
  if(G.area === 'station' && typeof atmosphereLine === 'function'){
    const atmo = atmosphereLine();
    if(atmo){
      root.appendChild(h('div', {
        class:'hint',
        style:{ marginTop:'-8px', marginBottom:'12px' }
      }, atmo));
    }
  }

  /* §5 · Тащим тело — баннер */
  if(G.flags.carryingBody){
    const body = G.npcs[G.flags.carryingBody];
    if(body){
      root.appendChild(h('div', { class:'notice' },
        h('div', {}, '🪢 Вы тащите: ' + body.name + '.'),
        h('div', { class:'hint', style:{ marginTop:'4px' } },
          'СИЛ влияет на скорость, ВЫН — на усталость.'),
        h('div', { class:'actions', style:{ marginTop:'8px' } },
          h('button', { class:'btn', onclick:() => dropCarriedBody('manual') },
            'Положить здесь'))));
    }
  }

  
  /* §3.4.5 · Инцидент на площадке погрузки */
  if(G.area === 'planet' && G.location === 'dock_area'){
    const L = G.prologue.loadingBg;
    if(L && L.pendingIncident && !L.pendingIncident.resolved){
      root.appendChild(h('div', { class:'notice bad' },
        h('div', {}, '⚠ Инцидент на площадке погрузки.'),
        h('div', { class:'actions', style:{ marginTop:'8px' } },
          h('button', { class:'btn primary', onclick:() => {
            if(typeof openLoadingIncidentModal === 'function'){
              openLoadingIncidentModal(L.pendingIncident.type);
            }
          }}, 'РЕШИТЬ ИНЦИДЕНТ'))));
    }
  }

  const deadHere = Object.values(G.npcs).filter(n =>
    n.area === G.area && n.location === G.location &&
    n.state === 'dead' && !n.bodyHidden);
  if(deadHere.length){
    root.appendChild(h('div', { class:'notice bad' },
      h('div', {}, '⚠ На полу тело. ' + deadHere.map(n => n.name).join(', ') + '.'),
      h('div', { class:'hint', style:{ marginTop:'4px' } },
        'Кто-нибудь найдёт. Рано или поздно.')));
  }

  /* Секции */
  const sections = {
    quest:   [],
    doors:   [],
    npcs:    [],
    objects: [],
    actions: [],
  };

  /* Проходы */
  for(const ex of loc.ex){
    const tgt = area.locs[ex];
    if(!tgt) continue;
    sections.doors.push(h('div', {
      class:'tile door' + (tgt.restrict ? ' locked' : ''),
      onclick:() => moveTo(ex)
    },
      h('span', { class:'ico' }, tgt.restrict ? '🔒' : '🚪'),
      h('div', { class:'body' },
        h('div', { class:'name' }, tgt.n),
        h('div', { class:'sub' }, tgt.restrict ? 'ограниченный доступ' : 'проход'))));
  }

  /* Люди */
  for(const npc of Object.values(G.npcs)){
    if(npc.area !== G.area || npc.location !== G.location) continue;
    if(npc.following && npc.isHelper) continue;

    let ico = '👤', sub = roleF(npc), cls = '';
    if(npc.state === 'dead'){ ico = '💀'; sub = 'мёртв'; cls = ' down'; }
    else if(npc.state === 'unconscious'){ ico = '😵'; sub = 'без сознания'; cls = ' down'; }
    else if(npc.sleeping){ ico = '😴'; sub = roleF(npc) + ' · спит'; cls = ' sleeping'; }
    else if(npc.hp < npc.maxHp){ ico = '🤕'; sub = roleF(npc) + ' · HP ' + npc.hp + '/' + npc.maxHp; }

    sections.npcs.push(h('div', {
      class:'tile npc' + cls,
      onclick:() => openNpcMenu(npc.id)
    },
      h('span', { class:'ico' }, ico),
      h('div', { class:'body' },
        h('div', { class:'name' }, npc.name + (npc.id === G.assistantId ? ' ★' : '')),
        h('div', { class:'sub' }, sub))));
  }

  /* Объекты */
  const has = loc.has || [];
  if(has.includes('crate'))        sections.objects.push(tileTerm('📦', 'Ящик', 'закрыт', () => inspectObject('crate')));
  if(has.includes('terminal'))     sections.objects.push(tileTerm('🖥', 'Терминал', 'маршрут · груз', () => inspectObject('terminal')));
  if(has.includes('medscanner'))   sections.objects.push(tileTerm('⚕', 'Медсканнер', 'диагностика · лечение', () => inspectObject('medscanner')));
  if(has.includes('buy_sedative')) sections.objects.push(tileTerm('💉', 'Снотворное', '40₡', () => inspectObject('sedative_shop')));
  if(has.includes('buy_ammo'))     sections.objects.push(tileAction('🔩', 'Патроны', '100₡ · 12 штук', openBuyAmmo));

  if(has.includes('cargo_hold')){
    const L = G.prologue.loadingBg;
    const smuggled = L ? (L.smuggledTons || 0) : 0;
    const hasContraband = smuggled > 0;
    if(hasContraband){
      sections.objects.push(h('div', {
        class:'tile item',
        style:{ borderColor:'var(--red)' },
        onclick:() => inspectObject('cargo_hold')
      },
        h('span', { class:'ico' }, '📦'),
        h('div', { class:'body' },
          h('div', { class:'name', style:{ color:'var(--red)' } }, 'Трюм'),
          h('div', { class:'sub' }, '⚠ не по накладной: ' + smuggled.toFixed(1) + ' т'))));
    } else if(L && L.missionLoaded){
      sections.objects.push(tileTerm('📦', 'Трюм', 'всё по накладной', () => inspectObject('cargo_hold')));
    }
  }

  /* Действия */
  if(has.includes('leisure'))      sections.actions.push(tileAction('🎯', 'Досуг', 'чем-то заняться', openLeisure));
  if(has.includes('cabin_rest'))   sections.actions.push(tileAction('🛏', 'Отдохнуть', 'побыть одному', openCabinRest));
  if(has.includes('eat'))          sections.actions.push(tileAction('🍞', 'Поесть', 'что дают', openEat));
  if(has.includes('buy_alcohol'))  sections.actions.push(tileAction('🍶', 'Выпить', '20₡ · стресс вниз', openBuyAlcohol));
  if(has.includes('pray'))         sections.actions.push(tileAction('🙏', 'Помолиться', 'как умеешь', openPray));
  if(has.includes('hide'))         sections.actions.push(tileAction('🚪', 'Уединиться', 'закрытая дверь', openHide));
  if(has.includes('eavesdrop'))    sections.actions.push(tileAction('👂', 'Подслушать', 'через стенку', openEavesdrop));

  /* По заданию */
  if(has.includes('exam_start')){
    if(G.prologue.examPassed){
      sections.quest.push(tileAction('✓', 'Экзамен сдан', 'допуск получен', null));
    } else {
      sections.quest.push(tileTerm('📝', 'Экзамен', '3 этапа', beginExam));
    }
  }
  if(has.includes('start_loading')){
    if(!G.prologue.examPassed){
      sections.quest.push(tileLocked('⚙', 'Погрузка', 'нужен допуск'));
    } else if(!G.prologue.missionLoaded){
      const L = G.prologue.loadingBg;
      const label = L && L.active ? 'погрузка ' + Math.floor(L.progress) + '%' : 'начать';
      sections.quest.push(tileTerm('⚙', 'Площадка погрузки', label, () => {
        if(!G.prologue.loadingBg){
          G.scene = 'loading_setup';
        } else {
          G.scene = 'loading';
        }
        render();
      }));
    } else {
      sections.quest.push(tileAction('✓', 'Погрузка завершена', 'можно дальше', null));
    }
  }
  if(has.includes('board_large')){
    if(!G.prologue.missionLoaded){
      sections.quest.push(tileLocked('🚀', 'Большой корабль', 'нужна погрузка'));
    } else {
      sections.quest.push(tileAction('🚀', 'Большой корабль', 'подняться', boardLargeShip));
    }
  }
  if(has.includes('unload')){
    sections.quest.push(tileTerm('🚚', 'Разгрузить', 'сдать груз', finishPrologue));
  }

  /* Рендер секций */
  const titles = {
    quest:   'По заданию',
    doors:   'Проходы',
    npcs:    'Люди',
    objects: 'Объекты',
    actions: 'Действия',
  };
  for(const key of ['quest','doors','npcs','objects','actions']){
    const list = sections[key];
    if(!list.length) continue;
    root.appendChild(h('div', { class:'scene-section' },
      h('div', { class:'scene-section-title' },
        titles[key],
        h('span', { class:'count' }, ' · ' + list.length)),
      h('div', { class:'grid' }, ...list)));
  }

  addCompanionPanel(root);

  const actions = h('div', { class:'actions' },
    h('button', { class:'btn', onclick:() => { adv(10, null); } }, '+10 мин'),
    h('button', { class:'btn', onclick:() => { adv(60, null); } }, '+1 час')
  );
  root.appendChild(actions);
}

function tileTerm(ico, name, sub, fn){
  return h('div', { class:'tile term', onclick: fn || null },
    h('span', { class:'ico' }, ico),
    h('div', { class:'body' },
      h('div', { class:'name' }, name),
      h('div', { class:'sub' }, sub)));
}
function tileAction(ico, name, sub, fn){
  return h('div', { class:'tile item', onclick: fn || null },
    h('span', { class:'ico' }, ico),
    h('div', { class:'body' },
      h('div', { class:'name' }, name),
      h('div', { class:'sub' }, sub)));
}
function tileLocked(ico, name, sub){
  return h('div', { class:'tile locked' },
    h('span', { class:'ico' }, ico),
    h('div', { class:'body' },
      h('div', { class:'name' }, name),
      h('div', { class:'sub' }, sub)));
}

function addCompanionPanel(root){
  const comp = Object.values(G.npcs).find(n =>
    n.isHelper && n.following && n.area === G.area && n.state === 'alive');
  if(!comp) return;
  root.appendChild(h('div', { class:'companion-panel' },
    h('div', { class:'companion-head' },
      h('span', { class:'sandbox-kicker' }, 'КОМПАНЬОН'),
      h('b', {}, comp.name)),
    h('div', { class:'hint' },
      'Режим: ' + (comp.companionMode || '—') + '. ' +
      heShe(comp) + ' остаётся автономным человеком.'),
    h('div', { class:'companion-actions' },
      h('button', { class:'btn mini', onclick:() => openCompanionWork(comp) }, 'Поручить работу'),
      h('button', { class:'btn mini', onclick:() => startDialogue(comp.id) }, 'Изменить режим'))));
}

/* ============================================================
   §10.21 · НАБЛЮДЕНИЯ · правая колонка
   ============================================================ */
function addLocalObservations(root){
  const col = document.getElementById('observations');
  if(!col) return;
  col.innerHTML = '';

  if(!G || !G.npcs || !G.area) return;

  const here = Object.values(G.npcs).filter(n =>
    n.area === G.area && n.location === G.location && n.state === 'alive');
  const notes = [];
  for(const npc of here){
    let note = null;
    if(npc.isHiddenKiller && npc.hiddenIntent && npc.hiddenIntent.active){
      const hi = npc.hiddenIntent;
      const target = G.npcs[hi.targetId];
      const tName = target ? target.name : '?';
      if(hi.stage === 'observing'){
        note = npc.publicBehavior || 'улыбается всем, напевает. Слишком радостно.';
      } else if(hi.stage === 'stalking'){
        note = 'слишком часто оказывается рядом с ' + tName + '. Слишком часто.';
      } else if(hi.stage === 'opportunity'){
        note = 'говорит с ' + tName + ' особенно тепло. Не по-настоящему.';
      } else if(hi.stage === 'attempt'){
        note = '⚠ смотрит на ' + tName + ' слишком долго. Что-то готовит.';
      } else {
        note = npc.publicBehavior || 'улыбается всем.';
      }
    } else if(npc.isHiddenKiller && npc.cheerful){
      note = npc.publicBehavior || 'улыбается всем, напевает. Слишком радостно.';
    } else if(npc.id === 'navigator_psyker' && !npc.navigationDiscovered){
      if(G.area === 'planet' && ['dock_area','arrival_terminal','transport_hub'].includes(G.location))
        note = 'следит за маршрутными табло. Слишком внимательно.';
      else if(G.area === 'large_ship' && ['corridor','tech_zone'].includes(G.location))
        note = 'слишком быстро реагирует на упоминание дальнего перехода.';
      else note = 'держится отдельно от остальных.';
    } else if(npc.formerFriend && npc.memoryState === 'fragmented'){
      note = 'иногда смотрит на тебя так, будто пытается вспомнить что-то важное.';
    } else if(npc.id === G.assistantId && npc.isSocialGuide){
      note = 'внимательно смотрит на людей и их манеру общаться.';
    } else if(npc.id === 'overseer' && !npc.isSubstitute){
      note = 'смотрит на руки, не в глаза. Всегда занят.';
    } else if(npc.wounds && npc.wounds.length && npc.state === 'alive'){
      note = 'держит руку на ушибленном месте. Заметно.';
    }
    if(!note) continue;
    notes.push({ npc, note });
  }

  if(!notes.length) return;

  col.appendChild(h('div', { class:'obs-title' }, 'НАБЛЮДЕНИЯ'));
  for(const { npc, note } of notes){
    col.appendChild(h('div', { class:'obs-card' },
      h('div', { class:'obs-name' }, npc.name + ' · ' + roleF(npc)),
      h('div', { class:'obs-note' }, note)));
  }
}

/* ============================================================
   §3.4 · ИНИЦИАЛИЗАЦИЯ ПОГРУЗКИ
   ============================================================ */
function initLoadingBg(){
  if(G.prologue.loadingBg) return;
  G.prologue.loadingBg = {
    active: true,
    phase: 'active',
    progress: 0,

    plan: {
      missionResource: G.destination.resource,
      missionRequired: G.destination.required,
      missionTarget: G.destination.required,
      extraResource: null,
      extraTarget: 0,
      capacity: G.rng.int(55, 70),
    },

    currentTons: 0,
    extraTons: 0,
    smuggledTons: 0,

    rate: 0,
    startedAt: G.time,
    nextIncidentAt: G.time + G.rng.int(90, 180),
    incidentShown: false,
    pendingIncident: null,
    incidentAutoResolveAt: 0,

    servitors: {
      'Сервитор ?01': { priority:['mission','extra'], condition:82, task:null, lastAction:'простаивает' },
      'Сервитор ?02': { priority:['extra','mission'], condition:64, task:null, lastAction:'простаивает' },
      'Сервитор ?03': { priority:['mission'],          condition:91, task:null, lastAction:'простаивает' },
    },
    equipment: {
      crane:  { name:'Кран №01',      condition:88, broken:false },
      loader: { name:'Погрузчик №03', condition:71, broken:false },
    },
    crew: [
      { id:'w1', name:'Бригадир Северин', fatigue:15, skill:7, working:true },
      { id:'w2', name:'Рабочий Гай',      fatigue:20, skill:5, working:true },
      { id:'w3', name:'Рабочий Ромул',    fatigue:25, skill:4, working:true },
      { id:'w4', name:'Рабочий Клавд',    fatigue:30, skill:3, working:true },
    ],
  };
  log('Площадка развёрнута: 3 сервитора, 4 рабочих, кран, погрузчик.', 'action');
}

/* ============================================================
   §3.4.4 · СЦЕНА ПЛАНА ПОГРУЗКИ
   ============================================================ */
function sceneLoadingSetup(root){
  const d = G.destination;
  const r = G.rng;

  if(!G.flags.loadingDraft){
    G.flags.loadingDraft = {
      capacity: r.int(55, 70),
      missionTarget: d.required,
      extraResource: null,
      extraTarget: 0,
    };
  }
  const draft = G.flags.loadingDraft;

  root.appendChild(h('h2', { class:'title' }, 'ПЛАН ПОГРУЗКИ'));
  root.appendChild(h('p', { class:'subtitle' },
    'Ты решаешь, что везти. Смотритель требует своё. Всё остальное — твоя ответственность.'));

  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp' }, 'ТРЕБОВАНИЕ СМОТРИТЕЛЯ'),
    kvl('Ресурс', d.resource),
    kvl('Обязательно', d.required + ' т'),
    kvl('Вместимость корабля', draft.capacity + ' т'),
    h('div', { style:{ marginTop:'8px', color:'var(--muted)', fontSize:'11px' } },
      'Если привезёшь меньше — штраф. Больше — твоя проблема, но и твоя выгода.')));

  root.appendChild(h('div', { class:'exam-sum', style:{ marginTop:'14px' } },
    h('div', { style:{ color:'var(--cyan)', marginBottom:'6px' } }, 'ОСНОВНОЙ РЕСУРС · ' + d.resource),
    h('div', { class:'hint' }, 'Минимум ' + d.required + ' т. Максимум ' + draft.capacity + ' т.'),
    h('div', { class:'prow', style:{ marginTop:'10px' } },
      h('div', {}, 'Грузим:'),
      h('div', { class:'bar' },
        h('i', { style:{ width:(draft.missionTarget / draft.capacity * 100) + '%', background:'var(--green)' } })),
      h('div', {}, draft.missionTarget + ' т')),
    h('div', { class:'actions', style:{ marginTop:'8px' } },
      h('button', { class:'btn mini', onclick:() => {
        draft.missionTarget = Math.max(d.required, draft.missionTarget - 5);
        if(draft.extraTarget + draft.missionTarget > draft.capacity){
          draft.extraTarget = Math.max(0, draft.capacity - draft.missionTarget);
        }
        render();
      }}, '−5 т'),
      h('button', { class:'btn mini', onclick:() => {
        draft.missionTarget = Math.max(d.required, draft.missionTarget - 1);
        if(draft.extraTarget + draft.missionTarget > draft.capacity){
          draft.extraTarget = Math.max(0, draft.capacity - draft.missionTarget);
        }
        render();
      }}, '−1'),
      h('button', { class:'btn mini primary', onclick:() => {
        draft.missionTarget = Math.min(draft.capacity, draft.missionTarget + 1);
        render();
      }}, '+1'),
      h('button', { class:'btn mini primary', onclick:() => {
        draft.missionTarget = Math.min(draft.capacity, draft.missionTarget + 5);
        render();
      }}, '+5 т'))));

  const extraRes = ['Продовольствие','Вода','Топливо','Металлы','Медикаменты']
    .filter(x => x !== d.resource);

  root.appendChild(h('div', { class:'exam-sum', style:{ marginTop:'14px' } },
    h('div', { style:{ color:'var(--cyan)', marginBottom:'6px' } }, 'ДОПОЛНИТЕЛЬНЫЙ ГРУЗ'),
    h('div', { class:'hint' }, 'Опционально. Продаётся на станции как есть.')));

  const resRow = h('div', { style:{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'8px' } });
  for(const res of extraRes){
    const sel = draft.extraResource === res;
    resRow.appendChild(h('button', {
      class:'btn mini' + (sel ? ' primary' : ''),
      onclick:() => {
        draft.extraResource = sel ? null : res;
        if(!draft.extraResource) draft.extraTarget = 0;
        render();
      }
    }, res));
  }
  root.appendChild(resRow);

  if(draft.extraResource){
    const maxExtra = draft.capacity - draft.missionTarget;
    root.appendChild(h('div', { class:'prow', style:{ marginTop:'10px' } },
      h('div', {}, draft.extraResource + ':'),
      h('div', { class:'bar' },
        h('i', { style:{ width:(draft.extraTarget / Math.max(1, maxExtra) * 100) + '%', background:'var(--amber)' } })),
      h('div', {}, draft.extraTarget + ' / ' + maxExtra + ' т')));
    root.appendChild(h('div', { class:'actions', style:{ marginTop:'8px' } },
      h('button', { class:'btn mini', onclick:() => {
        draft.extraTarget = Math.max(0, draft.extraTarget - 5); render();
      }}, '−5 т'),
      h('button', { class:'btn mini', onclick:() => {
        draft.extraTarget = Math.max(0, draft.extraTarget - 1); render();
      }}, '−1'),
      h('button', { class:'btn mini primary', onclick:() => {
        draft.extraTarget = Math.min(maxExtra, draft.extraTarget + 1); render();
      }}, '+1'),
      h('button', { class:'btn mini primary', onclick:() => {
        draft.extraTarget = Math.min(maxExtra, draft.extraTarget + 5); render();
      }}, '+5 т')));
  }

  const totalPlan = draft.missionTarget + draft.extraTarget;
  const free = draft.capacity - totalPlan;

  root.appendChild(h('div', { class:'card', style:{ marginTop:'14px' } },
    h('div', { class:'stamp' }, 'ИТОГО'),
    kvl('Основной', draft.missionTarget + ' т ' + d.resource),
    kvl('Дополнительный', draft.extraTarget + ' т' + (draft.extraResource ? ' ' + draft.extraResource : '')),
    kvl('Свободно', free + ' т'),
    h('div', { style:{ marginTop:'8px', color:'var(--muted)', fontSize:'11px' } },
      'Свободное место — риск. Оборудование и сервиторы не всегда делают только то, что им говорят.')));

  const actions = h('div', { class:'actions' });
  if(draft.missionTarget < d.required){
    actions.appendChild(h('button', { class:'btn danger', disabled:true },
      'МИССИЯ НЕ ВЫПОЛНИМА: ' + draft.missionTarget + ' из ' + d.required));
  } else {
    actions.appendChild(h('button', { class:'btn primary', onclick:() => {
      G.prologue.loadingBg = null;
      initLoadingBg();
      const L = G.prologue.loadingBg;
      L.plan.missionTarget = draft.missionTarget;
      L.plan.extraResource = draft.extraResource;
      L.plan.extraTarget = draft.extraTarget;
      L.plan.capacity = draft.capacity;
      delete G.flags.loadingDraft;
      G.scene = 'loading';
      log('План утверждён. Погрузка начинается.', 'action');
      render();
    }}, 'НАЧАТЬ ПОГРУЗКУ'));
  }
  actions.appendChild(h('button', { class:'btn', onclick:() => {
    G.scene = 'area';
    render();
  }}, 'ВЕРНУТЬСЯ В ДОК'));
  root.appendChild(actions);
}

/* ============================================================
   §3.4 · СЦЕНА ПОГРУЗКИ
   ============================================================ */
function sceneLoading(root){
  const L = G.prologue.loadingBg;
  root.appendChild(h('h2', { class:'title' }, 'ДОК · ПЛОЩАДКА ПОГРУЗКИ'));

  if(!L){
    root.appendChild(h('p', { class:'subtitle' }, 'Погрузка не начиналась.'));
    root.appendChild(h('div', { class:'actions' },
      h('button', { class:'btn primary', onclick:() => {
        G.scene = 'loading_setup';
        render();
      }}, 'СОСТАВИТЬ ПЛАН')));
    return;
  }

  if(!L.active){
    root.appendChild(h('p', { class:'subtitle' }, 'Погрузка завершена.'));
    root.appendChild(h('div', { class:'exam-sum' },
      h('div', {}, 'Поставка: ' + L.currentTons.toFixed(1) + ' / ' + L.plan.missionTarget + ' т'),
      L.plan.extraResource ? h('div', {}, L.plan.extraResource + ': ' + L.extraTons.toFixed(1) + ' / ' + L.plan.extraTarget + ' т') : null,
      L.smuggledTons > 0 ? h('div', { style:{ color:'var(--red)' } },
        'Не по накладной: ' + L.smuggledTons.toFixed(1) + ' т') : null));
    root.appendChild(h('div', { class:'actions' },
      h('button', { class:'btn primary', onclick:() => { G.scene = 'area'; render(); } }, 'Вернуться в док')));
    return;
  }

  const plan = L.plan || {};
  root.appendChild(h('p', { class:'subtitle' },
    'Погрузка идёт. Можно уйти — процесс не остановится.'));

  root.appendChild(h('div', { style:{ marginBottom:'12px' } },
    h('div', { style:{ color:'var(--cyan)', fontSize:'11px', letterSpacing:'2px', marginBottom:'6px' } },
      'ПЛАН'),
    h('div', { class:'pda-row' },
      h('span', { class:'k' }, 'Основной'),
      h('span', { class:'v' }, L.currentTons.toFixed(1) + ' / ' + (plan.missionTarget || 0) + ' т')),
    plan.extraResource ? h('div', { class:'pda-row' },
      h('span', { class:'k' }, plan.extraResource),
      h('span', { class:'v' }, L.extraTons.toFixed(1) + ' / ' + plan.extraTarget + ' т')) : null,
    L.smuggledTons > 0 ? h('div', { class:'pda-row', style:{ color:'var(--red)' } },
      h('span', { class:'k' }, '⚠ Не по накладной'),
      h('span', { class:'v' }, L.smuggledTons.toFixed(1) + ' т')) : null));

  root.appendChild(h('div', { class:'exam-sum' },
    h('div', { class:'prow' },
      h('div', {}, 'Основной'),
      h('div', { class:'bar' },
        h('i', { style:{ width:(L.currentTons / Math.max(1, plan.missionTarget) * 100) + '%', background:'var(--green)' } })),
      h('div', {}, L.currentTons.toFixed(1) + '/' + plan.missionTarget + ' т')),
    plan.extraResource ? h('div', { class:'prow' },
      h('div', {}, plan.extraResource),
      h('div', { class:'bar' },
        h('i', { style:{ width:(L.extraTons / Math.max(1, plan.extraTarget) * 100) + '%', background:'var(--amber)' } })),
      h('div', {}, L.extraTons.toFixed(1) + '/' + plan.extraTarget + ' т')) : null,
    h('div', { style:{ marginTop:'8px', fontSize:'11px', color:'var(--muted)' } },
      'Скорость: ' + (L.rate * 6).toFixed(1) + ' т/час. Прогресс: ' + L.progress.toFixed(0) + '%.')));

  root.appendChild(h('h3', {
    style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'6px', fontSize:'12px' }
  }, 'СЕРВИТОРЫ'));
  for(const sid in L.servitors){
    const s = L.servitors[sid];
    root.appendChild(h('div', { class:'method' },
      h('div', { style:{ flex:'1' } },
        h('div', {}, sid + ' · ' + s.lastAction),
        h('div', { style:{ fontSize:'10px', color:'var(--dim)' } },
          'Состояние: ' + Math.round(s.condition) + '% · приоритет: ' + s.priority.join(' > '))),
      s.condition > 0 ? h('button', { class:'btn mini', onclick:() => {
        s.priority.push(s.priority.shift());
        log(sid + ': приоритеты переставлены.', 'info');
        render();
      }}, 'Переставить') : null));
  }

  root.appendChild(h('h3', {
    style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'6px', fontSize:'12px' }
  }, 'ОБОРУДОВАНИЕ'));
  for(const eid in L.equipment){
    const eq = L.equipment[eid];
    root.appendChild(h('div', { class:'method' + (eq.broken ? ' dis' : '') },
      h('div', { style:{ flex:'1' } },
        h('div', {}, eq.name + (eq.broken ? ' — СЛОМАН' : ' — работает')),
        h('div', { style:{ fontSize:'10px', color:'var(--dim)' } },
          'Состояние: ' + Math.round(eq.condition) + '%'))));
  }

  root.appendChild(h('h3', {
    style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'6px', fontSize:'12px' }
  }, 'БРИГАДА'));
  for(const c of L.crew){
    root.appendChild(h('div', { class:'method' },
      h('div', { style:{ flex:'1' } },
        h('div', {}, c.name),
        h('div', { style:{ fontSize:'10px', color:'var(--dim)' } },
          'Усталость: ' + Math.round(c.fatigue) + ' · навык ' + c.skill)),
      c.working
        ? h('button', { class:'btn mini', onclick:() => {
            c.working = false;
            log(c.name + ' ушёл на перерыв.', 'warn');
            render();
          }}, 'Перерыв')
        : h('button', { class:'btn mini primary', onclick:() => {
            c.working = true;
            log(c.name + ' вернулся на смену.', 'info');
            render();
          }}, 'На смену')));
  }

  if(L.pendingIncident && !L.pendingIncident.resolved){
    root.appendChild(h('div', { class:'notice bad' },
      h('div', {}, '⚠ Инцидент требует решения.'),
      h('div', { class:'actions', style:{ marginTop:'8px' } },
        h('button', { class:'btn primary', onclick:() => {
          if(typeof openLoadingIncidentModal === 'function'){
            openLoadingIncidentModal(L.pendingIncident.type);
          }
        }}, 'РЕШИТЬ ИНЦИДЕНТ'))));
  }

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn', onclick:() => adv(10, 'Наблюдали за погрузкой.', 'info') }, 'Ждать 10 мин'),
    h('button', { class:'btn', onclick:() => adv(60, 'Прошёл час.', 'info') }, 'Ждать 1 час'),
    h('button', { class:'btn primary', onclick:() => { G.scene = 'area'; render(); } }, 'Вернуться в док')));
}

/* ============================================================
   SCENE · ARRIVAL PLANET
   ============================================================ */
function sceneArrivalPlanet(root){
  const d = G.destination;
  root.appendChild(h('div', { class:'title-scr' },
    h('h1', { style:{ fontSize:'24px', letterSpacing:'4px' } }, 'ПЛАНЕТА · ' + d.planet),
    h('div', { class:'sub' }, 'Корабль вышел на орбиту. Док ждёт.'),
    h('div', { class:'flavor' },
      h('div', {}, 'Толчок сброса. Гул двигателей стих.'),
      h('div', {}, 'Сквозь обшивку слышно, как работает планета: гул атмосферы, дальние сирены, шаги на площадке.'),
      h('div', {}, 'Погода: ' + G.weather + '.')),
    h('button', { class:'btn primary', onclick:() => {
      if(checkOverseerArrestOnTransition('arrival_planet')) return;
      if(G.flags.carryingBody) dropCarriedBody('left');
      G.area = 'planet';
      G.location = 'landing_pad';
      G.prologue.part = 'planet';
      const helper = G.npcs[G.assistantId];
      if(helper && helper.state === 'alive'){
        helper.area = 'planet';
        helper.location = 'arrival_terminal';
      }
      G.scene = 'area';
      log('Вы вышли на площадку ' + G.destination.planet + '.', 'good');
      render();
    }}, 'ВЫЙТИ НА ПЛОЩАДКУ')));
}

/* ============================================================
   SCENE · ARRIVAL SHIP
   ============================================================ */
function sceneArrivalShip(root){
  root.appendChild(h('div', { class:'title-scr' },
    h('h1', { style:{ fontSize:'24px', letterSpacing:'4px' } }, 'СТАНЦИЯ · НА ПОДХОДЕ'),
    h('div', { class:'sub' }, 'Связь с замом.'),
    h('div', { class:'flavor' },
      h('div', {}, 'За иллюминатором — глыба станции.'),
      h('div', {}, 'Стыковка займёт минут двадцать. Потом — приёмка.')),
    h('button', { class:'btn primary', onclick:() => {
      G.scene = 'approach'; render();
    }}, 'СВЯЗАТЬСЯ С ЗАМОМ')));
}

/* ============================================================
   SCENE · APPROACH
   ============================================================ */
function sceneApproach(root){
  root.appendChild(h('h2', { class:'title' }, 'СВЯЗЬ С ЗАМОМ'));
  root.appendChild(h('p', { class:'subtitle' }, 'Входящий вызов.'));
  const d = G.destination;
  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp' }, 'ЗАМ · КАНАЛ СВЯЗИ'),
    h('div', {}, '«Наконец-то. ' + d.resource + ' ждут. Разгружай немедленно.»'),
    h('div', { style:{ marginTop:'10px', color:'var(--dim)', fontSize:'11px', fontStyle:'italic' } },
      'Он не сказал «спасибо». Здесь не говорят «спасибо».')));
  const L = G.prologue.loadingBg;
  const loaded = L ? L.currentTons : 0;
  const extra = L ? (L.extraTons || 0) : 0;
  const extraResource = L && L.plan ? L.plan.extraResource : null;
  root.appendChild(h('div', { class:'notice' },
    h('div', {}, 'Станция: ' + d.station),
    h('div', {}, 'Везём: ' + loaded.toFixed(1) + ' т' +
      (extra > 0 && extraResource ? ' + ' + extra.toFixed(1) + ' т ' + extraResource : '')),
    h('div', {}, 'Тревога: ' + G.station.alert)));
  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick:() => {
      if(checkOverseerArrestOnTransition('approach')) return;
      if(G.flags.carryingBody) dropCarriedBody('left');
      G.area = 'station';
      G.location = 'dock_arrival';
      G.prologue.part = 'station';
      G.scene = 'station_arrival';
      adv(60, 'Прибытие на станцию.', 'info');
      if(typeof startFinal === 'function') startFinal();
      render();
    }}, 'ПРИБЫТЬ')));
}

/* ============================================================
   SCENE · END
   ============================================================ */
function sceneEnd(root){
  root.appendChild(h('h2', { class:'title' }, 'КОНЕЦ ПРОЛОГА'));
  root.appendChild(h('p', { class:'subtitle' }, 'Пролог завершён.'));
  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick: newGame }, 'НОВАЯ ИГРА')));
}

/* ============================================================
   SCENE · DEBUG
   ============================================================ */
function sceneDebug(root){
  root.appendChild(h('h2', { class:'title' }, 'МИР · наблюдатель'));
  root.appendChild(h('p', { class:'subtitle' }, 'Отладочная сцена.'));

  const counts = {};
  for(const n of Object.values(G.npcs)) counts[n.state] = (counts[n.state] || 0) + 1;
  root.appendChild(h('div', { class:'card' },
    kvl('Маршрут', G.destination.system + ' → ' + G.destination.planet + ' → ' + G.destination.station),
    kvl('NPC', Object.keys(G.npcs).length + ' всего · ' + (counts.alive || 0) + ' живых'),
    kvl('Warp', G.warp.exposure + '/' + WARP.SCALE_MAX + ' · ' + warpStage(G.warp.exposure).label),
    kvl('Роль станции', (G.station.role || '—'))));

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick:() => {
      G.scene = 'assignment'; render();
    }}, 'Начать пролог'),
    h('button', { class:'btn', onclick:() => { G.scene = 'title'; render(); } }, '← К титулу')));
}

/* ============================================================
   KV helper
   ============================================================ */
function kvl(k, v){
  return h('div', { class:'kv' },
    h('span', { class:'k' }, k + ':'),
    h('span', { class:'v' }, v));
}

/* ============================================================
   AMMO / SLEEP EVENT
   ============================================================ */
function openBuyAmmo(){
  openModal({ type:'action', title:'Патроны (100₡)', desc:'12 штук.',
    methods:[
      { label:'Купить', time:5, disabled: G.assets.money < 100,
        onClick:() => {
          G.assets.money -= 100;
          G.assets.inventory.push(makeItem('ammo'));
          closeModal();
          adv(5, 'Куплено 12 патронов.', 'good');
        }},
      { label:'Уйти', time:0, onClick: closeModal },
    ]});
}

function renderSleepEvent(box, m){
  mhead(box, m.title || 'Ночное событие');
  const body = h('div', { class:'modal-body' });
  body.appendChild(h('div', { class:'result-box' + (m.warp ? ' warp' : '') }, m.text || ''));
  const list = h('div', { class:'methods', style:{ marginTop:'12px' } });
  (m.options || []).forEach((opt, idx) => {
    list.appendChild(h('div', { class:'method', onclick: opt.fn },
      h('div', { style:{ flex:'1' } },
        h('span', { class:'key' }, String(idx + 1)),
        h('span', { class:'label' }, opt.label))));
  });
  body.appendChild(list);
  box.appendChild(body);
}

/* ============================================================
   §6 · ЗНАКОМСТВО СО СМОТРИТЕЛЕМ
   ============================================================ */
function sceneOverseerMeeting(root){
  const os = G.npcs.overseer;
  if(!os || os.state === 'dead'){
    G.scene = 'area';
    render();
    return;
  }

  G.flags.overseerMet = true;

  const f = os.feature && os.feature.text ? os.feature.text : 'ничего необычного';
  const stage = G.prologue.examPassed
    ? 'Экзамен сдан. Бумаги в порядке.'
    : 'Документы оформлены.';

  root.appendChild(h('h2', { class:'title' }, 'ЗНАКОМСТВО · СМОТРИТЕЛЬ'));
  root.appendChild(h('p', { class:'subtitle' }, 'Administratum. Среднее звено.'));

  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp' }, 'ADMINISTRATUM · ДОК · ' + G.destination.planet),
    h('div', { style:{ marginBottom:'12px' } },
      'Человек в потрёпанной одежде Administratum стоит у стойки. ' +
      'Смотрит на руки, не в глаза. ' +
      'Внешне: ' + f + '.'),
    h('div', { style:{ color:'var(--amber)', fontSize:'13px', marginBottom:'10px' } },
      '«' + stage + ' Я — Смотритель. Имя тебе знать незачем. ' +
      'Работай. Отчитывайся. Не спорь.»'),
    h('div', { style:{ color:'var(--muted)', fontSize:'12px', marginBottom:'10px' } },
      'Он не спрашивает, готов ли ты. Достаёт что-то из внутреннего кармана ' +
      'и кладёт на стойку — маленькая флешка.'),
    h('div', { style:{ color:'var(--cyan)', fontSize:'12px' } },
      '«Это модуль КПК. Звонки. Найдёшь техника — установит. ' +
      'Не потеряй. Он денег стоит.»'),
    h('div', { style:{ marginTop:'12px', color:'var(--dim)', fontSize:'11px', fontStyle:'italic' } },
      'Смотритель не говорит «спасибо». Здесь не говорят «спасибо».')));

  if(G.npcs[G.assistantId] && !G.npcs[G.assistantId].assignedByOverseer){
    G.npcs[G.assistantId].assignedByOverseer = true;
    root.appendChild(h('div', { class:'card', style:{ marginTop:'12px' } },
      h('div', { class:'stamp', style:{ color:'var(--cyan)', borderBottomColor:'#1c3038' } }, 'ПОМОЩНИК'),
      h('div', {}, '«Помощник с тобой. Оформление — его дело. ' +
        'Пусть работает. Не мешай ему.»')));
  }

  root.appendChild(h('div', { class:'card', style:{ marginTop:'12px' } },
    h('div', { class:'stamp', style:{ color:'var(--orange)', borderBottomColor:'#3a2820' } }, 'УСЛОВИЯ'),
    h('div', {}, '· Доставить груз на ' + G.destination.station + '.'),
    h('div', {}, '· ' + G.destination.required + ' т ' + G.destination.resource + '.'),
    h('div', {}, '· Дедлайн уже идёт.'),
    h('div', {}, '· Максимум 24 часа на погрузку. Дальше — штрафы.')));

  if(!G.pda.pendingModule) givePdaModule();

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn', onclick:() => {
      openOverseerIntroQuestions();
    }}, 'ЗАДАТЬ ВОПРОС'),
    h('button', { class:'btn primary', onclick:() => {
      log('Смотритель ушёл, не попрощавшись. Так он и работает.', 'ambient');
      G.scene = 'area';
      G.location = 'arrival_terminal';
      render();
    }}, 'ПРИНЯТЬ')));
}

function openOverseerIntroQuestions(){
  const os = G.npcs.overseer;
  openModal({
    type:'action',
    title:'Вопросы Смотрителю',
    desc:'Он смотрит на руки. Не на тебя.',
    methods:[
      { label:'«Кто ты такой?»', time:2,
        onClick:() => {
          closeModal();
          os.relation -= 1;
          log(os.addressAs + ': «Не твоё дело. Работай.»', 'warn');
          adv(2, null);
          G.scene = 'overseer_meeting';
          render();
        }},
      { label:'«Что с помощником?»', time:2,
        onClick:() => {
          closeModal();
          log(os.addressAs + ': «Он оформляет бумаги. Наблюдает. Работай.»', 'info');
          adv(2, null);
          G.scene = 'overseer_meeting';
          render();
        }},
      { label:'«Что будет, если не успею?»', time:2,
        onClick:() => {
          closeModal();
          log(os.addressAs + ': «Узнаешь. Если не успеешь.»', 'warn');
          adv(2, null);
          G.scene = 'overseer_meeting';
          render();
        }},
      { label:'«Почему ты сам здесь, а не пришлёшь кого-то?»', time:2,
        onClick:() => {
          closeModal();
          log(os.addressAs + ': «Потому что я должен видеть.»', 'info');
          adv(2, null);
          G.scene = 'overseer_meeting';
          render();
        }},
      { label:'Вернуться', time:0,
        onClick:() => {
          closeModal();
          G.scene = 'overseer_meeting';
          render();
        }},
    ]});
}

/* ============================================================
   §3.5 · ПОГРУЗКА НА БОЛЬШОЙ КОРАБЛЬ
   ============================================================ */
function sceneBoardLargeShip(root){
  const d = G.destination;
  root.appendChild(h('h2', { class:'title' }, 'ПОГРУЗКА НА БОРТ'));
  root.appendChild(h('p', { class:'subtitle' }, 'Транспортный узел. Большой корабль.'));

  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp' }, 'ОТХОД'),
    h('div', {}, 'Трап уходит вверх. Погрузчики втягиваются.'),
    h('div', { style:{ marginTop:'8px' } },
      'Внутри — гул систем. Ты больше не на планете.'),
    h('div', { style:{ marginTop:'8px', color:'var(--muted)', fontSize:'12px' } },
      'Пассажиров мало. Экипаж занят своими делами.'),
    h('div', { style:{ marginTop:'10px', color:'var(--cyan)', fontSize:'12px' } },
      '✈ ' + d.system + ' · ' + d.planet + ' → ' + d.station)));

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick:() => {
      if(checkOverseerArrestOnTransition('board_large')) return;
      if(G.flags.carryingBody) dropCarriedBody('left');
      G.area = 'large_ship';
      G.location = 'cabin';
      G.prologue.part = 'large_ship';
      G.prologue.largeBoardedAt = G.time;
      const helper = G.npcs[G.assistantId];
      if(helper && helper.state === 'alive'){
        helper.area = 'large_ship';
        helper.location = 'cabin';
      }
      G.scene = 'area';
      log('Корабль отходит от планеты. Курс: ' + G.destination.station + '.', 'good');
      adv(5, null);
      render();
    }}, 'ВОЙТИ В КАЮТУ')));
}

function boardLargeShip(){
  G.scene = 'board_large';
  render();
}

/* ============================================================
   §6.11 · АРЕСТ ПРИ ПЕРЕХОДЕ
   ============================================================ */
function checkOverseerArrestOnTransition(targetScene){
  if(!G.flags.overseerWitnessed) return false;
  if(G.flags.overseerArrested) return false;

  const triggered =
    (G.flags.overseerKilledIn === 'small_ship'  && targetScene === 'arrival_planet') ||
    (G.flags.overseerKilledIn === 'planet'      && targetScene === 'board_large') ||
    (G.flags.overseerKilledIn === 'large_ship'  && targetScene === 'approach') ||
    (G.flags.overseerKilledIn === 'station'     && targetScene === 'final_verdict');

  if(!triggered) return false;

  G.flags.overseerArrested = true;
  G.scene = 'overseer_arrest';
  render();
  return true;
}

function sceneOverseerArrest(root){
  root.appendChild(h('h2', { class:'title', style:{ color:'var(--red)' } },
    'РАЗБИРАТЕЛЬСТВО'));
  root.appendChild(h('p', { class:'subtitle' },
    'Смерть Смотрителя. Свидетели. Охрана Administratum.'));

  root.appendChild(h('div', { class:'card' },
    h('div', { class:'stamp', style:{ color:'var(--red)' } }, 'ИТОГ'),
    h('div', {}, 'Вас задержали в момент прибытия смены. ' +
      'Доказательства собраны. Показания записаны.'),
    h('div', { style:{ marginTop:'12px', color:'var(--dim)', fontStyle:'italic' } },
      'Смотритель был не просто человеком. Он был частью системы, ' +
      'которая видит всё. Просто не сразу.')));

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick: newGame }, 'НОВАЯ ИГРА')));
}

/* ============================================================
   KEYBOARD
   ============================================================ */
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && G && G.modal){
    G.modal = null;
    render();
    return;
  }
  if(e.key === 'Tab'){
    e.preventDefault();
    togglePDA();
    return;
  }
  if(G && G.modal && G.modal.type === 'pda'){
    const map = { '1':'map','2':'now','3':'orders','4':'people','5':'items' };
    if(map[e.key]){ G.modal.tab = map[e.key]; renderModal(); }
    return;
  }
  if(G && G.modal && G.modal.type === 'action'){
    const n = Number(e.key);
    if(n >= 1 && n <= 9){
      const m = G.modal.methods;
      if(m[n - 1] && !m[n - 1].disabled && m[n - 1].onClick) m[n - 1].onClick();
    }
  }
  if(G && G.modal && G.modal.type === 'dialogue' && G.modal.counterQuestion){
    const n = Number(e.key);
    if(n >= 1 && n <= 9){
      const npc = G.npcs[G.modal.npcId];
      const opts = G.modal.counterQuestion.options;
      if(npc && opts && opts[n - 1]) answerCounterQuestion(npc, n - 1);
    }
    return;
  }
  if(G && G.modal && G.modal.type === 'sleep_event'){
    const n = Number(e.key);
    if(n >= 1 && n <= 9){
      const o = G.modal.options;
      if(o[n - 1] && o[n - 1].fn) o[n - 1].fn();
    }
  }
});

/* ============================================================
   FLIGHT / ARRIVAL
   ============================================================ */
function getFlightArrival(){
  if(G.area === 'small_ship' && G.prologue.smallBoardedAt != null){
    return G.prologue.smallBoardedAt + G.destination.travelSmall;
  }
  if(G.area === 'large_ship' && G.prologue.largeBoardedAt != null){
    return G.prologue.largeBoardedAt + G.destination.travelLarge;
  }
  return null;
}

function finishPrologue(){
  const L = G.prologue.loadingBg;
  const loaded = L ? L.currentTons : 0;
  if(loaded < 1){
    log('Нечего сдавать. Груза нет.', 'warn');
    render();
    return;
  }
  G.unload = { stage: 1, startedAt: G.time, progress: 0, docsOK: false };
  G.scene = 'unload';
  render();
}

function checkArrival(){
  if(!G || G.scene !== 'area') return false;
  if(G.modal) return false;

  if(G.area === 'small_ship' && G.prologue.smallBoardedAt != null){
    const arr = G.prologue.smallBoardedAt + G.destination.travelSmall;
    if(G.time >= arr){
      G.time = arr;
      G.scene = 'arrival_planet';
      log('Корабль вышел на орбиту ' + G.destination.planet + '.', 'good');
      return true;
    }
  }
  if(G.area === 'large_ship' && G.prologue.largeBoardedAt != null){
    const arr = G.prologue.largeBoardedAt + G.destination.travelLarge;
    if(G.time >= arr && G.scene !== 'approach'){
      G.time = arr;
      G.scene = 'arrival_ship';
      log('Корабль подходит к ' + G.destination.station + '.', 'info');
      return true;
    }
  }
  return false;
}
