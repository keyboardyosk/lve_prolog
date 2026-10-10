'use strict';
/* ============================================================
   PDA · LVE_6 v3.4 · §10
   11 вкладок. Горячие клавиши 1–5.
   ============================================================ */

function togglePDA(){
  if(G.modal && G.modal.type === 'pda'){ closeModal(); return; }
  if(G.modal) return;
  openModal({ type:'pda', tab:'map' });
}

function renderPDA(box, m){
  const area = AREAS[G.area];
  const locName = area && area.locs[G.location] ? area.locs[G.location].n : '';
  const ctx = area ? (area.title + ' · ' + locName) : '';

  mhead(box, 'КПК · ' + fmtClock(G.time) + ' · ' + ctx);

  /* Tabs */
  const bar = h('div', { class:'pda-tabs' });
  const tabs = [
    ['map','Карта'], ['now','Сейчас'], ['orders','Приказы'],
    ['people','Люди'], ['items','Предметы'], ['player','Игрок'],
    ['know','Знания'], ['econ','Экономика'], ['fact','Фракции'],
    ['chron','Хроника'], ['msg','Сообщения'],
  ];
  for(const [id, name] of tabs){
    bar.appendChild(h('button', {
      class:'pda-tab' + (m.tab === id ? ' on' : ''),
      onclick:() => { m.tab = id; renderModal(); }
    }, name));
  }
  box.appendChild(bar);

  /* Body */
  const body = h('div', { class:'pda-body' });
  const renderers = {
    map:    pdaMap,
    now:    pdaNow,
    orders: pdaOrders,
    people: pdaPeople,
    items:  pdaItems,
    player: pdaPlayer,
    know:   pdaKnowledge,
    econ:   pdaEcon,
    fact:   pdaFactions,
    chron:  pdaChron,
    msg:    pdaMessages,
  };
  const fn = renderers[m.tab] || pdaMap;
  fn(body);
  box.appendChild(body);
}

/* ============================================================
   1. КАРТА
   ============================================================ */
function pdaMap(root){
  const area = AREAS[G.area];
  if(!area){ root.appendChild(h('div', { class:'hint' }, 'Неизвестная зона.')); return; }
  root.appendChild(h('div', { class:'hint' }, 'Клик — переход. Серая — ограничена.'));

  const grid = h('div', { class:'pda-map' });
  for(const id in area.locs){
    const loc = area.locs[id];
    const npcs = Object.values(G.npcs).filter(n =>
      n.area === G.area && n.location === id &&
      !n.following && n.state !== 'dead');
    const cur = G.location === id;
    grid.appendChild(h('div', {
      class:'pda-node' + (cur ? ' cur' : ''),
      style: loc.restrict ? { opacity:'0.6' } : null,
      onclick:() => { if(!cur) { closeModal(); moveTo(id); } }
    },
      h('div', {}, loc.n + (loc.restrict ? ' 🔒' : '')),
      npcs.length ? h('div', { style:{ fontSize:'10px', color:'var(--amber)' } },
        '●'.repeat(Math.min(npcs.length, 5))) : null));
  }
  root.appendChild(grid);
}

/* ============================================================
   2. СЕЙЧАС
   ============================================================ */
