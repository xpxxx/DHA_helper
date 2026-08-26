const currency = "DHS";
const state = {
  medicines: [],
  byName: new Map(),
  items: [],
  activeSuggest: -1,
};

const els = {
  search: document.getElementById("search-input"),
  suggest: document.getElementById("suggest-list"),
  rxList: document.getElementById("rx-list"),
  empty: document.getElementById("empty-state"),
  clear: document.getElementById("btn-clear"),
  tempBtn: document.getElementById("btn-temp"),
  grandTotal: document.getElementById("grand-total"),
  itemCount: document.getElementById("item-count"),
  dialog: document.getElementById("temp-dialog"),
  tempForm: document.getElementById("temp-form"),
  tempName: document.getElementById("temp-name"),
  tempType: document.getElementById("temp-type"),
  tempPrice: document.getElementById("temp-price"),
  tempQty: document.getElementById("temp-qty"),
  tempQtyLabel: document.getElementById("temp-qty-label"),
  tempCancel: document.getElementById("temp-cancel"),
};

function money(n) {
  const value = Number.isFinite(n) ? n : 0;
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function typeLabel(type) {
  return type === "patent" ? "中成药" : "草药";
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
    const name = med.name.toLowerCase();
    if (name.startsWith(q)) starts.push(med);
    else if (name.includes(q)) includes.push(med);
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
      type: med.type,
      unit: unitLabel(med.type, med.unit),
      price: Number(med.price),
      qty: roundQty(qty),
      temp: false,
      contains: med.contains || [],
      relatedPatents: med.relatedPatents || [],
    });
  }
  render();
}

function addTemp({ name, type, price, qty }) {
  state.items.push({
    id: crypto.randomUUID(),
    name: name.trim(),
    type,
    unit: unitLabel(type),
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

function lineTotal(item) {
  return (Number(item.price) || 0) * (Number(item.qty) || 0);
}

function renderSuggest(list) {
  if (!list.length) {
    els.suggest.hidden = true;
    els.suggest.innerHTML = "";
    els.search.setAttribute("aria-expanded", "false");
    state.activeSuggest = -1;
    return;
  }

  els.suggest.hidden = false;
  els.search.setAttribute("aria-expanded", "true");
  els.suggest.innerHTML = list
    .map((med, index) => {
      const rel = relationText(med);
      return `
        <li role="option">
          <button type="button" data-name="${escapeAttr(med.name)}" aria-selected="${
            index === state.activeSuggest
          }">
            <div class="suggest-main">
              <span>${escapeHtml(med.name)}</span>
              <span>${money(med.price)} / ${escapeHtml(unitLabel(med.type, med.unit))}</span>
            </div>
            <div class="suggest-meta">${typeLabel(med.type)}</div>
            ${rel ? `<div class="suggest-rel">${escapeHtml(rel)}</div>` : ""}
          </button>
        </li>
      `;
    })
    .join("");
}

function render() {
  const hasItems = state.items.length > 0;
  els.empty.hidden = hasItems;
  els.rxList.hidden = !hasItems;
  els.clear.hidden = !hasItems;

  els.rxList.innerHTML = state.items
    .map((item) => {
      const rel = relationText(item);
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
            : rel
              ? escapeHtml(rel)
              : "";

      return `
        <article class="rx-item ${item.temp ? "is-temp" : ""}" data-id="${item.id}">
          <div class="rx-top">
            <p class="rx-name">
              ${escapeHtml(item.name)}
              <span class="badge ${item.type === "patent" ? "badge-patent" : "badge-herb"}">${typeLabel(
                item.type
              )}</span>
              ${item.temp ? '<span class="badge badge-temp">临时</span>' : ""}
            </p>
            <button type="button" class="rx-remove" data-remove="${item.id}">删除</button>
          </div>
          ${relLine ? `<p class="rx-rel">${relLine}</p>` : ""}
          <div class="rx-controls">
            <div class="ctrl">
              <label>数量（${escapeHtml(item.unit)}）</label>
              <div class="qty-row">
                <button type="button" class="qty-btn" data-delta="-1" data-id="${item.id}" aria-label="减少">−</button>
                <input type="number" min="0" step="0.1" value="${item.qty}" data-qty="${item.id}" />
                <button type="button" class="qty-btn" data-delta="1" data-id="${item.id}" aria-label="增加">+</button>
              </div>
            </div>
            <div class="ctrl">
              <label>单价（DHS / ${escapeHtml(item.unit)}）</label>
              <input type="number" min="0" step="0.01" value="${item.price}" data-price="${item.id}" ${
                item.temp ? "" : "readonly"
              } />
            </div>
            <div class="rx-subtotal">
              <label style="display:block;color:var(--muted);font-size:0.75rem;font-weight:400;margin-bottom:0.25rem">小计</label>
              ${money(lineTotal(item))} DHS
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  const total = state.items.reduce((sum, item) => sum + lineTotal(item), 0);
  els.grandTotal.innerHTML = `${money(total)} <span>${currency}</span>`;
  els.itemCount.textContent = `${state.items.length} 项`;
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
    els.tempType.value === "patent" ? "数量（盒）" : "数量（克）";
}

function bindEvents() {
  els.search.addEventListener("input", () => {
    state.activeSuggest = -1;
    renderSuggest(searchMedicines(els.search.value));
  });

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
      const step = item.type === "patent" ? 1 : 1;
      const next = roundQty(item.qty + Number(deltaBtn.dataset.delta) * step);
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
    const type = els.tempType.value;
    const price = Number(els.tempPrice.value);
    const qty = Number(els.tempQty.value);
    if (!name || !(price >= 0) || !(qty >= 0)) return;
    addTemp({ name, type, price, qty });
    els.dialog.close();
  });
}

async function init() {
  bindEvents();
  render();

  try {
    const res = await fetch("data/medicines.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.medicines = data.medicines || [];
    state.byName = new Map(state.medicines.map((med) => [med.name, med]));
  } catch (error) {
    els.empty.textContent =
      "药品数据加载失败。若在本地打开，请使用本地服务器或部署到 GitHub Pages。";
    console.error(error);
  }
}

init();
