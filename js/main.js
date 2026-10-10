'use strict';
/* ============================================================
   MAIN · LVE_6 v3.4
   Точка входа. Новая игра + глобальный перехват ошибок.
   Вся логика в engine / logic / render / pda / final.
   ============================================================ */

/* ============================================================
   НОВАЯ ИГРА
   ============================================================ */
function newGame(){
  G = freshState();

  G.seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  G.rngSeed = G.seed;
  G.rng = new RNG(G.seed);

  G.worldTree = WORLD_TREE;

  /* Игрок — минимальный; предыстория задаётся в сцене background */
  G.player = {
    name: '', background: null, access: 'medium',
    stats: { str:5, int:5, cha:5, end:5 },
    state: {
      fatigue: 20, stress: 15, hunger: 30,
      hp: 10, maxHp: 10,
      sleepDebt: 30, sleepQuality: null,
    },
    pathologies: [],
    contacts: [],
    prayerBonus: 0,
    stressPenalty: false,
  };

  /* Активы */
  G.assets.money = 0;
  G.assets.inventory = [];

  /* Генерация мира.
     Порядок важен: сначала роль станции (её читает экономика),
     потом NPC (некоторые зависят от роли), потом экономика. */
  genDestination();
  genStationRole();
  genAllNpcs();
  if(typeof genEconomy === 'function') genEconomy();

  /* Старт пролога — уведомление о назначении */
  G.scene = 'assignment';

  /* Приветственный лог */
  log('Новая игра. Семя: ' + G.seed.toString(16).toUpperCase() + '.', 'info');
  log('Маршрут: ' + G.destination.system + ' → ' +
      G.destination.planet + ' → ' + G.destination.station, 'info');
  log('NPC в мире: ' + Object.keys(G.npcs).length +
      ' · роль станции: ' + (G.station.role || '—'), 'info');

  render();
}

/* ============================================================
   ГЛОБАЛЬНЫЙ ПЕРЕХВАТ ОШИБОК
   Вместо чёрного экрана — плашка с текстом и кнопкой перезагрузки.
   ============================================================ */
window.addEventListener('error', (e) => {
  const scene = document.getElementById('scene');
  if(!scene) return;

  scene.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText =
    'padding:20px;font-family:Consolas,monospace;color:#d6504a;' +
    'background:#0d1210;border:1px solid #6a2a2a;border-radius:4px;' +
    'max-width:800px;margin:20px auto;line-height:1.5;';
  box.innerHTML =
    '<div style="color:#e8c657;font-size:13px;letter-spacing:2px;margin-bottom:12px;">' +
      'ОШИБКА' +
    '</div>' +
    '<div style="margin-bottom:8px;color:#c3d0c8;">' +
      (e.message || 'неизвестная ошибка') +
    '</div>' +
    '<div style="color:#78877f;font-size:11px;">' +
      (e.filename || '') + ' : строка ' + (e.lineno || '?') +
    '</div>' +
    '<div style="margin-top:14px;color:#78877f;font-size:11px;">' +
      'Открой Console (F12) для стека вызовов.' +
    '</div>';
  const btn = document.createElement('button');
  btn.textContent = 'ПЕРЕЗАГРУЗИТЬ';
  btn.style.cssText =
    'margin-top:14px;padding:8px 14px;background:#131a17;' +
    'border:1px solid #2e403a;color:#5ed6c8;font:inherit;' +
    'cursor:pointer;border-radius:2px;letter-spacing:1px;';
  btn.onclick = () => location.reload();
  box.appendChild(btn);
  scene.appendChild(box);
});

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
G = freshState();
render();
