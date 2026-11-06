const state = {
  medicines: [],
  byName: new Map(),
  items: [],
  doses: 1,
  activeSuggest: -1,
  i18n: {
    currency: { zh: "DHS", en: "AED", ar: "درهم" },
    herb: { zh: "草药", en: "Herb", ar: "عشبة" },
    patent: { zh: "中成药", en: "Patent medicine", ar: "دواء جاهز" },
    unitPrice: { zh: "单价", en: "Unit price", ar: "سعر الوحدة" },
    qty: { zh: "数量", en: "Qty", ar: "الكمية" },
    subtotal: { zh: "小计", en: "Subtotal", ar: "المجموع الفرعي" },
    total: { zh: "处方总价", en: "Prescription total", ar: "إجمالي الوصفة" },
    perDose: { zh: "每剂", en: "Per dose", ar: "لكل جرعة" },
    totalAll: { zh: "总价", en: "Total", ar: "الإجمالي" },
    doses: { zh: "剂", en: "doses", ar: "جرعات" },
    items: { zh: "项", en: "items", ar: "أصناف" },
  },
};

const els = {
  search: document.getElementById("search-input"),
  suggest: document.getElementById("suggest-list"),
  rxList: document.getElementById("rx-list"),
  empty: document.getElementById("empty-state"),
  clear: document.getElementById("btn-clear"),
  tempBtn: document.getElementById("btn-temp"),
  grandTotalEl: document.getElementById("grand-total"),
  itemCount: document.getElementById("item-count"),
  totalLabel: document.getElementById("total-label"),
  perDoseTotal: document.getElementById("per-dose-total"),
  totalBar: document.querySelector(".total-bar"),
  searchPanel: document.querySelector(".search-panel"),
  doseCount: document.getElementById("dose-count"),
  dialog: document.getElementById("temp-dialog"),
  tempForm: document.getElementById("temp-form"),
  tempName: document.getElementById("temp-name"),
  tempNameEn: document.getElementById("temp-name-en"),
  tempNameAr: document.getElementById("temp-name-ar"),
  tempType: document.getElementById("temp-type"),
  tempPrice: document.getElementById("temp-price"),
  tempQty: document.getElementById("temp-qty"),
  tempQtyLabel: document.getElementById("temp-qty-label"),
  tempCancel: document.getElementById("temp-cancel"),
  dataStatus: document.getElementById("data-status"),
};

async function loadMedicineData() {
  const onlineUrl = String(window.DHA_CONFIG?.dataApiUrl || "").trim();
  const sources = [
    ...(onlineUrl ? [{ url: onlineUrl, label: "在线表格" }] : []),
    { url: "data/medicines.json", label: "本地备用数据" },
  ];

  let lastError;
  for (const source of sources) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(source.url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!Array.isArray(data.medicines)) throw new Error("药品数据格式无效");
      return { data, source: source.label };
    } catch (error) {
      lastError = error;
      console.warn(`Failed to load ${source.label}`, error);
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw lastError || new Error("药品数据加载失败");
}

