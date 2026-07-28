import React, { useState } from 'react';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Hash, Copy, ArrowDownUp, Spline, AlertTriangle } from 'lucide-react';

const CAT_META = {
  duplicate_question_number: { label: 'Duplicate Q. Number', icon: Hash, color: '#dc2626', bg: '#fee2e2' },
  missing_question_number: { label: 'Missing Q. Number', icon: Hash, color: '#dc2626', bg: '#fee2e2' },
  duplicate_options: { label: 'Duplicate Options', icon: Copy, color: '#d97706', bg: '#fef3c7' },
  question_ordering: { label: 'Question Ordering', icon: ArrowDownUp, color: '#4f6ef7', bg: '#eef1fe' },
  spelling: { label: 'Spelling Mistake', icon: Spline, color: '#7c3aed', bg: '#ede9fe' },
};

const SEV_STYLES = {
  high: { label: 'High', color: '#b91c1c', bg: '#fee2e2' },
  medium: { label: 'Medium', color: '#b45309', bg: '#fef3c7' },
  low: { label: 'Low', color: '#15803d', bg: '#dcfce7' },
};

// Math/science keywords that indicate possible fraction/formula issues
const MATH_KEYWORDS = ['sin', 'cos', 'tan', 'mg', 'log', 'sqrt', 'theta', 'theta', '/', 'frac', 'IL', 'kx', 'mv', 'mg'];

function hasMathContent(text) {
  if (!text) return false;
  return MATH_KEYWORDS.some(k => text.toLowerCase().includes(k.toLowerCase()));
}

