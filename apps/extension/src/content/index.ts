import { CMTScraper, CMTFiller } from './cmt-logic';
import { getSelectedPaper, getAuthors } from '../shared/api-helpers';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXECUTE') {
    console.log('CMT Autofill: Executing...');

    const schema = CMTScraper.scrapeForm();
    const paperPromise = getSelectedPaper();
    const authorsPromise = getAuthors();

    Promise.all([paperPromise, authorsPromise]).then(async ([paperData, authorData]) => {
      if (!paperData) {
        sendResponse({ status: 'error', error: 'No paper found in settings. Please add a paper in extension options.' });
        return;
      }

      const payload = {
        paper: paperData,
        conference: {
          name: schema.conference,
          welcomeText: schema.welcomeText
        },
        fields: schema.fields,
        authorSummary: {
          emails: (authorData || []).map(a => a.email),
          organizations: (authorData || []).map(a => a.organization),
          domains: (authorData || []).map(a => a.organization),
        }
      };

      // Route through background service worker to prevent HTTPS mixed content/CORS errors
      chrome.runtime.sendMessage({ type: 'DECIDE', payload }, (bgResponse) => {
        if (chrome.runtime.lastError) {
          sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
          return;
        }

        if (bgResponse?.status === 'success') {
          try {
            CMTFiller.fill(bgResponse.data.answers);
            sendResponse({ status: 'success', model: bgResponse.data.model });
          } catch (err: any) {
            sendResponse({ status: 'error', error: `Fill error: ${err.message}` });
          }
        } else {
          sendResponse({ status: 'error', error: bgResponse?.error || 'Backend request failed' });
        }
      });
    }).catch((err: any) => {
      console.error('Storage error:', err);
      sendResponse({ status: 'error', error: err.message });
    });

    return true; // Keep channel open for async response
  }
});
