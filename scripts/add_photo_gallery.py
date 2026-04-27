#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

GALLERY_PAGE_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - Photos</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div id="site-header"></div>

    <main>
        <h2>{title}</h2>

        <div class="photo-gallery">
            <p class="placeholder">Gallery content will appear here once photos are resized and added.</p>
        </div>
    </main>

    <div id="site-footer"></div>
    <script src="/inc/include.js"></script>
    <script src="gallery.js"></script>
</body>
</html>
'''

GALLERY_JS_TEMPLATE = '''document.addEventListener('DOMContentLoaded', () => {
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
'''

PHOTO_INDEX_TEMPLATE = '''            <div class="photo-item">
                <a href="/photos/{slug}/"><img src="/photos/{slug}/thumbs/{preview_image}" alt="{title} preview" loading="lazy"></a>
                <h3><a href="/photos/{slug}/">{title}</a></h3>
                <p class="photo-caption">{summary}</p>
            </div>
'''


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Create a new photo gallery from a source folder.')
    parser.add_argument('--src', required=True, help='Source folder containing original photos')
    parser.add_argument('--slug', help='Gallery slug to use for the folder name')
    parser.add_argument('--title', help='Gallery title shown on the photo page')
    parser.add_argument('--description', help='Gallery summary description to store in data.json')
    parser.add_argument('--people', help='Comma-separated names of the people in the photos')
    parser.add_argument('--weather', help='Weather and mood during the photo trip')
    parser.add_argument('--highlight', help='Key highlight or memory from the outing')
    parser.add_argument('--format', default='jpg', choices=['jpg', 'jpeg', 'png', 'webp'], help='Output image format')
    parser.add_argument('--max-width', type=int, default=1200, help='Maximum width for full-size images')
    parser.add_argument('--thumb-width', type=int, default=400, help='Maximum width for thumbnails')
    parser.add_argument('--quality', type=int, default=85, help='Image quality for output files')
    parser.add_argument('--force', action='store_true', help='Overwrite existing gallery files if needed')
    parser.add_argument('--no-prompt', action='store_true', help='Do not ask interactive questions')
    parser.add_argument('--index-file', default='photos/index.html', help='Path to the main photos index page')
    return parser.parse_args()


def ask(prompt: str, default: Optional[str] = None) -> str:
    if default is not None:
        prompt_text = f"{prompt} [{default}]: "
    else:
        prompt_text = f"{prompt}: "
    if not sys.stdin.isatty():
        return default or ''
    response = input(prompt_text).strip()
    return response or (default or '')


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", '-', value)
    value = re.sub(r"^-+|-+$", '', value)
    return value or 'gallery'


def build_description(title: str, people: str, weather: str, highlight: str) -> str:
    parts = []
    if title:
        parts.append(f"A visit to {title}.")
    if people:
        parts.append(f"The photos include {people}.")
    if weather:
        parts.append(f"The weather was {weather}.")
    if highlight:
        parts.append(f"The highlight was {highlight}.")
    parts.append("The trail felt refreshed after recent rain, with mossy rocks, flowing water, and a peaceful forest atmosphere.")
    return ' '.join(parts)


def create_gallery_page(folder: Path, title: str, force: bool) -> None:
    page_path = folder / 'index.html'
    if page_path.exists() and not force:
        print(f'Skipping existing gallery page: {page_path}')
        return
    page_path.write_text(GALLERY_PAGE_TEMPLATE.format(title=title), encoding='utf-8')
    print(f'Created gallery page: {page_path}')


def create_gallery_script(folder: Path, force: bool) -> None:
    js_path = folder / 'gallery.js'
    if js_path.exists() and not force:
        print(f'Skipping existing gallery script: {js_path}')
        return
    js_path.write_text(GALLERY_JS_TEMPLATE, encoding='utf-8')
    print(f'Created gallery script: {js_path}')


def find_matching_closing_div(html: str, start_pos: int) -> int:
    count = 1
    pos = start_pos
    while count > 0:
        next_open = html.find('<div', pos)
        next_close = html.find('</div>', pos)
        if next_close == -1:
            break
        if next_open != -1 and next_open < next_close:
            count += 1
            pos = next_open + 4
        else:
            count -= 1
            if count == 0:
                return next_close
            pos = next_close + 6
    raise ValueError('Matching closing </div> not found')


def insert_gallery_card(index_path: Path, slug: str, title: str, summary: str, preview_image: str) -> None:
    html = index_path.read_text(encoding='utf-8')
    if f'href="/photos/{slug}/"' in html:
        print(f'Gallery card already exists in {index_path} for {slug}')
        return

    insert_html = PHOTO_INDEX_TEMPLATE.format(slug=slug, title=title, summary=summary, preview_image=preview_image)
    marker = '<div class="photo-gallery">'
    start = html.find(marker)
    if start == -1:
        raise SystemExit(f'Could not find photo gallery container in {index_path}')
    end = find_matching_closing_div(html, start + len(marker))
    new_html = html[:end] + insert_html + html[end:]
    index_path.write_text(new_html, encoding='utf-8')
    print(f'Updated main index page: {index_path}')


def run_resize_script(src: Path, dest: Path, title: str, description: str, prefix: str, fmt: str, max_width: int, thumb_width: int, quality: int) -> None:
    script_path = Path('scripts/resize_photos.py')
    if not script_path.exists():
        raise SystemExit('resize_photos.py not found in scripts/')

    command = [
        sys.executable,
        str(script_path),
        '--src', str(src),
        '--dest', str(dest),
        '--data-file', str(dest / 'data.json'),
        '--title', title,
        '--description', description,
        '--prefix', prefix,
        '--format', fmt,
        '--max-width', str(max_width),
        '--thumb-width', str(thumb_width),
        '--quality', str(quality),
    ]
    print('Running resize script:')
    print(' '.join(command))
    result = subprocess.run(command, check=False)
    if result.returncode != 0:
        raise SystemExit(f'Resize script failed with code {result.returncode}')


def ensure_folder(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def main() -> int:
    args = parse_args()
    src = Path(args.src).expanduser().resolve()
    if not src.exists() or not src.is_dir():
        raise SystemExit(f'Source folder not found: {src}')

    slug = args.slug.strip() if args.slug else slugify(args.title or src.name)
    title = args.title.strip() if args.title else ask('Gallery title', src.name.replace('-', ' ').replace('_', ' ').title())
    if not title:
        title = src.name.replace('-', ' ').replace('_', ' ').title()

    people = args.people.strip() if args.people else ask('Who is in the photos? (names or relationships)', 'me, Sampada, Shaarvi, Gaargi')
    weather = args.weather.strip() if args.weather else ask('Weather and mood during the trip', 'cloudy with light drizzle')
    highlight = args.highlight.strip() if args.highlight else ask('What was the trip highlight?', 'small waterfalls and creek-side rocks')

    description = args.description.strip() if args.description else build_description(title, people, weather, highlight)

    dest = Path('photos') / slug
    ensure_folder(dest)
    ensure_folder(dest / 'thumbs')

    create_gallery_page(dest, title, args.force)
    create_gallery_script(dest, args.force)

    run_resize_script(src, dest, title, description, slug, args.format, args.max_width, args.thumb_width, args.quality)

    preview_image = f'{slug}-01.{args.format.lower()}'
    summary = description.split('.')[0].strip() if description else title
    insert_gallery_card(Path(args.index_file), slug, title, summary, preview_image)

    print('\nGallery creation complete.')
    print(f'New gallery folder: {dest}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
