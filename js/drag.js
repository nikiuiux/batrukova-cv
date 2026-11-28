// Drag the sheets and the menu card with mouse or finger.
// The grabbed element goes on top of the pile. Offsets are stored in cqw
// (percent of the sheet width), so positions survive window resizing.
(() => {
  const desk = document.querySelector('.desk');
  const items = [...desk.querySelectorAll('[data-drag]')];
  const resetBtn = document.querySelector('.reset');
  const THRESHOLD = 4; // px of movement before it counts as a drag, not a click

  let top = Math.max(...items.map(el => parseInt(getComputedStyle(el).zIndex, 10) || 0));

  items.forEach(el => {
    let start = null;
    let suppressClick = false;

    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      suppressClick = false;
      desk.classList.remove('is-returning', 'is-moving');
      start = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        dx: parseFloat(el.style.getPropertyValue('--dx')) || 0,
        dy: parseFloat(el.style.getPropertyValue('--dy')) || 0,
        unit: desk.getBoundingClientRect().width / 100,
        moved: false,
      };
      el.style.zIndex = ++top;
    });

    el.addEventListener('pointermove', e => {
      if (!start || e.pointerId !== start.id) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) { start = null; return; } // released elsewhere
      const mx = e.clientX - start.x;
      const my = e.clientY - start.y;
      if (!start.moved) {
        if (Math.hypot(mx, my) < THRESHOLD) return;
        start.moved = true;
        // capture only once it is a real drag, so plain clicks on menu links still work
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-dragging');
      }
      el.style.setProperty('--dx', (start.dx + mx / start.unit).toFixed(3));
      el.style.setProperty('--dy', (start.dy + my / start.unit).toFixed(3));
    });

    const end = e => {
      if (!start || e.pointerId !== start.id) return;
      if (start.moved) {
        // swallow only the click that the browser fires right after this drag
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        resetBtn.hidden = false;
      }
      el.classList.remove('is-dragging');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      start = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    // a drag that ends over a menu link must not open it
    el.addEventListener('click', e => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    }, true);
  });

  // ==========================================================================
  // Storyboard (Figma section "Раскадровка").
  // All coordinates are Figma px in the 1440 × 900 frame, rotation in Figma degrees.
  // A menu click puts the chosen sheet in the centre, First and the sheets already
  // seen go aside, the menu card moves to the right.
  // ==========================================================================

  const PX = 1 / 5.25;                       // Figma px → cqw

  // where everything lies in "дефолтное состояние" (must match css/style.css)
  const HOME = {
    intro: [458, 82, 0], work: [444, 87, 2], teaching: [458, 272, 0], conferences: [458, 82, 0],
    publications: [514, 179, 0], awards: [525, 255, 0], education: [514, 179, 0], card: [755, 110, 0],
  };
  // the opened sheet
  const CENTER = {
    work: [457, 78, 0], teaching: [443, 285, 0], conferences: [458, 82, 0],
    publications: [514, 179, 0], awards: [525, 287, 0],
    education: [514, 179, 0],                // not in the storyboard yet
  };
  // sheets already seen (and First) are put aside, all in one stack on the left
  const AWAY = {
    intro: [-139, 82, 0], work: [-168, 111, 0], teaching: [-74, 205, 0], conferences: [-150, 90, 0],
    education: [-120, 160, 0], publications: [-100, 140, 0], awards: [-60, 300, 0],
  };
  // sheets not seen yet shift a little in the pile once First is gone
  const PILE = { conferences: [464.47, 77.47, -1], teaching: [452, 266, 0], education: AWAY.education };
  const CARD = [1054, 74, 0];
  // the left stack follows the menu order: Work on top, then Teaching, Education,
  // Conferences, Publications, Awards, First at the bottom.
  // Education not opened yet hides under all of them.
  const AWAY_Z = { education_hidden: 5, intro: 10, awards: 20, publications: 30, conferences: 40, education: 60, teaching: 70, work: 80 };
  const ACTIVE_Z = 100, CARD_Z = 200;

  const card = desk.querySelector('.card');
  const sheets = Object.keys(HOME).filter(k => k !== 'card').map(k => document.getElementById(k)).filter(Boolean);
  const snaps = [...desk.querySelectorAll('[data-with]')];
  const baseRot = new Map(items.map(el => [el, parseFloat(getComputedStyle(el).getPropertyValue('--rot')) || 0]));
  let view = 'home';
  let seen = [];
  let cardPinned = false;                    // the visitor moved the menu card by hand: leave it there

  function place(el, home, to) {
    el.style.setProperty('--sx', ((to[0] - home[0]) * PX).toFixed(3));
    el.style.setProperty('--sy', ((to[1] - home[1]) * PX).toFixed(3));
    el.style.setProperty('--rot', (baseRot.get(el) - (to[2] - home[2])) + 'deg');
  }
  function unplace(el) {
    ['--sx', '--sy', '--rot', 'z-index'].forEach(p => el.style.removeProperty(p));
  }
  function clearHand(el) {
    el.style.removeProperty('--dx');
    el.style.removeProperty('--dy');
    el.style.removeProperty('z-index');
  }

  function fit() {
    // the whole 1440-wide composition has to fit on narrow screens
    const w = desk.offsetWidth * 1440 / 525;
    desk.style.setProperty('--fit', view === 'home' ? 1 : Math.min(1, window.innerWidth / w).toFixed(4));
  }

  function setView(id) {
    desk.classList.remove('is-returning');
    desk.classList.add('is-moving');
    view = id;
    desk.dataset.view = id;
    if (id === 'home') seen = [];
    else seen = seen.filter(s => s !== id).concat(id);

    const placed = {};
    let step = 0;
    sheets.forEach(el => {
      clearHand(el);
      const k = el.id;
      el.style.removeProperty('--delay');
      if (id === 'home') return unplace(el);
      let to, z = '';
      if (k === id) { to = CENTER[k]; z = ACTIVE_Z; }
      else if (k === 'intro' || seen.includes(k)) { to = AWAY[k]; z = AWAY_Z[k]; }
      else { to = PILE[k] || HOME[k]; if (k === 'education') z = AWAY_Z.education_hidden; }
      place(el, HOME[k], to);
      placed[k] = to;
      el.style.zIndex = z;
      // a little delay one after another, so the sheets do not all move as one block
      el.style.setProperty('--delay', (k === id ? 0 : 0.05 * (++step)).toFixed(2) + 's');
    });

    // event photos lie in the top-right corner of Conferences and travel with it,
    // turning around the sheet corner together with the sheet
    const conf = document.getElementById('conferences');
    snaps.forEach((el, i) => {
      clearHand(el);
      el.style.setProperty('--delay', conf.style.getPropertyValue('--delay') || '0s');
      if (id === 'home') return unplace(el);
      const [cx, cy, cr] = placed.conferences;
      const ox = el.offsetLeft * 5.25 / (desk.offsetWidth / 100);   // photo corner from the sheet corner, Figma px
      const oy = el.offsetTop * 5.25 / (desk.offsetWidth / 100);
      const a = cr * Math.PI / 180;                                   // Figma turns counter-clockwise
      const x = cx + ox * Math.cos(a) + oy * Math.sin(a);
      const y = cy - ox * Math.sin(a) + oy * Math.cos(a);
      place(el, [HOME.conferences[0] + ox, HOME.conferences[1] + oy, 0], [x, y, cr]);
      // on the open sheet the photos lie on top; in the left stack they hide under the sheet,
      // so they do not peek out from behind the other sheets
      const cz = parseInt(conf.style.zIndex, 10);
      if (cz) el.style.zIndex = id === 'conferences' ? cz + 1 + i : cz - 5 + i;
    });

    if (!cardPinned) {
      clearHand(card);
      if (id === 'home') unplace(card);
      else { place(card, HOME.card, CARD); card.style.zIndex = CARD_Z; }
    } else card.style.zIndex = CARD_Z;

    top = Math.max(CARD_Z, ...items.map(el => parseInt(el.style.zIndex, 10) || 0));
    resetBtn.hidden = id === 'home' && !cardPinned;
    fit();
  }

  // menu
  document.querySelectorAll('.menu a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      if (!CENTER[id]) return;
      e.preventDefault();
      setView(id);
    });
  });

  // First sheet aside: a click on it brings everything back
  document.getElementById('intro').addEventListener('click', e => {
    if (view !== 'home' && !e.target.closest('a')) setView('home');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && view !== 'home') setView('home'); });

  // the menu card moved by hand stays where it was put
  card.addEventListener('pointerup', () => {
    if (!card.classList.contains('is-dragging') && !(parseFloat(card.style.getPropertyValue('--dx')) || parseFloat(card.style.getPropertyValue('--dy')))) return;
    if (!cardPinned) {
      cardPinned = true;
      // fold the view offset into the hand offset, so later views do not move it
      const sx = parseFloat(card.style.getPropertyValue('--sx')) || 0;
      const sy = parseFloat(card.style.getPropertyValue('--sy')) || 0;
      card.style.setProperty('--dx', ((parseFloat(card.style.getPropertyValue('--dx')) || 0) + sx).toFixed(3));
      card.style.setProperty('--dy', ((parseFloat(card.style.getPropertyValue('--dy')) || 0) + sy).toFixed(3));
      card.style.setProperty('--sx', 0);
      card.style.setProperty('--sy', 0);
    }
  }, true);

  window.addEventListener('resize', fit);

  // "Download CV" without a file yet does nothing
  document.querySelectorAll('a[aria-disabled="true"]').forEach(a => a.addEventListener('click', e => e.preventDefault()));

  // "Put back": everything, the menu card too, goes home
  resetBtn.addEventListener('click', () => {
    cardPinned = false;
    items.forEach(clearHand);
    setView('home');
    desk.classList.add('is-returning');
    top = Math.max(...items.map(el => parseInt(getComputedStyle(el).zIndex, 10) || 0));
  });
})();
