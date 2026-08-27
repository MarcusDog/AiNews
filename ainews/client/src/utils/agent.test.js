import { buildAgentHistory, getAgentSuggestions } from './agent';

test('buildAgentHistory sends only completed user and assistant text without UI metadata', () => {
  const messages = [
    { role: 'assistant', content: 'welcome', system: true },
    { role: 'user', content: 'question', sources: [{ url: 'secret-ui-state' }] },
    { role: 'assistant', content: 'answer', sources: [{ url: 'https://example.com' }] },
    { role: 'assistant', content: '', pending: true }
  ];

  expect(buildAgentHistory(messages)).toEqual([
    { role: 'user', content: 'question' },
    { role: 'assistant', content: 'answer' }
  ]);
});

test('agent suggestions focus on analysis, diversity and helpful content workflows', () => {
  const suggestions = getAgentSuggestions();

  expect(suggestions).toHaveLength(4);
  expect(suggestions.join(' ')).toMatch(/信息茧房/);
  expect(suggestions.join(' ')).toMatch(/来源/);
});
