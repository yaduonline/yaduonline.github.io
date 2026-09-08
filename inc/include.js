document.addEventListener('DOMContentLoaded', function() {
  function loadFragment(selector, path) {
    fetch(path)
      .then(function(r) {
        if (!r.ok) throw new Error('Failed to load ' + path);
        return r.text();
      })
      .then(function(html) {
        var container = document.querySelector(selector);
        if (container) container.innerHTML = html;
        // If we just loaded the site footer, populate the last-updated timestamp (to the second).
        if (selector === '#site-footer') {
          try {
            var lastElem = document.getElementById('last-updated');
            var raw = document.lastModified;
            var parsed = new Date(raw);
            var date = isNaN(parsed.getTime()) ? new Date() : parsed;
            var formatted = date.toLocaleString(undefined, {
              year: 'numeric', month: 'short', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            if (lastElem) {
              lastElem.textContent = 'Last updated: ' + formatted;
            } else if (container) {
              var p = document.createElement('p');
              p.id = 'last-updated';
              p.style.margin = '6px 0 0 0';
              p.style.fontSize = '0.9em';
              p.textContent = 'Last updated: ' + formatted;
              container.appendChild(p);
            }
          } catch (e) {
            console.warn('Could not set last-updated:', e);
          }
        }
      })
      .catch(function(err) {
        console.warn(err);
      });
  }

  // Versioned like the games' scripts are. The page HTML is cached for minutes
  // and these fragments for hours, so without it a visitor can end up running
  // new include.js against a header fragment from before the theme control
  // existed - and the control silently never appears.
  loadFragment('#site-header', '/inc/header.html?v=2');
  loadFragment('#site-footer', '/inc/footer.html?v=2');
});

/**
 * Theme control.
 *
 * Three states, cycled in this order: system, light, dark. "system" removes
 * the attribute entirely and lets the prefers-color-scheme media query in
 * style.css decide, so the site follows the browser unless the visitor has
 * said otherwise. The choice is stored under "theme" and re-applied before
 * first paint by the inline snippet in each page's <head> - this file loads
 * too late to do it without a flash.
 */
(function () {
  var ORDER = ['system', 'light', 'dark'];
  var ICON = { system: '◐', light: '☀', dark: '☾' };
  var LABEL = {
    system: 'Colour theme: follow system',
    light: 'Colour theme: light',
    dark: 'Colour theme: dark',
  };

  function read() {
    try {
      var stored = localStorage.getItem('theme');
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch (e) {
      return 'system';
    }
  }

  function apply(mode) {
    if (mode === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    try {
      if (mode === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', mode);
    } catch (e) { /* private mode: the page still themes, it just will not stick */ }
  }

  function paintButton(button, mode) {
    var icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.textContent = ICON[mode];
    button.setAttribute('aria-label', LABEL[mode]);
    button.title = LABEL[mode];
  }

  function wire() {
    var button = document.getElementById('theme-toggle');
    if (!button || button.dataset.wired) return;
    button.dataset.wired = '1';
    paintButton(button, read());
    button.addEventListener('click', function () {
      var next = ORDER[(ORDER.indexOf(read()) + 1) % ORDER.length];
      apply(next);
      paintButton(button, next);
    });
  }

  // The header arrives asynchronously, so wire it whenever it turns up.
  document.addEventListener('DOMContentLoaded', function () {
    wire();
    var host = document.getElementById('site-header');
    if (host && window.MutationObserver) {
      new MutationObserver(wire).observe(host, { childList: true, subtree: true });
    }
  });
})();