/* ====================================================
   Modal — window.Modal.confirm(title, msg) → Promise<boolean>
            window.Modal.alert(title, msg)   → Promise<void>
   ==================================================== */

(function () {
  function createBackdrop(onBackdrop) {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.addEventListener('click', (e) => {
      if (e.target === bd) onBackdrop();
    });
    document.body.appendChild(bd);
    return bd;
  }

  function onEscape(handler) {
    function listener(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', listener);
        handler();
      }
    }
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }

  function confirm(title, message) {
    return new Promise((resolve) => {
      let cleanup;

      const bd = createBackdrop(() => { cleanup(); resolve(false); });

      const box = document.createElement('div');
      box.className = 'modal-box';
      box.innerHTML = `
        <div class="modal-header">${title}</div>
        <div class="modal-body">${message}</div>
        <div class="modal-footer">
          <button class="btn btn-outline btn-sm" data-action="cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" data-action="confirm">Confirm</button>
        </div>
      `;
      bd.appendChild(box);

      cleanup = onEscape(() => { bd.remove(); resolve(false); });

      box.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        cleanup();
        bd.remove();
        resolve(false);
      });
      box.querySelector('[data-action="confirm"]').addEventListener('click', () => {
        cleanup();
        bd.remove();
        resolve(true);
      });
    });
  }

  function alert(title, message) {
    return new Promise((resolve) => {
      let cleanup;

      const bd = createBackdrop(() => { cleanup(); resolve(); });

      const box = document.createElement('div');
      box.className = 'modal-box';
      box.innerHTML = `
        <div class="modal-header">${title}</div>
        <div class="modal-body">${message}</div>
        <div class="modal-footer">
          <button class="btn btn-primary btn-sm" data-action="ok">OK</button>
        </div>
      `;
      bd.appendChild(box);

      cleanup = onEscape(() => { bd.remove(); resolve(); });

      box.querySelector('[data-action="ok"]').addEventListener('click', () => {
        cleanup();
        bd.remove();
        resolve();
      });
    });
  }

  window.Modal = { confirm, alert };
})();
