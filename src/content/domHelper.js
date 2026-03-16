/** call with selector like `[index="0"]` or `#${CSS.escape(id)}-1-input` */
export const deepHtmlSearch = (document, selector, unwrap = false, count = 1) => {
  if (!document)
    return null;

  if (count > 1) {
    const directMatch = [...document.querySelectorAll(selector)];

    if (directMatch.length === count)
      return unwrap ? unwrapElementContent(directMatch) : directMatch;
  } else {
    const directMatch = document.querySelector(selector);

    if (directMatch)
      return unwrap ? unwrapElementContent(directMatch) : directMatch;
  }

  const iframes = document.querySelectorAll('iframe');

  for (const iframe of iframes) {
    const foundTarget = deepHtmlSearch(iframe.contentDocument, selector, unwrap, count);

    if (foundTarget)
      return foundTarget;
  }

  const elementsWithShadow = [...document.querySelectorAll('*')]
    .filter(el => el.shadowRoot);

  for (const element of elementsWithShadow) {
    if (count > 1) {
      const shadowMatch = [...element.shadowRoot.querySelectorAll(selector)];

      if (shadowMatch.length === count)
        return unwrap ? unwrapElementContent(shadowMatch) : shadowMatch;
    } else {
      const shadowMatch = element.shadowRoot.querySelector(selector);

      if (shadowMatch)
        return unwrap ? unwrapElementContent(shadowMatch) : shadowMatch;
    }

    const foundTarget = deepHtmlSearch(element.shadowRoot, selector, unwrap, count);

    if (foundTarget)
      return foundTarget;
  }

  return null;
};

export const deepHtmlFindByTextContent = (document, textContent) => {
  if (!document)
    return null;

  textContent = textContent.trim();

  const directMatch = [...document.querySelectorAll('*')]
    .find(el => el.textContent.trim() === textContent);

  if (directMatch)
    return directMatch;

  const iframes = document.querySelectorAll('iframe');

  for (const iframe of iframes) {
    const foundTarget = deepHtmlFindByTextContent(iframe.contentDocument, textContent);

    if (foundTarget)
      return foundTarget;
  }

  const documents = [...document.querySelectorAll('*')]
    .filter(el => el.tagName.toLowerCase().endsWith('-view') || el.tagName.toLowerCase() === 'app-root');

  for (const doc of documents) {
    const target = [...doc.shadowRoot.querySelectorAll('*')]
      .find(el => el.textContent.trim() === textContent);

    if (target)
      return target;

    const foundTarget = deepHtmlFindByTextContent(doc.shadowRoot, textContent);

    if (foundTarget)
      return foundTarget;
  }

  return null;
};

export const unwrapElementContent = element => {
  if (Array.isArray(element))
    return element.map(unwrapElementContent);

  if (element.contentDocument)
    return element.contentDocument;

  if (element.shadowRoot)
    return element.shadowRoot;

  return element;
};
