module.exports = {
  apps: [
    {
      name: 'ainews-server',
      script: './server/index.js',
      cwd: '/home/tian/clawdbot/work/Ainews',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      // 自动重启配置
      autorestart: true,
      // 崩溃后重启
      max_restarts: 10,
      // 最小运行时间（毫秒）
      min_uptime: '10s',
      // 重启延迟
      restart_delay: 3000,
      // 日志配置
      log_file: './logs/server.log',
      out_file: './logs/server-out.log',
      error_file: './logs/server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // 合并日志
      merge_logs: true,
      // 日志保留天数
      log_rotate_interval: '1d',
      // 监听文件变化（开发模式可启用）
      watch: false,
      // 忽略监听文件
      ignore_watch: ['node_modules', 'logs', '.git'],
      // 内存限制（超过则重启）
      max_memory_restart: '1G',
      // 进程优雅关闭超时
      kill_timeout: 5000
    },
    {
      name: 'ainews-client',
      script: 'npx',
      args: 'serve -s build -l 3003',
      cwd: '/home/tian/clawdbot/work/Ainews/client',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      // 自动重启配置
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      // 日志配置
      log_file: './logs/client.log',
      out_file: './logs/client-out.log',
      error_file: './logs/client-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      log_rotate_interval: '1d',
      // 不监听文件变化
      watch: false,
      // 内存限制
      max_memory_restart: '512M',
      kill_timeout: 5000
    }
  ]
};
