'use strict';
/* ============================================================
   EXAM · LVE_6 v3.4 · §3.4.3
   Три этапа: симулятор · сервиторы · разговор.
   Приоритет 1 — высший.
   ============================================================ */

/* ============================================================
   ВХОД В ЭКЗАМЕН
   ============================================================ */
function beginExam(){
  if(G.prologue.examPassed){ log('Экзамен уже сдан.', 'info'); render(); return; }
  if(G.area !== 'planet' || G.location !== 'exam_hall'){
    log('Сначала дойдите до экзамен-зала.', 'info'); render(); return;
  }
  G.exam = {
    attempts: (G.exam ? G.exam.attempts + 1 : 1),
    dist: null, sv: null, s1: null, s2: null, s3: null,
  };
  G.scene = 'exam1';
  render();
}

/* ============================================================
   §3.4.3 · ЭТАП 1 · СИМУЛЯТОР · свободное распределение 6 т
   ============================================================ */
function sceneExam1(root){
  root.appendChild(h('h2', { class:'title' }, 'ЭКЗАМЕН · ЭТАП 1 · СИМУЛЯТОР'));
  root.appendChild(h('p', { class:'subtitle' },
    'Распределите 6 т между 4 секторами. Каждый шаг — 0.5 т. ' +
    'Можно превысить нужду сектора — излишек уйдёт впустую.'));

  if(!G.exam.dist){
    G.exam.dist = [
      { id:'A', name:'Сектор А (пищеблок)', need:2.5, priority:1, alloc:0 },
      { id:'B', name:'Сектор Б (ремонт)',   need:1.5, priority:2, alloc:0 },
      { id:'C', name:'Сектор В (жилой)',    need:1.5, priority:2, alloc:0 },
      { id:'D', name:'Сектор Г (резерв)',   need:0.5, priority:3, alloc:0 },
    ];
  }
  const dist = G.exam.dist;
  const alloc = dist.reduce((s,c) => s + c.alloc, 0);
  const rem = 6 - alloc;

  for(const c of dist){
    root.appendChild(h('div', { class:'exam-row' },
      h('div', {},
        h('div', { class:'name' }, c.name),
        h('div', { class:'pri' }, 'приоритет ' + c.priority + ' · нужда ' + c.need + ' т')),
      h('button', { onclick:() => { if(c.alloc > 0){ c.alloc = Math.max(0, c.alloc - 0.5); render(); } } }, '−'),
      h('div', { class:'alloc' }, c.alloc.toFixed(1) + ' т'),
      h('button', { onclick:() => { if(rem >= 0.5){ c.alloc = c.alloc + 0.5; render(); } } }, '+')));
  }

  /* Оценка: приоритет 1 весит 3, приоритет 3 весит 1 */
  let num = 0, den = 0;
  for(const c of dist){
    const weight = 4 - c.priority;
    num += weight * Math.min(c.alloc, c.need);
    den += weight * c.need;
  }
  const score = den ? num / den : 0;
  const color = score >= 0.75 ? 'var(--green)' : score >= 0.6 ? 'var(--orange)' : 'var(--red)';

  root.appendChild(h('div', { class:'exam-sum' },
    h('div', {}, 'Распределено: ' + alloc.toFixed(1) + ' / 6.0 т · остаток ' + rem.toFixed(1) + ' т'),
    h('div', {}, 'Оценка: ',
      h('b', { style:{ color } }, (score * 100).toFixed(0) + '%'),
      score >= 0.75 ? ' — проходит' : ' — нужно ≥ 75%'),
    h('div', { class:'hint', style:{ marginTop:'6px' } },
      'Формула: Σ(вес × закрытая нужда) / Σ(вес × нужда). ' +
      'Приоритет 1 весит 3, приоритет 3 весит 1.'),
    h('div', { class:'hint' }, 'Попытка № ' + G.exam.attempts)));

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick:() => {
      G.exam.s1 = score;
      log('Этап 1: ' + (score * 100).toFixed(0) + '%.', 'info');
      G.scene = 'exam2';
      render();
    }}, 'ПОДТВЕРДИТЬ')));
}

/* ============================================================
   §3.4.3 · ЭТАП 2 · СЕРВИТОРЫ · карточки и партии
   Приоритет 1 — высший.
   ============================================================ */
