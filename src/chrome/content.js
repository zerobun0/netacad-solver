// content.js - netacad quiz solver
// intercepts components.json answers + fallback to AI if needed
// handles: mcq, match, dropdown, yesno, text input, fill blanks, table dropdown

'use strict';

// ─── State ───────────────────────────────────────────────────────────

let components = [];
let processedCount = 0;
let isReady = false;
let pollInterval = null;
let statusElement = null;

// WeakSets to prevent duplicate event listeners
const processedQuestionElements = new WeakSet();
const processedLabels = new WeakSet();
const processedMatchPairs = new WeakSet();
const processedDropdownOptions = new WeakSet();
const processedFillBlanks = new WeakSet();
const processedTableRows = new WeakSet();
const processedYesNo = new WeakSet();
const processedTextInputs = new WeakSet();

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// ─── Message Listener ────────────────────────────────────────────────

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'componentUrl' && message.url) {
    console.log('[NetAcad Helper] Received components.json URL:', message.url);
    setComponents(message.url);
    sendResponse({ received: true });
  }

  if (message.action === 'solveQuestion') {
    solveCurrentVisible();
    sendResponse({ success: true });
  }

  if (message.action === 'solveAll') {
    solveAllVisible();
    sendResponse({ success: true });
  }

  if (message.action === 'getStatus') {
    sendResponse({
      componentCount: components.length,
      processedCount: processedCount,
      isReady: isReady
    });
  }

  return true;
});

// ─── Components.json Fetching & Parsing ──────────────────────────────

async function setComponents(url) {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    let json = await res.json();

    // Filter to components that have quiz items and aren't already loaded
    const existingIds = new Set(components.map(c => c._id));
    json = json
      .filter(component => component._items || component._columns)
      .filter(component => !existingIds.has(component._id))
      .map(component => {
        // Clean HTML from body text
        if (component.body) {
          component.bodyText = getTextContentOfHtml(component.body);
        }
        // Detect question type
        component._questionType = detectQuestionType(component);
        return component;
      });

    components.push(...json);
    console.log(`[NetAcad Helper] Loaded ${json.length} new components (${components.length} total)`);
    showStatus(`Loaded ${components.length} questions`, 'success');

    // Start processing
    suspendMain();
  } catch (e) {
    console.error('[NetAcad Helper] Failed to fetch components.json:', e);
    showStatus('Failed to load quiz data', 'error');
  }
}

/**
 * Detect the question type from the component data structure.
 */
function detectQuestionType(component) {
  const items = component._items || [];
  if (items.length === 0) return 'unknown';

  const first = items[0];

  // Basic MCQ: has _shouldBeSelected boolean
  if (typeof first._shouldBeSelected === 'boolean') return 'basic';

  // Match: has question and answer properties
  if (first.question !== undefined && first.answer !== undefined) return 'match';

  // Yes/No: has _graphic with alt
  if (first._graphic && first._graphic.alt) return 'yesNo';

  // Open text input: has id and _options with text
  if (first.id !== undefined && first._options && first._options.text) return 'openTextInput';

  // Fill blanks: has preText and postText
  if (first.preText !== undefined && first.postText !== undefined) return 'fillBlanks';

  // Dropdown select: has text and _options array with _isCorrect
  if (first.text && Array.isArray(first._options) && first._options[0] && typeof first._options[0]._isCorrect === 'boolean') {
    return 'tableDropdown';
  }

  // Dropdown select: has text and _options with text
  if (first.text && first._options) return 'dropdownSelect';

  return 'basic'; // default fallback
}

// ─── Main Processing Loop ────────────────────────────────────────────

function suspendMain() {
  if (pollInterval) clearInterval(pollInterval);

  isReady = false;
  let readyAttempts = 0;

  pollInterval = setInterval(() => {
    readyAttempts++;

    // Check if quiz DOM is ready
    if (setIsReady() || readyAttempts > 60) {
      clearInterval(pollInterval);
      pollInterval = null;
      if (isReady) {
        main();
      }
    }
  }, 1000);
}

