import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { storage } from '../storage';
import { Author, Paper, ExtensionSettings } from '../shared/schemas';

const Options = () => {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [settings, setSettings] = useState<ExtensionSettings>({ backendBaseUrl: 'http://localhost:3001' });

  const [newAuthor, setNewAuthor] = useState({
    email: '',
    firstName: '',
    lastName: '',
    organization: '',
    countryCode: ''
  });

  const [newPaper, setNewPaper] = useState({
    title: '',
    abstract: '',
    keywords: '',
    fullText: ''
  });

  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    storage.getAuthors().then(setAuthors);
    storage.getPapers().then(setPapers);
    storage.getSettings().then(setSettings);
  }, []);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const addAuthor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuthor.email || !newAuthor.firstName || !newAuthor.lastName) {
      alert('Please fill in required author fields (Email, First & Last Name)');
      return;
    }

    const updated = [...authors, { ...newAuthor }];
    setAuthors(updated);
    await storage.saveAuthors(updated);
    setNewAuthor({ email: '', firstName: '', lastName: '', organization: '', countryCode: '' });
    showToast('Author added successfully!');
  };

  const removeAuthor = async (index: number) => {
    const updated = authors.filter((_, i) => i !== index);
    setAuthors(updated);
    await storage.saveAuthors(updated);
    showToast('Author removed');
  };

  const addPaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPaper.title || !newPaper.fullText) {
      alert('Please fill in required paper fields (Title & Full Text)');
      return;
    }

    const updated = [...papers, {
      ...newPaper,
      keywords: newPaper.keywords.split(',').map(k => k.trim()).filter(Boolean),
      authorIds: [],
      primaryContactId: ''
    }];
    setPapers(updated);
    await storage.savePapers(updated);
    setNewPaper({ title: '', abstract: '', keywords: '', fullText: '' });
    showToast('Paper saved successfully!');
  };

  const removePaper = async (index: number) => {
    const updated = papers.filter((_, i) => i !== index);
    setPapers(updated);
    await storage.savePapers(updated);
    showToast('Paper removed');
  };

  const updateBackendUrl = async (url: string) => {
    const updated = { ...settings, backendBaseUrl: url };
    setSettings(updated);
    await storage.saveSettings(updated);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      color: '#0f172a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      padding: '2.5rem 1rem'
    }}>
      <div style={{ maxWidth: '840px', margin: '0 auto' }}>
        
        {/* Header */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
              CMT Autofill Settings
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.25rem', margin: 0 }}>
              Manage paper metadata, authors, and AI backend configuration
            </p>
          </div>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: '600',
            backgroundColor: '#dcfce7',
            color: '#15803d'
          }}>
            ● Extension Active
          </span>
        </header>

        {/* Toast Notification */}
        {notification && (
          <div style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            borderRadius: '0.5rem',
            backgroundColor: '#0284c7',
            color: '#ffffff',
            fontWeight: '500',
            fontSize: '0.9rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            {notification}
          </div>
        )}

        {/* Backend Settings Card */}
        <section style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          marginBottom: '1.75rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#1e293b', marginTop: 0, marginBottom: '0.75rem' }}>
            Backend Configuration
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '500', color: '#475569' }}>Backend Base URL</label>
            <input
              type="url"
              value={settings.backendBaseUrl}
              onChange={e => updateBackendUrl(e.target.value)}
              placeholder="http://localhost:3001"
              style={inputStyle}
            />
          </div>
        </section>

        {/* Authors Section Card */}
        <section style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          marginBottom: '1.75rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#1e293b', marginTop: 0, marginBottom: '1rem' }}>
            Authors Library ({authors.length})
          </h2>

          <form onSubmit={addAuthor} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <input placeholder="Email *" value={newAuthor.email} onChange={e => setNewAuthor({...newAuthor, email: e.target.value})} style={inputStyle} required />
            <input placeholder="First Name *" value={newAuthor.firstName} onChange={e => setNewAuthor({...newAuthor, firstName: e.target.value})} style={inputStyle} required />
            <input placeholder="Last Name *" value={newAuthor.lastName} onChange={e => setNewAuthor({...newAuthor, lastName: e.target.value})} style={inputStyle} required />
            <input placeholder="Organization" value={newAuthor.organization} onChange={e => setNewAuthor({...newAuthor, organization: e.target.value})} style={inputStyle} />
            <input placeholder="Country Code (e.g. US)" value={newAuthor.countryCode} onChange={e => setNewAuthor({...newAuthor, countryCode: e.target.value})} style={inputStyle} />
            <button type="submit" style={primaryButtonStyle}>+ Add Author</button>
          </form>

          {authors.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic' }}>No authors added yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {authors.map((a, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #f1f5f9'
                }}>
                  <div>
                    <span style={{ fontWeight: '600', color: '#0f172a' }}>{a.firstName} {a.lastName}</span>
                    <span style={{ color: '#64748b', fontSize: '0.85rem', marginLeft: '0.5rem' }}>({a.email})</span>
                    {a.organization && <span style={{ display: 'block', fontSize: '0.8rem', color: '#64748b' }}>{a.organization} {a.countryCode ? `• ${a.countryCode}` : ''}</span>}
                  </div>
                  <button type="button" onClick={() => removeAuthor(i)} style={deleteButtonStyle}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Papers Section Card */}
        <section style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#1e293b', marginTop: 0, marginBottom: '1rem' }}>
            Papers Library ({papers.length})
          </h2>

          <form onSubmit={addPaper} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <input placeholder="Paper Title *" value={newPaper.title} onChange={e => setNewPaper({...newPaper, title: e.target.value})} style={inputStyle} required />
            <textarea placeholder="Abstract" value={newPaper.abstract} onChange={e => setNewPaper({...newPaper, abstract: e.target.value})} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
            <input placeholder="Keywords (comma separated, e.g. AI, NLP, Transformers)" value={newPaper.keywords} onChange={e => setNewPaper({...newPaper, keywords: e.target.value})} style={inputStyle} />
            <textarea placeholder="Full Paper Text *" value={newPaper.fullText} onChange={e => setNewPaper({...newPaper, fullText: e.target.value})} style={{ ...inputStyle, minHeight: '160px', resize: 'vertical' }} required />
            <button type="submit" style={primaryButtonStyle}>+ Add Paper</button>
          </form>

          {papers.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic' }}>No papers saved yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {papers.map((p, i) => (
                <div key={i} style={{
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #f1f5f9'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#0f172a', margin: 0 }}>{p.title}</h3>
                    <button type="button" onClick={() => removePaper(i)} style={deleteButtonStyle}>Remove</button>
                  </div>
                  {p.abstract && <p style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.375rem', marginBottom: '0.5rem', lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.abstract}</p>}
                  {p.keywords && p.keywords.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {p.keywords.map((k, idx) => (
                        <span key={idx} style={{ fontSize: '0.75rem', backgroundColor: '#e2e8f0', color: '#334155', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  padding: '0.625rem 0.875rem',
  borderRadius: '0.375rem',
  border: '1px solid #cbd5e1',
  fontSize: '0.9rem',
  outline: 'none',
  transition: 'border-color 0.15s ease',
  backgroundColor: '#ffffff'
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '0.625rem 1.25rem',
  borderRadius: '0.375rem',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  fontWeight: '600',
  fontSize: '0.9rem',
  border: 'none',
  cursor: 'pointer',
  transition: 'background-color 0.15s ease'
};

const deleteButtonStyle: React.CSSProperties = {
  padding: '0.25rem 0.625rem',
  borderRadius: '0.25rem',
  backgroundColor: '#fee2e2',
  color: '#dc2626',
  fontWeight: '500',
  fontSize: '0.8rem',
  border: 'none',
  cursor: 'pointer'
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Options />);