function sceneExam2(root){
  root.appendChild(h('h2', { class:'title' }, 'ЭКЗАМЕН · ЭТАП 2 · СЕРВИТОРЫ'));
  root.appendChild(h('p', { class:'subtitle' },
    'Тик — 10 минут. Каждая партия должна быть отгружена до дедлайна. ' +
    'Сервиторы тупые. Их надо переключать.'));

  if(!G.exam.sv){
    G.exam.sv = {
      tick: 0, maxTicks: 24,
      partitions: {
        A:{ name:'Партия A', tons:2, loaded:0, priority:1, deadline:8,  shipped:false, onTime:false },
        B:{ name:'Партия B', tons:2, loaded:0, priority:2, deadline:14, shipped:false, onTime:false },
        C:{ name:'Партия C', tons:2, loaded:0, priority:3, deadline:20, shipped:false, onTime:false },
      },
      servitors:{
        S1:{ name:'Сервитор ?01', priority:['A','B','C'], rate:1/3, lastAction:null },
        S2:{ name:'Сервитор ?02', priority:['C','A','B'], rate:1/3, lastAction:null },
      },
      log: [],
    };
  }
  const sv = G.exam.sv;

  /* Сервиторы — что делают сейчас */
  root.appendChild(h('div', { class:'exam-section-title' }, 'СЕРВИТОРЫ · ЧТО ДЕЛАЮТ СЕЙЧАС'));
  const srvRow = h('div', { class:'exam-servitors' });
  for(const sid in sv.servitors){
    const s = sv.servitors[sid];
    const target = s.priority[0];
    const p = sv.partitions[target];
    const pct = p ? Math.min(100, p.loaded / p.tons * 100) : 0;
    const done = p && p.shipped;

    const card = h('div', { class:'exam-servitor' },
      h('div', { class:'exam-servitor-head' },
        h('b', {}, s.name),
        h('span', { class:'exam-servitor-status' },
          done ? 'ждёт' : 'грузит ' + p.name)),
      h('div', { class:'exam-servitor-bar' },
        h('i', { style:{ width: pct + '%' } })),
      h('div', { class:'exam-servitor-foot' },
        h('span', {}, done ? '—' : pct.toFixed(0) + '%'),
        h('button', { class:'btn mini', onclick:() => {
          s.priority.push(s.priority.shift());
          log(s.name + ': внимание переключено на ' + sv.partitions[s.priority[0]].name + '.', 'info');
          render();
        }}, 'ПЕРЕКЛЮЧИТЬ')));
    srvRow.appendChild(card);
  }
  root.appendChild(srvRow);

  /* Партии */
  root.appendChild(h('div', { class:'exam-section-title', style:{ marginTop:'18px' } },
    'ПАРТИИ · СТАТУС ОТГРУЗКИ'));

  for(const pid of ['A','B','C']){
    const p = sv.partitions[pid];
    const overdue = !p.shipped && sv.tick > p.deadline;
    const pct = Math.min(100, p.loaded / p.tons * 100);
    const status = p.shipped
      ? (p.onTime ? 'отгружена в срок' : 'отгружена с опозданием')
      : overdue   ? 'просрочена'
                  : ('до тика ' + p.deadline);

    const cls = 'exam-cargo'
      + (p.shipped && p.onTime ? ' ok' : '')
      + (p.shipped && !p.onTime ? ' late' : '')
      + (overdue ? ' bad' : '');

    root.appendChild(h('div', { class: cls },
      h('div', { class:'exam-cargo-head' },
        h('b', {}, p.name),
        h('span', { class:'exam-cargo-status' }, status)),
      h('div', { class:'exam-cargo-bar' },
        h('i', { style:{ width: pct + '%' } })),
      h('div', { class:'exam-cargo-foot' },
        h('span', {}, p.loaded.toFixed(2) + ' / ' + p.tons + ' т'),
        h('span', { class:'exam-cargo-pri' }, 'приоритет ' + p.priority))));
  }

  /* Журнал */
  if(sv.log && sv.log.length){
    root.appendChild(h('div', { class:'exam-section-title', style:{ marginTop:'18px' } },
      'ЖУРНАЛ'));
    const lg = h('div', { class:'exam-log' });
    for(const line of sv.log.slice(-6)) lg.appendChild(h('div', {}, line));
    root.appendChild(lg);
  }

  root.appendChild(h('div', { class:'exam-tick-line' },
    'Тик ' + sv.tick + ' / ' + sv.maxTicks));

  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn', onclick:() => exam2Tick(1) }, '▶ ТИК'),
    h('button', { class:'btn', onclick:() => exam2Tick(5) }, '▶▶ +5'),
    h('button', { class:'btn primary', onclick: exam2Finish }, 'ЗАВЕРШИТЬ')));
}

