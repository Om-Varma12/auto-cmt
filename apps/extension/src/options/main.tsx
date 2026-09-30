import React from 'react';
import ReactDOM from 'react-dom/client';

const Options = () => {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>CMT Autofill Settings</h1>
      <p>Configure your backend and preferences here.</p>
      <div style={{ marginBottom: '1rem' }}>
        <label>Backend URL: </label>
        <input type="text" defaultValue="http://localhost:3001" />
      </div>
      <button>Save Settings</button>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Options />);
