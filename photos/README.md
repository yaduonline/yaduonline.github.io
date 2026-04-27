# Photo Gallery Workflow

This document describes the streamlined process for adding new photo sets to the site.

## Goals

- Keep the website lightweight and responsive
- Store only optimized web-ready images in the repo
- Avoid checking in raw originals
- Reuse the existing gallery pattern and scripts
- Ask a few simple questions to write an engaging summary

## Folder structure

Each gallery should live in its own folder under `photos/`.
For example:

- `photos/uvas-canyon/`
  - `index.html`
  - `data.json`
  - `gallery.js`
  - `uvas-canyon-01.jpg`
  - `thumbs/uvas-canyon-01.jpg`

Add a new card for each gallery to `photos/index.html`.

## Workflow

1. Receive the source folder path for the new photos.
   - Example: `/Volumes/2TBSSD/Photos/BigSurWeekend`

2. Choose a gallery slug and title.
   - Slug example: `big-sur-weekend`
   - Gallery folder: `photos/big-sur-weekend/`

3. Run the resize script from the repo root:

```bash
.venv/bin/python scripts/resize_photos.py \
  --src "/Volumes/2TBSSD/Photos/BigSurWeekend" \
  --dest photos/big-sur-weekend \
  --data-file photos/big-sur-weekend/data.json \
  --title "Big Sur Weekend" \
  --description "Brief summary text here." \
  --prefix big-sur-weekend \
  --format jpg \
  --max-width 1200 \
  --thumb-width 400 \
  --quality 85
```

4. Copy the gallery page pattern from an existing set.
   - Use `photos/uvas-canyon/index.html` as the template.
   - Update the title and remove any placeholder text.
   - Ensure the page loads `gallery.js` and `data.json`.

5. Update `photos/index.html` with a new gallery card.
   - Add a link to the gallery folder.
   - Use a thumbnail from `photos/<slug>/thumbs/`.
   - Add a short description line.

6. Review and refine captions.
   - Open `photos/<slug>/data.json`.
   - Replace placeholder captions with scene-specific text.
   - Mention people occasionally for a personal touch.

7. Verify the gallery page.
   - Open `photos/<slug>/index.html` in a browser.
   - Confirm images load and captions display.
   - Check the main `photos/index.html` gallery card.

## If the folder contains more photos than expected

- Keep only the resized web-ready images in the repo.
- Do not commit original or RAW files.
- If there are videos or unsupported formats, ignore them for now.

## Questions to ask for a new gallery

When a new folder is provided, ask for:

1. What is the gallery title and location?
2. Who is in the photos? (names, relationships, kids)
3. What was the mood, weather, and key highlight of the visit?
4. Any specific parts of the trip or photos you want emphasized?
5. Should the caption order follow the trail/story from start to finish?

## When to consider external storage

Use GitHub Pages for small, optimized galleries.
If the site grows beyond a few hundred megabytes or dozens of galleries, move future sets to external storage or a CDN.

Recommended repo threshold:
- keep total site assets under `500-700 MB`
- avoid approaching `1 GB`

## Notes

- For each new gallery, I can also write the summary text and captions based on the images and answers to the questions above.
- If needed, I can create a gallery scaffold for you automatically from the source folder.

## Automated gallery creation

Use `scripts/add_photo_gallery.py` to create a new photo set with minimal manual steps.
From the repo root:

```bash
.venv/bin/python scripts/add_photo_gallery.py \
  --src "/Volumes/2TBSSD/Photos/BigSurWeekend" \
  --title "Big Sur Weekend" \
  --slug big-sur-weekend
```

The script will:
- create `photos/<slug>/`
- generate `index.html` and `gallery.js`
- resize the source images into `photos/<slug>/`
- create thumbnails in `photos/<slug>/thumbs/`
- create `photos/<slug>/data.json`
- add a gallery card to `photos/index.html`

If you want, I can also make this script generate placeholder captions for every new gallery automatically. 
