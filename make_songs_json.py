import os
import json
import re

FILES_DIR = "files"
OUTPUT = "songs.json"

def extract_key(filename):
    # 키 추출 (G, A, Bb, C#, F-G 등)
    m = re.search(r'([A-G](?:#|b)?(?:-[A-G](?:#|b)?)?)', filename)
    return m.group(1) if m else ""

songs = []

for fname in sorted(os.listdir(FILES_DIR)):
    if not fname.lower().endswith(".pdf"):
        continue

    name = fname.replace(".pdf", "")
    key = extract_key(name)

    songs.append({
        "title": name,
        "key": key,
        "file": f"{FILES_DIR}/{fname}"
    })

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(songs, f, ensure_ascii=False, indent=2)

print(f"완료: {len(songs)}곡 → {OUTPUT} 생성")