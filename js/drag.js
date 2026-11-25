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

  // a menu link whose target is a sheet on the desk brings that sheet on top
  document.querySelectorAll('.menu a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target || !target.hasAttribute('data-drag')) return;
      e.preventDefault();
      target.style.zIndex = ++top;
      // the menu card stays above the sheet it opened, so the next item is still clickable
      const card = a.closest('[data-drag]');
      if (card) card.style.zIndex = ++top;
      target.animate(
        [{ scale: 1 }, { scale: 1.02 }, { scale: 1 }],
        { duration: 350, easing: 'ease-out' }
      );
    });
  });

  resetBtn.addEventListener('click', () => {
    desk.classList.add('is-returning');
    items.forEach(el => {
      el.style.removeProperty('--dx');
      el.style.removeProperty('--dy');
      el.style.removeProperty('z-index');
    });
    top = Math.max(...items.map(el => parseInt(getComputedStyle(el).zIndex, 10) || 0));
    resetBtn.hidden = true;
  });
})();