function setIsReady() {
  if (components.length === 0) return false;

  // Check if at least one component's DOM element is visible
  for (const component of components) {
    const el = deepHtmlSearch(document, `.${CSS.escape(component._id)}`);
    if (el) {
      isReady = true;
      return true;
    }
  }
  return false;
}

function main() {
  console.log('[NetAcad Helper] Processing', components.length, 'components');
  let currentProcessed = 0;

  for (const component of components) {
    const questionDiv = deepHtmlSearch(document, `.${CSS.escape(component._id)}`);
    if (!questionDiv) continue;

    currentProcessed++;
    processComponent(component, questionDiv);
  }

  processedCount = currentProcessed;
  console.log(`[NetAcad Helper] Processed ${processedCount} visible questions`);

  // Monitor for navigation changes
  startNavigationMonitor();
}

// ─── Component Processing ────────────────────────────────────────────

function processComponent(component, questionDiv) {
  const type = component._questionType;

  switch (type) {
    case 'basic':
      processBasicQuestion(component, questionDiv);
      break;
    case 'match':
      processMatchQuestion(component, questionDiv);
      break;
    case 'dropdownSelect':
      processDropdownQuestion(component, questionDiv);
      break;
    case 'yesNo':
      processYesNoQuestion(component, questionDiv);
      break;
    case 'openTextInput':
      processTextInputQuestion(component, questionDiv);
      break;
    case 'fillBlanks':
      processFillBlanksQuestion(component, questionDiv);
      break;
    case 'tableDropdown':
      processTableDropdownQuestion(component, questionDiv);
      break;
    default:
      processBasicQuestion(component, questionDiv);
  }
}

// ─── Basic MCQ (radio/checkbox) ──────────────────────────────────────

function processBasicQuestion(component, questionDiv) {
  const questionElement = deepHtmlSearch(questionDiv, '.component__body, [class*="question"]')
    || deepHtmlFindByTextContent(questionDiv, component.bodyText)
    || questionDiv;

  if (!questionElement || processedQuestionElements.has(questionElement)) return;
  processedQuestionElements.add(questionElement);

  // Collect inputs and labels
  const inputs = [];
  for (let i = 0; i < component._items.length; i++) {
    const inputSelector = `#${CSS.escape(component._id)}-${i}-input`;
    const labelSelector = `#${CSS.escape(component._id)}-${i}-label`;

    let input = deepHtmlSearch(document, inputSelector);
    let label = deepHtmlSearch(document, labelSelector);

    // Fallback: search within the question div
    if (!input) {
      const allInputs = deepHtmlSearch(questionDiv, 'input[type="radio"], input[type="checkbox"]', false, 20);
      if (Array.isArray(allInputs) && allInputs[i]) {
        input = allInputs[i];
        label = input.closest('label') || input.parentElement;
      }
    }

    if (!label && input) {
      label = input.closest('label') || input.parentElement;
    }

    inputs.push({ input, label, index: i });
  }

  // Click handler: click question text → auto-select correct answers
  questionElement.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
    selectBasicAnswers(component, inputs);
  });

  // Ctrl+hover handler on each option
  for (const { input, label, index } of inputs) {
    if (!label || processedLabels.has(label)) continue;
    processedLabels.add(label);

    label.addEventListener('mouseover', (e) => {
      if (e.ctrlKey && component._items[index]._shouldBeSelected) {
        setTimeout(() => label.click(), 10);
      }
    });
  }

  // Visual indicator
  addQuestionIndicator(questionElement, component._items.filter(i => i._shouldBeSelected).length > 1 ? 'multi' : 'single');
}

