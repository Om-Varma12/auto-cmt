import { CMTScraper, CMTFiller } from './cmt-logic';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXECUTE') {
    console.log('CMT Autofill: Executing...');

    const schema = CMTScraper.scrapeForm();

    // In v1, we'll use a placeholder for paper data.
    // In the next step, we'll integrate the setup-ui data.
    const mockPaper = {
      title: 'My Awesome Paper',
      abstract: 'This is a great paper about AI.',
      keywords: ['AI', 'ML'],
      fullText: 'Full text of the paper goes here...'
    };

    fetch('http://localhost:3001/api/v1/ai/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paper: mockPaper,
        conference: {
          name: schema.conference,
          welcomeText: schema.welcomeText
        },
        fields: schema.fields
      })
    })
    .then(res => res.json())
    .then(data => {
      CMTFiller.fill(data.answers);
      sendResponse({ status: 'success', model: data.model });
    })
    .catch(err => {
      console.error('Filling error:', err);
      sendResponse({ status: 'error', error: err.message });
    });

    return true; // Keep channel open for async response
  }
});
