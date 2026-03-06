const express = require('express');
const router = express.Router();
const NewsService = require('../services/NewsService');

// ========== 具体路由（必须放在参数路由之前）==========

// 获取最新新闻列表
router.get('/latest', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search } = req.query;
    const news = await NewsService.getLatestNews({
      page: parseInt(page),
      limit: parseInt(limit),
      category,
      search
    });
    res.json({
      success: true,
      data: news,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: news.total || news.length
      }
    });
  } catch (error) {
    console.error('获取最新新闻失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取系统状态 - 必须放在 /:id 之前
router.get('/status', async (req, res) => {
  try {
    const newsCount = await NewsService.getNewsCount();
    const categories = await NewsService.getCategories();
    const lastUpdate = NewsService.getLastUpdateTime();
    const isUsingDemo = newsCount === 0;
    const isUpdating = NewsService.isUpdating || false;

    res.json({
      success: true,
      data: {
        newsCount,
        categories,
        lastUpdate,
        isUsingDemo,
        isUpdating,
        isDemo: isUsingDemo,
        status: isUpdating ? '更新中' : (isUsingDemo ? '演示模式' : '正常运行'),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('获取系统状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取分类列表 - 必须放在 /:id 之前
router.get('/categories', async (req, res) => {
  try {
    const categories = await NewsService.getCategories();
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('获取分类列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 搜索新闻 - 必须放在 /:id 之前
router.get('/search', async (req, res) => {
  try {
    const { 
      q, 
      page = 1, 
      limit = 20,
      category,
      source,
      startDate,
      endDate,
      sortBy = 'publishedAt',
      sortOrder = 'desc'
    } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        error: '搜索关键词不能为空'
      });
    }
    
    const results = await NewsService.advancedSearch(q, {
      page: parseInt(page),
      limit: parseInt(limit),
      category,
      source,
      startDate,
      endDate,
      sortBy,
      sortOrder
    });
    
    res.json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: results.total || results.length
      }
    });
  } catch (error) {
    console.error('搜索新闻失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取所有来源列表 - 必须放在 /:id 之前
router.get('/sources', async (req, res) => {
  try {
    const sources = await NewsService.getSources();
    res.json({
      success: true,
      data: sources
    });
  } catch (error) {
    console.error('获取来源列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取推荐新闻 - 必须放在 /:id 之前
router.get('/recommendations', async (req, res) => {
  try {
    const { userId = 'default', limit = 10 } = req.query;
    const recommendations = await NewsService.getRecommendations(userId, parseInt(limit));
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('获取推荐新闻失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取模拟新闻数据（用于演示）- 必须放在 /:id 之前
router.get('/demo', async (req, res) => {
  try {
    const { page = 1, limit = 10, category } = req.query;

    // 模拟AI新闻数据
    const mockNews = [
      {
        id: 'demo_1',
        title: 'GPT-5即将发布：OpenAI宣布重大突破',
        description: 'OpenAI宣布其下一代语言模型GPT-5在推理能力、多模态处理和代码生成方面实现了革命性突破。该模型预计将在2026年第一季度正式发布，标志着人工智能进入新纪元。',
        url: 'https://example.com/gpt5-announcement',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        category: 'AI新闻',
        source: 'OpenAI官方',
        imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&h=300&fit=crop',
        author: 'OpenAI Team'
      },
      {
        id: 'demo_2',
        title: 'PyTorch 3.0发布：AI开发新标准',
        description: 'PyTorch团队宣布推出PyTorch 3.0，这是一个里程碑版本，引入了全新的动态图优化、自动混合精度训练和分布式训练增强功能。',
        url: 'https://example.com/pytorch3-release',
        publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        category: 'AI框架',
        source: 'PyTorch Foundation',
        imageUrl: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=400&h=300&fit=crop',
        author: 'PyTorch Team'
      },
      {
        id: 'demo_3',
        title: '新型Transformer架构：效率提升300%',
        description: '研究团队提出了一种全新的注意力机制设计，将Transformer模型的计算效率提升了300%，同时保持了模型性能。这一突破性研究将大大降低AI训练成本。',
        url: 'https://example.com/efficient-transformer',
        publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
        category: '新算法',
        source: 'arXiv',
        imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=300&fit=crop',
        author: 'Research Team'
      },
      {
        id: 'demo_4',
        title: '多模态AI：文本、图像、音频统一理解',
        description: '最新研究展示了能够同时处理文本、图像和音频的统一AI模型，在跨模态理解和生成任务中取得了前所未有的性能。',
        url: 'https://example.com/multimodal-ai',
        publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        category: '新思路',
        source: 'Google Research',
        imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=300&fit=crop',
        author: 'Google AI Team'
      },
      {
        id: 'demo_5',
        title: 'AI编程助手Copilot X：支持全栈开发',
        description: 'GitHub发布Copilot X，将AI编程助手的边界扩展到全栈开发，支持前端、后端、数据库设计和部署等整个开发生命周期。',
        url: 'https://example.com/copilot-x',
        publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
        category: '新工具',
        source: 'GitHub',
        imageUrl: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=400&h=300&fit=crop',
        author: 'GitHub Team'
      }
    ];

    let filteredNews = mockNews;

    // 按分类过滤
    if (category && category !== '全部') {
      filteredNews = mockNews.filter(item => item.category === category);
    }

    // 分页
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedNews = filteredNews.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        data: paginatedNews,
        total: filteredNews.length
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredNews.length
      }
    });
  } catch (error) {
    console.error('获取演示数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 手动更新新闻 - 必须放在 /:id 之前
router.post('/update', async (req, res) => {
  try {
    console.log('收到手动更新请求');
    const result = await NewsService.updateAllNews();
    res.json({
      success: true,
      message: '新闻更新完成',
      data: result
    });
  } catch (error) {
    console.error('更新新闻时发生错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== 参数路由（必须放在最后）==========

// 获取新闻详情 - 参数路由必须放在所有具体路由之后
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const news = await NewsService.getNewsById(id);
    if (!news) {
      return res.status(404).json({
        success: false,
        error: '新闻不存在'
      });
    }
    
    res.json({
      success: true,
      data: news
    });
  } catch (error) {
    console.error('获取新闻详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
