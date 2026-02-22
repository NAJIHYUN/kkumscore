#!/usr/bin/env python3
"""
files/ 폴더 파일명 일괄 정리 스크립트

기본은 dry-run(미리보기)이고, 실제 변경은 --apply 옵션으로 실행합니다.

규칙:
- 유니코드 NFC 정규화
- 확장자 소문자
- 파일명 본문에서 위험 문자 제거: \\ / : * ? " < > |
- 공백 정리, 연속 언더스코어 정리
- 최종 형식: 이름.확장자

사용 예:
  python3 normalize_files_names.py
  python3 normalize_files_names.py --apply
"""

from __future__ import annotations

import argparse
import os
import re
import unicodedata
from pathlib import Path


SUPPORTED_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}


def clean_base_name(name: str) -> str:
    text = unicodedata.normalize("NFC", name)
    text = re.sub(r"[\\/:*?\"<>|]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s*_\s*", "_", text)
    text = re.sub(r"_+", "_", text)
    text = text.strip(" ._")
    return text or "unnamed"


def unique_path(target: Path) -> Path:
    if not target.exists():
        return target
    stem = target.stem
    suffix = target.suffix
    parent = target.parent
    i = 2
    while True:
        cand = parent / f"{stem}_{i}{suffix}"
        if not cand.exists():
            return cand
        i += 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="실제 파일명 변경")
    parser.add_argument("--dir", default="files", help="대상 폴더 (기본: files)")
    args = parser.parse_args()

    root = Path(args.dir)
    if not root.exists() or not root.is_dir():
        print(f"[ERROR] 폴더를 찾을 수 없습니다: {root}")
        return 1

    files = sorted([p for p in root.iterdir() if p.is_file()])
    if not files:
        print("[INFO] 대상 파일이 없습니다.")
        return 0

    changed = 0
    skipped = 0
    planned: list[tuple[Path, Path]] = []

    for src in files:
        ext = src.suffix.lower()
        if ext not in SUPPORTED_EXTS:
            skipped += 1
            continue

        clean_base = clean_base_name(src.stem)
        dst = src.with_name(f"{clean_base}{ext}")
        if dst == src:
            continue
        dst = unique_path(dst)
        planned.append((src, dst))

    if not planned:
        print("[INFO] 변경할 파일명이 없습니다.")
        if skipped:
            print(f"[INFO] 확장자 제외로 스킵: {skipped}개")
        return 0

    print(f"[PLAN] 변경 예정: {len(planned)}개")
    for src, dst in planned:
        print(f"- {src.name} -> {dst.name}")

    if not args.apply:
        print("\n[DRY-RUN] 실제 변경 없음. 적용하려면 --apply 옵션을 사용하세요.")
        return 0

    for src, dst in planned:
        os.rename(src, dst)
        changed += 1

    print(f"\n[DONE] 파일명 변경 완료: {changed}개")
    if skipped:
        print(f"[INFO] 확장자 제외 스킵: {skipped}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

