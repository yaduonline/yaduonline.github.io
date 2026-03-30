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
              p.style.color = '#333';
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

  loadFragment('#site-header', '/inc/header.html');
  loadFragment('#site-footer', '/inc/footer.html');
});