// Drag the sheets and the menu card with mouse or finger.
// The grabbed element goes on top of the pile. Offsets are stored in cqw
// (percent of the sheet width), so positions survive window resizing.
(() => {
  const desk = document.querySelector('.desk');
  const items = [...desk.querySelectorAll('[data-drag]')];
  const resetBtn = document.querySelector('.reset');
  const THRESHOLD = 4; // px of movement before it counts as a drag, not a click
  const phoneQuery = window.matchMedia('(max-width: 640px)');
  const isPhone = () => phoneQuery.matches;

  let top = Math.max(...items.map(el => parseInt(getComputedStyle(el).zIndex, 10) || 0));

  items.forEach(el => {
    let start = null;
    let suppressClick = false;

    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || isPhone()) return;   // on a phone sheets are swiped, not dragged
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
      // the sheet on top is always level: a clicked sheet turns straight
      if (el.classList.contains('sheet')) straighten(el);
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

  // event photos lie in the top-right corner of Conferences and travel with it,
  // turning around the sheet corner together with the sheet
  let confNow = null;                        // where Conferences is now, null = at home
  function placeSnaps(all) {
    const conf = document.getElementById('conferences');
    snaps.forEach((el, i) => {
      const byHand = el.style.getPropertyValue('--dx') || el.style.getPropertyValue('--dy');
      if (!all && byHand) return;            // a photo moved by hand stays where it was put
      if (all) clearHand(el);
      el.style.setProperty('--delay', conf.style.getPropertyValue('--delay') || '0s');
      if (!confNow) { if (all) unplace(el); return; }
      const [cx, cy, cr] = confNow;
      const ox = el.offsetLeft * 5.25 / (desk.offsetWidth / 100);   // photo corner from the sheet corner, Figma px
      const oy = el.offsetTop * 5.25 / (desk.offsetWidth / 100);
      const a = cr * Math.PI / 180;                                   // Figma turns counter-clockwise
      const x = cx + ox * Math.cos(a) + oy * Math.sin(a);
      const y = cy - ox * Math.sin(a) + oy * Math.cos(a);
      place(el, [HOME.conferences[0] + ox, HOME.conferences[1] + oy, 0], [x, y, cr]);
      if (!all) return;
      // on the open sheet the photos lie on top; in the left stack they hide under the sheet,
      // so they do not peek out from behind the other sheets
      const cz = parseInt(conf.style.zIndex, 10);
      if (cz) el.style.zIndex = view === 'conferences' ? cz + 1 + i : cz - 5 + i;
    });
  }

  function straighten(el) {
    el.style.setProperty('--rot', '0deg');
    if (el.id === 'conferences') {
      if (confNow) confNow[2] = 0;
      else if (baseRot.get(el)) confNow = [...HOME.conferences.slice(0, 2), 0];
      placeSnaps(false);
    }
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

    confNow = id === 'home' ? null : placed.conferences.slice();
    placeSnaps(true);

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
      if (isPhone()) return phoneOpen(id);
      setView(id);
    });
  });

  // First sheet aside: a click on it brings everything back
  document.getElementById('intro').addEventListener('click', e => {
    if (!isPhone() && view !== 'home' && !e.target.closest('a')) setView('home');
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (isPhone()) phoneMenu(false);
    else if (view !== 'home') setView('home');
  });

  // the menu card moved by hand stays where it was put
  card.addEventListener('pointerup', () => {
    if (isPhone()) return;
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

  window.addEventListener('resize', () => { if (isPhone()) phoneCard(); else fit(); });

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

  // ==========================================================================
  // Phone. No spreading out: the sheets stay in the pile of the first frame and
  // change places in it. The open sheet is on top; a swipe tucks it under the pile
  // (left = next, right = back). The menu card lies on the pile in the first frame;
  // after the first section is opened it waits as a blue strip at the right edge,
  // a tap slides it out.
  // ==========================================================================

  const ORDER = ['intro', 'work', 'teaching', 'education', 'conferences', 'publications', 'awards'];
  let deck = ORDER.slice();                  // deck[0] lies on top, the rest in menu order
  let menuOpen = false;
  let cardHome = true;                       // first frame: the card lies on the pile as on desktop
  let busy = false;

  // a sheet together with what lies on it (photos on Conferences)
  const withPhotos = k => [document.getElementById(k), ...(k === 'conferences' ? snaps : [])];

  function phoneLayout() {
    deck.forEach((k, i) => {
      const el = document.getElementById(k);
      const to = i === 0 ? (CENTER[k] || HOME[k]) : HOME[k];
      place(el, HOME[k], to);
      el.style.zIndex = (ORDER.length - i) * 10;
      if (k === 'conferences') confNow = i === 0 ? to.slice() : null;
    });
    placeSnaps(true);
    const cz = parseInt(document.getElementById('conferences').style.zIndex, 10);
    snaps.forEach((el, i) => { el.style.zIndex = cz + 1 + i; });
  }

  function phoneCard() {
    card.style.zIndex = 200;
    if (cardHome) {                          // until the first section is opened
      ['--sx', '--sy'].forEach(p => card.style.removeProperty(p));
      card.classList.add('is-open');
      return;
    }
    const unit = desk.offsetWidth / 100;
    const right = window.innerWidth - desk.getBoundingClientRect().left;   // screen edge, px from the sheet corner
    const x = menuOpen ? right - card.offsetWidth - 12 : right - 22;      // 22px of blue stays on screen
    card.style.setProperty('--sx', (x / unit - 56.571).toFixed(3));       // 56.571cqw = card home left
    card.style.setProperty('--sy', 0);
    card.style.zIndex = 200;
    card.classList.toggle('is-open', menuOpen);
  }

  function phoneMenu(open) {
    if (cardHome) return;
    menuOpen = open;
    phoneCard();
  }

  // bring a sheet on top: it slides in from the side (from = -1 left, 1 right)
  function phoneOpen(id, from = 1) {
    if (cardHome) { cardHome = false; phoneCard(); }   // from now on the menu is a strip at the edge
    phoneMenu(false);
    if (deck[0] === id || busy) return;
    busy = true;
    const el = document.getElementById(id);
    // the pile keeps the menu order: after the open sheet come the next ones, so a swipe
    // left always shows the next section and a swipe right the previous one
    const i = ORDER.indexOf(id);
    deck = ORDER.slice(i).concat(ORDER.slice(0, i));
    // it lies under the pile, so it can be moved aside unseen
    const startX = 110 * from + (((CENTER[id] || HOME[id])[0] - HOME[id][0]) / 5.25);
    withPhotos(id).forEach(n => {
      n.style.transition = 'none';
      n.style.setProperty('--sx', startX.toFixed(3));
      n.style.zIndex = 100;
    });
    void el.offsetWidth;
    withPhotos(id).forEach(n => { n.style.transition = ''; });
    phoneLayout();
    setTimeout(() => { phoneLayout(); busy = false; }, 800);
  }

  // tuck the top sheet under the pile
  function phoneNext() {
    if (busy) return;
    busy = true;
    if (cardHome) { cardHome = false; phoneCard(); }
    const k = deck[0];
    const els = withPhotos(k);
    els.forEach(n => {
      n.classList.remove('is-dragging');
      n.style.transition = 'translate 0.35s cubic-bezier(0.4, 0, 0.2, 1), rotate 0.35s ease';
      n.style.setProperty('--dx', -110);
    });
    setTimeout(() => {
      deck = [...deck.slice(1), k];
      els.forEach(n => { n.style.transition = ''; n.style.removeProperty('--dx'); });
      phoneLayout();
      setTimeout(() => { busy = false; }, 500);
    }, 350);
  }

  function phoneBack() {
    withPhotos(deck[0]).forEach(n => { n.classList.remove('is-dragging'); n.style.removeProperty('--dx'); });
    phoneOpen(deck[deck.length - 1], -1);
  }

  // swipe
  let swipe = null;
  desk.addEventListener('pointerdown', e => {
    if (!isPhone() || busy || card.contains(e.target)) return;
    if (menuOpen) { phoneMenu(false); return; }
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false };
  });
  desk.addEventListener('pointermove', e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const mx = e.clientX - swipe.x, my = e.clientY - swipe.y;
    if (!swipe.on) {
      if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(my)) return;
      swipe.on = true;
      desk.setPointerCapture(e.pointerId);
      withPhotos(deck[0]).forEach(n => n.classList.add('is-dragging'));
    }
    withPhotos(deck[0]).forEach(n => n.style.setProperty('--dx', (mx / (desk.offsetWidth / 100)).toFixed(3)));
  });
  const swipeEnd = e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const mx = e.clientX - swipe.x;
    const on = swipe.on;
    swipe = null;
    if (!on) return;
    if (mx < -50) return phoneNext();
    if (mx > 50) return phoneBack();
    withPhotos(deck[0]).forEach(n => { n.classList.remove('is-dragging'); n.style.removeProperty('--dx'); });
  };
  desk.addEventListener('pointerup', swipeEnd);
  desk.addEventListener('pointercancel', swipeEnd);

  // the closed menu strip opens on a tap, its links wait until it is out
  card.addEventListener('click', e => {
    if (!isPhone() || menuOpen || cardHome) return;
    e.preventDefault();
    e.stopPropagation();
    phoneMenu(true);
  }, true);
  document.addEventListener('click', e => {
    if (isPhone() && menuOpen && !card.contains(e.target)) phoneMenu(false);
  });

  // switching between phone and desktop (turning a tablet, resizing a window)
  function setMode() {
    items.forEach(el => {
      clearHand(el);
      unplace(el);
      el.style.removeProperty('--delay');
      el.style.transition = '';
      el.classList.remove('is-dragging', 'is-open');
    });
    desk.classList.remove('is-moving', 'is-returning');
    view = 'home'; seen = []; cardPinned = false; confNow = null;
    desk.dataset.view = 'home';
    desk.style.setProperty('--fit', 1);
    resetBtn.hidden = true;
    deck = ORDER.slice(); menuOpen = false; cardHome = true;
    if (isPhone()) { phoneLayout(); phoneCard(); }
  }
  phoneQuery.addEventListener('change', setMode);
  if (isPhone()) setMode();
})();
