// background.js - service worker for chrome
// intercepts components.json requests and sends urls to content script
// also handles AI api calls if configured

'use strict';

// ─── Intercept components.json requests ──────────────────────────────

chrome.webRequest.onSendHeaders.addListener(
  async ({ url, tabId }) => {
    console.log('[NetAcad Helper BG] Intercepted components.json:', url);

    // Send the URL to the specific tab
    if (tabId && tabId > 0) {
      sendToTab(tabId, url);
    }

    // Also broadcast to all netacad tabs
    try {
      const tabs = await chrome.tabs.query({ url: ['*://*.netacad.com/*', '*://*.skillsforall.com/*'] });
      for (const tab of tabs) {
        if (tab.id !== tabId) {
          sendToTab(tab.id, url);
        }
      }
    } catch (e) {
      console.log('[NetAcad Helper BG] Could not query tabs:', e);
    }
  },
  { urls: ['*://*.netacad.com/*/components.json', '*://*.netacad.com/*/components.json?*'] },
  ['requestHeaders']
);

// In MV3, we can't use blocking webRequest to modify headers.
// Instead, we use declarativeNetRequest rules set in manifest or
// rely on content script fetching with cache: 'no-store'.
// The content script already uses { cache: 'no-store' } when fetching.

/**
 * Send component URL to a tab with retry logic.
 */
function sendToTab(tabId, url, retries = 10, interval = 1000) {
  let attempts = 0;

  function trySend() {
    attempts++;
    chrome.tabs.sendMessage(tabId, { action: 'componentUrl', url }, (response) => {
      if (chrome.runtime.lastError) {
        if (attempts < retries) {
          setTimeout(trySend, interval);
        } else {
          console.log('[NetAcad Helper BG] Failed to send to tab after', retries, 'attempts');
        }
      } else {
        console.log('[NetAcad Helper BG] Successfully sent URL to tab', tabId);
      }
    });
  }

  trySend();
}

// ─── Handle messages from content script / popup ─────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'aiAnswer') {
    handleAIRequest(message).then(sendResponse);
    return true; // keep channel open for async response
  }

  if (message.action === 'searchAnswers') {
    handleSearchRequest(message).then(sendResponse);
    return true;
  }

  if (message.action === 'getSettings') {
    chrome.storage.local.get(['aiProvider', 'aiApiKey', 'aiModel', 'autoClick', 'highlightOnly'], (result) => {
      sendResponse(result);
    });
    return true;
  }
});

// ─── AI Answer Lookup (fallback when JSON interception fails) ────────

async function handleAIRequest({ question, options, isMultiSelect }) {
  try {
    const settings = await getSettings();
    if (!settings.aiApiKey) {
      return { success: false, error: 'No API key configured. Set one in the extension popup.' };
    }

    const provider = settings.aiProvider || 'gemini';
    const prompt = buildPrompt(question, options, isMultiSelect);

    let answer;
    if (provider === 'gemini') {
      answer = await callGemini(settings.aiApiKey, prompt, settings.aiModel);
    } else if (provider === 'openrouter') {
      answer = await callOpenRouter(settings.aiApiKey, prompt, settings.aiModel);
    } else if (provider === 'groq') {
      answer = await callGroq(settings.aiApiKey, prompt, settings.aiModel);
    }

    if (answer) {
      const indices = parseAIAnswer(answer, options);
      return { success: true, answerIndices: indices, rawAnswer: answer };
    }

    return { success: false, error: 'AI returned no answer' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function buildPrompt(question, options, isMultiSelect) {
  const optionList = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n');
  return `You are answering a Cisco NetAcad quiz question. Answer with ONLY the letter(s) of the correct option(s), nothing else.
${isMultiSelect ? 'This is a multi-select question. Multiple answers may be correct. Return all correct letters separated by commas.' : 'This is single-choice. Return exactly ONE letter.'}

Question: ${question}

Options:
${optionList}

Answer:`;
}

function parseAIAnswer(answer, options) {
  const cleaned = answer.trim().toUpperCase();
  const indices = [];
  for (let i = 0; i < options.length; i++) {
    const letter = String.fromCharCode(65 + i);
    if (cleaned.includes(letter)) {
      indices.push(i);
    }
  }
  return indices;
}

// ─── AI Provider APIs ────────────────────────────────────────────────

async function callGemini(apiKey, prompt, model = 'gemini-2.0-flash') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 50 }
    })
  });
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function callOpenRouter(apiKey, prompt, model = 'meta-llama/llama-3.1-8b-instruct:free') {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 50
    })
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || null;
}

async function callGroq(apiKey, prompt, model = 'llama-3.1-8b-instant') {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 50
    })
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || null;
}

// ─── Google Search Fallback ──────────────────────────────────────────

async function handleSearchRequest({ query, options }) {
  // This could be expanded to search known answer sites
  return { success: false, error: 'Search not available in background' };
}

// ─── Utility ─────────────────────────────────────────────────────────

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aiProvider', 'aiApiKey', 'aiModel', 'autoClick', 'highlightOnly'], (result) => {
      resolve(result || {});
    });
  });
}
