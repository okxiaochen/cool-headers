// Cool Headers - Popup Logic

document.addEventListener("DOMContentLoaded", init);

// --- State ---
let editingRuleId = null;
let currentTabUrl = "";
let isTabMode = false;

// --- Init ---
async function init() {
  isTabMode = window.location.search.includes("tab=true");
  if (isTabMode) {
    document.body.classList.add("tab-mode");
    document.getElementById("btn-open-tab").style.display = "none";
  }

  await cacheCurrentTabUrl();
  await renderRules();
  await renderActiveRules();
  bindEvents();
}

// --- Storage Helpers ---
async function getRules() {
  const data = await chrome.storage.sync.get("rules");
  return data.rules || [];
}

async function saveRules(rules) {
  await chrome.storage.sync.set({ rules });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// --- Current Tab URL ---
async function cacheCurrentTabUrl() {
  try {
    if (isTabMode) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const normalTab = tabs.find(
        (t) =>
          t.url &&
          !t.url.startsWith("chrome://") &&
          !t.url.startsWith("chrome-extension://")
      );
      if (normalTab) {
        currentTabUrl = normalTab.url;
      }
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && !tab.url.startsWith("chrome://")) {
        currentTabUrl = tab.url;
      }
    }
  } catch {
    // ignore
  }
}

function urlToPattern(url) {
  try {
    const u = new URL(url);
    const port = u.port ? ":" + u.port : "";
    return "*://" + u.hostname + port + "/*";
  } catch {
    return url;
  }
}

// --- URL Matching (same logic as background.js) ---

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternToRegex(pattern) {
  let p = pattern;
  let scheme = "";
  const SUBDOMAIN_PH = "__SUBDOMAIN__";
  const SEP_PH = "<<<SEP>>>";

  if (p.includes("://")) {
    const schemeEnd = p.indexOf("://");
    const schemePart = p.substring(0, schemeEnd);
    const rest = p.substring(schemeEnd + 3);

    if (schemePart === "*") {
      scheme = "https?://";
    } else {
      scheme = escapeRegex(schemePart) + "://";
    }
    p = rest;
  } else if (p.startsWith("||")) {
    p = p.substring(2);
    scheme = "https?://";
    p = SUBDOMAIN_PH + p;
  } else {
    scheme = "https?://";
  }

  p = p.replace(/^\*\./, SUBDOMAIN_PH);
  p = p.replace(/\^/g, SEP_PH);
  p = escapeRegex(p);
  p = p.replace(new RegExp(SEP_PH, "g"), "(?:[/\\?#]|$)");
  p = p.replace(/\*/g, ".*");
  p = p.split(SUBDOMAIN_PH).join("(([^\\./]+\\.)+)?");

  let regex = "^" + scheme + p;
  if (!regex.endsWith(".*")) {
    regex += ".*";
  }
  return regex;
}

function matchUrl(url, pattern) {
  try {
    const regex = new RegExp(patternToRegex(pattern), "i");
    return regex.test(url);
  } catch {
    return false;
  }
}

// --- Rendering ---

async function renderActiveRules() {
  const container = document.getElementById("active-rules");
  const section = document.getElementById("active-section");
  const badge = document.getElementById("active-badge");
  const rules = await getRules();
  const active = rules.filter((r) => r.enabled && matchUrl(currentTabUrl, r.matchPattern));

  badge.textContent = String(active.length);
  badge.dataset.count = String(active.length);

  if (active.length === 0) {
    section.style.display = "none";
    container.innerHTML = "";
    return;
  }

  section.style.display = "";
  container.innerHTML = active
    .map(
      (r) => `
    <div class="rule-card">
      <div class="rule-card-name">${escapeHtml(r.name)}</div>
      <div class="rule-card-pattern">${escapeHtml(r.matchPattern)}</div>
    </div>`
    )
    .join("");
}

async function renderRules() {
  const container = document.getElementById("all-rules");
  const emptyState = document.getElementById("empty-state");
  const rules = await getRules();

  if (rules.length === 0) {
    container.innerHTML = "";
    emptyState.style.display = "";
    return;
  }

  emptyState.style.display = "none";
  container.innerHTML = rules
    .map(
      (r) => `
    <div class="rule-row ${r.enabled ? "" : "disabled"}" data-id="${escapeHtml(r.id)}">
      <label class="toggle" title="${r.enabled ? "Disable" : "Enable"}">
        <input type="checkbox" class="rule-toggle" data-id="${escapeHtml(r.id)}" ${r.enabled ? "checked" : ""} />
        <span class="toggle-slider"></span>
      </label>
      <div class="rule-row-info">
        <div class="rule-row-name">${escapeHtml(r.name)}</div>
        <div class="rule-row-pattern">${escapeHtml(r.matchPattern)}</div>
        <div class="rule-row-headers">${escapeHtml(formatHeadersSummary(r.headers))}</div>
      </div>
      <div class="rule-actions">
        <button class="btn-icon btn-edit" data-id="${escapeHtml(r.id)}" title="Edit">✎</button>
        <button class="btn-icon delete btn-delete" data-id="${escapeHtml(r.id)}" title="Delete">✕</button>
      </div>
    </div>`
    )
    .join("");
}

