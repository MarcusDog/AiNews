# Creator 热点推送与数据维护

推送链路为：已提交帖子/评分/共题事件 → 持久订阅匹配 → SQLite outbox → 端点传输 → 尝试记录/重试/死信。进程重启不会丢失等待队列。

## 1. 用户与订阅

打开 `/alerts` 可在页面内注册或登录。公开热点无需登录；订阅、端点、SSE 与投递记录按用户隔离。

订阅可按以下字段组合：

- 垂类、平台、Creator；
- `post.published`、`post.hot`、`topic.multi_creator`、`topic.cross_platform`；
- 最低分；
- immediate 或 digest；
- 时区和静默时段。

站内端点只能指向当前用户。外部端点支持 Webhook、email、飞书、企微、钉钉、Telegram、ntfy、Bark；没有对应服务端配置时会明确失败或显示 `unconfigured`。

## 2. Webhook 安全与签名

Webhook 仅允许 HTTPS，默认端口 443；拒绝 userinfo、IP literal、私网/回环/链路本地/元数据地址、DNS 混合公共与私有结果、重定向和 DNS rebinding。每次尝试重新解析并把请求连接固定到已验证公共 IP，同时保留原 hostname 做 TLS 校验。

端点只保存 `secretRef`，例如 `env:AYA_CREATOR_WEBHOOK_CUSTOMER_A_SECRET`；真实值只由服务端环境注入，不进入数据库和 API 响应。默认解析器只允许专用 Creator Webhook 环境变量前缀。

请求为有界 JSON，并使用 HMAC SHA-256。请求头为：

- `x-aya-timestamp`：服务端生成的时间戳字符串；
- `x-aya-event-id`：稳定事件 ID；
- `x-aya-delivery-id`：持久 outbox 投递 ID；
- `x-aya-signature`：`sha256=<64 hex>`。

接收方必须用实际收到的原始 JSON body 计算 `hex(HMAC_SHA256(secret, timestamp + "." + raw_body))`，常量时间比较签名，并按 `x-aya-delivery-id` 幂等处理。不要重新序列化 JSON 后验签，也不要把签名 Secret 写入 URL。

## 3. 重试、死信与测试

- 2xx：记录成功并确认 outbox；
- 429：尊重 `Retry-After`；
- 5xx/网络错误：持久退避重试；
- 终止性 4xx：进入 dead letter；
- 发送后进程崩溃但尚未确认：lease 到期后可能重试，接收方必须幂等；
- 测试端点也只通过 outbox，并生成归属用户可见的投递和尝试审计。

在 `/alerts` 点击“测试”后，检查“最近投递”的 HTTP 状态与错误。不要通过直接 HTTP 工具绕过 outbox 来判断生产正确性。

SSE 端点 `/api/creators/v1/stream` 需要登录。首次连接从当前已提交末尾追新；显式 `since` 或 `Last-Event-ID` 才回放。事件保留期导致 cursor 过期时返回 410 和 `resync`，客户端先重新读取帖子，再从 `latest_cursor` 重连。Nginx 必须关闭该精确路由的 buffering、cache 和 gzip。

## 4. 数据保留

默认策略：

| 数据 | 保留 |
|---|---|
| Creator posts | 365 天 |
| Bridge payload allowlist | 30 天 |
| 指标/评分快照 | 72 小时细粒度，之后每日一条至 180 天 |
| 成功投递 | 30 天 |
| 失败/死信投递 | 90 天 |
| Creator events | 30 天 |
| 维护预览/审计 | 90 天 |

清理采用 preview-first：预览冻结时间边界和最大 rowid，返回单次、限时、绑定操作者的 token；执行只能删除冻结范围，后来写入的行不受影响。级联清除 Bridge payload link，但保留帖子和采集 run。

CLI：

```bash
cd server
node scripts/creator-maintenance.js preview
node scripts/creator-maintenance.js execute PREVIEW_TOKEN
```

管理 API：

```bash
curl -X POST http://localhost:3002/api/creators/v1/admin/maintenance/preview \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY'

curl -X POST http://localhost:3002/api/creators/v1/admin/maintenance/execute \
  -H 'Content-Type: application/json' \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY' \
  -d '{"token":"PREVIEW_TOKEN"}'
```

## 5. 备份与导出

`AYA_CREATOR_BACKUP_DIR` 与 `AYA_CREATOR_EXPORT_DIR` 必须是服务账号可写、与前端静态目录分离的专用目录。文件名受目录限制且拒绝覆盖。

```bash
cd server
node scripts/creator-maintenance.js backup
node scripts/creator-maintenance.js export
```

SQLite online backup 可在写入时运行，完成后以只读 `integrity_check` 验证。JSONL 在一致事务中导出，包含 schema、时间范围和 SHA256；明确排除私有 cursor、secret reference、Cookie、Authorization 和原始请求头。

建议把备份复制到加密的异机对象存储，并周期性做恢复演练；不要只验证文件存在。