function selectBasicAnswers(component, inputs) {
  for (const { input, label, index } of inputs) {
    if (!label) continue;
    const shouldSelect = component._items[index]._shouldBeSelected;

    if (shouldSelect) {
      setTimeout(() => label.click(), 10 * index);
    } else if (input && input.checked) {
      // Uncheck wrong answers
      setTimeout(() => label.click(), 10 * index);
    }
  }
}

// ─── Match Questions (Drag & Drop Pairs) ─────────────────────────────

function processMatchQuestion(component, questionDiv) {
  if (processedMatchPairs.has(questionDiv)) return;
  processedMatchPairs.add(questionDiv);

  const questionElement = deepHtmlSearch(questionDiv, '.component__body, [class*="question"]')
    || questionDiv;

  questionElement.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT') return;
    selectMatchAnswers(component, questionDiv);
  });

  addQuestionIndicator(questionElement, 'match');
}

function selectMatchAnswers(component, questionDiv) {
  for (let i = 0; i < component._items.length; i++) {
    const item = component._items[i];

    // Find the answer elements by data-id attribute
    const answerInputs = deepHtmlSearch(document, `[data-id="${i}"]`, false, 2);
    if (Array.isArray(answerInputs) && answerInputs.length >= 2) {
      setTimeout(() => {
        answerInputs[0].click();
        setTimeout(() => answerInputs[1].click(), 50);
      }, 100 * i);
    }
  }
}

// ─── Dropdown Select ─────────────────────────────────────────────────

function processDropdownQuestion(component, questionDiv) {
  if (processedDropdownOptions.has(questionDiv)) return;
  processedDropdownOptions.add(questionDiv);

  const questionElement = deepHtmlSearch(questionDiv, '.component__body, [class*="question"]')
    || questionDiv;

  questionElement.addEventListener('click', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
    selectDropdownAnswers(component, questionDiv);
  });

  // Ctrl+hover on dropdown items
  for (let i = 0; i < component._items.length; i++) {
    const item = component._items[i];
    if (!item._options) continue;

    const correctIdx = Array.isArray(item._options)
      ? item._options.findIndex(opt => opt._isCorrect)
      : -1;

    if (correctIdx >= 0) {
      const dropdownSelector = `#dropdown__item-index-${correctIdx}`;
      const dropdownItem = deepHtmlSearch(questionDiv, dropdownSelector);
      if (dropdownItem && !processedDropdownOptions.has(dropdownItem)) {
        processedDropdownOptions.add(dropdownItem);
        dropdownItem.addEventListener('mouseover', (e) => {
          if (e.ctrlKey) setTimeout(() => dropdownItem.click(), 10);
        });
      }
    }
  }

  addQuestionIndicator(questionElement, 'dropdown');
}

