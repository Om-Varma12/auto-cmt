import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { storage } from '../storage';
import { Author, Paper } from '../shared/schemas';

const Options = () => {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [newAuthor, setNewAuthor] = useState({ email: '', firstName: '', lastName: '', organization: '', countryCode: '' });
  const [newPaper, setNewPaper] = useState({ title: '', abstract: '', keywords: '', fullText: '' });

  useEffect(() => {
    storage.getAuthors().then(setAuthors);
    storage.getPapers().then(setPapers);
  }, []);

  const addAuthor = async () => {
    const updated = [...authors, { ...newAuthor, id: crypto.randomUUID() }];
    setAuthors(updated);
    await storage.saveAuthors(updated);
    setNewAuthor({ email: '', firstName: '', lastName: '', organization: '', countryCode: '' });
  };

  const addPaper = async () => {
    const updated = [...papers, {
      ...newPaper,
      id: crypto.randomUUID(),
      keywords: newPaper.keywords.split(',').map(k => k.trim()),
      authorIds: [],
      primaryContactId: ''
    }];
    setPapers(updated);
    await storage.savePapers(updated);
    setNewPaper({ title: '', abstract: '', keywords: '', fullText: '' });
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>CMT Autofill Settings</h1>

      <section style={{ marginBottom: '2rem', border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
        <h2>Authors</h2>
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
          <input placeholder="Email" value={newAuthor.email} onChange={e => setNewAuthor({...newAuthor, email: e.target.value})} />
          <input placeholder="First Name" value={newAuthor.firstName} onChange={e => setNewAuthor({...newAuthor, firstName: e.target.value})} />
          <input placeholder="Last Name" value={newAuthor.lastName} onChange={e => setNewAuthor({...newAuthor, lastName: e.target.value})} />
          <input placeholder="Organization" value={newAuthor.organization} onChange={e => setNewAuthor({...newAuthor, organization: e.target.value})} />
          <input placeholder="Country" value={newAuthor.countryCode} onChange={e => setNewAuthor({...newAuthor, countryCode: e.target.value})} />
          <button onClick={addAuthor}>Add Author</button>
        </div>
        <ul>
          {authors.map((a, i) => <li key={i}>{a.email} - {a.firstName} {a.lastName}</li>)}
        </ul>
      </section>

      <section style={{ marginBottom: '2rem', border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
        <h2>Papers</h2>
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
          <input placeholder="Title" value={newPaper.title} onChange={e => setNewPaper({...newPaper, title: e.target.value})} />
          <textarea placeholder="Abstract" value={newPaper.abstract} onChange={e => setNewPaper({...newPaper, abstract: e.target.value})} />
          <input placeholder="Keywords (comma separated)" value={newPaper.keywords} onChange={e => setNewPaper({...newPaper, keywords: e.target.value})} />
          <textarea placeholder="Full Text" value={newPaper.fullText} onChange={e => setNewPaper({...newPaper, fullText: e.target.value})} rows={10} />
          <button onClick={addPaper}>Add Paper</button>
        </div>
        <ul>
          {papers.map((p, i) => <li key={i}>{p.title}</li>)}
        </ul>
      </section>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Options />);