function money(n) {
  const value = Number.isFinite(n) ? n : 0;
  return value.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function currencyText() {
  const c = state.i18n.currency;
  return `${c.zh} / ${c.en} · ${c.ar}`;
}

function typeLabel(type) {
  const key = type === "patent" ? "patent" : "herb";
  const t = state.i18n[key];
  return `${t.zh} · ${t.en}`;
}

function unitParts(item) {
  return {
    zh: item.unit || (item.type === "patent" ? "盒" : "克"),
    en: item.unitEn || (item.type === "patent" ? "box" : "g"),
    ar: item.unitAr || (item.type === "patent" ? "علبة" : "غرام"),
  };
}

function unitLabel(type, unit) {
  if (unit) return unit;
  return type === "patent" ? "盒" : "克";
}

function normalizeQuery(q) {
  return String(q || "")
    .trim()
    .toLowerCase()
    .replace(/\(/g, "（")
    .replace(/\)/g, "）");
}

function searchMedicines(query) {
  const q = normalizeQuery(query);
  if (!q) return [];
  const starts = [];
  const includes = [];
  for (const med of state.medicines) {
    const hay = [med.name, med.nameEn, med.nameAr]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const name = med.name.toLowerCase();
    if (name.startsWith(q) || (med.nameEn || "").toLowerCase().startsWith(q)) {
      starts.push(med);
    } else if (hay.includes(q)) {
      includes.push(med);
    }
  }
  return [...starts, ...includes].slice(0, 12);
}

function relationText(med) {
  if (med.type === "herb" && med.relatedPatents?.length) {
    return `相关成药：${med.relatedPatents.join("、")}`;
  }
  if (med.type === "patent" && med.contains?.length) {
    return `已知含：${med.contains.join("、")}`;
  }
  return "";
}

function findByName(name) {
  return state.byName.get(String(name || "").trim());
}

function nameBlock(item) {
  const en = item.nameEn && item.nameEn !== item.name ? item.nameEn : "";
  const ar = item.nameAr && item.nameAr !== item.name ? item.nameAr : "";
  return `
    <p class="rx-name">
      ${escapeHtml(item.name)}
      <span class="badge ${item.type === "patent" ? "badge-patent" : "badge-herb"}">${escapeHtml(
        typeLabel(item.type)
      )}</span>
      ${item.temp ? '<span class="badge badge-temp">临时 · Temp</span>' : ""}
    </p>
    ${en ? `<p class="rx-name-en">${escapeHtml(en)}</p>` : ""}
    ${ar ? `<p class="rx-name-ar" lang="ar" dir="rtl">${escapeHtml(ar)}</p>` : ""}
  `;
}

function priceLine(amount) {
  const c = state.i18n.currency;
  return `${money(amount)} <span class="cur">${escapeHtml(c.zh)}</span><span class="cur-sub">/ ${escapeHtml(
    c.en
  )}</span>`;
}

function updateSuggestMaxHeight() {
  if (!els.suggest || !els.search || els.suggest.hidden) return;
  const searchRect = els.search.getBoundingClientRect();
  const barRect = els.totalBar?.getBoundingClientRect();
  const bottomLimit = barRect ? barRect.top : window.innerHeight - 16;
  const available = bottomLimit - searchRect.bottom - 12;
  const max = Math.max(120, Math.min(320, available));
  els.suggest.style.maxHeight = `${max}px`;
}

function setSuggestOpen(open) {
  els.searchPanel?.classList.toggle("is-open", open);
  if (open) {
    updateSuggestMaxHeight();
  }
}

function addMedicine(med, qty = med.type === "patent" ? 1 : 10) {
  const existing = state.items.find(
    (item) => !item.temp && item.name === med.name && item.type === med.type
  );
  if (existing) {
    existing.qty = roundQty(existing.qty + qty);
  } else {
    state.items.push({
      id: crypto.randomUUID(),
      name: med.name,
      nameEn: med.nameEn || "",
      nameAr: med.nameAr || "",
      type: med.type,
      unit: unitLabel(med.type, med.unit),
      unitEn: med.unitEn || (med.type === "patent" ? "box" : "g"),
      unitAr: med.unitAr || (med.type === "patent" ? "علبة" : "غرام"),
      price: Number(med.price),
      qty: roundQty(qty),
      temp: false,
      contains: med.contains || [],
      relatedPatents: med.relatedPatents || [],
    });
  }
  render();
}

function addTemp({ name, nameEn, nameAr, type, price, qty }) {
  state.items.push({
    id: crypto.randomUUID(),
    name: name.trim(),
    nameEn: (nameEn || "").trim(),
    nameAr: (nameAr || "").trim(),
    type,
    unit: unitLabel(type),
    unitEn: type === "patent" ? "box" : "g",
    unitAr: type === "patent" ? "علبة" : "غرام",
    price: Number(price),
    qty: roundQty(qty),
    temp: true,
    contains: [],
    relatedPatents: [],
  });
  render();
}

function roundQty(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function roundDoses(n) {
  return Math.max(1, Math.round(Number(n) || 1));
}

function lineTotal(item) {
  return (Number(item.price) || 0) * (Number(item.qty) || 0);
}

function perDoseTotal() {
  return state.items.reduce((sum, item) => sum + lineTotal(item), 0);
}

function totalForAllDoses() {
  return perDoseTotal() * state.doses;
}

function setDoses(next) {
  state.doses = roundDoses(next);
  if (els.doseCount) {
    els.doseCount.value = String(state.doses);
  }
  renderTotals();
}

function renderSuggest(list) {
  if (!list.length) {
    els.suggest.hidden = true;
    els.suggest.innerHTML = "";
    els.search.setAttribute("aria-expanded", "false");
    state.activeSuggest = -1;
    setSuggestOpen(false);
    return;
  }

  els.suggest.hidden = false;
  els.search.setAttribute("aria-expanded", "true");
  setSuggestOpen(true);
  els.suggest.innerHTML = list
    .map((med, index) => {
      const rel = relationText(med);
      const unit = unitParts(med);
      const en = med.nameEn && med.nameEn !== med.name ? med.nameEn : "";
      return `
        <li role="option">
          <button type="button" data-name="${escapeAttr(med.name)}" aria-selected="${
            index === state.activeSuggest
          }">
            <div class="suggest-main">
              <span>${escapeHtml(med.name)}</span>
              <span>${money(med.price)} / ${escapeHtml(unit.zh)} (${escapeHtml(unit.en)})</span>
            </div>
            ${en ? `<div class="suggest-en">${escapeHtml(en)}</div>` : ""}
            <div class="suggest-meta">${escapeHtml(typeLabel(med.type))}</div>
            ${rel ? `<div class="suggest-rel">${escapeHtml(rel)}</div>` : ""}
          </button>
        </li>
      `;
    })
    .join("");

  updateSuggestMaxHeight();
}

function render() {
  const hasItems = state.items.length > 0;
  els.empty.hidden = hasItems;
  els.rxList.hidden = !hasItems;
  els.clear.hidden = !hasItems;

  const t = state.i18n;

  els.rxList.innerHTML = state.items
    .map((item) => {
      const relatedNames =
        item.type === "herb" ? item.relatedPatents || [] : item.contains || [];
      const relHtml = relatedNames.length
        ? relatedNames
            .map((name) => {
              const exists = Boolean(findByName(name));
              if (!exists) return escapeHtml(name);
              return `<button type="button" class="linkish" data-add-related="${escapeAttr(
                name
              )}">${escapeHtml(name)}</button>`;
            })
            .join("、")
        : "";

      const relLine =
        item.type === "herb" && relatedNames.length
          ? `相关成药：${relHtml}`
          : item.type === "patent" && relatedNames.length
            ? `已知含：${relHtml}`
            : "";

      const unit = unitParts(item);

      return `
        <article class="rx-item ${item.temp ? "is-temp" : ""}" data-id="${item.id}">
          <div class="rx-top">
            <div class="rx-title">
              ${nameBlock(item)}
            </div>
            <button type="button" class="rx-remove" data-remove="${item.id}">删除</button>
          </div>
          ${relLine ? `<p class="rx-rel">${relLine}</p>` : ""}
          <div class="rx-controls">
            <div class="ctrl">
              <label>
                ${escapeHtml(t.qty.zh)}（${escapeHtml(unit.zh)}）
                <span class="label-i18n">${escapeHtml(t.qty.en)} (${escapeHtml(unit.en)}) · <span lang="ar" dir="rtl">${escapeHtml(
                  t.qty.ar
                )} (${escapeHtml(unit.ar)})</span></span>
              </label>
              <div class="qty-row">
                <button type="button" class="qty-btn" data-delta="-1" data-id="${item.id}" aria-label="减少">−</button>
                <input type="number" min="0" step="0.1" value="${item.qty}" data-qty="${item.id}" />
                <button type="button" class="qty-btn" data-delta="1" data-id="${item.id}" aria-label="增加">+</button>
              </div>
            </div>
            <div class="ctrl">
              <label>
                ${escapeHtml(t.unitPrice.zh)}（${escapeHtml(t.currency.zh)} / ${escapeHtml(unit.zh)}）
                <span class="label-i18n">${escapeHtml(t.unitPrice.en)} · <span lang="ar" dir="rtl">${escapeHtml(
                  t.unitPrice.ar
                )}</span></span>
              </label>
              <input type="number" min="0" step="0.01" value="${item.price}" data-price="${item.id}" ${
                item.temp ? "" : "readonly"
              } />
            </div>
            <div class="rx-subtotal">
              <label>
                ${escapeHtml(t.subtotal.zh)}
                <span class="label-i18n">${escapeHtml(t.subtotal.en)} · <span lang="ar" dir="rtl">${escapeHtml(
                  t.subtotal.ar
                )}</span></span>
              </label>
              <div class="price-tri">${priceLine(lineTotal(item))}</div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  renderTotals();
}

function renderTotals() {
  const t = state.i18n;
  const oneDose = perDoseTotal();
  const allDoses = totalForAllDoses();
  const hasItems = state.items.length > 0;

  if (els.doseCount && document.activeElement !== els.doseCount) {
    els.doseCount.value = String(state.doses);
  }

  if (els.perDoseTotal) {
    if (hasItems) {
      els.perDoseTotal.hidden = false;
      els.perDoseTotal.innerHTML = `
        ${escapeHtml(t.perDose.zh)}（1 ${escapeHtml(t.doses.zh)}）：${money(oneDose)} ${escapeHtml(t.currency.zh)}
      `;
    } else {
      els.perDoseTotal.hidden = true;
      els.perDoseTotal.textContent = "";
    }
  }

  if (els.totalLabel) {
    if (state.doses > 1) {
      els.totalLabel.innerHTML = `
        ${escapeHtml(t.totalAll.zh)}（${state.doses} ${escapeHtml(t.doses.zh)}）
        <span class="total-i18n">${escapeHtml(t.totalAll.en)} (${state.doses} ${escapeHtml(
          t.doses.en
        )}) · <span lang="ar" dir="rtl">${escapeHtml(t.totalAll.ar)} (${state.doses} ${escapeHtml(
          t.doses.ar
        )})</span></span>
      `;
    } else {
      els.totalLabel.innerHTML = `
        ${escapeHtml(t.total.zh)}（1 ${escapeHtml(t.doses.zh)}）
        <span class="total-i18n">${escapeHtml(t.total.en)} (1 ${escapeHtml(t.doses.en)}) · <span lang="ar" dir="rtl">${escapeHtml(
          t.total.ar
        )} (1 ${escapeHtml(t.doses.ar)})</span></span>
      `;
    }
  }

  if (els.grandTotalEl) {
    els.grandTotalEl.innerHTML = priceLine(allDoses);
  }

  if (els.itemCount) {
    els.itemCount.textContent = `${state.items.length} ${t.items.zh} · ${state.items.length} ${t.items.en}`;
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(text) {
  return escapeHtml(text).replaceAll("'", "&#39;");
}

function updateTempQtyLabel() {
  els.tempQtyLabel.textContent =
    els.tempType.value === "patent"
      ? "数量（盒） / Qty (box)"
      : "数量（克） / Qty (g)";
}

function bindEvents() {
  els.search.addEventListener("input", () => {
    state.activeSuggest = -1;
    renderSuggest(searchMedicines(els.search.value));
  });

  els.search.addEventListener("focus", () => {
    if (els.search.value.trim()) {
      renderSuggest(searchMedicines(els.search.value));
    }
  });

  window.addEventListener("resize", updateSuggestMaxHeight);
  window.visualViewport?.addEventListener("resize", updateSuggestMaxHeight);

  els.search.addEventListener("keydown", (event) => {
    const options = [...els.suggest.querySelectorAll("button")];
    if (!options.length) {
      if (event.key === "Enter") event.preventDefault();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.activeSuggest = (state.activeSuggest + 1) % options.length;
      renderSuggest(searchMedicines(els.search.value));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      state.activeSuggest =
        (state.activeSuggest - 1 + options.length) % options.length;
      renderSuggest(searchMedicines(els.search.value));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const index = state.activeSuggest >= 0 ? state.activeSuggest : 0;
      options[index]?.click();
    } else if (event.key === "Escape") {
      renderSuggest([]);
    }
  });

  els.suggest.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-name]");
    if (!btn) return;
    const med = findByName(btn.dataset.name);
    if (!med) return;
    addMedicine(med);
    els.search.value = "";
    renderSuggest([]);
    els.search.focus();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) {
      renderSuggest([]);
    }
  });

  els.rxList.addEventListener("click", (event) => {
    const removeId = event.target.closest("[data-remove]")?.dataset.remove;
    if (removeId) {
      state.items = state.items.filter((item) => item.id !== removeId);
      render();
      return;
    }

    const related = event.target.closest("[data-add-related]")?.dataset.addRelated;
    if (related) {
      const med = findByName(related);
      if (med) addMedicine(med);
      return;
    }

    const deltaBtn = event.target.closest("[data-delta]");
    if (deltaBtn) {
      const item = state.items.find((row) => row.id === deltaBtn.dataset.id);
      if (!item) return;
      const next = roundQty(item.qty + Number(deltaBtn.dataset.delta));
      item.qty = Math.max(0, next);
      render();
    }
  });

  els.rxList.addEventListener("change", (event) => {
    const qtyId = event.target.dataset.qty;
    const priceId = event.target.dataset.price;
    if (qtyId) {
      const item = state.items.find((row) => row.id === qtyId);
      if (!item) return;
      item.qty = Math.max(0, roundQty(event.target.value));
      render();
    }
    if (priceId) {
      const item = state.items.find((row) => row.id === priceId);
      if (!item || !item.temp) return;
      item.price = Math.max(0, Number(event.target.value) || 0);
      render();
    }
  });

  els.clear.addEventListener("click", () => {
    if (state.items.length && confirm("确定清空当前处方？")) {
      state.items = [];
      render();
    }
  });

  els.totalBar?.addEventListener("click", (event) => {
    const doseBtn = event.target.closest("[data-dose-delta]");
    if (!doseBtn) return;
    event.preventDefault();
    setDoses(state.doses + Number(doseBtn.dataset.doseDelta));
  });

  els.doseCount?.addEventListener("input", (event) => {
    setDoses(event.target.value);
  });

  els.doseCount?.addEventListener("change", (event) => {
    setDoses(event.target.value);
  });

  els.tempBtn.addEventListener("click", () => {
    els.tempForm.reset();
    els.tempType.value = "herb";
    els.tempQty.value = "10";
    updateTempQtyLabel();
    els.dialog.showModal();
    els.tempName.focus();
  });

  els.tempType.addEventListener("change", updateTempQtyLabel);

  els.tempCancel.addEventListener("click", () => {
    els.dialog.close();
  });

  els.tempForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = els.tempName.value.trim();
    const nameEn = els.tempNameEn?.value.trim() || "";
    const nameAr = els.tempNameAr?.value.trim() || "";
    const type = els.tempType.value;
    const price = Number(els.tempPrice.value);
    const qty = Number(els.tempQty.value);
    if (!name || !(price >= 0) || !(qty >= 0)) return;
    addTemp({ name, nameEn, nameAr, type, price, qty });
    els.dialog.close();
  });
}

async function init() {
  bindEvents();
  render();

  try {
    const { data, source } = await loadMedicineData();
    state.medicines = data.medicines || [];
    state.byName = new Map(state.medicines.map((med) => [med.name, med]));
    if (data.i18n) state.i18n = { ...state.i18n, ...data.i18n };
    if (els.dataStatus) {
      const updated = data.lastUpdated
        ? ` · 更新于 ${new Date(data.lastUpdated).toLocaleString("zh-CN")}`
        : "";
      els.dataStatus.textContent = `数据来源：${source}${updated}`;
    }
    render();
  } catch (error) {
    els.empty.textContent =
      "药品数据加载失败。若在本地打开，请使用本地服务器或部署到 GitHub Pages。";
    if (els.dataStatus) els.dataStatus.textContent = "药品目录加载失败";
    console.error(error);
  }
}

init();
