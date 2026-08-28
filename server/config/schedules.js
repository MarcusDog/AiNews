const newsSchedules = {
  dailyMorning: '0 8 * * *',
  recurring: '0 */2 * * *',
  signalRecurring: '*/30 * * * *',
  creatorWebSubRenewal: '17 */6 * * *',
  diversityAudit: '30 8 * * *',
  cleanup: '0 2 * * *',
  timezone: 'Asia/Shanghai',
  retentionDays: 45,
  signalWindowHours: 72
};

module.exports = {
  newsSchedules
};
