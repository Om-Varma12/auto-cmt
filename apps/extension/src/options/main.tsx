import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { storage } from '../storage';
import { Author, Paper, ExtensionSettings } from '../shared/schemas';

const Options = () => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings>({ backendBaseUrl: 'http://localhost:3001', autoUploadPdf: false });

  // PDF Upload & Extraction State
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentPendingFile, setCurrentPendingFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<{
    title: string;
    abstract: string;
    authors: Author[];
    primaryAuthorIndex: number;
  } | null>(null);

  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    storage.getPapers().then(loadedPapers => {
      setPapers(loadedPapers);
      storage.getSelectedPaperId().then(selectedId => {
        if (selectedId && loadedPapers.some(p => p.id === selectedId)) {
          setSelectedPaperId(selectedId);
        } else if (loadedPapers.length > 0) {
          setSelectedPaperId(loadedPapers[0].id);
          storage.setSelectedPaperId(loadedPapers[0].id);
        }
      });
    });
    storage.getSettings().then(setSettings);
  }, []);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // PDF File Upload Handler
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Please upload a valid PDF file (.pdf)');
      return;
    }

    setCurrentPendingFile(file);
    setIsExtracting(true);
    setNotification('Extracting paper metadata and authors using AI...');

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];

      // Save base64 immediately to chrome.storage.local (accessible from content scripts)
      storage.savePdfBase64('temp_pending_pdf', base64, file.name).catch(err => {
        console.warn('[OPTIONS] Failed to save pending PDF base64 to storage:', err);
      });

      chrome.runtime.sendMessage(
        { type: 'EXTRACT_PDF', payload: { pdfBase64: base64 } },
        (response) => {
          setIsExtracting(false);
          if (chrome.runtime.lastError) {
            alert(`Error: ${chrome.runtime.lastError.message}`);
            return;
          }
          if (response?.status !== 'success') {
            alert(`Failed to extract PDF: ${response?.error || 'Unknown error'}`);
            return;
          }

          const res = response.data;
          setExtractedData({
            title: res.title || '',
            abstract: res.abstract || '',
            authors: (res.authors || []).map((a: any) => ({
              email: a.email || '',
              firstName: a.firstName || '',
              lastName: a.lastName || '',
              organization: a.organization || '',
              countryCode: a.countryCode || 'India',
            })),
            primaryAuthorIndex: 0,
          });
          showToast('✓ PDF processed! Review and edit the details below.');
        }
      );
    };

    reader.readAsDataURL(file);
  };

  // Update extracted author field
  const updateExtractedAuthor = (index: number, field: keyof Author, value: string) => {
    if (!extractedData) return;
    const updatedAuthors = [...extractedData.authors];
    updatedAuthors[index] = { ...updatedAuthors[index], [field]: value };
    setExtractedData({ ...extractedData, authors: updatedAuthors });
  };

  // Add new co-author to extracted form
  const addExtractedAuthor = () => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      authors: [
        ...extractedData.authors,
        { email: '', firstName: '', lastName: '', organization: '', countryCode: 'India' }
      ]
    });
  };

  // Remove author from extracted form
  const removeExtractedAuthor = (index: number) => {
    if (!extractedData) return;
    const updatedAuthors = extractedData.authors.filter((_, i) => i !== index);
    let newPrimary = extractedData.primaryAuthorIndex;
    if (newPrimary >= updatedAuthors.length) {
      newPrimary = Math.max(0, updatedAuthors.length - 1);
    }
    setExtractedData({
      ...extractedData,
      authors: updatedAuthors,
      primaryAuthorIndex: newPrimary
    });
  };

  // Save Final Extracted Paper & Authors
  const saveExtractedPaperAndAuthors = async () => {
    if (!extractedData) return;
    if (!extractedData.title.trim()) {
      alert('Paper Title cannot be empty');
      return;
    }
    if (extractedData.authors.length === 0) {
      alert('At least one author is required');
      return;
    }

    const newPaperId = 'paper_' + Date.now();

    // Persist PDF as base64 in chrome.storage.local under the real paperId
    // (chrome.storage.local is shared across all extension contexts including content scripts)
    const pendingPdf = await storage.getPdfBase64('temp_pending_pdf').catch(() => null);
    if (pendingPdf) {
      await storage.savePdfBase64(newPaperId, pendingPdf.base64, pendingPdf.fileName).catch(err => {
        console.warn('[OPTIONS] Failed to save PDF base64 to storage:', err);
      });
    }

    const primaryAuthor = extractedData.authors[extractedData.primaryAuthorIndex] || extractedData.authors[0];

    const newPaper: Paper = {
      id: newPaperId,
      title: extractedData.title,
      abstract: extractedData.abstract,
      keywords: [],
      fullText: '',
      authors: extractedData.authors,
      primaryContactId: primaryAuthor.email,
      createdAt: Date.now(),
    };

    const updatedPapers = [newPaper, ...papers];
    setPapers(updatedPapers);
    setSelectedPaperId(newPaperId);

    await storage.savePapers(updatedPapers);
    await storage.setSelectedPaperId(newPaperId);

    showToast(`✓ "${newPaper.title}" saved and set as active paper!`);
    setExtractedData(null);
    setCurrentPendingFile(null);
  };

  // Select active paper for automation
  const selectActivePaper = async (paperId: string) => {
    setSelectedPaperId(paperId);
    await storage.setSelectedPaperId(paperId);
    // Also update pdf_b64_active to point to this paper's PDF
    const pdf = await storage.getPdfBase64(paperId).catch(() => null);
    if (pdf) {
      await storage.savePdfBase64(paperId, pdf.base64, pdf.fileName).catch(() => {});
    }
    const targetPaper = papers.find(p => p.id === paperId);
    showToast(`⭐ Selected "${targetPaper?.title || 'Paper'}" for automation execution`);
  };

  // Remove a paper from history
  const removePaper = async (paperId: string) => {
    const updatedPapers = papers.filter(p => p.id !== paperId);
    setPapers(updatedPapers);
    await storage.savePapers(updatedPapers);
    await storage.deletePdfBase64(paperId).catch(() => {});

    if (selectedPaperId === paperId) {
      const nextId = updatedPapers.length > 0 ? updatedPapers[0].id : null;
      setSelectedPaperId(nextId);
      if (nextId) await storage.setSelectedPaperId(nextId);
      else await chrome.storage.local.remove('selectedPaperId');
    }

    showToast('Paper removed from library');
  };

  const updateBackendUrl = async (url: string) => {
    const updated = { ...settings, backendBaseUrl: url };
    setSettings(updated);
    await storage.saveSettings(updated);
  };

  const updateAutoUploadPdf = async (autoUpload: boolean) => {
    const updated = { ...settings, autoUploadPdf: autoUpload };
    setSettings(updated);
    await storage.saveSettings(updated);
    showToast(`PDF Auto-Attach is now ${autoUpload ? 'ON' : 'OFF'}`);
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
              Manage paper submissions, authors, and select active paper for automation
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

        {/* STEP 1: PDF Upload Card */}
        <section style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          padding: '1.75rem',
          marginBottom: '1.75rem',
          border: '2px dashed #3b82f6',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1e293b', marginTop: 0, marginBottom: '0.5rem' }}>
            📄 Upload Research Paper PDF
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
            Upload your paper PDF. AI will extract the title, abstract, and author details automatically.
          </p>

          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handlePdfUpload}
            disabled={isExtracting}
            id="pdf-upload-input"
            style={{ display: 'none' }}
          />

          <label htmlFor="pdf-upload-input" style={{
            display: 'inline-block',
            padding: '0.75rem 1.75rem',
            borderRadius: '0.5rem',
            backgroundColor: isExtracting ? '#94a3b8' : '#2563eb',
            color: '#ffffff',
            fontWeight: '600',
            fontSize: '0.95rem',
            cursor: isExtracting ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s ease'
          }}>
            {isExtracting ? '⏳ Extracting Metadata via AI...' : '📁 Select PDF File'}
          </label>
        </section>

        {/* STEP 2: Review & Modify Extracted Details */}
        {extractedData && (
          <section style={{
            backgroundColor: '#ffffff',
            borderRadius: '0.75rem',
            padding: '1.75rem',
            marginBottom: '1.75rem',
            border: '2px solid #2563eb',
            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                ✏️ Review & Edit Extracted Paper Details
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#64748b', backgroundColor: '#e0f2fe', padding: '0.25rem 0.625rem', borderRadius: '0.25rem', fontWeight: '500' }}>
                AI Extracted
              </span>
            </div>

            {/* Title & Abstract Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.375rem' }}>
                  Paper Title *
                </label>
                <input
                  type="text"
                  value={extractedData.title}
                  onChange={e => setExtractedData({ ...extractedData, title: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.375rem' }}>
                  Abstract
                </label>
                <textarea
                  value={extractedData.abstract}
                  onChange={e => setExtractedData({ ...extractedData, abstract: e.target.value })}
                  style={{ ...inputStyle, minHeight: '110px', resize: 'vertical' }}
                />
              </div>
            </div>

            {/* Extracted Authors Section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                  Authors ({extractedData.authors.length}) — Select 1 Main/Primary Author
                </h3>
                <button type="button" onClick={addExtractedAuthor} style={smallPrimaryButtonStyle}>
                  + Add Co-Author
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {extractedData.authors.map((author, index) => (
                  <div key={index} style={{
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    backgroundColor: extractedData.primaryAuthorIndex === index ? '#f0fdf4' : '#f8fafc',
                    border: extractedData.primaryAuthorIndex === index ? '2px solid #22c55e' : '1px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem', color: '#0f172a' }}>
                        <input
                          type="radio"
                          name="primaryAuthorSelect"
                          checked={extractedData.primaryAuthorIndex === index}
                          onChange={() => setExtractedData({ ...extractedData, primaryAuthorIndex: index })}
                        />
                        {extractedData.primaryAuthorIndex === index ? '⭐ Main / Primary Author' : `Co-Author #${index + 1}`}
                      </label>
                      {extractedData.authors.length > 1 && (
                        <button type="button" onClick={() => removeExtractedAuthor(index)} style={deleteButtonStyle}>
                          Remove
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.625rem' }}>
                      <input
                        placeholder="Email *"
                        value={author.email}
                        onChange={e => updateExtractedAuthor(index, 'email', e.target.value)}
                        style={inputStyle}
                        required
                      />
                      <input
                        placeholder="First Name *"
                        value={author.firstName}
                        onChange={e => updateExtractedAuthor(index, 'firstName', e.target.value)}
                        style={inputStyle}
                        required
                      />
                      <input
                        placeholder="Last Name *"
                        value={author.lastName}
                        onChange={e => updateExtractedAuthor(index, 'lastName', e.target.value)}
                        style={inputStyle}
                        required
                      />
                      <input
                        placeholder="Organization / Institution"
                        value={author.organization}
                        onChange={e => updateExtractedAuthor(index, 'organization', e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        placeholder="Country (e.g. India)"
                        value={author.countryCode}
                        onChange={e => updateExtractedAuthor(index, 'countryCode', e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <button
              type="button"
              onClick={saveExtractedPaperAndAuthors}
              style={{ ...primaryButtonStyle, width: '100%', padding: '0.875rem', fontSize: '1rem' }}
            >
              💾 Save Paper & Set as Active for Automation
            </button>
          </section>
        )}

        {/* STEP 3: Papers Library & Active Selection */}
        <section style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          marginBottom: '1.75rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#1e293b', marginTop: 0, marginBottom: '0.375rem' }}>
            📚 Papers Library ({papers.length})
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '1.25rem' }}>
            Select which paper you want the CMT automation to execute for.
          </p>

          {papers.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic' }}>
              No papers saved in library yet. Upload a PDF above to add your first paper.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {papers.map((p) => {
                const isSelected = selectedPaperId === p.id;
                return (
                  <div key={p.id} style={{
                    padding: '1.25rem',
                    borderRadius: '0.625rem',
                    backgroundColor: isSelected ? '#f0fdf4' : '#f8fafc',
                    border: isSelected ? '2px solid #22c55e' : '1px solid #e2e8f0',
                    boxShadow: isSelected ? '0 2px 4px rgba(34, 197, 94, 0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}>
                    {/* Top Row: Title & Action Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                          {p.title}
                        </h3>
                        {isSelected && (
                          <span style={{
                            fontSize: '0.75rem',
                            backgroundColor: '#22c55e',
                            color: '#ffffff',
                            fontWeight: '700',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}>
                            ⭐ Active for Automation
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!isSelected ? (
                          <button
                            type="button"
                            onClick={() => selectActivePaper(p.id)}
                            style={smallPrimaryButtonStyle}
                          >
                            Select for Automation
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: '600', alignSelf: 'center' }}>
                            Currently Active
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removePaper(p.id)}
                          style={deleteButtonStyle}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Abstract snippet */}
                    {p.abstract && (
                      <p style={{
                        fontSize: '0.85rem',
                        color: '#475569',
                        marginTop: 0,
                        marginBottom: '0.875rem',
                        lineClamp: 2,
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {p.abstract}
                      </p>
                    )}

                    {/* Authors List */}
                    {p.authors && p.authors.length > 0 && (
                      <div>
                        <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>
                          Authors ({p.authors.length}):
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.375rem' }}>
                          {p.authors.map((auth, aIdx) => {
                            const isPrimary = auth.email === p.primaryContactId;
                            return (
                              <span key={aIdx} style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.625rem',
                                borderRadius: '0.375rem',
                                backgroundColor: isPrimary ? '#dcfce7' : '#e2e8f0',
                                color: isPrimary ? '#15803d' : '#334155',
                                fontWeight: isPrimary ? '600' : '400',
                                border: isPrimary ? '1px solid #86efac' : 'none'
                              }}>
                                {auth.firstName} {auth.lastName} {isPrimary ? '⭐ (Primary)' : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Backend & Upload Settings Card */}
        <section style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#1e293b', marginTop: 0, marginBottom: '1rem' }}>
            Extension & Attachment Settings
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '500', color: '#475569' }}>Backend Base URL</label>
              <input
                type="url"
                value={settings.backendBaseUrl}
                onChange={e => updateBackendUrl(e.target.value)}
                placeholder="http://localhost:3001"
                style={inputStyle}
              />
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.875rem 1rem',
              borderRadius: '0.5rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0'
            }}>
              <div>
                <label style={{ fontWeight: '600', color: '#0f172a', fontSize: '0.9rem', cursor: 'pointer' }}>
                  Automatically attach PDF during Execute
                </label>
                <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0.125rem 0 0 0' }}>
                  Attempts to auto-attach active paper PDF to CMT form when clicking Execute (Default: OFF)
                </p>
              </div>

              <input
                type="checkbox"
                checked={settings.autoUploadPdf ?? false}
                onChange={e => updateAutoUploadPdf(e.target.checked)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.875rem',
  borderRadius: '0.375rem',
  border: '1px solid #cbd5e1',
  fontSize: '0.9rem',
  outline: 'none',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box'
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

const smallPrimaryButtonStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  borderRadius: '0.375rem',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  fontWeight: '600',
  fontSize: '0.8rem',
  border: 'none',
  cursor: 'pointer'
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
