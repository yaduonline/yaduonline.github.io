#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List, Optional

try:
    import pillow_heif  # noqa: F401
except ImportError:
    raise SystemExit('Install pillow-heif to support HEIC input files: pip install pillow-heif')

from PIL import Image, ImageOps

pillow_heif.register_heif_opener()

SUPPORTED_IMAGE_EXTENSIONS = {'.heic', '.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff'}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Resize a folder of photos to web-ready images and thumbnails.',
    )

    parser.add_argument('--src', required=True, help='Source folder containing original images')
    parser.add_argument('--dest', required=True, help='Destination folder for resized web images')
    parser.add_argument('--thumb-dir', default='thumbs', help='Subfolder name for thumbnail images')
    parser.add_argument('--data-file', default=None, help='If provided, writes or updates metadata JSON here')
    parser.add_argument('--title', default='Photos', help='Title to set in generated metadata')
    parser.add_argument('--description', default='', help='Description to set in generated metadata')
    parser.add_argument('--prefix', default='photo', help='Filename prefix for resized images')
    parser.add_argument('--format', default='jpg', choices=['jpg', 'jpeg', 'png', 'webp'], help='Output image format')
    parser.add_argument('--max-width', type=int, default=1200, help='Maximum width for full-size images')
    parser.add_argument('--thumb-width', type=int, default=400, help='Maximum width for thumbnails')
    parser.add_argument('--quality', type=int, default=85, help='Output quality for JPEG/WebP images')
    parser.add_argument('--dry-run', action='store_true', help='Print planned actions without writing files')

    return parser.parse_args()


def gather_source_files(src_dir: Path) -> List[Path]:
    if not src_dir.exists() or not src_dir.is_dir():
        raise FileNotFoundError(f'Source folder not found: {src_dir}')

    files = [
        p for p in sorted(src_dir.iterdir())
        if not p.name.startswith('.') and p.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS
    ]
    return files


def resize_image(image: Image.Image, max_width: int) -> Image.Image:
    if image.width <= max_width:
        return image.copy()
    ratio = max_width / image.width
    target_height = int(image.height * ratio)
    return image.resize((max_width, target_height), Image.LANCZOS)


def sanitized_filename(prefix: str, index: int, ext: str) -> str:
    padded = f'{index:02d}'
    return f'{prefix}-{padded}.{ext}'


def load_existing_metadata(path: Path) -> Optional[Dict]:
    if not path.exists():
        return None
    with path.open('r', encoding='utf-8') as f:
        return json.load(f)


def build_metadata(images: List[Dict], title: str, description: str, existing: Optional[Dict] = None) -> Dict:
    metadata: Dict = {
        'title': title,
        'description': description,
        'images': [],
    }

    caption_map = {}
    if existing and isinstance(existing.get('images'), list):
        for item in existing['images']:
            if isinstance(item, dict) and 'filename' in item:
                caption_map[item['filename']] = item.get('caption', '')

    for image in images:
        caption = caption_map.get(image['filename'], image.get('caption', ''))
        metadata['images'].append({'filename': image['filename'], 'caption': caption})
    return metadata


def write_metadata(path: Path, metadata: Dict, dry_run: bool = False) -> None:
    if dry_run:
        print(f'[dry run] Would write metadata to {path}')
        return
    with path.open('w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
        f.write('\n')


def main() -> int:
    args = parse_args()
    src_dir = Path(args.src).expanduser().resolve()
    dest_dir = Path(args.dest).expanduser().resolve()
    thumb_dir = dest_dir / args.thumb_dir
    metadata_path = Path(args.data_file).expanduser().resolve() if args.data_file else None

    source_files = gather_source_files(src_dir)
    if not source_files:
        raise SystemExit('No supported image files found in source folder.')

    if not args.dry_run:
        dest_dir.mkdir(parents=True, exist_ok=True)
        thumb_dir.mkdir(parents=True, exist_ok=True)

    output_images: List[Dict] = []

    for index, source_path in enumerate(source_files, start=1):
        output_name = sanitized_filename(args.prefix, index, args.format.lower())
        output_path = dest_dir / output_name
        thumb_path = thumb_dir / output_name

        print(f'Processing {source_path.name} -> {output_name}')
        if args.dry_run:
            output_images.append({'filename': output_name, 'caption': ''})
            continue

        with Image.open(source_path) as image:
            image = ImageOps.exif_transpose(image).convert('RGB')
            resized = resize_image(image, args.max_width)
            resized.save(
                output_path,
                format='WEBP' if args.format.lower() == 'webp' else 'JPEG' if args.format.lower() in {'jpg', 'jpeg'} else args.format.upper(),
                quality=args.quality,
                optimize=True,
            )

            thumb = resize_image(image, args.thumb_width)
            thumb.save(
                thumb_path,
                format='WEBP' if args.format.lower() == 'webp' else 'JPEG' if args.format.lower() in {'jpg', 'jpeg'} else args.format.upper(),
                quality=args.quality,
                optimize=True,
            )

        output_images.append({'filename': output_name, 'caption': ''})

    if metadata_path:
        existing_metadata = load_existing_metadata(metadata_path)
        metadata = build_metadata(output_images, args.title, args.description, existing_metadata)
        write_metadata(metadata_path, metadata, dry_run=args.dry_run)
        print(f'Wrote metadata to {metadata_path}')

    print(f'Done: {len(output_images)} images processed.')
    if not args.dry_run:
        print(f'Resized images written to: {dest_dir}')
        print(f'Thumbnails written to: {thumb_dir}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
