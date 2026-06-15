// Cool Headers - Background Service Worker
// Converts stored rules into declarativeNetRequest session rules

const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "webtransport",
  "webbundle",
  "other",
];

// Generate a numeric rule ID from a string (declarativeNetRequest requires integer IDs)
function hashToId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) + 1; // avoid 0
}

// Escape regex special chars for use in a regex pattern
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Convert a user-friendly URL pattern to a regex string for declarativeNetRequest
function patternToRegex(pattern) {
  let p = pattern;
  let scheme = "";
  const SUBDOMAIN_PH = "__SUBDOMAIN__";
  const SEP_PH = "<<<SEP>>>";

  // --- Step 1: Extract scheme and host/path ---
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

  // Step 2: Handle *. subdomain wildcard
  p = p.replace(/^\*\./, SUBDOMAIN_PH);

  // Step 3: Replace ^ separator BEFORE escaping (so it doesn't get escaped)
  p = p.replace(/\^/g, SEP_PH);

  // Step 4: Escape regex special chars
  p = escapeRegex(p);

  // Step 5: Restore ^ separator
  p = p.replace(new RegExp(SEP_PH, "g"), "(?:[/\\?#]|$)");

  // Step 6: Convert * to .*
  p = p.replace(/\*/g, ".*");

  // Step 7: Restore subdomain placeholder
  p = p.split(SUBDOMAIN_PH).join("(([^\\./]+\\.)+)?");

  // Step 8: Assemble final regex
  let regex = "^" + scheme + p;
  if (!regex.endsWith(".*")) {
    regex += ".*";
  }
  return regex;
}

function storedRuleToDnrRules(rule) {
  if (!rule.enabled || !rule.headers || rule.headers.length === 0) {
    return [];
  }

  const requestHeaders = rule.headers.map((h) => {
    if (h.operation === "remove") {
      return { header: h.name, operation: "remove" };
    }
    return { header: h.name, operation: "set", value: h.value };
  });

  const regexFilter = patternToRegex(rule.matchPattern);

  return [
    {
      id: hashToId(rule.id),
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders,
      },
      condition: {
        regexFilter,
        resourceTypes: RESOURCE_TYPES,
      },
    },
  ];
}

async function rebuildSessionRules() {
  try {
    const existing = await chrome.declarativeNetRequest.getSessionRules();
    const existingIds = existing.map((r) => r.id);

    const data = await chrome.storage.sync.get("rules");
    const rules = data.rules || [];
    const dnrRules = rules.flatMap(storedRuleToDnrRules);

    const updateOpts = {};
    if (existingIds.length > 0) {
      updateOpts.removeRuleIds = existingIds;
    }
    if (dnrRules.length > 0) {
      updateOpts.addRules = dnrRules;
    }

    await chrome.declarativeNetRequest.updateSessionRules(updateOpts);
    console.log(`Cool Headers: rebuilt ${dnrRules.length} session rules`);
  } catch (err) {
    console.error("Cool Headers: failed to rebuild session rules:", err);
  }
}

async function updateBadge(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) {
      chrome.action.setBadgeText({ text: "", tabId });
      return;
    }

    const data = await chrome.storage.sync.get("rules");
    const rules = data.rules || [];
    const activeCount = rules.filter(
      (r) => r.enabled && matchUrl(tab.url, r.matchPattern)
    ).length;

    if (activeCount > 0) {
      chrome.action.setBadgeText({ text: String(activeCount), tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId });
    } else {
      chrome.action.setBadgeText({ text: "", tabId });
    }
  } catch {
    // Tab may have been closed
  }
}

function matchUrl(url, pattern) {
  try {
    const regexStr = patternToRegex(pattern);
    const regex = new RegExp(regexStr, "i");
    return regex.test(url);
  } catch {
    return false;
  }
}

// --- Event Listeners ---

chrome.runtime.onInstalled.addListener(() => {
  rebuildSessionRules();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.rules) {
    rebuildSessionRules();
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateBadge(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    updateBadge(tabId);
  }
});
