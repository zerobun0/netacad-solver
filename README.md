# NetAcad Solver - Call Tarek

A browser extension that automatically solves Cisco NetAcad quizzes by extracting answer data from quiz endpoints and intelligently selecting correct answers. Built with Webpack and compatible with Chrome, Edge, and Firefox.

## Table of Contents
- [Features](#features)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Technical Details](#technical-details)
- [Development](#development)

## Features

- 🎯 **Auto-solve quizzes** - Automatically selects correct answer(s) when you visit a quiz
- 🖱️ **Click-to-solve** - Click a question to highlight and select the correct option(s)
- ⌨️ **Ctrl+Hover solve** - Hold Ctrl while hovering answers to select correct ones
- 📊 **Multiple question types** - Handles MCQ, matching, dropdowns, fill-in-the-blanks, yes/no, table dropdowns, and text input questions
- 🌐 **Browser support** - Works on Chrome, Edge, Firefox, and other Chromium-based browsers
- 💡 **Status indicator** - Popup shows connection status to NetAcad

## How It Works

The extension uses a two-part architecture: **background script** + **content script**.

### Architecture Overview

```
NetAcad Server (components.json)
         ↓
  Background Script (Detects API calls)
         ↓
  Content Script (Processes DOM & Answers)
         ↓
  User Sees Correct Answers Selected
```

### Step-by-Step Process

1. **Detection Phase**
   - Background script monitors network requests for `components.json` API calls
   - NetAcad loads quiz data via this API endpoint with all answer information
   - Extension intercepts and sends the URL to the content script

2. **Data Fetching**
   - Content script fetches the `components.json` and parses the quiz structure
   - Each question has metadata including `_id`, `_items[]`, and `_shouldBeSelected`/`_isCorrect` flags
   - Answer data is extracted and stored in memory

3. **DOM Analysis**
   - Extension searches the quiz DOM (using CSS selectors, iframes, and shadow DOM)
   - Identifies each question type based on the component structure
   - Maps answer data to DOM elements (inputs, buttons, dropdowns, etc.)

4. **Auto-Solve**
   - When user clicks a question: extension finds the correct answer element and clicks/selects it
   - Event listeners are attached with WeakSets to prevent duplicate handlers
   - Supports both click events and Ctrl+hover interactions

### Supported Question Types

| Type | Data Source | Interaction |
|------|-------------|-------------|
| **Basic MCQ** | `_shouldBeSelected` boolean | Click radio/checkbox inputs |
| **Matching** | `question`/`answer` pairs | Click matching pairs |
| **Dropdown Select** | `_options[]` with `_isCorrect` | Click dropdown option |
| **Yes/No** | `_graphic` + `_shouldBeSelected` | Click Yes/No buttons |
| **Fill Blanks** | `preText`, `postText`, `_options[]` | Select dropdown blanks |
| **Text Input** | `_options.text` with text match | Click answer buttons |
| **Table Dropdown** | `_columns` + `_options` | Click table cell inputs |

## Installation

### From Browser Store (When Available)
Coming soon to Chrome Web Store and Firefox Add-ons.

### Manual Installation

#### Chrome, Edge, Brave, Opera, Vivaldi
1. Clone/download this repository
2. Run `npm install && npm run build`
3. Go to `chrome://extensions/`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked** and select the `dist/` folder
6. Visit https://www.netacad.com/ and start a quiz

#### Firefox
1. Clone/download this repository
2. Run `npm install && npm run build`
3. Go to `about:debugging#/runtime/this-firefox`
4. Click **Load Temporary Add-on** and select `dist/manifest.json`
5. Visit https://www.netacad.com/ and start a quiz

## Usage

### Website
1. Navigate to https://www.netacad.com/ and open a quiz
2. Wait for the popup to show "NetAcad page detected"

### Interaction Methods

**Method 1: Click to Solve**
- Click on any quiz question → Correct answer(s) auto-select

**Method 2: Ctrl+Hover**
- Hold Ctrl and hover over answer options → Selected options highlight

**Method 3: Auto-Solve (on page load)**
- If auto-solve is enabled, answers appear as soon as the quiz loads

### Status Indicator
- 🟢 Green dot with "NetAcad page detected" = Extension ready
- ⚫ Gray dot with "Open a NetAcad page" = Not on a quiz page
- The **"Tip Me!"** button links to Ko-fi if you want to support development

## Project Structure

```
your-netacad-solver/
├── src/
│   ├── background/
│   │   └── background.js          # Monitors network requests
│   ├── content/
│   │   ├── content.js             # Main quiz processing (Firefox-compatible)
│   │   └── domHelper.js           # Deep DOM search utilities
│   ├── chrome/
│   │   ├── background.js          # Chrome-specific network interception
│   │   ├── content.js             # Chrome-specific question handling
│   │   ├── popup.js               # Popup UI logic
│   │   ├── popup.html             # Popup interface
│   │   └── domHelper.js           # Chrome DOM utilities
│   ├── firefox/
│   │   ├── background.js          # Firefox-specific handlers
│   │   ├── content.js             # Firefox content script
│   │   └── manifest.json          # Firefox manifest v3
│   ├── popup.js                   # Shared popup logic
│   ├── popup.html                 # Shared popup template
│   ├── manifest.json              # Chrome manifest v3
│   └── manifest-v2.json           # Legacy manifest
├── webpack.common.js              # Shared webpack config
├── webpack.dev.js                 # Development config
├── webpack.prod.js                # Production config
└── package.json                   # Dependencies & scripts
```

## Technical Details

### Network Interception Flow

**Background Script (`src/chrome/background.js` or `src/background/background.js`)**
```javascript
// Listens for API calls to components.json
browser.webRequest.onSendHeaders.addListener(({url, tabId}) => {
  // When detected: browser.tabs.sendMessage(tabId, {componentsUrl: url})
  // This wakes up the content script with the quiz data endpoint
}, {urls: ['https://*.netacad.com/*/components.json']});
```

This approach intercepts the network request without needing API keys or authentication—the data is already being loaded by NetAcad.

### Content Script Processing

**Key Functions:**

1. **`setComponents(url)`** - Fetches `components.json` and parses quiz structure
2. **`detectQuestionType(component)`** - Identifies question type from data structure
3. **`processComponent(component, questionDiv)`** - Handles different question types
4. **`deepHtmlSearch(document, selector)`** - Searches iframes and shadow DOM
5. **Event Listeners** - Attaches click/hover handlers with WeakSet to prevent duplicates

**Example: Basic MCQ Processing**
```javascript
// For each item in the question:
// - Find the input element (radio or checkbox)
// - Add click listener
// - If _shouldBeSelected is true: pre-click or highlight
// - For Ctrl+hover: conditional click on mouseover
```

### DOM Navigation Challenges

NetAcad quizzes use:
- **iframes** - Nested frames with quiz content
- **Shadow DOM** - Encapsulated component styles
- **Dynamic IDs** - CSS-escaped class names like `#{escapeId}__${i}-input`

The `deepHtmlSearch()` function recursively searches through all of these:
```javascript
// 1. Direct DOM query
// 2. Search all iframes recursively
// 3. Search shadow DOM in elements with shadowRoot
// 4. Return first match found
```

### Data Structure Examples

**Basic MCQ from components.json:**
```json
{
  "_id": "question-123",
  "_items": [
    { "_shouldBeSelected": true, "text": "Correct Answer" },
    { "_shouldBeSelected": false, "text": "Wrong Answer" }
  ]
}
```

**Matching Question:**
```json
{
  "_items": [
    { "question": "Q1", "answer": "A1" },
    { "question": "Q2", "answer": "A2" }
  ]
}
```

### Browser Compatibility

- **Chrome/Edge/Brave**: Uses Chrome-specific APIs (`chrome.webRequest`)
- **Firefox**: Uses WebExtension APIs (`browser.webRequest`)
- **Polyfill**: `webextension-polyfill` provides consistent API across browsers

## Development

### Setup

```bash
# Install dependencies
npm install

# Start dev server with file watching
npm start

# Build for production
npm run build

# Output goes to dist/
```

### How to Extend

**Adding a new question type:**

1. Update `detectQuestionType()` to identify your new type
2. Create `processNewType()` function
3. Add case in the switch statement in `main()`
4. Test by checking the DOM structure in your quiz

**Debugging:**

```javascript
// Enable console logging in extension
// Open DevTools on the quiz page: Right-click → Inspect → Console
// Look for [NetAcad Helper] messages
```

To view background script logs:
1. Go to `chrome://extensions/`
2. Click **Details** on your extension
3. Click **background.js** under "Inspecting views"

**Development Workflow:**

1. Make changes to `src/` files
2. Run `npm start` for file watching
3. Go to `chrome://extensions/`
4. Click the refresh icon on your extension to reload
5. Test on a NetAcad quiz page

### Build System

Uses **Webpack 5** with separate configs:
- `webpack.common.js` - Shared config, Babel transpilation
- `webpack.dev.js` - Source maps, no minification, faster builds
- `webpack.prod.js` - Minification, Terser plugin, optimized output

Each browser (Chrome/Firefox) gets its own manifest and code tree for compatibility.

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed updates and improvements.

## Support

If you find bugs or have feature requests, check the GitHub issues or consider supporting development via [Ko-fi](https://ko-fi.com/Zerobun).

## Legal Notice

This extension is for educational purposes. Users are responsible for ensuring their use complies with NetAcad's terms of service and their educational institution's policies.

---

**Built with ❤️ using Webpack, JavaScript, and WebExtension APIs**

1. Build the extension (npm run build)
2. Replace dist/manifest.json with src/manifest-v2.json (or package separately for Firefox)
3. Open about:debugging#/runtime/this-firefox
4. Click Load Temporary Add-on and select your Firefox package/manifest

## License

MIT
