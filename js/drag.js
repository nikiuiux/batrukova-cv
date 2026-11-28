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
      // photos lying on Conferences travel with it (not the ones moved off it by hand)
      start.carry = el.id === 'conferences'
        ? snaps.filter(n => !n.dataset.loose).map(n => {
            n.style.zIndex = ++top;
            return { n, dx: parseFloat(n.style.getPropertyValue('--dx')) || 0, dy: parseFloat(n.style.getPropertyValue('--dy')) || 0 };
          })
        : [];
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
        start.carry.forEach(c => c.n.classList.add('is-dragging'));
        if (el.dataset.with) el.dataset.loose = '1';   // a photo taken off the sheet by hand stays where it is put
      }
      el.style.setProperty('--dx', (start.dx + mx / start.unit).toFixed(3));
      el.style.setProperty('--dy', (start.dy + my / start.unit).toFixed(3));
      start.carry.forEach(c => {
        c.n.style.setProperty('--dx', (c.dx + mx / start.unit).toFixed(3));
        c.n.style.setProperty('--dy', (c.dy + my / start.unit).toFixed(3));
      });
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
      start.carry.forEach(c => c.n.classList.remove('is-dragging'));
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
  // before it in the menu are turned over to the left like pages of a book, the ones
  // after it stay in the pile under it; the menu card moves to the right.
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
  // sheets before the open one (and First) are turned over to one stack on the left
  const AWAY = {
    intro: [-139, 82, 0], work: [-168, 111, 0], teaching: [-74, 205, 0], conferences: [-150, 90, 0],
    education: [-120, 160, 0], publications: [-100, 140, 0], awards: [-60, 300, 0],
  };
  // sheets after the open one shift a little in the pile once First is gone
  const PILE = { conferences: [464.47, 77.47, -1], teaching: [452, 266, 0] };
  const CARD = [1054, 74, 0];
  // the left stack is turned over page by page: First at the bottom, the latest turned sheet on top.
  // Sheets still ahead wait in the pile under the open one, Education at the very bottom of it.
  const AWAY_Z = { intro: 10, work: 20, teaching: 30, education: 40, conferences: 50, publications: 60, awards: 70 };
  const SEQ = ['work', 'teaching', 'education', 'conferences', 'publications', 'awards'];   // menu order
  const ACTIVE_Z = 100, CARD_Z = 200;

  const card = desk.querySelector('.card');
  const sheets = Object.keys(HOME).filter(k => k !== 'card').map(k => document.getElementById(k)).filter(Boolean);
  const snaps = [...desk.querySelectorAll('[data-with]')];
  const baseRot = new Map(items.map(el => [el, parseFloat(getComputedStyle(el).getPropertyValue('--rot')) || 0]));
  let view = 'home';
  let cardPinned = false;                    // the visitor moved the menu card by hand: leave it there
  let phaseTimer = 0;
  let lastPlaced = { ...HOME };              // where each sheet was sent last time

  function place(el, home, to) {
    el.style.setProperty('--sx', ((to[0] - home[0]) * PX).toFixed(3));
    el.style.setProperty('--sy', ((to[1] - home[1]) * PX).toFixed(3));
    el.style.setProperty('--rot', (baseRot.get(el) - (to[2] - home[2])) + 'deg');
  }
  function unplace(el) {
    ['--sx', '--sy', '--rot', 'z-index'].forEach(p => el.style.removeProperty(p));
  }
  function clearHand(el) {
    delete el.dataset.loose;
    el.style.removeProperty('--dx');
    el.style.removeProperty('--dy');
    el.style.removeProperty('z-index');
  }

  // event photos lie in the top-right corner of Conferences and travel with it,
  // turning around the sheet corner together with the sheet
  let confNow = null;                        // where Conferences is now, null = at home
  // spread out after a click: [left, top, Figma rotation] from the sheet corner, Figma px.
  // They fill the free space right of and under the list.
  // (Muravyov top right, the EEF stage under it, a row of three under the list: map, foresight session, EEF)
  const SPREAD = [[336, 112, 0.5], [177, 527, -1.5], [303, 352, -1.5], [18, 528, 1], [338, 525, 1]];
  let spread = false;
  function placeSnaps(all) {
    const conf = document.getElementById('conferences');
    snaps.forEach((el, i) => {
      if (!all && el.dataset.loose) return;  // a photo moved off the sheet by hand stays where it was put
      if (all) { clearHand(el); delete el.dataset.loose; }
      el.style.setProperty('--delay', conf.style.getPropertyValue('--delay') || '0s');
      const sp = spread && SPREAD[i];
      if (!confNow && !sp) { if (all) unplace(el); return; }
      const [cx, cy, cr] = confNow || HOME.conferences;
      const ux = 5.25 / (desk.offsetWidth / 100);
      const hx = el.offsetLeft * ux, hy = el.offsetTop * ux;        // pile place from the sheet corner, Figma px
      const ox = sp ? sp[0] : hx, oy = sp ? sp[1] : hy;
      const a = cr * Math.PI / 180;                                   // Figma turns counter-clockwise
      const x = cx + ox * Math.cos(a) + oy * Math.sin(a);
      const y = cy - ox * Math.sin(a) + oy * Math.cos(a);
      place(el, [HOME.conferences[0] + hx, HOME.conferences[1] + hy, 0], [x, y, cr]);
      if (sp) el.style.setProperty('--rot', -(cr + sp[2]) + 'deg');
      if (!all) return;
      // on the open sheet the photos lie on top; in the left stack they hide under the sheet,
      // so they do not peek out from behind the other sheets
      const cz = parseInt(conf.style.zIndex, 10);
      if (cz) el.style.zIndex = view === 'conferences' || spread || isPhone() ? cz + 1 + i : cz - 5 + i;
    });
  }

  // a click on a photo spreads the pile out, so all of them are seen at once; another click gathers it
  snaps.forEach(el => el.addEventListener('click', e => {
    if (e.defaultPrevented) return;          // the click that ends a drag
    spread = !spread;
    snaps.forEach(n => n.style.setProperty('--delay', '0s'));
    placeSnaps(true);
    if (spread && view !== 'conferences') {      // keep them above the sheet while spread
      const cz = parseInt(getComputedStyle(document.getElementById('conferences')).zIndex, 10) || 3;
      snaps.forEach((n, i) => { n.style.zIndex = cz + 1 + i; });
    }
  }));

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
    const at = SEQ.indexOf(id);
    const chosen = id === 'home' ? 'intro' : id;
    spread = false;                            // photos gather back into their pile
    clearTimeout(phaseTimer);

    // where every sheet goes
    const placed = {}, zs = {};
    sheets.forEach(el => {
      const k = el.id;
      let to = HOME[k], z = '';
      if (id !== 'home') {
        if (k === id) { to = CENTER[k]; z = ACTIVE_Z; }
        else if (k === 'intro' || SEQ.indexOf(k) < at) { to = AWAY[k]; z = AWAY_Z[k]; }
        else to = PILE[k] || HOME[k];
      }
      placed[k] = to;
      zs[k] = z;
    });

    // Two steps: first the sheets in the way slide off (one after another, the top one first),
    // then the chosen section comes up.
    const moved = k => String(lastPlaced[k]) !== String(placed[k]);
    const side = k => (k === 'intro' ? -1 : SEQ.indexOf(k));
    const goingLeft = sheets.map(el => el.id).filter(k => k !== chosen && moved(k) && zs[k] >= AWAY_Z.intro)
      .sort((a, b) => side(a) - side(b));
    const coming = sheets.map(el => el.id).filter(k => k !== chosen && moved(k) && !goingLeft.includes(k))
      .sort((a, b) => side(b) - side(a));
    const movers = [...goingLeft, ...coming];
    const STEP = 0.09;
    const delay = {};
    movers.forEach((k, i) => { delay[k] = i * STEP; });
    delay[chosen] = movers.length ? 0.35 + STEP * (movers.length - 1) : 0;

    const chosenEl = document.getElementById(chosen);
    const chosenZ = chosenEl.style.zIndex;     // it stays at its place in the pile until its turn
    sheets.forEach(el => {
      const k = el.id;
      clearHand(el);
      if (id === 'home') unplace(el);
      else place(el, HOME[k], placed[k]);
      el.style.zIndex = zs[k];
      el.style.setProperty('--delay', (delay[k] || 0).toFixed(2) + 's');
    });
    lastPlaced = placed;

    confNow = id === 'home' ? null : placed.conferences.slice();
    placeSnaps(true);

    if (delay[chosen]) {
      const raise = () => {
        chosenEl.style.zIndex = zs[chosen];
        if (chosen === 'conferences') placeSnaps(true);
      };
      chosenEl.style.zIndex = chosenZ;
      if (chosen === 'conferences') snaps.forEach((n, i) => { n.style.zIndex = (parseInt(chosenZ, 10) || 3) + 1 + i; });
      phaseTimer = setTimeout(raise, delay[chosen] * 1000);
    }

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

  // "Contents" on the menu card leads back to the first frame
  card.querySelector('.card__home').addEventListener('click', e => {
    e.preventDefault();
    if (isPhone()) { if (deck[0] !== 'intro') phoneOpen('intro'); }
    else if (view !== 'home') setView('home');
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

  // Analytics (GoatCounter, script in index.html): which sections are opened and CV downloads.
  // Without the script nothing is sent.
  function track(name) {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: name, event: true }); } catch (_) {}
  }
  document.querySelectorAll('.menu a[href^="#"]').forEach(a => a.addEventListener('click', () => track('open-' + a.getAttribute('href').slice(1))));
  document.querySelectorAll('.contacts__cv').forEach(a => a.addEventListener('click', () => track('download-cv')));
  document.querySelectorAll('.contacts a[href^="mailto"], .contacts a[href*="t.me"], .contacts a[href*="instagram"]').forEach(a =>
    a.addEventListener('click', () => track('contact-' + (a.href.startsWith('mailto') ? 'email' : a.href.includes('t.me') ? 'telegram' : 'instagram'))));

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
  // to the left and the next section comes up (there is no swiping back). The menu card lies on the pile in the first frame;
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

  const toStart = document.querySelector('.to-start');
  toStart.addEventListener('click', () => phoneOpen('intro', -1));

  function phoneLayout() {
    toStart.hidden = deck[0] === 'intro';    // "Home" shows once the first sheet is not on top
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
    const unit = desk.offsetWidth / 100;
    const right = window.innerWidth - desk.getBoundingClientRect().left;   // screen edge, px from the sheet corner
    if (cardHome) {                          // until the first section is opened: on the pile, as on desktop
      ['--sx', '--sy'].forEach(p => card.style.removeProperty(p));   // (its empty right margin may hang off the screen)
      card.classList.add('is-open');
      return;
    }
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
    spread = false;
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
    spread = false;
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
    if (mx < -50) return phoneNext();        // only forward: a swipe to the right just puts the sheet back
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
    view = 'home'; cardPinned = false; confNow = null; spread = false; lastPlaced = { ...HOME }; clearTimeout(phaseTimer);
    desk.dataset.view = 'home';
    desk.style.setProperty('--fit', 1);
    resetBtn.hidden = true;
    deck = ORDER.slice(); menuOpen = false; cardHome = true;
    if (isPhone()) { phoneLayout(); phoneCard(); }
  }
  phoneQuery.addEventListener('change', setMode);
  if (isPhone()) setMode();
})();
