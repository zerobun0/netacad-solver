const extensionApi = typeof browser !== 'undefined' ? browser : chrome;

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const tipBtn = document.getElementById('tipBtn');

const setStatus = (text, isOk) => {
  statusText.textContent = text;
  statusDot.classList.toggle('ok', !!isOk);
};

const openTipLink = () => {
  try {
    extensionApi.tabs.create({url: 'https://ko-fi.com/Zerobun'});
  } catch (e) {
    window.open('https://ko-fi.com/Zerobun', '_blank');
  }
};

const checkActiveTab = async () => {
  // Prevent the popup from appearing stuck if tab query is slow or unavailable.
  const fallbackTimer = setTimeout(() => setStatus('Ready', false), 1200);

  try {
    const tabs = await extensionApi.tabs.query({active: true, currentWindow: true});
    clearTimeout(fallbackTimer);

    if (!tabs || tabs.length === 0) {
      setStatus('Ready', false);
      return;
    }

    const url = tabs[0].url || '';
    const isNetacad = /https:\/\/(www\.)?netacad\.com\//i.test(url);
    setStatus(isNetacad ? 'NetAcad page detected' : 'Open a NetAcad page', isNetacad);
  } catch (e) {
    clearTimeout(fallbackTimer);
    setStatus('Ready', false);
  }
};

tipBtn.addEventListener('click', openTipLink);
checkActiveTab();
