"""Build the Anseong index from TAGO city membership and GBIS station/route workbooks."""
import csv
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

def worksheet(path, all_sheets=False):
    with zipfile.ZipFile(path) as archive:
        strings = ["".join(item.itertext()) for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        sheets = sorted(name for name in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name))
        for name in sheets if all_sheets else sheets[:1]:
          with archive.open(name) as sheet:
            columns = {}
            for _, row in ET.iterparse(sheet, events=("end",)):
                if not row.tag.endswith("}row"):
                    continue
                cells = {}
                for cell in row:
                    value = cell.findtext("x:v", "", NS)
                    cells[re.sub(r"\d+", "", cell.attrib["r"])] = strings[int(value)] if cell.get("t") == "s" else value
                if columns:
                    yield {key: cells.get(col, "") for col, key in columns.items()}
                else:
                    columns = cells
                row.clear()

def build(national, stations, routes):
    with open(national, encoding="cp949", newline="") as handle:
        city_ids = {row["정류장번호"][3:] for row in csv.DictReader(handle)
                    if row["도시명"] == "경기도 안성시" and row["정류장번호"].startswith("GGB")}
    stops = {}
    for r in worksheet(stations):
        sid = r["STATION_ID"]
        if sid in city_ids:
            stops[sid] = [sid, r["STATION_NM"], r["MOBILE_NO"], float(r["Y"]), float(r["X"])]
    if not stops:
        raise ValueError("No matching Anseong stations")
    directions = defaultdict(Counter)
    names = {}
    previous = None
    for r in worksheet(routes, all_sheets=True):
        sid, route = r["STATION_ID"], r["ROUTE_ID"]
        if sid in stops:
            names[route] = r["ROUTE_NM"]
        if previous and previous["STATION_ID"] in stops and route == previous["ROUTE_ID"] and int(r["STA_ORDER"]) == int(previous["STA_ORDER"]) + 1:
            if r["STATION_NM"] != previous["STATION_NM"]:
                directions[previous["STATION_ID"]][r["STATION_NM"]] += 1
        previous = r
    output = {"stops": [stops[sid] + [[name for name, _ in directions[sid].most_common(2)]] for sid in sorted(stops)],
              "routes": names}
    target = Path(__file__).resolve().parents[1] / "anseong-stops.json"
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(stops)} GBIS stations matched in Anseong, {len(names)} routes")

if __name__ == "__main__":
    build(*sys.argv[1:])
