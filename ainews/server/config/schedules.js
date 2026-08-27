const newsSchedules = {
  dailyMorning: '0 8 * * *',
  recurring: '0 */2 * * *',
  diversityAudit: '30 8 * * *',
  cleanup: '0 2 * * *',
  timezone: 'Asia/Shanghai',
  retentionDays: 45
};

module.exports = {
  newsSchedules
};
