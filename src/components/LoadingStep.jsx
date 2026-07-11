// src/components/LoadingStep.jsx
import React, { useEffect, useState } from 'react';

const DEFAULT_STEPS = [
  'Rendering PDF pages…',
  'Reading chemistry formulas and symbols…',
  'Checking question numbering…',
  'Detecting duplicate options…',
  'Checking spelling…',
  'Generating report…',
];

export default function LoadingStep({ customMsg }) {
  const [step, setStep] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setStep(s => (s + 1) % DEFAULT_STEPS.length);
    }, 2000);
    const dotTimer = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);
    return () => { clearInterval(timer); clearInterval(dotTimer); };
  }, []);

  const msg = customMsg || DEFAULT_STEPS[step];

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <h2 style={styles.title}>Auditing your paper{dots}</h2>
        <p style={styles.msg}>{msg}</p>
        <div style={styles.stepList}>
          {DEFAULT_STEPS.map((s, i) => (
            <div key={i} style={styles.stepRow}>
              <div style={{ ...styles.dot, background: i < step ? '#16a34a' : i === step ? '#4f6ef7' : '#e2e5ea' }} />
              <span style={{ ...styles.stepLabel, color: i <= step ? '#1a1d23' : '#9099a8', fontWeight: i === step ? 500 : 400 }}>{s}</span>
              {i < step && <span style={styles.check}>✓</span>}
            </div>
          ))}
        </div>
        <p style={styles.note}>Vision AI reads symbols, charges (⊕⊖), Greek letters (α β γ), and structural formulas directly from the PDF.</p>
      </div>
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 520, margin: '3rem auto', padding: '0 1rem' },
  card: { background: '#fff', border: '0.5px solid #e2e5ea', borderRadius: 14, padding: '2.5rem', textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.07)' },
  spinner: { width: 40, height: 40, borderRadius: '50%', border: '3px solid #e2e5ea', borderTopColor: '#4f6ef7', animation: 'spin 0.7s linear infinite', margin: '0 auto 1.25rem' },
  title: { fontSize: 18, fontWeight: 600, marginBottom: 6 },
  msg: { fontSize: 14, color: '#5a6070', marginBottom: '1.5rem' },
  stepList: { textAlign: 'left', marginBottom: '1.25rem' },
  stepRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '0.5px solid #f1f3f6' },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, transition: 'all .3s' },
  stepLabel: { fontSize: 13, flex: 1, transition: 'color .3s' },
  check: { fontSize: 12, color: '#16a34a' },
  note: { fontSize: 11, color: '#9099a8', borderTop: '0.5px solid #f1f3f6', paddingTop: '1rem', lineHeight: 1.6 },
};

const style = document.createElement('style');
style.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);
