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
      })
      .catch(function(err) {
        console.warn(err);
      });
  }

  loadFragment('#site-header', '/inc/header.html');
  loadFragment('#site-footer', '/inc/footer.html');
});