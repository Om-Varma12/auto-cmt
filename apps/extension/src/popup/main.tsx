import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

const Popup = () => {
  const [status, setStatus] = useState('');

  const handleExecute = async () => {
    setStatus('Executing...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE' }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus('Error: Not on a CMT page');
      } else if (response?.status === 'success') {
        setStatus(`Filled by ${response.model}!`);
      } else {
        setStatus(`Error: ${response?.error || 'Unknown error'}`);
      }
    });
  };

  return (
    <div style={{ padding: '1rem', width: '200px', fontFamily: 'sans-serif' }}>
      <h3>CMT Autofill</h3>
      <button
        onClick={handleExecute}
        style={{
          width: '100%',
          padding: '0.5rem',
          cursor: 'pointer',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px'
        }}
      >
        Execute Fill
      </button>
      <p style={{ fontSize: '0.8rem', marginTop: '1rem', textAlign: 'center' }}>
        {status}
      </p>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
