// domHelper.js - deep DOM traversal for netacad's web components
// need this because netacad uses shadow DOM + iframes for everything

'use strict';

//
// recursively search through DOM, shadow DOM, and iframes
function deepHtmlSearch(root, selector, unwrap = false, count = 0) {
  if (!root) return count > 0 ? [] : null;

  // Try regular querySelector first
  try {
    if (count > 0) {
      const results = Array.from(root.querySelectorAll(selector));
      if (results.length >= count) {
        return unwrap ? results.map(unwrapElementContent) : results;
      }

      // Search inside shadow roots and iframes
      const allElements = root.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          const shadowResults = deepHtmlSearch(el.shadowRoot, selector, unwrap, count - results.length);
          if (Array.isArray(shadowResults)) results.push(...shadowResults);
          else if (shadowResults) results.push(shadowResults);
          if (results.length >= count) break;
        }
        if (el.tagName === 'IFRAME') {
          try {
            const iframeDoc = el.contentDocument || el.contentWindow?.document;
            if (iframeDoc) {
              const iframeResults = deepHtmlSearch(iframeDoc, selector, unwrap, count - results.length);
              if (Array.isArray(iframeResults)) results.push(...iframeResults);
              else if (iframeResults) results.push(iframeResults);
              if (results.length >= count) break;
            }
          } catch (e) { /* cross-origin iframe */ }
        }
      }
      return unwrap ? results.map(unwrapElementContent) : results;
    } else {
      // Find single element
      let found = root.querySelector(selector);
      if (found) return unwrap ? unwrapElementContent(found) : found;

      const allElements = root.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          found = deepHtmlSearch(el.shadowRoot, selector, unwrap, 0);
          if (found) return found;
        }
        if (el.tagName === 'IFRAME') {
          try {
            const iframeDoc = el.contentDocument || el.contentWindow?.document;
            if (iframeDoc) {
              found = deepHtmlSearch(iframeDoc, selector, unwrap, 0);
              if (found) return found;
            }
          } catch (e) { /* cross-origin */ }
        }
      }
      return null;
    }
  } catch (e) {
    return count > 0 ? [] : null;
  }
}

//
// find element by text content
// searches shadow DOM + iframes recursively

function deepHtmlFindByTextContent(root, textContent) {
  if (!root || !textContent) return null;
  const trimmed = textContent.trim();

  try {
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.children.length === 0 && el.textContent.trim() === trimmed) {
        return el;
      }
    }

    // Search shadow roots
    for (const el of allElements) {
      if (el.shadowRoot) {
        const found = deepHtmlFindByTextContent(el.shadowRoot, trimmed);
        if (found) return found;
      }
      if (el.tagName === 'IFRAME') {
        try {
          const iframeDoc = el.contentDocument || el.contentWindow?.document;
          if (iframeDoc) {
            const found = deepHtmlFindByTextContent(iframeDoc, trimmed);
            if (found) return found;
          }
        } catch (e) { /* cross-origin */ }
      }
    }
  } catch (e) { /* ignore */ }

  return null;
}

//
// unwrap element - get inner doc from iframes or shadow root

function unwrapElementContent(element) {
  if (!element) return element;
  if (element.tagName === 'IFRAME') {
    try {
      return element.contentDocument || element.contentWindow?.document || element;
    } catch (e) { return element; }
  }
  if (element.shadowRoot) return element.shadowRoot;
  return element;
}

//
// strip html tags, return plain text

function getTextContentOfHtml(html) {
  if (!html) return '';
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent.trim();
}
