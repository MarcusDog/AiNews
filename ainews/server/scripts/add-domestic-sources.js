// 国内 RSS 源批量添加脚本
// 一次性入库，使用 UPSERT 避免重复
const DatabaseService = require('../services/DatabaseService');

const sources = [
  // ===== 国内综合 AI/科技媒体 =====
  { name: '机器之心', url: 'https://www.jiqizhixin.com/rss', category: 'AI新闻' },
  { name: '量子位', url: 'https://www.qbitai.com/feed', category: 'AI新闻' },
  { name: '新智元', url: 'https://www.sohu.com/rss/it_ai.xml', category: 'AI新闻' },
  { name: 'AI科技大本营', url: 'https://ai-blog.csdn.net/rss', category: 'AI新闻' },
  { name: 'AI前线', url: 'https://www.infoq.cn/feed.xml', category: 'AI新闻' },
  { name: '硬地骇客', url: 'https://www.huxiu.com/rss/0.xml', category: 'AI新闻' },
  { name: '36氪 AI', url: 'https://36kr.com/feed', category: 'AI新闻' },

  // ===== 国内大厂 AI 官方 =====
  { name: '百度 AI 官方', url: 'https://ai.baidu.com/blog/rss.xml', category: 'AI新闻' },
  { name: '阿里云 AI 资讯', url: 'https://developer.aliyun.com/feed', category: 'AI新闻' },
  { name: '腾讯云 AI 资讯', url: 'https://cloud.tencent.com/developer/rss', category: 'AI新闻' },
  { name: '华为云 AI 博客', url: 'https://bbs.huaweicloud.com/rss', category: 'AI新闻' },

  // ===== 国内 LLM/AI 模型动态 =====
  { name: '智谱 GLM 官方', url: 'https://www.zhipuai.cn/news/rss', category: 'AI新闻' },
  { name: '月之暗面 Kimi', url: 'https://kimi.moonshot.cn/rss.xml', category: 'AI新闻' },
  { name: '百川智能', url: 'https://www.baichuan-inc.com/rss', category: 'AI新闻' },
  { name: 'MiniMax 官方', url: 'https://www.minimaxi.com/news/rss', category: 'AI新闻' },

  // ===== 国内开源/工程 =====
  { name: '开源中国', url: 'https://www.oschina.net/project/rss', category: '新工具' },
  { name: 'GitCode 热门', url: 'https://gitcode.com/feed', category: '新工具' },
  { name: 'HelloGitHub', url: 'https://hellogithub.com/rss', category: '新工具' },

  // ===== 国内开发者社区 =====
  { name: '掘金 AI 频道', url: 'https://juejin.cn/rss/tag/AI', category: '新思路' },
  { name: '思否 SegmentFault AI', url: 'https://segmentfault.com/feed', category: '新思路' },

  // ===== 国内学术 =====
  { name: 'PaperWeekly', url: 'https://zhuanlan.zhihu.com/paperweekly/rss', category: '新算法' },
  { name: '机器学习与数据分析', url: 'https://datawhalechina.github.io/feed.xml', category: '新算法' },
];

async function add() {
  const db = require('../services/DatabaseService');
  await db.initialize();
  let ok = 0, fail = 0;
  for (const s of sources) {
    try {
      // 兼容签名：(name, url, category, success, errorMessage)
      await db.updateRssSourceStatus(s.name, s.url, s.category, true, null);
      console.log('  ✅', s.name);
      ok++;
    } catch (e) {
      console.log('  ❌', s.name, '→', e.message);
      fail++;
    }
  }
  console.log(`\n汇总: 成功 ${ok} / 失败 ${fail} / 总计 ${sources.length}`);
  await db.close();
}

add().catch(e => { console.error(e); process.exit(1); });