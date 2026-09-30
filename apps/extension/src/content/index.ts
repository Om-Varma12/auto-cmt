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
        sendResponse({ status: 'error', error: 'No paper found in settings' });
        return;
      }

      try {
        const response = await fetch('http://localhost:3001/api/v1/ai/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paper: paperData,
            conference: {
              name: schema.conference,
              welcomeText: schema.welcomeText
            },
            fields: schema.fields,
            authorSummary: {
              emails: authorData.map(a => a.email),
              organizations: authorData.map(a => a.organization),
              domains: authorData.map(a => a.organization),
            }
          })
        });

        const data = await response.json();
        CMTFiller.fill(data.answers);
        sendResponse({ status: 'success', model: data.model });
      } catch (err: any) {
        console.error('Filling error:', err);
        sendResponse({ status: 'error', error: err.message });
      }
    }).catch((err: any) => {
      console.error('Storage error:', err);
      sendResponse({ status: 'error', error: err.message });
    });

    return true; // Keep channel open for async response
  }
});
