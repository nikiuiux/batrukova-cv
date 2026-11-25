// Drag sheets, the note and the menu card with mouse or finger.
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
      desk.classList.remove('is-returning');
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

  // ---------- views ----------
  // A menu click switches the desk to that section's composition (see "views" in style.css):
  // the intro sheet slides down, the note and the menu move aside, the section sheet comes to the middle.
  // A click on the intro sheet, Esc or "Put back" returns to the start.

  // width of the widest composition, in sheet widths (Figma "композиция": 1024px / 439.5px)
  const SPREAD_WIDTH = 2.33;

  function clearManual() {
    items.forEach(el => {
      el.style.removeProperty('--dx');
      el.style.removeProperty('--dy');
      el.style.removeProperty('z-index');
    });
    top = Math.max(...items.map(el => parseInt(getComputedStyle(el).zIndex, 10) || 0));
  }

  function fit() {
    if (desk.dataset.view === 'home') { desk.style.setProperty('--fit', 1); return; }
    // scale the composition down when it is wider than the screen
    const w = desk.offsetWidth * SPREAD_WIDTH;
    desk.style.setProperty('--fit', Math.min(1, (window.innerWidth * 0.96) / w).toFixed(3));
  }

  function setView(view) {
    if (desk.dataset.view === view) return;
    desk.classList.remove('is-returning');
    desk.classList.add('is-moving');
    clearManual();
    desk.dataset.view = view;
    fit();
    resetBtn.hidden = view === 'home';
    clearTimeout(setView.t);
    setView.t = setTimeout(() => desk.classList.remove('is-moving'), 850);
  }

  document.querySelectorAll('.menu a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (!target || !target.hasAttribute('data-drag')) return; // section without a sheet yet
      e.preventDefault();
      setView(id);
    });
  });

  // back to the start: click the intro sheet (not a drag), or press Esc
  const intro = document.getElementById('intro');
  intro.addEventListener('click', () => { if (desk.dataset.view !== 'home') setView('home'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setView('home'); });
  window.addEventListener('resize', fit);

  resetBtn.addEventListener('click', () => {
    if (desk.dataset.view !== 'home') { setView('home'); return; }
    desk.classList.add('is-returning');
    clearManual();
    resetBtn.hidden = true;
  });
})();