function selectDropdownAnswers(component, questionDiv) {
  for (let i = 0; i < component._items.length; i++) {
    const item = component._items[i];
    if (!item._options) continue;

    const correctIdx = Array.isArray(item._options)
      ? item._options.findIndex(opt => opt._isCorrect)
      : -1;

    if (correctIdx >= 0) {
      // Try clicking dropdown then selecting
      const dropdownSelector = `#dropdown__item-index-${correctIdx}`;
      const dropdownItem = deepHtmlSearch(questionDiv, dropdownSelector);
      if (dropdownItem) {
        setTimeout(() => dropdownItem.click(), 50 * i);
      }

      // Also try select elements
      const selects = deepHtmlSearch(questionDiv, 'select', false, 10);
      if (Array.isArray(selects) && selects[i]) {
        const select = selects[i];
        const correctOption = Array.isArray(item._options)
          ? item._options.find(opt => opt._isCorrect)
          : null;
        if (correctOption) {
          select.value = correctOption.text || correctIdx.toString();
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  }
}

// ─── Yes/No Questions ────────────────────────────────────────────────

function processYesNoQuestion(component, questionDiv) {
  if (processedYesNo.has(questionDiv)) return;
  processedYesNo.add(questionDiv);

  const questionElement = deepHtmlSearch(questionDiv, '.component__body, [class*="question"]')
    || questionDiv;

  questionElement.addEventListener('click', (e) => {
    selectYesNoAnswers(component, questionDiv);
  });

  addQuestionIndicator(questionElement, 'yesno');
}

function selectYesNoAnswers(component, questionDiv) {
  for (let i = 0; i < component._items.length; i++) {
    const item = component._items[i];
    const altText = item._graphic?.alt;
    if (!altText) continue;

    // Find the image by alt text
    const img = deepHtmlSearch(questionDiv, `img[alt="${CSS.escape(altText)}"]`);
    if (!img) continue;

    const container = img.closest('[class*="item"]') || img.parentElement;
    if (!container) continue;

    const shouldSelect = item._shouldBeSelected;
    const yesBtn = deepHtmlSearch(container, '.user_selects_yes, [class*="yes"]');
    const noBtn = deepHtmlSearch(container, '.user_selects_no, [class*="no"]');

    if (shouldSelect && yesBtn) {
      setTimeout(() => yesBtn.click(), 50 * i);
    } else if (!shouldSelect && noBtn) {
      setTimeout(() => noBtn.click(), 50 * i);
    }
  }
}

// ─── Open Text Input ─────────────────────────────────────────────────

function processTextInputQuestion(component, questionDiv) {
  if (processedTextInputs.has(questionDiv)) return;
  processedTextInputs.add(questionDiv);

  const questionElement = deepHtmlSearch(questionDiv, '.component__body, [class*="question"]')
    || questionDiv;

  questionElement.addEventListener('click', (e) => {
    selectTextInputAnswers(component, questionDiv);
  });

  addQuestionIndicator(questionElement, 'text');
}

function selectTextInputAnswers(component, questionDiv) {
  for (let i = 0; i < component._items.length; i++) {
    const item = component._items[i];
    if (!item._options) continue;

    const position = item.position || item._options.position;
    if (position && Array.isArray(position)) {
      for (const pos of position) {
        const target = deepHtmlSearch(questionDiv, `[data-target="${pos}"]`);
        if (target) {
          setTimeout(() => target.click(), 50 * i);
        }
      }
    }
  }
}

// ─── Fill-in-the-Blanks ──────────────────────────────────────────────

function processFillBlanksQuestion(component, questionDiv) {
  if (processedFillBlanks.has(questionDiv)) return;
  processedFillBlanks.add(questionDiv);

  const questionElement = deepHtmlSearch(questionDiv, '.component__body, [class*="question"]')
    || questionDiv;

  questionElement.addEventListener('click', (e) => {
    selectFillBlanksAnswers(component, questionDiv);
  });

  // Ctrl+hover
  for (let i = 0; i < component._items.length; i++) {
    const item = component._items[i];
    if (!item._options || !Array.isArray(item._options)) continue;

    const correctOpt = item._options.find(opt => opt._isCorrect);
    if (!correctOpt) continue;

    const optElements = deepHtmlSearch(questionDiv, '[class*="dropdown__item"]', false, 20);
    if (Array.isArray(optElements)) {
      for (const el of optElements) {
        if (el.textContent.trim() === correctOpt.text && !processedFillBlanks.has(el)) {
          processedFillBlanks.add(el);
          el.addEventListener('mouseover', (e) => {
            if (e.ctrlKey) setTimeout(() => el.click(), 10);
          });
        }
      }
    }
  }

  addQuestionIndicator(questionElement, 'fill');
}

function selectFillBlanksAnswers(component, questionDiv) {
  for (let i = 0; i < component._items.length; i++) {
    const item = component._items[i];
    if (!item._options || !Array.isArray(item._options)) continue;

    const correctOpt = item._options.find(opt => opt._isCorrect);
    if (!correctOpt) continue;

    // Find matching text in dropdown items
    const optElements = deepHtmlSearch(questionDiv, '[class*="dropdown__item"]', false, 20);
    if (Array.isArray(optElements)) {
      for (const el of optElements) {
        if (el.textContent.trim() === correctOpt.text) {
          setTimeout(() => el.click(), 50 * i);
          break;
        }
      }
    }
  }
}

// ─── Table Dropdown ──────────────────────────────────────────────────

function processTableDropdownQuestion(component, questionDiv) {
  if (processedTableRows.has(questionDiv)) return;
  processedTableRows.add(questionDiv);

  const questionElement = deepHtmlSearch(questionDiv, '.component__body, [class*="question"]')
    || questionDiv;

  questionElement.addEventListener('click', (e) => {
    selectTableDropdownAnswers(component, questionDiv);
  });

  addQuestionIndicator(questionElement, 'table');
}

function selectTableDropdownAnswers(component, questionDiv) {
  const rows = deepHtmlSearch(questionDiv, 'tbody tr', false, 50);
  if (!Array.isArray(rows)) return;

  for (let i = 0; i < component._items.length && i < rows.length; i++) {
    const item = component._items[i];
    if (!item._options || !Array.isArray(item._options)) continue;

    const correctOpt = item._options.find(opt => opt._isCorrect);
    if (!correctOpt) continue;

    const row = rows[i];
    // Find dropdown in row and select correct option
    const dropdownItems = deepHtmlSearch(row, '[class*="dropdown__item"]', false, 10);
    if (Array.isArray(dropdownItems)) {
      for (const el of dropdownItems) {
        if (el.textContent.trim() === correctOpt.text) {
          setTimeout(() => el.click(), 50 * i);
          break;
        }
      }
    }
  }
}

// ─── Navigation Monitor ──────────────────────────────────────────────

let navMonitorInterval = null;

function startNavigationMonitor() {
  if (navMonitorInterval) clearInterval(navMonitorInterval);

  navMonitorInterval = setInterval(() => {
    let visibleCount = 0;
    for (const component of components) {
      if (deepHtmlSearch(document, `.${CSS.escape(component._id)}`)) {
        visibleCount++;
      }
    }

    if (visibleCount !== processedCount && visibleCount > 0) {
      console.log('[NetAcad Helper] Navigation detected, re-processing...');
      processedCount = visibleCount;
      main();
    }
  }, 1000);
}

// ─── Manual Solve (for popup/keyboard triggers) ──────────────────────

function solveCurrentVisible() {
  if (components.length > 0) {
    main();
    showStatus('Solving visible questions...', 'working');
    // Auto-click all visible answers
    for (const component of components) {
      const questionDiv = deepHtmlSearch(document, `.${CSS.escape(component._id)}`);
      if (questionDiv) {
        // Simulate a click on the question element to trigger auto-answer
        const questionEl = deepHtmlSearch(questionDiv, '.component__body, [class*="question"]') || questionDiv;
        questionEl.click();
      }
    }
    showStatus('Answers selected', 'success');
  } else {
    // Try AI fallback via Shadow DOM extraction
    solveViaShadowDOM();
  }
}

async function solveAllVisible() {
  showStatus('Solving all questions...', 'working');
  solveCurrentVisible();

  // Try clicking Next and solving subsequent pages
  for (let page = 0; page < 50; page++) {
    await new Promise(r => setTimeout(r, 2000));
    if (!clickNextButton()) break;
    await new Promise(r => setTimeout(r, 1500));
    solveCurrentVisible();
  }
  showStatus('All pages processed', 'success');
}

// ─── Shadow DOM Extraction Fallback (when JSON not available) ────────

async function solveViaShadowDOM() {
  showStatus('No JSON data — trying Shadow DOM extraction...', 'working');

  const questionData = extractFromShadowDOM();
  if (!questionData) {
    showStatus('No quiz found on this page', 'error');
    return;
  }

  // Ask AI for the answer
  try {
    const response = await browserAPI.runtime.sendMessage({
      action: 'aiAnswer',
      question: questionData.question,
      options: questionData.options.map(o => o.text),
      isMultiSelect: questionData.isMultiSelect
    });

    if (response && response.success && response.answerIndices?.length > 0) {
      highlightShadowDOMAnswers(questionData, response.answerIndices);
      showStatus(`AI Answer: ${response.answerIndices.map(i => String.fromCharCode(65 + i)).join(', ')}`, 'success');
    } else {
      showStatus('AI could not determine answer', 'error');
    }
  } catch (e) {
    showStatus('AI request failed — configure API key in popup', 'error');
  }
}

function extractFromShadowDOM() {
  // Find mcq-view elements (NetAcad's custom element for MCQ)
  const allMcqViews = [];
  function findMcqViews(root) {
    const views = root.querySelectorAll('mcq-view');
    allMcqViews.push(...views);
    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) findMcqViews(el.shadowRoot);
    });
  }
  findMcqViews(document);

  if (allMcqViews.length === 0) return null;

  // Get the last visible mcq-view
  let mcqViewElement = allMcqViews[allMcqViews.length - 1];
  if (!mcqViewElement?.shadowRoot) return null;

  const mcqView = mcqViewElement.shadowRoot.querySelector('div');
  if (!mcqView) return null;

  // Extract question text
  const headerContainer = mcqView.querySelector("div[class='component__header-container']");
  if (!headerContainer) return null;

  const baseView = headerContainer.querySelector('base-view');
  if (!baseView?.shadowRoot) return null;

  const bodyInner = baseView.shadowRoot.querySelector("div[class='component__body-inner mcq__body-inner']");
  if (!bodyInner) return null;

  let questionText = bodyInner.textContent.trim();

  // Check for code snippets
  const codeWithMcq = mcqView.querySelector('code-with-mcq');
  if (codeWithMcq?.shadowRoot) {
    const codeComponent = codeWithMcq.shadowRoot.querySelector("div[class='component']");
    if (codeComponent) questionText += '\n\nCode:\n' + codeComponent.textContent.trim();
  }

  // Extract options
  const optionNodes = mcqView.querySelectorAll('.mcq__item-text-inner');
  if (optionNodes.length === 0) return null;

  const options = Array.from(optionNodes).map((node, index) => ({
    index, text: node.textContent.trim(),
    element: node.closest('.mcq__item')
  }));

  const isMultiSelect = mcqView.querySelectorAll('input[type="checkbox"]').length > 0;
  return { question: questionText, options, isMultiSelect, mcqView };
}

