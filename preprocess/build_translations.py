#!/usr/bin/env python3
"""为药品目录生成英文 / 阿拉伯语译名，写入 data/name_i18n.json 并合并进 medicines.json。"""

from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from deep_translator import MyMemoryTranslator

ROOT = Path(__file__).resolve().parents[1]
MEDICINES = ROOT / "data" / "medicines.json"
I18N_PATH = ROOT / "data" / "name_i18n.json"

STATIC_UNITS = {
    "克": {"en": "g", "ar": "غرام"},
    "盒": {"en": "box", "ar": "علبة"},
}

MANUAL_OVERRIDES: dict[str, dict[str, str]] = {
    # 2026-11-06 新增草药；英阿名称为 AI 初译，发布前可由专业人员复核。
    "五指毛桃": {"en": "Hairy Fig Root", "ar": "جذر التين الشعري"},
    "阿胶": {"en": "Donkey-hide Gelatin", "ar": "جيلاتين جلد الحمار"},
    "皂角刺": {"en": "Chinese Honeylocust Spine", "ar": "شوك الغلاديشيا الصينية"},
    "补骨脂": {"en": "Psoralea Fruit", "ar": "ثمرة البسوراليا"},
    "黄芪": {"en": "Astragalus Root", "ar": "جذر القتاد"},
    "木香": {"en": "Costus Root", "ar": "جذر القسط"},
    "升麻": {"en": "Cimicifuga Rhizome", "ar": "جذمور السيميسيفوغا"},
    "枇杷叶": {"en": "Loquat Leaf", "ar": "أوراق البشملة"},
    "川穹": {"en": "Chuanxiong Rhizome", "ar": "جذمور تشوانشيونغ"},
    "马齿笕": {"en": "Purslane", "ar": "رجلة"},
    "燀山桃仁（chan）": {"en": "Blanched Peach Kernel", "ar": "نواة الخوخ المسلوقة"},
    "燀苦杏仁": {"en": "Blanched Bitter Apricot Kernel", "ar": "بذرة المشمش المرة المسلوقة"},
    "秦艽（jiao）": {"en": "Largeleaf Gentian Root", "ar": "جذر الجنطيانا"},
    "茜草（qian）": {"en": "Madder Root", "ar": "جذر الفوة"},
    "广防已": {"en": "Fangji Root", "ar": "جذر فانغجي"},
    "复方丹参滴": {"en": "Compound Danshen Dripping Pills", "ar": "حبوب دانشن المركبة"},
    "三棱": {"en": "Sparganium Rhizome", "ar": "جذمور السبرغانيوم"},
    "坤宝丸": {"en": "Kunbao Wan", "ar": "كونباو وان"},
    "调经促孕丸": {
        "en": "Tiaojing Cuyun Wan (Regulate Menstruation & Aid Pregnancy Pills)",
        "ar": "حبوب تنظيم الدورة والمساعدة على الحمل",
    },
    "莲芝消炎片": {"en": "Lianzhi Xiaoyan Tablets", "ar": "أقراص ليانزي المضادة للالتهاب"},
}


def clean_for_translate(name: str) -> str:
    text = re.sub(r"（[^）]*）", "", name)
    text = re.sub(r"\([^)]*\)", "", text)
    return text.strip() or name


def translate(text: str, source: str, target: str, retries: int = 3) -> str | None:
    for attempt in range(retries):
        try:
            result = MyMemoryTranslator(source=source, target=target).translate(text)
            if result and result.strip():
                return result.strip()
        except Exception as exc:  # noqa: BLE001
            if attempt + 1 == retries:
                print(f"  warn {source}->{target} {text}: {exc}")
            time.sleep(0.4 * (attempt + 1))
    return None


def translate_pair(name: str) -> tuple[str, dict[str, str]]:
    if name in MANUAL_OVERRIDES:
        return name, dict(MANUAL_OVERRIDES[name])

    base = clean_for_translate(name)
    en = translate(base, "zh-CN", "en-US") or base

    # 阿拉伯语从英文译，减少把汉字字面义误译成普通词
    ar = translate(en, "en-GB", "ar-SA")
    if not ar:
        ar = translate(base, "zh-CN", "ar-SA") or en

    note = re.search(r"（([^）]+)）", name)
    if note and note.group(1) == "动物" and "animal" not in en.lower():
        en = f"{en} (animal-derived)"

    return name, {"en": en, "ar": ar}


def load_i18n() -> dict:
    if I18N_PATH.exists():
        return json.loads(I18N_PATH.read_text(encoding="utf-8"))
    return {}


def save_i18n(i18n: dict) -> None:
    I18N_PATH.parent.mkdir(parents=True, exist_ok=True)
    I18N_PATH.write_text(
        json.dumps(dict(sorted(i18n.items())), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def build_i18n(names: list[str], workers: int = 6) -> dict:
    i18n = load_i18n()
    for name, override in MANUAL_OVERRIDES.items():
        i18n[name] = dict(override)

    pending = [
        n
        for n in names
        if n not in i18n or not i18n[n].get("en") or not i18n[n].get("ar")
    ]
    print(f"Need translate: {len(pending)} / {len(names)}")
    if not pending:
        return i18n

    done = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(translate_pair, name): name for name in pending}
        for future in as_completed(futures):
            name, payload = future.result()
            i18n[name] = payload
            done += 1
            print(f"[{done}/{len(pending)}] {name} -> {payload['en'][:48]}")
            if done % 15 == 0 or done == len(pending):
                save_i18n(i18n)

    for name, override in MANUAL_OVERRIDES.items():
        i18n[name] = dict(override)
    save_i18n(i18n)
    return i18n


def merge_into_medicines(i18n: dict) -> None:
    data = json.loads(MEDICINES.read_text(encoding="utf-8"))
    for med in data["medicines"]:
        names = i18n.get(med["name"], {})
        med["nameEn"] = names.get("en") or med["name"]
        med["nameAr"] = names.get("ar") or med["name"]
        unit = med.get("unit") or ("盒" if med["type"] == "patent" else "克")
        unit_i18n = STATIC_UNITS.get(unit, {"en": unit, "ar": unit})
        med["unitEn"] = unit_i18n["en"]
        med["unitAr"] = unit_i18n["ar"]

    data["i18n"] = {
        "currency": {"zh": "DHS", "en": "AED", "ar": "درهم"},
        "herb": {"zh": "草药", "en": "Herb", "ar": "عشبة"},
        "patent": {"zh": "中成药", "en": "Patent medicine", "ar": "دواء جاهز"},
        "unitPrice": {"zh": "单价", "en": "Unit price", "ar": "سعر الوحدة"},
        "qty": {"zh": "数量", "en": "Qty", "ar": "الكمية"},
        "subtotal": {"zh": "小计", "en": "Subtotal", "ar": "المجموع الفرعي"},
        "total": {"zh": "处方总价", "en": "Prescription total", "ar": "إجمالي الوصفة"},
        "items": {"zh": "项", "en": "items", "ar": "أصناف"},
    }
    MEDICINES.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Updated {MEDICINES.relative_to(ROOT)}")


def main() -> None:
    data = json.loads(MEDICINES.read_text(encoding="utf-8"))
    names = [m["name"] for m in data["medicines"]]
    i18n = build_i18n(names)
    merge_into_medicines(i18n)


if __name__ == "__main__":
    main()
