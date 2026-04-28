document.addEventListener('DOMContentLoaded', () => {
  const gallery = document.querySelector('.photo-gallery');
  if (!gallery) return;

  fetch('data.json')
    .then((response) => response.json())
    .then((data) => {
      gallery.innerHTML = '';
      const heading = document.createElement('p');
      heading.textContent = data.description;
      heading.className = 'photo-intro';
      gallery.parentElement.insertBefore(heading, gallery);

      data.images.forEach((image) => {
        const item = document.createElement('div');
        item.className = 'photo-item';

        const img = document.createElement('img');
        img.src = image.filename;
        img.alt = image.caption;
        img.loading = 'lazy';
        item.appendChild(img);

        const caption = document.createElement('p');
        caption.className = 'photo-caption';
        caption.textContent = image.caption;
        item.appendChild(caption);

        gallery.appendChild(item);
      });
    })
    .catch(() => {
      gallery.innerHTML = '<p class="placeholder">Unable to load gallery metadata. Please check data.json.</p>';
    });
});