function highlightShadowDOMAnswers(questionData, answerIndices) {
  const optionElements = questionData.mcqView.querySelectorAll('.mcq__item');

  // Clear old highlights
  optionElements.forEach(el => {
    el.style.removeProperty('background-color');
    el.style.removeProperty('border');
    el.style.removeProperty('box-shadow');
    el.querySelectorAll('*').forEach(c => c.style.removeProperty('color'));
  });

  for (const idx of answerIndices) {
    if (idx >= 0 && idx < optionElements.length) {
      const el = optionElements[idx];
      el.style.backgroundColor = '#22c55e';
      el.style.border = '3px solid #16a34a';
      el.style.borderRadius = '8px';
      el.style.boxShadow = '0 0 0 4px rgba(34, 197, 94, 0.2)';
      el.style.color = 'white';
      el.querySelectorAll('*').forEach(c => { c.style.color = 'white'; });

      // Auto-click
      el.click();
      const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
      if (input) { input.click(); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }
}

// ─── Next Button Navigation ──────────────────────────────────────────

function clickNextButton() {
  const selectors = [
    'button.next', 'button[aria-label="Next"]',
    '.btn-next', '[data-test="next-button"]'
  ];

  for (const sel of selectors) {
    const btn = deepHtmlSearch(document, sel);
    if (btn) { btn.click(); return true; }
  }

  // Fallback: find any button with "Next"
  const buttons = deepHtmlSearch(document, 'button', false, 50);
  if (Array.isArray(buttons)) {
    for (const btn of buttons) {
      if (btn.textContent.trim().toLowerCase().includes('next')) {
        btn.click();
        return true;
      }
    }
  }
  return false;
}

// ─── Visual Indicators ───────────────────────────────────────────────

function addQuestionIndicator(element, type) {
  if (!element) return;

  const badge = document.createElement('span');
  badge.style.cssText = `
    display: inline-block;
    padding: 2px 8px;
    margin-left: 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    vertical-align: middle;
    cursor: help;
  `;

  const colors = {
    single: { bg: '#dbeafe', color: '#1d4ed8', text: '● Click to solve' },
    multi: { bg: '#fef3c7', color: '#92400e', text: '● Multi-select — Click to solve' },
    match: { bg: '#e0e7ff', color: '#4338ca', text: '● Match — Click to solve' },
    dropdown: { bg: '#f3e8ff', color: '#6b21a8', text: '● Dropdown — Click to solve' },
    yesno: { bg: '#fce7f3', color: '#9d174d', text: '● Yes/No — Click to solve' },
    fill: { bg: '#ecfdf5', color: '#065f46', text: '● Fill blanks — Click to solve' },
    table: { bg: '#fff7ed', color: '#9a3412', text: '● Table — Click to solve' },
    text: { bg: '#f0fdfa', color: '#134e4a', text: '● Text input — Click to solve' },
  };

  const style = colors[type] || colors.single;
  badge.style.backgroundColor = style.bg;
  badge.style.color = style.color;
  badge.textContent = style.text;
  badge.title = 'NetAcad Helper: Click the question text or Ctrl+hover over answers';

  try {
    element.appendChild(badge);
  } catch (e) { /* shadow DOM restriction */ }
}

// ─── Status Overlay ──────────────────────────────────────────────────

function showStatus(message, type = 'info') {
  if (!statusElement) {
    statusElement = document.createElement('div');
    statusElement.id = 'netacad-helper-status';
    statusElement.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      padding: 10px 16px;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      transition: all 0.3s ease;
      max-width: 300px;
      pointer-events: none;
    `;
    document.body.appendChild(statusElement);
  }

  const styles = {
    info: { bg: '#1e293b', border: '#334155', color: '#94a3b8', icon: '🧠' },
    success: { bg: '#052e16', border: '#166534', color: '#86efac', icon: '✅' },
    error: { bg: '#450a0a', border: '#991b1b', color: '#fca5a5', icon: '❌' },
    working: { bg: '#1e1b4b', border: '#3730a3', color: '#a5b4fc', icon: '⏳' },
  };

  const s = styles[type] || styles.info;
  statusElement.style.background = s.bg;
  statusElement.style.border = `1px solid ${s.border}`;
  statusElement.style.color = s.color;
  statusElement.innerHTML = `${s.icon} ${message}`;
  statusElement.style.opacity = '1';

  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      if (statusElement) statusElement.style.opacity = '0.3';
    }, 4000);
  }
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // Alt+Shift+Q = Solve visible questions
  if (e.altKey && e.shiftKey && (e.key === 'Q' || e.key === 'q')) {
    e.preventDefault();
    solveCurrentVisible();
  }
  // Alt+Shift+A = Solve all (with navigation)
  if (e.altKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    e.preventDefault();
    solveAllVisible();
  }
});

// ─── Initialization ──────────────────────────────────────────────────

function initialize() {
  // Only run on NetAcad pages
  if (!window.location.href.includes('netacad.com') && !window.location.href.includes('skillsforall.com')) {
    return;
  }

  console.log('[NetAcad Helper] Content script loaded on', window.location.href);
  showStatus('NetAcad Quiz Helper active', 'info');

  // If components are already loaded (from background script), process them
  if (components.length > 0) {
    suspendMain();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
