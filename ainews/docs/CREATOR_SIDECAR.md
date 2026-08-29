# Creator Sidecar 签名接入

L4 登录态采集器必须作为独立进程运行。AyaNews Web 服务不读取浏览器 Cookie、不启动登录态爬虫，也不保存 Sidecar 原始请求头。仅允许已配置来源向已核验账号发送公开、结构化帖子。

## 1. 配置来源与绑定

在部署 Secret 中设置 `AYA_CREATOR_BRIDGES_JSON`。JSON 只保存 secret 的环境变量名，不保存值：

```json
[
  {
    "id": "creator-xhs-sidecar",
    "adapter": "xiaohongshu-mcp",
    "secretEnv": "AYA_CREATOR_BRIDGE_XHS_SECRET",
    "bindings": [
      { "platform": "xiaohongshu", "externalAccountId": "VERIFIED_PLATFORM_ID" }
    ]
  }
]
```

再由部署平台注入 `AYA_CREATOR_BRIDGE_XHS_SECRET` 的随机高强度值。该账号还必须存在于核验观察名单；只有 secret 或只有绑定都不能写入。

支持的适配器标识：`rsshub`、`newsnow`、`mediacrawler`、`xiaohongshu-mcp`、`douyin-parser`。

## 2. 请求契约

端点：`POST /api/ingest/v1/creator-bridge`

必须发送：

- `Content-Type: application/json`
- `x-aya-source-id`: 配置中的来源 ID
- `x-aya-timestamp`: 当前 10 位秒或 13 位毫秒 Unix 时间
- `x-aya-nonce`: 8–160 字符、每批唯一
- `x-aya-signature`: `sha256=<64 lowercase hex>`

签名必须基于“实际发送的原始字节”，不能重新序列化：

```text
body_sha256 = hex(SHA256(raw_body_bytes))
message = timestamp + "." + nonce + "." + body_sha256
signature = "sha256=" + hex(HMAC_SHA256(secret, message))
```

服务端先验证时间窗、nonce 和 HMAC，再解析 JSON。等价 JSON 的空格或键顺序不同会得到不同签名。请求最多 2 MiB、每批最多 500 条，nonce 重放返回 409。

最小请求体：

```json
{
  "version": 1,
  "platform": "xiaohongshu",
  "externalAccountId": "VERIFIED_PLATFORM_ID",
  "nextCursor": null,
  "exhausted": false,
  "items": [
    {
      "externalPostId": "PLATFORM_POST_ID",
      "url": "https://www.example.com/public/post",
      "title": "公开帖子标题",
      "text": "平台允许读取的公开摘要",
      "contentType": "post",
      "publishedAt": "2026-08-29T08:00:00.000Z",
      "visibility": "public",
      "metrics": { "likes": 120, "comments": 18, "shares": null }
    }
  ]
}
```

私密内容、删除内容、非 HTTPS URL、负指标、未绑定账号和未知 raw 字段会被拒绝或丢弃。凭据、Cookie、请求头、私有 cursor 和不在 allowlist 的 payload 字段不会进入公开 API。

## 3. 响应与重试

| HTTP | 含义 | Sidecar 动作 |
|---|---|---|
| 202 | 批次原子提交 | 保存 `nextExpectedCursor`，继续下一页 |
| 401 | 未知来源、签名错误或时间过期 | 停止并核对 secret/时钟，不盲重试 |
| 403 | 来源与账号未绑定或账号未核验 | 停止并由运营者复核 |
| 409 | nonce 已使用 | 视作旧批已被处理；换 nonce 前核对 cursor |
| 413 | 超过 2 MiB | 拆小批次 |
| 422 | Schema、公开性或帖子字段不合格 | 隔离坏项并人工检查 |
| 5xx | 服务端临时失败 | 指数退避；保持同一数据页但使用新的 nonce/时间戳 |

帖子、指标、Bridge payload allowlist、nonce、run 和 cursor 在一个事务边界提交；失败不会出现 cursor 前进而帖子丢失。

## 4. 上线验收

1. 使用一个已核验测试账号发送 1 条公开帖子。
2. 原帖 URL 可由无登录浏览器打开。
3. `/api/creators/v1/sources` 的该来源从 `awaiting_signed_canary` 变为 `online`。
4. 重发相同 nonce 得到 409，换 nonce 重发相同帖子不会重复。
5. 错误签名、过期时间、未绑定账号和超过大小的请求均不写任何 nonce、run、帖子或 payload。
6. Sidecar 停止或登录过期时来源显示 `blocked` / `auth_expired` / `degraded`，不伪装在线。

生产 Sidecar 的登录态、Secret 和 Cookie 必须在独立密钥存储中轮换，不能放入本仓库、日志、URL 或前端。
