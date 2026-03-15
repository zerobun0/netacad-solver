// popup.js - extension popup ui

'use strict';

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// ─── DOM Elements ────────────────────────────────────────────────────

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const btnSolve = document.getElementById('btnSolve');
const btnSolveAll = document.getElementById('btnSolveAll');
const btnRefresh = document.getElementById('btnRefresh');
const autoClickToggle = document.getElementById('autoClick');
const highlightOnlyToggle = document.getElementById('highlightOnly');
const aiHeader = document.getElementById('aiHeader');
const aiBody = document.getElementById('aiBody');
const aiProvider = document.getElementById('aiProvider');
const aiApiKey = document.getElementById('aiApiKey');
const aiModel = document.getElementById('aiModel');
const btnSaveAI = document.getElementById('btnSaveAI');

// ─── Initialization ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  checkStatus();
});

// ─── Status Check ────────────────────────────────────────────────────

async function checkStatus() {
  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      setStatus(false, 'No active tab');
      return;
    }

    const url = tab.url || '';
    if (!url.includes('netacad.com') && !url.includes('skillsforall.com')) {
      setStatus(false, 'Not on a NetAcad page');
      return;
    }

    browserAPI.tabs.sendMessage(tab.id, { action: 'getStatus' }, (response) => {
      if (browserAPI.runtime.lastError) {
        setStatus(false, 'Extension not active on this page — reload the page');
        return;
      }

      if (response) {
        if (response.componentCount > 0) {
          setStatus(true, `${response.componentCount} questions loaded, ${response.processedCount} visible`);
        } else {
          setStatus(true, 'Active — waiting for quiz data');
        }
      }
    });
  } catch (e) {
    setStatus(false, 'Could not check status');
  }
}

function setStatus(active, text) {
  statusDot.className = active ? 'status-dot' : 'status-dot inactive';
  statusText.textContent = text;
}

// ─── Button Handlers ─────────────────────────────────────────────────

btnSolve.addEventListener('click', async () => {
  const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    browserAPI.tabs.sendMessage(tab.id, { action: 'solveQuestion' });
    btnSolve.textContent = '✅ Solving...';
    setTimeout(() => { btnSolve.innerHTML = '🤖 Solve Current'; }, 2000);
  }
});

btnSolveAll.addEventListener('click', async () => {
  const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    browserAPI.tabs.sendMessage(tab.id, { action: 'solveAll' });
    btnSolveAll.textContent = '⏳ Working...';
    setTimeout(() => { btnSolveAll.innerHTML = '🚀 Solve All'; }, 5000);
  }
});

btnRefresh.addEventListener('click', () => {
  browserAPI.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab) browserAPI.tabs.reload(tab.id);
  });
  window.close();
});

// ─── Settings ────────────────────────────────────────────────────────

function loadSettings() {
  browserAPI.storage.local.get(['autoClick', 'highlightOnly', 'aiProvider', 'aiApiKey', 'aiModel'], (result) => {
    autoClickToggle.checked = result.autoClick !== false; // default true
    highlightOnlyToggle.checked = result.highlightOnly === true;
    if (result.aiProvider) aiProvider.value = result.aiProvider;
    if (result.aiApiKey) aiApiKey.value = result.aiApiKey;
    if (result.aiModel) aiModel.value = result.aiModel;
  });
}

autoClickToggle.addEventListener('change', () => {
  browserAPI.storage.local.set({ autoClick: autoClickToggle.checked });
  if (autoClickToggle.checked) highlightOnlyToggle.checked = false;
  browserAPI.storage.local.set({ highlightOnly: highlightOnlyToggle.checked });
});

highlightOnlyToggle.addEventListener('change', () => {
  browserAPI.storage.local.set({ highlightOnly: highlightOnlyToggle.checked });
  if (highlightOnlyToggle.checked) autoClickToggle.checked = false;
  browserAPI.storage.local.set({ autoClick: autoClickToggle.checked });
});

// ─── AI Settings (Collapsible) ───────────────────────────────────────

aiHeader.addEventListener('click', () => {
  aiHeader.classList.toggle('open');
  aiBody.classList.toggle('open');
});

btnSaveAI.addEventListener('click', () => {
  browserAPI.storage.local.set({
    aiProvider: aiProvider.value,
    aiApiKey: aiApiKey.value,
    aiModel: aiModel.value
  }, () => {
    btnSaveAI.textContent = '✅ Saved';
    setTimeout(() => { btnSaveAI.innerHTML = '💾 Save AI Settings'; }, 2000);
  });
});
