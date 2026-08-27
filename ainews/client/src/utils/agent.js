export const buildAgentHistory = (messages = []) => messages
  .filter((item) => item && !item.system && !item.pending && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' && item.content.trim())
  .map((item) => ({ role: item.role, content: item.content.trim() }))
  .slice(-8);

export const getAgentSuggestions = () => [
  '最近 7 天有哪些真正值得关注的 AI 趋势？请逐条给出来源。',
  '当前资讯库有哪些信息茧房和来源盲区？',
  '比较国内外 AI Agent 的最新进展与不同观点。',
  '把今天的重要新闻整理成一份对自媒体读者有帮助的选题简报。'
];
