# AI资讯平台项目需求文档 (SPEC)

## 1. 目标（Goals）
- 构建一个本地运行的AI科技资讯聚合与分析平台
- 创建多维度AI知识学习与思考空间
- 打造适合个人使用的长期运营AI信息生态系统
- 帮助您减少信息差，保持对AI领域发展的敏感度
- 提供独立思考和批判性分析的内容
- 支持每日汇总更新迭代的内容节奏

## 2. 范围（Scope）
**核心功能模块：**
- 实时AI新闻与资讯聚合模块（每日更新）
- AI技术框架与工具分析页面
- 新算法/新思路解读板块
- 知识理解辅助功能（概念解释、术语词典）
- 视野拓展与思维训练区域
- 信息茧房预警与多元化内容推荐
- AI独立思考与批判性内容专栏
- 个人偏好设置与个性化推荐系统
- 多页面导航系统

**技术实现：**
- 前端：React + Node.js + Express 技术栈
- 后端：Node.js API服务
- 数据存储：本地数据库（SQLite/PostgreSQL）
- 数据源：付费API + RSS订阅的混合方案
- 部署：Linux本地运行环境配置

**涉及文件/模块：**
- 前端页面组件和路由配置
- 后端API服务（数据获取与处理）
- 数据库设计（用户偏好、内容存储）
- 第三方AI资讯API集成
- 内容管理系统
- 本地部署配置文件

## 3. 不做什么（Out of Scope）
- 不涉及深度技术开发教程
- 不提供投资建议或商业决策支持
- 不构建社交网络功能（评论、点赞等）
- 不创建付费内容或商业模式
- 不涉及具体AI模型的训练或部署
- 不部署到云服务器（仅本地运行）
- 不支持多用户并发访问（单用户设计）

## 4. 验收标准（Acceptance Criteria）
- [x] 能够获取并展示至少5个主要AI资讯源的每日汇总内容
- [x] 网站具备清晰的多页面导航结构
- [x] 每个核心功能模块都有对应的独立页面
- [x] 提供至少30个常见AI术语的通俗解释
- [x] 建立信息茧房检测算法（内容多样性评分）
- [x] 至少包含3种不同视角的AI发展趋势分析
- [x] 建立内容质量保障机制：拓展思路/扩展眼界/破除固定路子的内容推荐
- [x] 网站响应速度<3秒，支持Linux桌面端访问
- [x] 具备基础的内容搜索和筛选功能
- [x] 用户个人偏好设置功能正常运作
- [x] 完全自动化的每日内容更新机制稳定运行（每日8:00执行）
- [x] 集成RSS订阅作为数据源备用方案
- [x] 本地部署流程清晰，支持手动配置步骤
- [x] 付费API + 免费RSS的混合数据源方案稳定运行
- [x] 初始个性化推荐配置支持手动调优功能

## 5. 风险与假设（Risks & Assumptions）
**潜在风险：**
- 付费API服务可能不稳定或成本逐渐增加
- 付费API配额限制可能影响内容获取量
- 即使有付费方案，仍需要RSS等免费方案作为补充
- AI资讯质量参差不齐，需要智能筛选算法确保内容质量
- 完全自动化可能导致质量波动，需要监控和人工干预机制
- 每日8点自动更新可能有时间点冲突或网络问题
- 个人偏好算法初始调优可能需要较多人工干预

**做出的假设：**
- 您可以在Linux环境下配置Node.js运行环境
- 愿意为高质量数据源支付少量费用（成本控制在合理范围内）
- 能够获取必要的第三方API密钥
- 接受RSS订阅作为数据源补充方案
- 每日早上8点有稳定网络连接进行内容更新
- 有时间投入来维护内容质量和偏好调优
- 每周可以投入一些时间查看和分析内容质量
- 接受手动配置部署步骤（可提供详细指南）
- 接受个性化推荐的初始手动调优过程

## 6. 确认完成的问题

✅ **运行环境**：Linux - 已确认
✅ **技术栈**：React + Node.js + Express - 已确认  
✅ **数据源预算**：愿意支付少量费用获取高质量数据源 - 已确认
✅ **内容质量保障**：需要拓展思路/扩展眼界/破除固定路子的内容作为补充 - 已确认
✅ **备份方案**：接受RSS订阅作为备用数据源 - 已确认
✅ **内容审核**：完全自动化更新机制 - 已确认
✅ **部署方式**：手动配置步骤 - 已确认
✅ **更新频率**：每日早上8点自动更新 - 已确认
✅ **个性化调优**：接受手动调优过程 - 已确认

## 7. 需要最终确认

1. **数据源API选择**：我会推荐少量付费高质量API（如ArXiv API、NewsAPI）+ 免费RSS源的组合，确保成本控制的同时保证内容质量。

2. **内容更新频率**：每日早上8点自动更新汇总内容，您是否确认这个节奏？

3. **个性化程度**：基于您的阅读偏好进行推荐，初始配置需要一些手动调优，是否可以接受？

数据源：
免费RSS源推荐（用于AI新闻、算法、论文更新）
这些RSS大多完全免费，可直接在RSS阅读器（如Feedly、Inoreader）中订阅。

名称描述RSS链接arXiv Artificial IntelligencearXiv上最新AI论文（cs.AI类别），适合跟踪前沿算法和研究https://arxiv.org/rss/cs.AIarXiv Machine LearningarXiv上机器学习论文（cs.LG），算法和模型相关论文最多https://arxiv.org/rss/cs.LGHugging Face BlogHugging Face官方博客，覆盖模型发布、教程、AI新闻和开源动态https://huggingface.co/blog/feed.xmlAI Weekly每周AI精选新闻和论文摘要，简洁实用http://aiweekly.co/issues.rssMIT Technology Review AIMIT科技评论AI专题，深度新闻和趋势分析https://www.technologyreview.com/topic/artificial-intelligence/rss/NVIDIA BlogNVIDIA官方博客，GPU、AI硬件、算法应用新闻https://blogs.nvidia.com/feed/WIRED AIWIRED杂志AI专题，科普性强，覆盖新闻和伦理讨论https://www.wired.com/feed/tag/ai/latest/rssDeepMind BlogGoogle DeepMind研究更新和突破https://deepmind.google/discover/blog/rss.xml
提示：更多完整列表可参考 Feedspot 的 Top 100 AI RSS（https://rss.feedspot.com/ai_rss_feeds） 或 Reddit 整理的AI RSS合集。
API推荐（免费 + 付费）
这些API可用于获取AI新闻、论文、数据集或模型。免费的通常有额度限制，付费的更稳定和功能强大。
免费/有限免费API

名称描述特点链接Hugging Face Inference API免费调用数千个开源AI模型、数据集和论文相关工具有免费额度，适合算法实验和资料获取https://huggingface.co/docs/api-inferenceSemantic Scholar API免费获取AI论文摘要、引用、作者信息（覆盖arXiv等）学术导向，完全免费，无需付费https://api.semanticscholar.org/NewsAPI.org全球新闻API，可搜索“AI”“machine learning”等关键词免费层每天100次请求，适合AI新闻监控https://newsapi.org/arXiv OAI-PMH API批量获取arXiv论文元数据和全文（包括AI类别）完全免费，适合研究资料采集https://arxiv.org/help/oa

newsapi.org：fae1e349d73345b2a5b8ead577c69b94

---



**根据您的确认，所有问题已澄清完成，请输入"OK/确认"开始工作。**