export default function IssueCard({ issue, onStateChange }) {
  const [expanded, setExpanded] = useState(true);
  const state = issue._state || 'pending';
  const cat = CAT_META[issue.category] || { label: issue.category, icon: Hash, color: '#5a6070', bg: '#f1f3f6' };
  const sev = SEV_STYLES[issue.severity] || SEV_STYLES.low;
  const CatIcon = cat.icon;
  const conf = Math.round((issue.confidence || 0) * 100);

  // Show math disclaimer for duplicate_options when math content detected
  const showMathDisclaimer = issue.category === 'duplicate_options' &&
    (hasMathContent(issue.original_text) || hasMathContent(issue.description));

  return (
    <div style={{
      ...styles.card,
      borderColor: state === 'accepted' ? '#86efac' : '#e2e5ea',
      background: state === 'accepted' ? '#f0fdf4' : state === 'rejected' ? '#f9fafb' : '#fff',
      opacity: state === 'rejected' ? 0.5 : 1,
    }}>
      <div style={styles.headerRow} onClick={() => setExpanded(!expanded)}>
        <div style={styles.badges}>
          <span style={{ ...styles.badge, background: sev.bg, color: sev.color }}>{sev.label}</span>
          <span style={{ ...styles.badge, background: cat.bg, color: cat.color }}>
            <CatIcon size={11} style={{ verticalAlign: -1 }} /> {cat.label}
          </span>
          <span style={styles.qnum}>{issue.question_num}</span>
        </div>
        <button style={styles.toggleBtn}>
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      <p style={styles.desc}>{issue.description}</p>

      {expanded && (
        <>
          {issue.original_text && (
            <div style={styles.original}>
              <span style={styles.origLabel}>Found:</span>
              <code style={styles.origText}>{issue.original_text}</code>
            </div>
          )}

          {/* Math disclaimer */}
          {showMathDisclaimer && (
            <div style={styles.disclaimer}>
              <AlertTriangle size={13} color="#d97706" />
              <span>This question contains math/physics expressions. PDF text extraction may lose fraction structure (e.g. numerator vs denominator), causing false positives. Please verify manually before accepting.</span>
            </div>
          )}

          <div style={styles.suggestion}>
            <span style={styles.suggLabel}>💡 Fix</span>
            <p style={styles.suggText}>{issue.suggestion}</p>
          </div>

          <div style={styles.confRow}>
            <span style={styles.confLabel}>Confidence</span>
            <div style={styles.confTrack}>
              <div style={{ ...styles.confFill, width: `${conf}%` }} />
            </div>
            <span style={styles.confVal}>{conf}%</span>
          </div>

          <div style={styles.actionRow}>
            <button
              style={{ ...styles.actionBtn, ...(state === 'accepted' ? styles.acceptedActive : styles.acceptBtn) }}
              onClick={() => onStateChange(issue.id, state === 'accepted' ? 'pending' : 'accepted')}>
              <CheckCircle2 size={14} /> {state === 'accepted' ? 'Accepted' : 'Accept fix'}
            </button>
            <button
              style={{ ...styles.actionBtn, ...(state === 'rejected' ? styles.rejectedActive : styles.rejectBtn) }}
              onClick={() => onStateChange(issue.id, state === 'rejected' ? 'pending' : 'rejected')}>
              <XCircle size={14} /> {state === 'rejected' ? 'Dismissed' : 'Dismiss'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  card: { border: '0.5px solid #e2e5ea', borderRadius: 12, padding: '1rem 1.1rem', marginBottom: '0.625rem', transition: 'all .2s' },
  headerRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 6 },
  badges: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  badge: { fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 3 },
  qnum: { fontSize: 12, color: '#9099a8' },
  toggleBtn: { background: 'none', border: 'none', color: '#9099a8', cursor: 'pointer', padding: 2, flexShrink: 0 },
  desc: { fontSize: 14, color: '#1a1d23', lineHeight: 1.5, marginBottom: '0.625rem' },
  original: { background: '#f7f8fa', borderRadius: 6, padding: '8px 10px', marginBottom: '0.625rem', display: 'flex', gap: 8, alignItems: 'flex-start' },
  origLabel: { fontSize: 11, color: '#9099a8', fontWeight: 500, whiteSpace: 'nowrap', marginTop: 1 },
  origText: { fontSize: 12, color: '#5a6070', fontFamily: 'monospace', lineHeight: 1.5 },
  disclaimer: { display: 'flex', alignItems: 'flex-start', gap: 7, background: '#fffbeb', border: '0.5px solid #fcd34d', borderRadius: 7, padding: '8px 10px', marginBottom: '0.625rem', fontSize: 12, color: '#92400e', lineHeight: 1.5 },
  suggestion: { background: '#eef1fe', borderLeft: '3px solid #4f6ef7', borderRadius: '0 6px 6px 0', padding: '8px 12px', marginBottom: '0.75rem' },
  suggLabel: { fontSize: 11, fontWeight: 500, color: '#3451d1', display: 'block', marginBottom: 3 },
  suggText: { fontSize: 13, color: '#1a1d23', lineHeight: 1.5 },
  confRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' },
  confLabel: { fontSize: 11, color: '#9099a8', width: 70 },
  confTrack: { flex: 1, height: 4, background: '#e2e5ea', borderRadius: 2, overflow: 'hidden' },
  confFill: { height: '100%', borderRadius: 2, background: '#4f6ef7', transition: 'width .3s' },
  confVal: { fontSize: 11, color: '#5a6070', width: 30, textAlign: 'right' },
  actionRow: { display: 'flex', gap: 8 },
  actionBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 0', borderRadius: 7, fontSize: 13, border: '0.5px solid', cursor: 'pointer', transition: 'all .15s' },
  acceptBtn: { background: 'transparent', borderColor: '#86efac', color: '#15803d' },
  acceptedActive: { background: '#dcfce7', borderColor: '#16a34a', color: '#15803d', fontWeight: 500 },
  rejectBtn: { background: 'transparent', borderColor: '#fca5a5', color: '#b91c1c' },
  rejectedActive: { background: '#fee2e2', borderColor: '#dc2626', color: '#b91c1c', fontWeight: 500 },
};