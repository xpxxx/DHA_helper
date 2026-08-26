#!/usr/bin/env python3
"""将药品.xlsx / 药品零售价.xlsx 预处理为 data/medicines.json。"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DRUGS_XLSX = ROOT / "药品.xlsx"
PRICES_XLSX = ROOT / "药品零售价.xlsx"
OUT_JSON = ROOT / "data" / "medicines.json"


def clean_name(value) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    text = text.replace("(", "（").replace(")", "）")
    text = re.sub(r"\s+", "", text)
    return text or None


def to_price(value) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    if price < 0:
        return None
    return round(price, 4)


def load_pairs() -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    df = pd.read_excel(DRUGS_XLSX, sheet_name="Sheet1", header=0)
    df.columns = ["品名", "空", "名称"]
    herb_to_patents: dict[str, list[str]] = defaultdict(list)
    patent_to_herbs: dict[str, list[str]] = defaultdict(list)

    for _, row in df.iterrows():
        herb = clean_name(row["品名"])
        patent = clean_name(row["名称"])
        if not herb or not patent:
            continue
        if patent not in herb_to_patents[herb]:
            herb_to_patents[herb].append(patent)
        if herb not in patent_to_herbs[patent]:
            patent_to_herbs[patent].append(herb)

    return herb_to_patents, patent_to_herbs


def dedupe_priced(rows: list[tuple[str, float]]) -> tuple[list[tuple[str, float]], list[str]]:
    """同名同价去重；同名异价记录冲突并保留首次出现。"""
    seen: dict[str, float] = {}
    conflicts: list[str] = []
    ordered: list[tuple[str, float]] = []

    for name, price in rows:
        if name not in seen:
            seen[name] = price
            ordered.append((name, price))
            continue
        if seen[name] != price:
            conflicts.append(f"{name}: {seen[name]} vs {price}")

    return ordered, conflicts


def build() -> dict:
    herb_to_patents, patent_to_herbs = load_pairs()

    herbs_df = pd.read_excel(PRICES_XLSX, sheet_name="Sheet1", header=1)
    herbs_df.columns = ["品名", "单价"]
    herb_rows: list[tuple[str, float]] = []
    skipped_herbs: list[str] = []
    for _, row in herbs_df.iterrows():
        name = clean_name(row["品名"])
        price = to_price(row["单价"])
        if not name:
            continue
        if price is None:
            skipped_herbs.append(name)
            continue
        herb_rows.append((name, price))

    patents_df = pd.read_excel(PRICES_XLSX, sheet_name="Sheet2", header=1)
    patents_df.columns = ["名称", "单价"]
    patent_rows: list[tuple[str, float]] = []
    skipped_patents: list[str] = []
    for _, row in patents_df.iterrows():
        name = clean_name(row["名称"])
        price = to_price(row["单价"])
        if not name:
            continue
        if price is None:
            skipped_patents.append(name)
            continue
        patent_rows.append((name, price))

    herbs, herb_conflicts = dedupe_priced(herb_rows)
    patents, patent_conflicts = dedupe_priced(patent_rows)

    herb_names = {name for name, _ in herbs}
    patent_names = {name for name, _ in patents}

    medicines: list[dict] = []
    for name, price in herbs:
        related = [p for p in herb_to_patents.get(name, []) if p in patent_names]
        medicines.append(
            {
                "name": name,
                "type": "herb",
                "unit": "克",
                "price": price,
                "contains": [],
                "relatedPatents": related,
            }
        )

    for name, price in patents:
        contains = [h for h in patent_to_herbs.get(name, []) if h in herb_names]
        medicines.append(
            {
                "name": name,
                "type": "patent",
                "unit": "盒",
                "price": price,
                "contains": contains,
                "relatedPatents": [],
            }
        )

    medicines.sort(key=lambda item: (0 if item["type"] == "herb" else 1, item["name"]))

    payload = {
        "currency": "DHS",
        "generatedFrom": ["药品.xlsx", "药品零售价.xlsx"],
        "counts": {
            "herbs": len(herbs),
            "patents": len(patents),
            "total": len(medicines),
            "skippedHerbsNoPrice": len(skipped_herbs),
            "skippedPatentsNoPrice": len(skipped_patents),
        },
        "skipped": {
            "herbsNoPrice": skipped_herbs,
            "patentsNoPrice": skipped_patents,
            "herbPriceConflicts": herb_conflicts,
            "patentPriceConflicts": patent_conflicts,
        },
        "medicines": medicines,
    }
    return payload


def main() -> None:
    payload = build()
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    c = payload["counts"]
    print(
        f"Wrote {OUT_JSON.relative_to(ROOT)}: "
        f"{c['herbs']} herbs, {c['patents']} patents, {c['total']} total"
    )
    if payload["skipped"]["herbPriceConflicts"] or payload["skipped"]["patentPriceConflicts"]:
        print("Price conflicts (kept first):")
        for item in payload["skipped"]["herbPriceConflicts"]:
            print("  herb", item)
        for item in payload["skipped"]["patentPriceConflicts"]:
            print("  patent", item)


if __name__ == "__main__":
    main()
