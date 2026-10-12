// A format/reference audit only: passing does not establish factual correctness.
function auditAnswer(answer, sources = [], requiredSections = ['## 结论', '## 证据边界']) {
  const validIds = new Set(sources.map((source) => source.citationId));
  const citedIds = [...new Set((String(answer).match(/\[S\d+\]/g) || []).map((token) => token.slice(1, -1)))];
  const invalidIds = citedIds.filter((id) => !validIds.has(id));
  const hasRequiredSections = requiredSections.every((heading) => String(answer).includes(heading));
  const uncitedLines = String(answer).split(/\n+/).map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s/.test(line))
    .filter((line) => line.replace(/^[-*+]|^\d+[.)]/, '').trim().length >= 4)
    .filter((line) => !/\[S\d+\]/.test(line));
  return { valid: Boolean(String(answer).trim()) && citedIds.length > 0 && invalidIds.length === 0 && hasRequiredSections && uncitedLines.length === 0,
    citedIds, invalidIds, hasRequiredSections, uncitedLines };
}
module.exports = { auditAnswer };
