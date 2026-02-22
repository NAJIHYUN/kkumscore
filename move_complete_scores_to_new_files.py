#!/usr/bin/env python3
from __future__ import annotations
import json
import re
import shutil
import unicodedata
from pathlib import Path

ROOT = Path('.')
JSON_PATH = ROOT / 'songs.json'
SRC_DIR = ROOT / 'files'
DST_DIR = ROOT / 'new files'


def clean_part(text: str) -> str:
    s = unicodedata.normalize('NFC', str(text or '').strip())
    s = re.sub(r'[\\/:*?"<>|]+', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.strip('._ ')
    return s


def unique_target(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suf = path.suffix
    i = 2
    while True:
        cand = path.with_name(f"{stem}_{i}{suf}")
        if not cand.exists():
            return cand
        i += 1


def get_file_field(item: dict):
    # 우선순위: file -> pdfUrl -> jpgUrl
    for key in ('file', 'pdfUrl', 'jpgUrl'):
        val = item.get(key)
        if isinstance(val, str) and val.strip().startswith('files/'):
            return key, val.strip()
    return None, None


def main():
    if not JSON_PATH.exists():
        raise SystemExit('songs.json not found')
    if not SRC_DIR.exists():
        raise SystemExit('files/ not found')

    with JSON_PATH.open('r', encoding='utf-8') as f:
        data = json.load(f)

    DST_DIR.mkdir(exist_ok=True)

    moved = 0
    skipped_missing_elements = 0
    skipped_mismatch = 0
    skipped_not_files_ref = 0

    for item in data:
        title = clean_part(item.get('title', ''))
        artist = clean_part(item.get('artist', ''))
        keyv = clean_part(item.get('key', ''))

        field, rel = get_file_field(item)
        if not rel:
            skipped_not_files_ref += 1
            continue

        src = ROOT / rel
        if not src.exists() or not src.is_file():
            skipped_mismatch += 1
            continue

        if not (title and artist and keyv):
            skipped_missing_elements += 1
            continue

        ext = src.suffix.lower() or '.pdf'
        target_name = f"{title}_{artist}_{keyv}{ext}"
        target = unique_target(DST_DIR / target_name)

        shutil.move(str(src), str(target))

        new_rel = f"new files/{target.name}"
        item[field] = new_rel
        # file 필드가 있고 pdfUrl이 동일 문자열이면 함께 동기화
        if field == 'file' and isinstance(item.get('pdfUrl'), str) and item.get('pdfUrl', '').strip() == rel:
            item['pdfUrl'] = new_rel
        if field == 'file' and isinstance(item.get('jpgUrl'), str) and item.get('jpgUrl', '').strip() == rel:
            item['jpgUrl'] = new_rel

        moved += 1

    with JSON_PATH.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f"moved={moved}")
    print(f"skipped_missing_elements={skipped_missing_elements}")
    print(f"skipped_mismatch={skipped_mismatch}")
    print(f"skipped_not_files_ref={skipped_not_files_ref}")


if __name__ == '__main__':
    main()