function pdaNow(root){
  const urgent = [];

  /* §11 · Обстоятельства финала */
  if(G.final && G.final.started && !G.final.mainCheck){
    const left = G.final.deadline - G.time;
    urgent.push({
      ico:'⏱',
      text:'Главная проверка: ' + (left > 0 ? fmtDur(left) : 'просрочено'),
      color: left < 180 ? 'var(--red)' : left < 720 ? 'var(--orange)' : 'var(--amber)'
    });
  }
  if(G.final && G.final.started){
    const obs = G.final.obstacles;
    if(obs.conflict.triggered   && !obs.conflict.resolved)
      urgent.push({ ico:'⚠', text:'Конфликт интересов: не решён.', color:'var(--orange)' });
    if(obs.equipment.triggered  && !obs.equipment.resolved)
      urgent.push({ ico:'⚙', text:'Оборудование: требует внимания.', color:'var(--orange)' });
    if(obs.contraband.triggered && !obs.contraband.resolved)
      urgent.push({ ico:'📦', text:'Контрабанда: не решена.', color:'var(--red)' });
    if(obs.sidequests.triggered && !obs.sidequests.resolved)
      urgent.push({ ico:'✉', text:'Побочные задания: ждут.', color:'var(--orange)' });
  }

  /* §3.3.3 · Скрытая угроза — только при knowsKiller */
  if(G.flags.knowsKiller){
    const killer = Object.values(G.npcs).find(n =>
      n.isHiddenKiller && n.hiddenIntent && n.hiddenIntent.active);
    if(killer){
      const target = G.npcs[killer.hiddenIntent.targetId];
      urgent.push({
        ico:'⚠',
        text:'Готовится убийство: ' + killer.name + ' → ' + (target ? target.name : '?'),
        color:'var(--red)'
      });
    }
  }

  /* Общие срочности */
  if(G.combat && G.combat.active){
    urgent.push({ ico:'⚔', text:'Стычка. Раунд ' + G.combat.round + '.', color:'var(--red)' });
  }
  if(G.warp.exposure >= 100){
    const stage = warpStage(G.warp.exposure);
    urgent.push({ ico:'✦', text:'Warp: ' + stage.label + '.', color:'var(--purple)' });
  }
  if(G.station.alert && G.station.alert !== 'LOW'){
    urgent.push({ ico:'!', text:'Станция: ' + G.station.alert + '.', color:'var(--red)' });
  }
  if(G.prologue.deadline && !(G.final && G.final.started)){
    const left = G.prologue.deadline - G.time;
    if(left < 180) urgent.push({ ico:'⏱', text:'Срок меньше 3 часов.', color:'var(--orange)' });
  }
  if(G.prologue.loadingBg && G.prologue.loadingBg.active){
    urgent.push({ ico:'⚙', text:'Погрузка ' + Math.floor(G.prologue.loadingBg.progress) + '%.',
      color:'var(--cyan)' });
  }
  if(G.prologue.loadingBg && G.prologue.loadingBg.pendingIncident &&
     !G.prologue.loadingBg.pendingIncident.resolved){
    urgent.push({ ico:'⚠', text:'Инцидент на площадке погрузки.',
      color:'var(--red)' });
  }

  /* Раненые рядом */
  const nearby = Object.values(G.npcs).filter(n =>
    n.area === G.area && n.location === G.location &&
    n.state === 'alive' && n.hp < n.maxHp);
  for(const n of nearby){
    urgent.push({ ico:'🤕', text: n.name + ' ранен(а) (' + n.hp + '/' + n.maxHp + ').',
      color:'var(--orange)' });
  }

  if(!urgent.length){
    root.appendChild(h('div', { class:'hint' }, 'Ничего срочного.'));
    return;
  }
  for(const u of urgent){
    root.appendChild(h('div', {
      class:'pda-row',
      style:{ color: u.color }
    },
      h('span', { class:'k' }, u.ico + ' ' + u.text),
      h('span', { class:'v' })));
  }
}

/* ============================================================
   3. ПРИКАЗЫ
   ============================================================ */
function pdaOrders(root){
  const d = G.destination;
  root.appendChild(h('div', {
    style:{ color:'var(--cyan)', marginBottom:'8px', fontSize:'11px' }
  }, 'ОСНОВНАЯ'));

  const loaded = G.prologue.loadingBg ? G.prologue.loadingBg.currentTons : 0;
  root.appendChild(h('div', { class:'task-item accepted' },
    h('div', { class:'t-title' }, d.resource + ' ' + d.required + ' т → ' + d.station),
    h('div', { class:'t-desc' }, 'Срок: ' + fmtClock(G.prologue.deadline)),
    h('div', { class:'t-giver' }, G.prologue.missionLoaded
      ? 'Погружено (' + loaded.toFixed(1) + ' т)'
      : 'Ожидает')));

  const buckets = [
    ['Приказ',  G.obligations.orders],
    ['Услуга',  G.obligations.favors],
    ['Долг',    G.obligations.debts],
    ['Слово',   G.obligations.words],
    ['Письмо',  G.obligations.letters],
  ];
  const any = buckets.some(([_, arr]) => arr.length);
  if(any){
    root.appendChild(h('div', {
      style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
    }, 'ПРОЧИЕ'));
    for(const [label, arr] of buckets){
      for(const o of arr){
        root.appendChild(h('div', { class:'task-item' },
          h('div', { class:'t-title' }, '[' + label + '] ' + (o.title || '—')),
          o.desc ? h('div', { class:'t-desc' }, o.desc) : null,
          o.giver ? h('div', { class:'t-giver' }, 'от ' + o.giver) : null));
      }
    }
  }

  /* §11 · Обстоятельства финала */
  if(G.final && G.final.started){
    root.appendChild(h('div', {
      style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
    }, 'ОБСТОЯТЕЛЬСТВА ФИНАЛА'));

    const obs = G.final.obstacles;
    const items = [
      ['Конфликт интересов', obs.conflict],
      ['Контрабанда',        obs.contraband],
      ['Оборудование',       obs.equipment],
      ['Побочные задания',   obs.sidequests],
      ['Отчёт Смотрителю',   obs.report],
    ];
    for(const [label, o] of items){
      const state = o.resolved ? 'решено' : o.triggered ? 'активно' : 'ждёт';
      const color = o.resolved ? 'var(--green)' : o.triggered ? 'var(--orange)' : 'var(--dim)';
      root.appendChild(h('div', { class:'pda-row' },
        h('span', { class:'k' }, label),
        h('span', { class:'v', style:{ color } }, state)));
    }
  }
}

