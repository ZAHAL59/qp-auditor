// src/utils/exportReport.js

const CAT_LABELS = {
  option_issues: 'Option Issues',
  spelling_grammar: 'Spelling & Grammar',
  answer_key: 'Answer Key',
  factual: 'Factual Errors',
  formatting: 'Formatting',
  educational_quality: 'Educational Quality',
  duplicates: 'Duplicate Questions',
};

export function exportTXT(result, issues) {
  const accepted = issues.filter(i => i._state === 'accepted');
  const rejected = issues.filter(i => i._state === 'rejected');
  const pending = issues.filter(i => !i._state || i._state === 'pending');

  const line = '─'.repeat(50);
  let txt = `QUESTION PAPER AUDIT REPORT\n${line}\nGenerated: ${new Date().toLocaleString()}\n\n`;
  txt += `SUMMARY\n${line}\n`;
  txt += `Overall Quality Score : ${result.quality_score}/100\n`;
  txt += `Total Questions       : ${result.total_questions}\n`;
  txt += `Total Issues Found    : ${issues.length}\n`;
  txt += `  Accepted Fixes      : ${accepted.length}\n`;
  txt += `  Dismissed           : ${rejected.length}\n`;
  txt += `  Pending Review      : ${pending.length}\n\n`;
  txt += `Assessment: ${result.summary || ''}\n\n`;

  const byCat = {};
  issues.forEach(i => { byCat[i.category] = (byCat[i.category] || 0) + 1; });
  txt += `ISSUES BY CATEGORY\n${line}\n`;
  Object.entries(byCat).forEach(([cat, count]) => {
    txt += `  ${(CAT_LABELS[cat] || cat).padEnd(24)} : ${count}\n`;
  });
  txt += '\n';

  ['high', 'medium', 'low', 'info'].forEach(sev => {
    const group = issues.filter(i => i.severity === sev);
    if (!group.length) return;
    txt += `${sev.toUpperCase()} SEVERITY (${group.length})\n${line}\n`;
    group.forEach(issue => {
      txt += `\n[${issue.question_num}] ${CAT_LABELS[issue.category] || issue.category}\n`;
      txt += `Issue      : ${issue.description}\n`;
      if (issue.original_text) txt += `Found      : ${issue.original_text}\n`;
      txt += `Suggestion : ${issue.suggestion}\n`;
      txt += `Confidence : ${Math.round(issue.confidence * 100)}%\n`;
      txt += `Status     : ${issue._state || 'pending'}\n`;
    });
    txt += '\n';
  });

  return txt;
}

export function exportCSV(issues) {
  const headers = ['ID', 'Question', 'Category', 'Severity', 'Description', 'Suggestion', 'Confidence', 'Status'];
  const rows = issues.map(i => [
    i.id, i.question_num, CAT_LABELS[i.category] || i.category,
    i.severity, `"${(i.description || '').replace(/"/g, '""')}"`,
    `"${(i.suggestion || '').replace(/"/g, '""')}"`,
    `${Math.round(i.confidence * 100)}%`, i._state || 'pending'
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
