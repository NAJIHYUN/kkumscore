#!/usr/bin/env python3
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SONGS_JSON = ROOT / "songs.json"
REPORT = ROOT / "key_fill_report.txt"

KEY_MARKER_RE = re.compile(r"(?:\bKEY\b|\bKey\b|원키|키|조성)\s*(?:of)?\s*[:：]?\s*([A-G](?:#|b)?m?)")
FILENAME_KEY_RE = re.compile(r"(?<![A-Za-z0-9])([A-G](?:#|b)?m?)(?![A-Za-z0-9])")
CHORD_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9])([A-G](?:#|b)?)(m(?!aj)|maj7?|M7|dim|aug|sus[24]?|add\d+|[24679]|11|13)?(?:/[A-G](?:#|b)?)?(?![A-Za-z0-9])")


def pdf_text(path: Path, max_pages: int = 4) -> str:
    if not path.exists():
        return ""
    try:
        proc = subprocess.run(
            ["pdftotext", "-f", "1", "-l", str(max_pages), str(path), "-"],
            capture_output=True,
            text=True,
            check=True,
        )
        return proc.stdout or ""
    except Exception:
        return ""


def normalize_key(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    return raw[0].upper() + raw[1:]


def key_from_filename(name: str):
    m = FILENAME_KEY_RE.search(name)
    if not m:
        return None
    return normalize_key(m.group(1)), "low"


def key_from_text(text: str):
    if not text.strip():
        return None, "none"

    marker = KEY_MARKER_RE.search(text)
    if marker:
        return normalize_key(marker.group(1)), "high"

    chord_lines = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        tokens = CHORD_TOKEN_RE.findall(line)
        if len(tokens) < 2:
            continue

        words = re.findall(r"[A-Za-z가-힣0-9#b/]+", line)
        if len(tokens) / max(1, len(words)) < 0.45:
            continue

        token_strs = [f"{r}{s or ''}" for r, s in tokens]
        chord_lines.append(token_strs)

    if not chord_lines:
        return None, "none"

    all_tokens = [t for line in chord_lines for t in line]
    all_roots = [re.match(r"([A-G](?:#|b)?)", t).group(1) for t in all_tokens]
    root_counts = Counter(all_roots)
    top_root, _ = root_counts.most_common(1)[0]

    first = chord_lines[0][0]
    last = chord_lines[-1][-1]
    first_root = re.match(r"([A-G](?:#|b)?)", first).group(1)
    last_root = re.match(r"([A-G](?:#|b)?)", last).group(1)
    last_minor = bool(re.match(r"[A-G](?:#|b)?m(?!aj)", last))

    if first_root == last_root:
        return normalize_key(f"{last_root}{'m' if last_minor else ''}"), "medium"
    if last_root == top_root:
        return normalize_key(f"{last_root}{'m' if last_minor else ''}"), "low"
    return normalize_key(top_root), "low"


def main():
    songs = json.loads(SONGS_JSON.read_text(encoding="utf-8"))

    updated = 0
    reviewed = 0
    skipped = 0
    rows = []

    for s in songs:
        cur = str(s.get("key", "")).strip()
        if cur:
            continue

        rel = s.get("pdfUrl") or s.get("file") or ""
        path = ROOT / rel if rel else None

        key = None
        conf = "none"

        if rel:
            filename_guess = key_from_filename(Path(rel).name)
            if filename_guess:
                key, conf = filename_guess

        txt = pdf_text(path) if path else ""
        t_key, t_conf = key_from_text(txt)
        if t_key:
            key, conf = t_key, t_conf

        if not key:
            skipped += 1
            continue

        s["key"] = key
        if conf == "low":
            s["key_review"] = True
            reviewed += 1
        else:
            s.pop("key_review", None)

        updated += 1
        rows.append((s.get("title", ""), key, conf))

    SONGS_JSON.write_text(json.dumps(songs, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        f"updated: {updated}",
        f"review_needed: {reviewed}",
        f"skipped: {skipped}",
        "",
        "title\tkey\tconfidence",
    ]
    lines.extend([f"{t}\t{k}\t{c}" for t, k, c in rows])
    REPORT.write_text("\n".join(lines), encoding="utf-8")

    print(f"updated={updated} review_needed={reviewed} skipped={skipped}")


if __name__ == "__main__":
    main()