function formatHeadersSummary(headers) {
  if (!headers || headers.length === 0) return "No headers";
  return headers
    .map((h) => {
      if (h.operation === "remove") return `${h.name}: (remove)`;
      return `${h.name}: ${h.value}`;
    })
    .join(" · ");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Editor ---

function openEditor(rule) {
  editingRuleId = rule ? rule.id : null;
  document.getElementById("modal-title").textContent = rule ? "Edit Rule" : "Add Rule";
  document.getElementById("rule-name").value = rule ? rule.name : "";
  document.getElementById("rule-pattern").value = rule ? rule.matchPattern : "";

  const headersRows = document.getElementById("headers-rows");
  headersRows.innerHTML = "";
  const headers = rule && rule.headers ? rule.headers : [{ name: "", value: "", operation: "set" }];
  headers.forEach((h) => addHeaderRow(h));

  document.getElementById("modal-overlay").style.display = "flex";
}

function closeEditor() {
  editingRuleId = null;
  document.getElementById("modal-overlay").style.display = "none";
}

function addHeaderRow(header = { name: "", value: "", operation: "set" }) {
  const row = document.createElement("div");
  row.className = "header-row";
  row.innerHTML = `
    <input type="text" class="header-name" placeholder="Header name" value="${escapeHtml(header.name)}" />
    <input type="text" class="header-value" placeholder="Value" value="${escapeHtml(header.value)}" ${header.operation === "remove" ? "disabled" : ""} />
    <select class="header-op">
      <option value="set" ${header.operation === "set" ? "selected" : ""}>Set</option>
      <option value="remove" ${header.operation === "remove" ? "selected" : ""}>Remove</option>
    </select>
    <button class="btn-remove" title="Remove header">✕</button>
  `;

  row.querySelector(".header-op").addEventListener("change", (e) => {
    const valueInput = row.querySelector(".header-value");
    valueInput.disabled = e.target.value === "remove";
    if (e.target.value === "remove") valueInput.value = "";
  });

  row.querySelector(".btn-remove").addEventListener("click", () => {
    const list = document.getElementById("headers-rows");
    if (list.children.length > 1) {
      row.remove();
    }
  });

  document.getElementById("headers-rows").appendChild(row);
}

function collectHeadersFromEditor() {
  const rows = document.querySelectorAll("#headers-rows .header-row");
  const headers = [];
  rows.forEach((row) => {
    const name = row.querySelector(".header-name").value.trim();
    const operation = row.querySelector(".header-op").value;
    const value = row.querySelector(".header-value").value;
    if (name) {
      headers.push({ name, value, operation });
    }
  });
  return headers;
}

async function saveRuleFromEditor() {
  const name = document.getElementById("rule-name").value.trim();
  const matchPattern = document.getElementById("rule-pattern").value.trim();
  const headers = collectHeadersFromEditor();

  if (!name || !matchPattern) {
    alert("Please fill in rule name and URL pattern.");
    return;
  }
  if (headers.length === 0) {
    alert("Please add at least one header.");
    return;
  }

  const rules = await getRules();

  if (editingRuleId) {
    const idx = rules.findIndex((r) => r.id === editingRuleId);
    if (idx >= 0) {
      rules[idx] = { ...rules[idx], name, matchPattern, headers };
    }
  } else {
    rules.push({
      id: generateId(),
      name,
      enabled: true,
      matchPattern,
      headers,
    });
  }

  await saveRules(rules);
  closeEditor();
  await renderRules();
  await renderActiveRules();
}

// --- Import / Export ---

async function exportRules() {
  const rules = await getRules();
  const blob = new Blob([JSON.stringify({ rules }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cool-headers-rules.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function importRules(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.rules || !Array.isArray(data.rules)) {
      alert("Invalid file format.");
      return;
    }

    const existing = await getRules();
    const existingIds = new Set(existing.map((r) => r.id));
    let added = 0;

    for (const rule of data.rules) {
      if (!rule.id || existingIds.has(rule.id)) continue;
      existing.push(rule);
      existingIds.add(rule.id);
      added++;
    }

    await saveRules(existing);
    await renderRules();
    await renderActiveRules();
    alert(`Imported ${added} rule(s).`);
  } catch {
    alert("Failed to import rules. Check the file format.");
  }
}

// --- Events ---

function bindEvents() {
  document.getElementById("btn-add").addEventListener("click", () => openEditor(null));
  document.getElementById("btn-cancel").addEventListener("click", closeEditor);
  document.getElementById("btn-save").addEventListener("click", saveRuleFromEditor);
  document.getElementById("btn-add-header").addEventListener("click", () => addHeaderRow());

  document.getElementById("btn-use-current").addEventListener("click", () => {
    if (currentTabUrl) {
      document.getElementById("rule-pattern").value = urlToPattern(currentTabUrl);
    }
  });

  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeEditor();
  });

  document.getElementById("btn-open-tab").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html?tab=true") });
  });

  document.getElementById("btn-export").addEventListener("click", exportRules);

  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("file-import").click();
  });

  document.getElementById("file-import").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importRules(file);
    e.target.value = "";
  });

  document.getElementById("all-rules").addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".btn-edit");
    const deleteBtn = e.target.closest(".btn-delete");

    if (editBtn) {
      const rules = await getRules();
      const rule = rules.find((r) => r.id === editBtn.dataset.id);
      if (rule) openEditor(rule);
    }

    if (deleteBtn) {
      if (!confirm("Delete this rule?")) return;
      const rules = await getRules();
      await saveRules(rules.filter((r) => r.id !== deleteBtn.dataset.id));
      await renderRules();
      await renderActiveRules();
    }
  });

  document.getElementById("all-rules").addEventListener("change", async (e) => {
    if (e.target.classList.contains("rule-toggle")) {
      const rules = await getRules();
      const rule = rules.find((r) => r.id === e.target.dataset.id);
      if (rule) {
        rule.enabled = e.target.checked;
        await saveRules(rules);
        await renderRules();
        await renderActiveRules();
      }
    }
  });
}
