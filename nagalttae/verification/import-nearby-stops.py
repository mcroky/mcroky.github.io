"""Build latitude bands from the Ministry of Land's national bus stop CSV (data.go.kr/15067528).

Usage: python verification/import-nearby-stops.py <TAGO CSV>
The existing GBIS index adds directions and the arrival-service ID at supported stops.
"""
import csv
import json
import math
import re
import sys
from pathlib import Path


def build(source):
    root = Path(__file__).resolve().parents[1]
    enhanced = {"GGB" + row[0]: row for row in
                json.loads((root / "anseong-stops.json").read_text(encoding="utf-8"))["stops"]}
    bands = {}
    seen = set()
    with open(source, encoding="cp949", newline="") as handle:
        for record in csv.DictReader(handle):
            sid = record["정류장번호"].strip()
            if not sid or sid in seen:
                raise ValueError(f"Missing or duplicate stop ID {sid}")
            seen.add(sid)
            if re.search(r"미정차|\(가상|가상정류[장소]", record["정류장명"]):
                continue
            local = enhanced.get(sid)
            if local:
                stop_id, name, number, lat, lon, directions = local
            else:
                stop_id, name = sid, record["정류장명"].strip()
                number = record["모바일단축번호"].strip()
                lat, lon = float(record["위도"]), float(record["경도"])
            if not name or not (33 <= lat < 39 and 124 <= lon < 132):
                raise ValueError(f"Unexpected stop or coordinates for {sid}")
            areas, stops = bands.setdefault(math.floor(lat), ({}, []))
            area = record["도시명"].strip()
            row = [stop_id, name, number if number != "0" else "", lat, lon, areas.setdefault(area, len(areas))]
            if local:
                row.append(directions)
            stops.append(row)
    if set(enhanced) - seen:
        raise ValueError("GBIS index has stops missing from the TAGO snapshot")
    dest = root / "stops"
    dest.mkdir(exist_ok=True)
    for band, (areas, rows) in sorted(bands.items()):
        rows.sort(key=lambda row: (row[3], row[4], row[0]))
        data = {"areas": list(areas), "stops": rows}
        (dest / f"{band}.json").write_bytes((json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode())
    published = sum(len(rows) for _, rows in bands.values())
    print(f"{published:,} stops in bands {sorted(bands)}, {len(seen) - published:,} non-boarding locations omitted")


if __name__ == "__main__":
    build(sys.argv[1])