/* ============================================================
   4. ЛЮДИ
   ============================================================ */
function pdaPeople(root){
  const nearby = Object.values(G.npcs).filter(n => n.area === G.area && n.state === 'alive');
  root.appendChild(h('div', {
    style:{ color:'var(--cyan)', marginBottom:'8px', fontSize:'11px' }
  }, 'РЯДОМ'));
  if(!nearby.length){
    root.appendChild(h('div', { class:'hint' }, 'Никого.'));
  } else {
    for(const npc of nearby){
      const st = dialogueStage(npc);
      const locName = (AREAS[npc.area] && AREAS[npc.area].locs[npc.location])
        ? AREAS[npc.area].locs[npc.location].n : '?';
      /* §5.7 · Хобби видно только после знакомства */
      const hobbyVisible = (st === 'acquainted' || st === 'trusted');
      const hobby = (npc.hobby && hobbyVisible) ? ' · хобби: ' + npc.hobby : '';
      root.appendChild(h('div', { class:'pda-row' },
        h('span', { class:'k' },
          npc.name + ' · ' + roleF(npc) +
          (npc.faction ? ' (' + npc.faction + ')' : '')),
        h('span', { class:'v', style:{ textAlign:'right', maxWidth:'55%' } },
          locName + ' · ' + (CONTACT_STAGE_LABEL[st] || st) +
          ' · отн. ' + npc.relation + hobby)));
    }
  }

  if(G.assets.contacts.length){
    root.appendChild(h('div', {
      style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
    }, 'КОНТАКТЫ'));
    for(const id of G.assets.contacts){
      const npc = G.npcs[id];
      if(!npc) continue;
      root.appendChild(h('div', { class:'pda-row' },
        h('span', { class:'k' }, npc.name + ' · ' + roleF(npc)),
        h('span', { class:'v' }, npc.state === 'dead' ? 'мёртв' : '—')));
    }
  }
}

/* ============================================================
   5. ПРЕДМЕТЫ
   ============================================================ */
