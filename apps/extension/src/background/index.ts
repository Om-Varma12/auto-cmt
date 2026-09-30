chrome.runtime.onInstalled.addListener(() => {
  console.log('CMT Autofill Extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DECIDE') {
    fetchDecide(message.payload)
      .then((data) => sendResponse({ status: 'success', data }))
      .catch((err) => sendResponse({ status: 'error', error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'EXTRACT_PDF') {
    fetchExtractPdf(message.payload)
      .then((data) => sendResponse({ status: 'success', data }))
      .catch((err) => sendResponse({ status: 'error', error: err.message }));
    return true;
  }
});

async function fetchDecide(payload: any) {
  const urls = [
    'http://localhost:3001/api/v1/ai/decide',
    'http://127.0.0.1:3001/api/v1/ai/decide'
  ];

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Backend returned HTTP ${response.status}: ${errText}`);
      }

      return await response.json();
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to connect to backend server at localhost:3001');
}

async function fetchExtractPdf(payload: any) {
  const urls = [
    'http://localhost:3001/api/v1/ai/extract-pdf',
    'http://127.0.0.1:3001/api/v1/ai/extract-pdf'
  ];

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Backend returned HTTP ${response.status}: ${errText}`);
      }

      return await response.json();
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to connect to backend server at localhost:3001');
}
