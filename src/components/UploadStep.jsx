// src/components/UploadStep.jsx
import React, { useState, useRef } from 'react';
import { Upload, FileText, ClipboardList, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';

const ACCEPTED = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.txt'];

export default function UploadStep({ onStart, loading }) {
  const [tab, setTab] = useState('paste');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setError(`Unsupported file type. Please use: ${ACCEPTED.join(', ')}`);
      return;
    }
    setFile(f);
    setError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = () => {
    const content = tab === 'paste' ? text.trim() : null;
    if (tab === 'paste' && !content) { setError('Please paste your question paper text.'); return; }
    if (tab === 'upload' && !file)   { setError('Please upload a file.'); return; }
    setError('');
    onStart({ text: content, file: tab === 'upload' ? file : null });
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={styles.logoWrap}><ClipboardList size={22} color="#4f6ef7" /></div>
        <div>
          <h1 style={styles.h1}>QP Auditor</h1>
          <p style={styles.tagline}>AI-powered question paper quality check</p>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(tab === 'paste' ? styles.tabActive : {}) }} onClick={() => setTab('paste')}>
            <FileText size={14} /> Paste text
          </button>
          <button style={{ ...styles.tab, ...(tab === 'upload' ? styles.tabActive : {}) }} onClick={() => setTab('upload')}>
            <Upload size={14} /> Upload file
          </button>
        </div>

        {tab === 'paste' && (
          <div>
            <textarea
              style={styles.textarea}
              placeholder={`Paste your question paper here.\n\nExample:\n1. What is the capital of France?\nA. London\nB. Berlin\nC. Paris\nD. Madrid\nAnswer: C\n\n2. Watr boils at standard pressure at...\nA. 90°C\nB. 100°C\nC. 110°C\nD. 120°C\nAns: B`}
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <p style={styles.hint}><CheckCircle2 size={12} style={{ verticalAlign: -1 }} /> Include question numbers and options A/B/C/D for best results.</p>
          </div>
        )}

        {tab === 'upload' && (
          <div>
            <div
              style={{ ...styles.dropZone, ...(drag ? styles.dropZoneDrag : {}) }}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current.click()}
            >
              <Upload size={28} color={drag ? '#4f6ef7' : '#9099a8'} />
              <p style={styles.dropTitle}>{file ? file.name : 'Drop your file here'}</p>
              <p style={styles.dropSub}>{file ? `${(file.size/1024).toFixed(1)} KB · Click to change` : 'or click to browse · PDF, DOCX, XLSX, TXT'}</p>
              <input ref={fileRef} type="file" accept={ACCEPTED.join(',')} style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            </div>
            {file && (
              <div style={styles.fileChip}>
                <FileText size={14} />
                <span>{file.name}</span>
                <button style={styles.removeBtn} onClick={e => { e.stopPropagation(); setFile(null); }}>×</button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={styles.errorBox}><AlertCircle size={14} />{error}</div>
        )}

        <button style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }} onClick={handleSubmit} disabled={loading}>
          {loading ? 'Analyzing…' : <><span>Audit Paper</span> <ChevronRight size={16} /></>}
        </button>
      </div>

      <div style={styles.features}>
        {['Duplicate Question Numbers', 'Duplicate Options', 'Question Ordering', 'Spelling Mistakes'].map(f => (
          <span key={f} style={styles.pill}>{f}</span>
        ))}
      </div>
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 580, margin: '0 auto', padding: '2rem 1rem' },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' },
  logoWrap: { width: 40, height: 40, borderRadius: 10, background: '#eef1fe', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 22, fontWeight: 600, color: '#1a1d23', lineHeight: 1.2 },
  tagline: { fontSize: 13, color: '#5a6070', marginTop: 2 },
  card: { background: '#fff', border: '0.5px solid #e2e5ea', borderRadius: 14, padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  tabs: { display: 'flex', gap: 4, marginBottom: '1rem', borderBottom: '0.5px solid #e2e5ea' },
  tab: { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 13, background: 'transparent', border: 'none', color: '#5a6070', borderBottom: '2px solid transparent', marginBottom: -1, cursor: 'pointer' },
  tabActive: { color: '#4f6ef7', borderBottomColor: '#4f6ef7', fontWeight: 500 },
  textarea: { width: '100%', minHeight: 220, border: '0.5px solid #e2e5ea', borderRadius: 8, padding: '12px 14px', fontSize: 13, fontFamily: 'Inter, sans-serif', color: '#1a1d23', background: '#f7f8fa', resize: 'vertical', outline: 'none', lineHeight: 1.6 },
  dropZone: { border: '1.5px dashed #c8cdd6', borderRadius: 10, padding: '2.5rem 1rem', textAlign: 'center', cursor: 'pointer', background: '#f7f8fa', transition: 'border-color .15s' },
  dropZoneDrag: { borderColor: '#4f6ef7', background: '#eef1fe' },
  dropTitle: { fontSize: 14, fontWeight: 500, color: '#1a1d23', marginTop: 10 },
  dropSub: { fontSize: 12, color: '#9099a8', marginTop: 4 },
  fileChip: { display: 'inline-flex', alignItems: 'center', gap: 7, background: '#eef1fe', color: '#3451d1', borderRadius: 6, padding: '5px 10px', fontSize: 13, marginTop: 8 },
  removeBtn: { background: 'none', border: 'none', color: '#9099a8', fontSize: 16, cursor: 'pointer' },
  hint: { fontSize: 12, color: '#9099a8', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 },
  errorBox: { display: 'flex', alignItems: 'center', gap: 7, background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginTop: '1rem' },
  submitBtn: { width: '100%', marginTop: '1.25rem', background: '#4f6ef7', color: '#fff', border: 'none', borderRadius: 9, padding: '12px', fontSize: 15, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  features: { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: '1.25rem' },
  pill: { fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f3f6', color: '#5a6070', border: '0.5px solid #e2e5ea' },
};
