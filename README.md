# netacad-solver

browser extension that auto-solves cisco netacad quizzes. works on chrome, firefox, and basically any chromium browser (edge, brave, opera, vivaldi etc).

no api keys needed. it just reads the answers that netacad already sends to your browser lol

## how it works

netacad loads a `components.json` file that literally contains all the correct answers for the quiz. the extension intercepts that request using webRequest API and parses the answer flags (`_shouldBeSelected`, `_isCorrect`) from the json data. so its not guessing - its reading the actual answers from netacad's own data.

if for whatever reason the json interception doesnt work (like if they change something), theres an optional AI fallback that can use gemini/groq/openrouter to figure out the answers. but honestly you probably wont need it.

## supported question types

- multiple choice (single + multi select)
- matching / drag & drop pairs
- dropdown select
- yes/no with images
- text input
- fill in the blanks
- table dropdowns

pretty much covers everything netacad throws at you

## installation

### chrome / edge / brave / etc

1. download or clone this repo
2. go to `chrome://extensions/`
3. turn on **Developer mode** (top right toggle)
4. click **Load unpacked**
5. select the `src/chrome` folder
6. done

### firefox

1. download or clone this repo
2. go to `about:debugging#/runtime/this-firefox`
3. click **Load Temporary Add-on**
4. select `src/firefox/manifest.json`
5. done

> firefox temporary addons reset when you restart the browser. for permanent install youd need to sign it through AMO but this works fine for personal use

## usage

theres 3 ways to use it:

**click to solve** - just click on the question text and itll auto select the right answer(s)

**ctrl + hover** - hold ctrl and hover over the options, the correct ones get selected

**keyboard shortcuts:**
| shortcut | what it does |
|---|---|
| `Alt+Shift+Q` | solve questions on current page |
| `Alt+Shift+A` | solve all pages (auto navigates) |

you can also use the popup (click the extension icon) to hit solve current / solve all

## ai fallback (optional)

if you want to set up the AI fallback just in case:

1. click the extension icon
2. expand "AI Fallback" section
3. pick a provider (gemini is free and works well)
4. paste your api key
5. save

this only kicks in when the json method fails which honestly almost never happens

## project structure

```
src/
├── chrome/          # manifest v3 (chromium browsers)
│   ├── manifest.json
│   ├── background.js    # intercepts components.json
│   ├── content.js       # main quiz solving logic
│   ├── domHelper.js     # shadow dom traversal
│   ├── popup.html/js    # settings ui
│   ├── rules.json       # declarativeNetRequest rules
│   └── icons/
│
└── firefox/         # manifest v2 (firefox)
    ├── manifest.json
    ├── background.js
    ├── content.js
    ├── domHelper.js
    ├── popup.html/js
    └── icons/
```

## why does this even work

netacad sends the answer data to the client side because they need it for:
- client side validation / instant feedback
- showing explanations after you submit
- the interactive quiz ui

so the answers are literally already in your browser, this extension just reads them. its not hacking anything or modifying server responses.

## credits

inspired by [MeowCad Solver](https://github.com/ingui-n/netacad-solver) and [netAIcad](https://github.com/zaidkx7/NetAIcad)

## license

MIT
