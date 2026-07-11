// src/App.jsx
import React, { useState } from 'react';
import UploadStep from './components/UploadStep';
import LoadingStep from './components/LoadingStep';
import ResultsStep from './components/ResultsStep';
import { parseFile } from './utils/fileParser';
import { pdfToImages } from './utils/pdfToImages';
import { auditPaper } from './utils/auditor';

const STEP = { UPLOAD: 'upload', LOADING: 'loading', RESULTS: 'results' };

export default function App() {
  const [step, setStep] = useState(STEP.UPLOAD);
  const [result, setResult] = useState(null);
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState('');
  const [loadMsg, setLoadMsg] = useState('');

  const handleStart = async ({ text, file }) => {
    setStep(STEP.LOADING);
    setError('');

    try {
      let content = text;
      let images = null;

      if (file) {
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'pdf') {
          // For PDFs: render as images for vision AI
          setLoadMsg('Rendering PDF pages as images…');
          images = await pdfToImages(file, 30); // up to 30 pages
          setLoadMsg(`Extracted ${images.length} pages — sending to AI…`);
          content = ''; // images will be used instead
        } else {
          // For DOCX/XLSX/TXT: extract text as before
          setLoadMsg('Extracting text from file…');
          content = await parseFile(file);
        }
      }

      setLoadMsg('AI is reading your question paper…');
      const auditResult = await auditPaper(content, images);

      const numberedIssues = (auditResult.issues || []).map((issue, i) => ({
        ...issue,
        id: issue.id || i + 1,
        _state: 'pending',
      }));

      setResult(auditResult);
      setIssues(numberedIssues);
      setStep(STEP.RESULTS);
    } catch (err) {
      setError(err.message);
      setStep(STEP.UPLOAD);
    }
  };

  const handleReset = () => {
    setStep(STEP.UPLOAD);
    setResult(null);
    setIssues([]);
    setError('');
    setLoadMsg('');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa' }}>
      {step !== STEP.LOADING && (
        <div style={styles.stepBar}>
          {['Upload', 'Analyze', 'Review'].map((label, i) => {
            const num = i + 1;
            const currentNum = step === STEP.UPLOAD ? 1 : step === STEP.LOADING ? 2 : 3;
            const done = num < currentNum;
            const active = num === currentNum;
            return (
              <React.Fragment key={label}>
                <div style={styles.stepItem}>
                  <div style={{ ...styles.stepDot, background: done || active ? '#4f6ef7' : '#e2e5ea', color: done || active ? '#fff' : '#9099a8', opacity: active ? 1 : done ? 0.7 : 0.5 }}>
                    {done ? '✓' : num}
                  </div>
                  <span style={{ ...styles.stepLabel, color: active ? '#1a1d23' : '#9099a8', fontWeight: active ? 500 : 400 }}>{label}</span>
                </div>
                {i < 2 && <div style={{ ...styles.stepLine, background: done ? '#4f6ef7' : '#e2e5ea' }} />}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {error && (
        <div style={styles.errorBanner}>
          ⚠️ {error}
          <button style={styles.errClose} onClick={() => setError('')}>×</button>
        </div>
      )}

      {step === STEP.UPLOAD && <UploadStep onStart={handleStart} loading={false} />}
      {step === STEP.LOADING && <LoadingStep customMsg={loadMsg} />}
      {step === STEP.RESULTS && result && (
        <ResultsStep result={result} issues={issues} setIssues={setIssues} onReset={handleReset} />
      )}

      <footer style={styles.footer}>QP Auditor · Powered by Gemini Vision AI</footer>
    </div>
  );
}

const styles = {
  stepBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, padding: '1.25rem 1rem 0', maxWidth: 400, margin: '0 auto' },
  stepItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  stepDot: { width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, transition: 'all .3s' },
  stepLabel: { fontSize: 11, transition: 'color .3s' },
  stepLine: { flex: 1, height: 1.5, margin: '0 4px', marginBottom: 18, transition: 'background .3s' },
  errorBanner: { maxWidth: 700, margin: '1rem auto 0', background: '#fee2e2', color: '#b91c1c', border: '0.5px solid #fca5a5', borderRadius: 9, padding: '10px 16px', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  errClose: { background: 'none', border: 'none', color: '#b91c1c', fontSize: 18, cursor: 'pointer' },
  footer: { textAlign: 'center', padding: '2rem 1rem 1.5rem', fontSize: 12, color: '#9099a8' },
};
