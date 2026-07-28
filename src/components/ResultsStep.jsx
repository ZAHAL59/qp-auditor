import React, { useState } from 'react';
import { Download, FileText, RotateCcw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import IssueCard from './IssueCard';
import { exportTXT, exportCSV, downloadFile } from '../utils/exportReport';

const CATS = [
  { key: 'all', label: 'All' },
  { key: 'duplicate_question_number', label: 'Duplicate Q. No.' },
  { key: 'missing_question_number', label: 'Missing Q. No.' },
  { key: 'duplicate_options', label: 'Duplicate Options' },
  { key: 'question_ordering', label: 'Ordering' },
];

export default function ResultsStep({ result, issues, setIssues, onReset }) {
  const [catFilter, setCatFilter] = useState('all');

  const updateState = (id, state) => {
    setIssues(issues.map(i => i.id === id ? { ...i, _state: state } : i));
  };

  const acceptAll = () => setIssues(issues.map(i => ({ ...i, _state: 'accepted' })));
  const clearAll = () => setIssues(issues.map(i => ({ ...i, _state: 'pending' })));

  const visible = issues.filter(i => catFilter === 'all' || i.category === catFilter);
  const accepted = issues.filter(i => i._state === 'accepted').length;
  const rejected = issues.filter(i => i._state === 'rejected').length;
  const pending = issues.filter(i => !i._state || i._state === 'pending').length;

  const score = result.quality_score || 0;
  const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
  const scoreBg = score >= 80 ? '#dcfce7' : score >= 60 ? '#fef3c7' : '#fee2e2';

  const counts = {
    duplicate_question_number: 0,
    missing_question_number: 0,
    duplicate_options: 0,
    question_ordering: 0,
  };
  issues.forEach(i => { if (counts[i.category] !== undefined) counts[i.category]++; });

  return (
    <div style={styles.wrap}>
      <div style={styles.topBar}>
        <div>
          <h2 style={styles.title}>Audit Report</h2>
          <p style={styles.sub}>{result.total_questions} questions · {issues.length} issues found</p>
        </div>
        <button style={styles.resetBtn} onClick={onReset}>
          <RotateCcw size={14} /> New audit
        </button>
      </div>

      <div style={styles.summaryGrid}>
        <div style={{ ...styles.scoreCard, background: scoreBg }}>
          <div style={{ ...styles.scoreNum, color: scoreColor }}>{score}</div>
          <div style={styles.scoreLbl}>Quality score</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: '#dc2626' }}>{counts.duplicate_question_number}</div>
          <div style={styles.statLbl}>Duplicate Q. No.</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: '#dc2626' }}>{counts.missing_question_number}</div>
          <div style={styles.statLbl}>Missing Q. No.</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: '#d97706' }}>{counts.duplicate_options}</div>
          <div style={styles.statLbl}>Duplicate Options</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: '#4f6ef7' }}>{counts.question_ordering}</div>
          <div style={styles.statLbl}>Order Issues</div>
        </div>
      </div>

      {result.summary && (
        <div style={styles.assessment}>
          <p style={styles.assessText}>{result.summary}</p>
        </div>
      )}

      <div style={styles.progressRow}>
        <span style={{ ...styles.pill, background: '#dcfce7', color: '#15803d' }}><CheckCircle2 size={12} /> {accepted} accepted</span>
        <span style={{ ...styles.pill, background: '#fee2e2', color: '#b91c1c' }}><XCircle size={12} /> {rejected} dismissed</span>
        <span style={{ ...styles.pill, background: '#f1f5f9', color: '#475569' }}><Clock size={12} /> {pending} pending</span>
        <div style={{ flex: 1 }} />
        <button style={styles.textBtn} onClick={acceptAll}>Accept all</button>
        <button style={styles.textBtn} onClick={clearAll}>Clear all</button>
      </div>

      <div style={styles.filterRow}>
        {CATS.map(c => {
          const count = c.key === 'all' ? issues.length : counts[c.key] || 0;
          if (c.key !== 'all' && count === 0) return null;
          return (
            <button key={c.key}
              style={{ ...styles.filterBtn, ...(catFilter === c.key ? styles.filterBtnActive : {}) }}
              onClick={() => setCatFilter(c.key)}>
              {c.label} <span style={styles.filterCount}>{count}</span>
            </button>
          );
        })}
      </div>

      <div>
        {visible.length === 0
          ? <div style={styles.empty}><CheckCircle2 size={28} color="#16a34a" /><p style={{ marginTop: 8, color: '#5a6070', fontSize: 14 }}>No issues in this category</p></div>
          : visible.map(issue => <IssueCard key={issue.id} issue={issue} onStateChange={updateState} />)
        }
      </div>

      <div style={styles.exportRow}>
        <button style={styles.exportBtn} onClick={() => downloadFile(exportTXT(result, issues), 'audit_report.txt', 'text/plain')}>
          <FileText size={14} /> Export TXT
        </button>
        <button style={styles.exportBtn} onClick={() => downloadFile(exportCSV(issues), 'audit_report.csv', 'text/csv')}>
          <Download size={14} /> Export CSV
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 760, margin: '0 auto', padding: '1.5rem 1rem' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' },
  title: { fontSize: 20, fontWeight: 600 },
  sub: { fontSize: 13, color: '#5a6070', marginTop: 2 },
  resetBtn: { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '0.5px solid #e2e5ea', borderRadius: 7, background: '#fff', color: '#5a6070', fontSize: 13, cursor: 'pointer' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: '1rem' },
  scoreCard: { borderRadius: 10, padding: '0.875rem 1rem', textAlign: 'center' },
  scoreNum: { fontSize: 26, fontWeight: 600 },
  scoreLbl: { fontSize: 12, color: '#5a6070', marginTop: 2 },
  statCard: { background: '#fff', border: '0.5px solid #e2e5ea', borderRadius: 10, padding: '0.875rem 1rem', textAlign: 'center' },
  statNum: { fontSize: 22, fontWeight: 600 },
  statLbl: { fontSize: 12, color: '#5a6070', marginTop: 2 },
  assessment: { background: '#f7f8fa', border: '0.5px solid #e2e5ea', borderRadius: 9, padding: '12px 14px', marginBottom: '1rem' },
  assessText: { fontSize: 13, color: '#5a6070', lineHeight: 1.6 },
  progressRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: '1rem' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 12 },
  textBtn: { background: 'none', border: 'none', color: '#4f6ef7', fontSize: 13, cursor: 'pointer' },
  filterRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1rem' },
  filterBtn: { padding: '4px 12px', borderRadius: 20, fontSize: 12, border: '0.5px solid #e2e5ea', background: '#fff', color: '#5a6070', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 },
  filterBtnActive: { background: '#eef1fe', borderColor: '#4f6ef7', color: '#3451d1', fontWeight: 500 },
  filterCount: { background: '#e2e5ea', borderRadius: 10, padding: '0 5px', fontSize: 10, color: '#5a6070' },
  empty: { textAlign: 'center', padding: '3rem 0', color: '#9099a8' },
  exportRow: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '0.5px solid #e2e5ea' },
  exportBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '0.5px solid #e2e5ea', borderRadius: 8, background: '#fff', color: '#5a6070', fontSize: 13, cursor: 'pointer' },
};