function exam2Tick(count){
  count = count || 1;
  const sv = G.exam.sv;
  if(!sv.log) sv.log = [];

  for(let t = 0; t < count; t++){
    if(sv.tick >= sv.maxTicks) break;
    sv.tick++;

    const busy = new Set();
    for(const sid in sv.servitors){
      const s = sv.servitors[sid];
      let target = null;
      for(const pid of s.priority){
        const p = sv.partitions[pid];
        if(!p.shipped && p.loaded < p.tons && !busy.has(pid)){ target = pid; break; }
      }
      if(target){
        busy.add(target);
        const p = sv.partitions[target];
        p.loaded = Math.min(p.tons, p.loaded + s.rate);
        s.lastAction = 'грузит ' + p.name;
      } else {
        s.lastAction = 'простаивает';
      }
    }

    for(const pid of ['A','B','C']){
      const p = sv.partitions[pid];
      if(!p.shipped && p.loaded >= p.tons){
        p.shipped = true;
        p.onTime = sv.tick <= p.deadline;
        sv.log.push(
          'Тик ' + sv.tick + ': ' + p.name + ' отгружена' +
          (p.onTime ? ' в срок.' : ' с опозданием.')
        );
      }
    }
  }

  render();
}

function exam2Finish(){
  const sv = G.exam.sv;
  for(const pid of ['A','B','C']){
    const p = sv.partitions[pid];
    if(!p.shipped && p.loaded > 0){ p.shipped = true; p.onTime = sv.tick <= p.deadline; }
  }
  let total = 0, penalty = 0;
  for(const p of Object.values(sv.partitions)){
    total += p.loaded;
    if(p.shipped && !p.onTime){
      /* Приоритет 1 — вес 3, приоритет 3 — вес 1 */
      const weight = 4 - p.priority;
      penalty += weight * 0.15;
    }
  }
  G.exam.s2 = clamp(total / 6 - penalty, 0, 1);
  log('Этап 2: ' + (G.exam.s2 * 100).toFixed(0) + '%.' +
    (penalty > 0 ? ' Штраф за опоздание: −' + Math.round(penalty * 100) + '%.' : ''), 'info');
  G.scene = 'exam3';
  render();
}

/* ============================================================
   §3.4.3 · ЭТАП 3 · РАЗГОВОР
   ============================================================ */
function sceneExam3(root){
  root.appendChild(h('h2', { class:'title' }, 'ЭКЗАМЕН · ЭТАП 3 · РАЗГОВОР'));
  root.appendChild(h('p', { class:'subtitle' }, 'Экзаменатор задаёт вопросы.'));

  const s1 = G.exam.s1 || 0, s2 = G.exam.s2 || 0;
  root.appendChild(h('div', { class:'exam-sum' },
    h('div', {}, 'Этап 1: ' + (s1 * 100).toFixed(0) + '%'),
    h('div', {}, 'Этап 2: ' + (s2 * 100).toFixed(0) + '%'),
    h('div', {}, 'ХАР: ' + modStr(G.player.stats.cha) + ' · ИНТ: ' + modStr(G.player.stats.int)),
    h('div', {}, 'Попытка № ' + G.exam.attempts)));

  const top = (s1 >= 0.9 && s2 >= 0.9);
  const oneWeak = (s1 < 0.6 || s2 < 0.6);
  const questions = [];
  if(top){
    questions.push('«Оба этапа — почти без потерь. Как вы это объясняете?»');
    questions.push('«Допустим, ресурсов вдвое меньше. Что оставите, что урежете?»');
  } else if(oneWeak){
    questions.push('«Один из этапов дал сбой. Что именно сработало не так?»');
    questions.push('«Где вы потеряли больше всего времени?»');
  } else {
    questions.push('«Что вы сделали на этапе 2?»');
    questions.push('«Почему такой приоритет?»');
  }
  const body = h('div', { class:'card' });
  for(const q of questions){
    body.appendChild(h('div', { class:'dlg-line' },
      h('span', { class:'who' }, 'Экзаменатор:'),
      h('span', { class:'txt' }, ' ' + q)));
  }
  root.appendChild(body);
  root.appendChild(h('div', { class:'actions' },
    h('button', { class:'btn primary', onclick: openExamChoices }, 'ОТВЕТИТЬ')));
}

