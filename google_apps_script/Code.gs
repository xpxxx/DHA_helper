const DHA_SHEET_NAME = "药品目录";
const DHA_SPREADSHEET_ID = "1lURO_8sq10IZZH7i7dhmERJk-DcpKzxiuVYqwbjMl54";
const DHA_CACHE_KEY = "dha-helper-catalog-v1";
const DHA_CACHE_SECONDS = 300;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("DHA Helper")
    .addItem("生成所选行翻译", "translateSelectedRows")
    .addItem("检查目录数据", "validateCatalog")
    .addToUi();
}

function onEdit() {
  CacheService.getScriptCache().remove(DHA_CACHE_KEY);
}

function doGet() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(DHA_CACHE_KEY);
    const body = cached || JSON.stringify(buildPayload_());
    if (!cached) cache.put(DHA_CACHE_KEY, body, DHA_CACHE_SECONDS);
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: String(error && error.message ? error.message : error) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function buildPayload_() {
  const spreadsheet = SpreadsheetApp.openById(DHA_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(DHA_SHEET_NAME);
  if (!sheet) throw new Error(`找不到工作表：${DHA_SHEET_NAME}`);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error("药品目录没有数据");

  const headers = values[0].map(String);
  const required = [
    "启用",
    "中文名",
    "类型",
    "单位",
    "单价(DHS)",
    "英文名",
    "阿拉伯文名",
    "所含草药（中成药）",
    "相关中成药（草药）",
  ];
  const indexes = Object.fromEntries(required.map((name) => [name, headers.indexOf(name)]));
  const missing = required.filter((name) => indexes[name] < 0);
  if (missing.length) throw new Error(`缺少列：${missing.join("、")}`);

  const medicines = [];
  const names = new Set();
  const errors = [];

  values.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    if (String(row[indexes["启用"]]).trim() !== "是") return;

    const name = String(row[indexes["中文名"]] || "").trim();
    const typeLabel = String(row[indexes["类型"]] || "").trim();
    const unit = String(row[indexes["单位"]] || "").trim();
    const price = Number(row[indexes["单价(DHS)"]]);
    if (!name) errors.push(`第 ${rowNumber} 行：中文名不能为空`);
    if (!['草药', '中成药'].includes(typeLabel)) errors.push(`第 ${rowNumber} 行：类型无效`);
    if (!Number.isFinite(price) || price < 0) errors.push(`第 ${rowNumber} 行：价格无效`);
    if (name && names.has(name)) errors.push(`第 ${rowNumber} 行：药名重复（${name}）`);
    if (name) names.add(name);
    if (!name || !['草药', '中成药'].includes(typeLabel) || !Number.isFinite(price) || price < 0) return;

    const type = typeLabel === "中成药" ? "patent" : "herb";
    medicines.push({
      name,
      type,
      unit: unit || (type === "patent" ? "盒" : "克"),
      price: Math.round(price * 10000) / 10000,
      nameEn: String(row[indexes["英文名"]] || name).trim() || name,
      nameAr: String(row[indexes["阿拉伯文名"]] || name).trim() || name,
      unitEn: type === "patent" ? "box" : "g",
      unitAr: type === "patent" ? "علبة" : "غرام",
      contains: splitNames_(row[indexes["所含草药（中成药）"]]),
      relatedPatents: splitNames_(row[indexes["相关中成药（草药）"]]),
    });
  });

  if (errors.length) throw new Error(errors.slice(0, 20).join("；"));
  medicines.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "zh-CN") : a.type === "herb" ? -1 : 1));

  const herbs = medicines.filter((m) => m.type === "herb").length;
  const patents = medicines.length - herbs;
  return {
    currency: "DHS",
    generatedFrom: ["Google Sheet"],
    lastUpdated: new Date().toISOString(),
    counts: { herbs, patents, total: medicines.length },
    medicines,
    i18n: {
      currency: { zh: "DHS", en: "AED", ar: "درهم" },
      herb: { zh: "草药", en: "Herb", ar: "عشبة" },
      patent: { zh: "中成药", en: "Patent medicine", ar: "دواء جاهز" },
      unitPrice: { zh: "单价", en: "Unit price", ar: "سعر الوحدة" },
      qty: { zh: "数量", en: "Qty", ar: "الكمية" },
      subtotal: { zh: "小计", en: "Subtotal", ar: "المجموع الفرعي" },
      total: { zh: "处方总价", en: "Prescription total", ar: "إجمالي الوصفة" },
      items: { zh: "项", en: "items", ar: "أصناف" },
    },
  };
}

function splitNames_(value) {
  return String(value || "")
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function translateSelectedRows() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== DHA_SHEET_NAME) throw new Error(`请在“${DHA_SHEET_NAME}”中选择药品行`);

  const range = sheet.getActiveRange();
  const start = Math.max(2, range.getRow());
  const end = range.getLastRow();
  for (let row = start; row <= end; row += 1) {
    const name = String(sheet.getRange(row, 2).getValue() || "").trim();
    if (!name) continue;
    const english = LanguageApp.translate(name, "zh", "en");
    const arabic = LanguageApp.translate(english, "en", "ar");
    sheet.getRange(row, 6, 1, 2).setValues([[english, arabic]]);
    sheet.getRange(row, 10).setValue("AI初译");
  }
  onEdit();
  SpreadsheetApp.getActiveSpreadsheet().toast("所选行的 AI 初译已生成，请人工复核。", "DHA Helper", 5);
}

function validateCatalog() {
  const payload = buildPayload_();
  SpreadsheetApp.getUi().alert(
    `检查通过：${payload.counts.herbs} 种草药，${payload.counts.patents} 种中成药，共 ${payload.counts.total} 项。`
  );
}
