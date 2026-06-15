# Cool Headers

A Chrome extension that auto-applies request headers based on URL patterns. No more manual profile switching.

## Why?

Tools like ModHeader require you to manually switch between profiles when moving between environments (test, staging, production). Cool Headers ties rules to URL match patterns instead — visit a site and the right headers apply automatically.

## Features

- **URL-pattern-based rules** — match URL patterns, headers apply automatically
- **Enable/disable toggle** — turn individual rules on or off
- **Active rules indicator** — badge on the icon + popup section showing active rules for the current tab
- **Import/export** — share or backup rules as JSON
- **Header operations** — Set and Remove
- **Open in Tab** — full-page view with a resizable window for easier management

## Installation

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `cool-headers` directory

## Usage

### Add a Rule

1. Click the extension icon
2. Click **Add Rule**
3. Fill in:
   - **Rule Name** — e.g. "Test Auth Headers"
   - **URL Match Pattern** — e.g. `*://test.example.com/*` (click 📍 to auto-fill from current tab)
   - **Headers** — add name/value pairs with Set or Remove operations
4. Click **Save**

### URL Match Patterns

| Pattern | Matches |
|---------|---------|
| `*://test.example.com/*` | Any request to test.example.com |
| `*://*.example.com/*` | Any subdomain of example.com (including bare domain) |
| `*://localhost:3000/*` | Localhost on port 3000 |
| `https://api.example.com/*` | HTTPS only to api.example.com |

Wildcards: `*` matches anything, `||` is a domain anchor, `^` is a separator.

### Example: Multiple Environments

| Rule Name | URL Pattern | Headers |
|-----------|-------------|---------|
| Test Auth | `*://test.example.com/*` | `Cookie: session=test-token` |
| Staging Auth | `*://staging.example.com/*` | `Cookie: session=staging-token` |

Both rules can be active at the same time. Visit test.example.com and the test cookie applies; visit staging.example.com and the staging cookie applies — no profile switching needed.

### Import / Export

- **Export** — downloads all rules as a JSON file
- **Import** — loads rules from a JSON file; duplicate IDs are skipped

### Import File Format

```json
{
  "rules": [
    {
      "id": "abc123",
      "name": "Test Auth Headers",
      "enabled": true,
      "matchPattern": "*://test.example.com/*",
      "headers": [
        { "name": "Cookie", "value": "session=test-token", "operation": "set" },
        { "name": "X-Debug", "value": "", "operation": "remove" }
      ]
    }
  ]
}
```

## Tech

- Chrome Extension Manifest V3
- [`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/) API for header modification (no persistent background needed)
- [`chrome.storage.sync`](https://developer.chrome.com/docs/extensions/reference/storage/) for rule persistence and cross-device sync