function openExamChoices(){
  const chaMod = statMod(G.player.stats.cha);
  const intMod = statMod(G.player.stats.int);
  const s1 = G.exam.s1 || 0, s2 = G.exam.s2 || 0;
  const top = (s1 >= 0.9 && s2 >= 0.9);
  const oneWeak = (s1 < 0.6 || s2 < 0.6);
  let methods;
  if(top){
    methods = [
      { label:'«Я знал приоритеты с самого начала»', time:2, mod: modLabel('ИНТ', G.player.stats.int), onClick:() => examAnswer(3 + intMod, 'уверенный') },
      { label:'«Приоритеты были очевидны по документу»', time:2, onClick:() => examAnswer(2, 'педантичный') },
      { label:'«Мне просто повезло с людьми»', time:2, onClick:() => examAnswer(1, 'скромный') },
      { label:'«Дальше — это уже не про рейс»', time:2, onClick:() => examAnswer(0, 'уклончивый') },
    ];
  } else if(oneWeak){
    methods = [
      { label:'«Я недооценил ограничение по времени»', time:2, onClick:() => examAnswer(2, 'самокритика') },
      { label:'«Проблема была в погрузке, не во мне»', time:2, onClick:() => examAnswer(-1, 'защита') },
      { label:'«Я бы перепроверил вводные»', time:2, mod: modLabel('ИНТ', G.player.stats.int), onClick:() => examAnswer(2 + intMod, 'осторожный') },
      { label:'«Тут был элемент случайности»', time:2, onClick:() => examAnswer(0, 'философский') },
    ];
  } else {
    methods = [
      { label:'«Я бы сделал всё то же самое»', time:2, mod: modLabel('ХАР', G.player.stats.cha), onClick:() => examAnswer(1 + chaMod, 'уверенный') },
      { label:'«Я бы сначала проверил ограничения»', time:2, mod: modLabel('ИНТ', G.player.stats.int), onClick:() => examAnswer(2 + intMod, 'скромный') },
      { label:'«Я потерял время на приоритеты»', time:2, onClick:() => examAnswer(3, 'самокритика') },
      { label:'«Погрузка была организована плохо»', time:2, onClick:() => examAnswer(-2, 'агрессивный') },
    ];
  }
  openModal({ type:'action', title:'Что ответить?', desc:'Экзаменатор ждёт.', methods });
}

function examAnswer(mod, label){
  closeModal();
  const s1 = G.exam.s1 || 0, s2 = G.exam.s2 || 0;
  let totalMod = mod;
  if(s1 >= 0.8) totalMod += 2;
  if(s2 >= 0.8) totalMod += 2;
  if(G.player.background === 'tech' || G.player.background === 'heir') totalMod += 1;
  if(G.exam.attempts > 1) totalMod -= 1;

  const roll = G.rng.d20();
  const rollNorm = clamp(roll + totalMod, 1, 20) / 20;
  const final = 0.3 * s1 + 0.4 * s2 + 0.3 * rollNorm;
  G.exam.s3 = final;
  G.exam.temperament = label;

  log('Этап 3: бросок ' + roll + ' (мод ' + totalMod + ', ' + label + '). Итог: ' + (final * 100).toFixed(0) + '%.', 'info');

  if(final >= 0.75){
    G.prologue.examPassed = true;
    log('Экзамен сдан.', 'good');
    G.location = 'arrival_terminal';
    G.scene = G.flags.overseerMet ? 'area' : 'overseer_meeting';
    render();
    return;
  }

  if(G.exam.attempts >= 5){
    log('Экзамен не сдан. Альтернативная бумага.', 'danger');
    G.prologue.examPassed = true;
    G.location = 'arrival_terminal';
    G.scene = G.flags.overseerMet ? 'area' : 'overseer_meeting';
    render();
    return;
  }

  log('Экзамен не сдан. Пересдача.', 'danger');
  G.exam.dist = null;
  G.exam.sv = null;
  G.exam.s1 = null;
  G.exam.s2 = null;
  G.scene = 'exam1';
  render();
}