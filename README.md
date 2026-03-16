# Call Tarek

Browser extension for solving NetAcad quizzes.

## Features

- Click a question to auto-select correct answer(s)
- Hold Ctrl and hover options to apply correct answer(s)
- Built-in Tip me popup button linking to Ko-fi

## Usage

1. Open your course at https://www.netacad.com/
2. Use one of these options:
- Click on a quiz question and correct option(s) are selected automatically.
- Hover over answers while holding Ctrl to select correct option(s).

## Local development

1. Install dependencies:

```bash
npm install
```

2. Build production files:

```bash
npm run build
```

3. Output is generated in dist/.

## Quick test in Chrome

1. Open chrome://extensions/
2. Enable Developer mode
3. Click Load unpacked and choose dist/
4. Reload the NetAcad quiz page and test click/hover solve

## Manual loading

### Chromium browsers (Chrome, Edge, Brave, Opera, Vivaldi)

1. Build the extension (npm run build)
2. Open chrome://extensions/
3. Enable Developer mode
4. Click Load unpacked and select the dist/ folder

### Firefox

1. Build the extension (npm run build)
2. Replace dist/manifest.json with src/manifest-v2.json (or package separately for Firefox)
3. Open about:debugging#/runtime/this-firefox
4. Click Load Temporary Add-on and select your Firefox package/manifest

## License

MIT