function pdaItems(root){
  const inv = (G.assets.inventory || []).filter(it => (it.location || 'inventory') === 'inventory');
  if(!inv.length){
    root.appendChild(h('div', { class:'hint' }, 'Пусто.'));
    return;
  }

  const normal = inv.filter(it => !it.artifact);
  const artifacts = inv.filter(it => it.artifact);

  if(normal.length){
    for(const it of normal){
      root.appendChild(h('div', { class:'pda-row' },
        h('span', { class:'k' }, it.icon + ' ' + it.name),
        h('span', { class:'v' }, it.desc || '')));
    }
  }

  if(artifacts.length){
    root.appendChild(h('div', {
      style:{ color:'var(--purple)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
    }, 'АРТЕФАКТЫ'));
    for(const it of artifacts){
      const state = it.state === 'active'   ? 'активен'
                  : it.state === 'dormant'  ? 'спит'
                  : it.state;
      const color = it.state === 'active' ? 'var(--orange)' : 'var(--dim)';
      root.appendChild(h('div', { class:'pda-row' },
        h('span', { class:'k' }, it.icon + ' ' + it.name),
        h('span', { class:'v', style:{ color } }, state +
          ' · warp ' + it.warp_level)));
    }
  }
}

/* ============================================================
   6. ИГРОК
   ============================================================ */
function pdaPlayer(root){
  const p = G.player;
  const row = (k, v) => root.appendChild(h('div', { class:'pda-row' },
    h('span', { class:'k' }, k), h('span', { class:'v' }, v)));

  row('Имя', p.name || '—');
  row('Предыстория', p.background ? BACKGROUNDS[p.background].name : '—');
  row('Доступ', p.access);
  row('Кредиты', '₡' + G.assets.money);
  row('СИЛ', p.stats.str + ' (' + modStr(p.stats.str) + ')');
  row('ИНТ', p.stats.int + ' (' + modStr(p.stats.int) + ')');
  row('ХАР', p.stats.cha + ' (' + modStr(p.stats.cha) + ')');
  row('ВЫН', p.stats.end + ' (' + modStr(p.stats.end) + ')');
  if(p.stressPenalty) row('Штраф', '−1 ко всем d20 (стресс)');

  root.appendChild(h('div', {
    style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
  }, 'МЕДИЦИНСКАЯ КАРТА'));
  if(!p.pathologies.length){
    root.appendChild(h('div', { class:'hint' }, 'Патологий нет.'));
  } else {
    for(const pa of p.pathologies){
      let name = '? ' + pa.symptom, status = 'скрыто', color = 'var(--dim)';
      if(pa.discovered){
        name = pa.name;
        status = pa.treated ? 'вылечено' : 'обнаружено';
        color = pa.treated ? 'var(--green)' : 'var(--red)';
      }
      root.appendChild(h('div', { class:'pda-row' },
        h('span', { class:'k' }, name),
        h('span', { class:'v', style:{ color } }, status)));
    }
  }
}

/* ============================================================
   7. ЗНАНИЯ · с блоком слухов
   ============================================================ */
function pdaKnowledge(root){
  const all = (G.playerKnowledge || []).filter(e => e.status === 'active');
  if(!all.length){
    root.appendChild(h('div', { class:'hint' }, 'Наблюдений пока нет.'));
    return;
  }
  const bySubject = {};
  for(const e of all){
    if(!bySubject[e.subjectId]) bySubject[e.subjectId] = [];
    bySubject[e.subjectId].push(e);
  }
  for(const subjId in bySubject){
    const subj = G.npcs[subjId];
    const name = subj ? subj.name : subjId;
    root.appendChild(h('div', {
      style:{ color:'var(--amber)', marginTop:'10px', fontSize:'12px' }
    }, name));
    for(const e of bySubject[subjId]){
      const color = e.epistemic_state === 'CONFIRMED' ? 'var(--green)'
                  : e.epistemic_state === 'OBSERVED'  ? 'var(--amber)'
                                                      : 'var(--dim)';
      root.appendChild(h('div', { class:'knowledge-entry' },
        h('div', { style:{ color } }, e.attribute + ' = ' + e.value),
        h('small', {}, e.epistemic_state + ' · ' + e.source_type +
          ' · уверенность ' + Math.round((e.confidence || 0) * 100) + '%')));
    }
  }

  /* §5.4 · Слухи · какие события уже разошлись */
  if(typeof getGossipSpread === 'function'){
    const gossipEvents = (G.history || []).filter(e => {
      if(e.severity === 'minor') return false;
      const spread = getGossipSpread(e.id);
      return spread >= 2;
    });
    if(gossipEvents.length){
      root.appendChild(h('div', {
        style:{ color:'var(--cyan)', marginTop:'18px', marginBottom:'8px', fontSize:'11px' }
      }, 'СЛУХИ · ЧТО УЖЕ РАЗОШЛОСЬ'));
      for(const ev of gossipEvents.slice(-6).reverse()){
        const spread = getGossipSpread(ev.id);
        root.appendChild(h('div', { class:'pda-row' },
          h('span', { class:'k' }, fmtClock(ev.time) + ' · ' + (ev.action || '—')),
          h('span', { class:'v' }, 'знают: ' + spread + ' чел.')));
      }
    }
  }
}

/* ============================================================
   8. ЭКОНОМИКА · делегирование в economy.js
   ============================================================ */
function pdaEcon(root){
  if(typeof pdaEconomyFull === 'function'){
    pdaEconomyFull(root);
  } else {
    root.appendChild(h('div', { class:'hint' }, 'Модуль экономики не загружен.'));
  }
}

/* ============================================================
   9. ФРАКЦИИ
   ============================================================ */
function pdaFactions(root){
  root.appendChild(h('div', {
    style:{ color:'var(--cyan)', marginBottom:'8px', fontSize:'11px' }
  }, 'ПРЕДСТАВЛЕНЫ РЯДОМ'));
  const seen = new Set();
  for(const npc of Object.values(G.npcs)){
    if(npc.area === G.area && npc.faction && npc.state === 'alive') seen.add(npc.faction);
  }
  if(!seen.size) root.appendChild(h('div', { class:'hint' }, 'Фракции не представлены.'));
  else for(const f of seen){
    root.appendChild(h('div', { class:'pda-row' },
      h('span', { class:'k' }, f), h('span', { class:'v' }, '—')));
  }

  root.appendChild(h('div', {
    style:{ color:'var(--cyan)', marginTop:'14px', marginBottom:'8px', fontSize:'11px' }
  }, 'РЕПУТАЦИЯ'));
  const r = G.assets.reputation;
  const rows = [
    ['рабочие', r.workers], ['чиновники', r.officials], ['криминал', r.criminals],
    ['военные', r.military], ['церковь', r.church], ['mechanicus', r.mechanicus],
  ];
  for(const [name, val] of rows){
    const color = val >= 70 ? 'var(--green)' : val <= 30 ? 'var(--red)' : 'var(--text)';
    root.appendChild(h('div', { class:'pda-row' },
      h('span', { class:'k' }, name),
      h('span', { class:'v', style:{ color } }, val)));
  }
}

/* ============================================================
   10. ХРОНИКА
   ============================================================ */
function pdaChron(root){
  if(!G.history.length){
    root.appendChild(h('div', { class:'hint' }, 'Хроника пуста.'));
    return;
  }
  const recent = G.history.slice(-40).reverse();
  for(const ev of recent){
    const desc = ev.action + (ev.target ? ' → ' + ev.target : '');
    root.appendChild(h('div', { class:'pda-row' },
      h('span', { class:'k' }, fmtClock(ev.time) + ' · ' + ev.actor),
      h('span', { class:'v', style:{
        color: ev.severity === 'grave'    ? 'var(--red)'
             : ev.severity === 'notable'  ? 'var(--orange)'
             : 'var(--muted)'
      }}, desc)));
  }
}

/* ============================================================
   11. СООБЩЕНИЯ · письма, инциденты, артефакт
   ============================================================ */
function pdaMessages(root){
  const msgs = (G.pda.messages || []).slice().reverse();
  if(!msgs.length){
    root.appendChild(h('div', { class:'hint' }, 'Нет сообщений.'));
    return;
  }

  for(const m of msgs){
    const unread = !m.read;
    const resolved = m.resolved;
    const color = resolved ? 'var(--dim)' : unread ? 'var(--amber)' : 'var(--text)';

    const card = h('div', {
      class:'task-item' + (unread ? ' accepted' : ''),
      style:{ cursor: m.type === 'incident' && !resolved ? 'pointer' : 'default',
              opacity: resolved ? '0.6' : '1' },
              onclick:() => {
                m.read = true;
                if(m.type === 'incident' && !resolved){
                  openPdaMessage(m.id);
                } else {
                  renderModal();
                }
              }
    },
      h('div', { class:'t-title', style:{ color } },
        (unread ? '● ' : '') + m.title,
        resolved ? h('span', { style:{ marginLeft:'6px', color:'var(--green)', fontSize:'10px' } },
          m.autoResolved ? '(авто)' : '(решено)') : null),
      h('div', { class:'t-desc' }, m.body),
      h('div', { class:'t-giver' }, fmtClock(m.time) + ' · ' + m.from));

    root.appendChild(card);
  }
}

function openPdaMessage(msgId){
  const msg = (G.pda.messages || []).find(m => m.id === msgId);
  if(!msg) return;
  if(msg.type !== 'incident') return;
  if(msg.resolved) return;

  const L = G.prologue.loadingBg;
  if(!L || !L.pendingIncident){ closeModal(); return; }

  const type = L.pendingIncident.type;
  /* Закрываем КПК и сразу открываем модалку инцидента.
     closeModal() вызывает render(), поэтому openLoadingIncidentModal
     вызываем напрямую — она перезапишет G.modal. */
  closeModal();
  if(typeof openLoadingIncidentModal === 'function'){
    openLoadingIncidentModal(type);
  }
}