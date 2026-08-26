import React, { useCallback, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Cpu, Layers3, Loader2, Search } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { useRefreshOnVisible } from '../hooks/usePageVisibility';

const VIEWS = [
  { id: 'terms', label: '术语词典', icon: BookOpen },
  { id: 'architectures', label: '模型架构', icon: Cpu },
  { id: 'frameworks', label: '工程框架', icon: Layers3 }
];

const ARCHITECTURES = [
  { id: 'transformer', name: 'Transformer', note: '序列与多模态的主流骨架', summary: '通过注意力机制建模上下文关系，适合并行训练，也是大语言模型和许多多模态模型的核心结构。', strengths: ['长距离上下文', '训练并行度高', '生态成熟'], tradeoffs: ['长序列计算与显存开销较高', '对数据和算力需求大'], uses: '语言模型、视觉 Transformer、多模态理解与生成' },
  { id: 'cnn', name: 'CNN', note: '局部模式与视觉任务', summary: '用卷积核提取局部空间特征，结构稳定、推理高效，在视觉和边缘设备上仍然很实用。', strengths: ['局部归纳偏置强', '参数利用高效', '部署成熟'], tradeoffs: ['全局关系需要更深网络', '通用序列建模能力有限'], uses: '图像分类、检测、工业视觉、端侧推理' },
  { id: 'rnn', name: 'RNN / LSTM', note: '按时间顺序处理状态', summary: '逐步维护隐藏状态，天然适合流式时序信号；LSTM 和 GRU 用门控机制缓解长期依赖问题。', strengths: ['流式处理自然', '小模型成本可控', '适合连续状态'], tradeoffs: ['训练难以充分并行', '超长依赖容易衰减'], uses: '传感器时序、语音流、小型预测系统' },
  { id: 'ssm', name: 'State Space / Mamba', note: '线性复杂度长序列', summary: '把序列建模转为状态空间更新，以更接近线性的成本处理长上下文，是 Transformer 之外的重要路线。', strengths: ['长序列效率高', '推理内存更友好', '适合流式输入'], tradeoffs: ['工具生态较新', '任务适配与可解释性仍在发展'], uses: '长文本、基因序列、音频与连续信号' },
  { id: 'diffusion', name: 'Diffusion / MoE', note: '生成过程与稀疏扩展', summary: 'Diffusion 通过逐步去噪生成内容；MoE 通过路由激活部分专家扩展容量。二者解决的是不同层面的问题。', strengths: ['高质量生成', '模型容量可扩展', '路线组合空间大'], tradeoffs: ['采样或路由更复杂', '训练和部署需要专门优化'], uses: '图像视频生成、稀疏大模型、多模态系统' }
];

const FRAMEWORK_LAYERS = [
  { id: 'training', name: '训练与数值计算', role: '把模型结构变成可以训练的程序，并管理梯度、并行与硬件。', examples: ['PyTorch', 'JAX', 'TensorFlow', 'MindSpore', 'PaddlePaddle'], choose: '需要研究迭代、训练自有模型或控制底层算子时。' },
  { id: 'ecosystem', name: '模型与数据生态', role: '提供预训练模型、数据集、评测和复用接口，减少重复工程。', examples: ['Hugging Face', 'ModelScope', 'OpenMMLab', 'PaddleNLP'], choose: '需要快速找到模型、微调配方或标准评测时。' },
  { id: 'inference', name: '推理与部署', role: '把训练好的模型稳定、低成本地变成线上服务或端侧能力。', examples: ['vLLM', 'TensorRT-LLM', 'ONNX Runtime', 'Triton', 'llama.cpp'], choose: '关注吞吐、延迟、显存、量化和多硬件部署时。' },
  { id: 'application', name: '应用与编排', role: '连接模型、检索、工具和业务流程，管理一次完整任务如何执行。', examples: ['LangChain', 'LlamaIndex', 'Dify', 'Semantic Kernel'], choose: '需要做 RAG、Agent、工作流或产品原型时。' }
];

const GlossaryPage = () => {
  const [view, setView] = useState('terms');
  const [glossary, setGlossary] = useState([]);
  const [totalTerms, setTotalTerms] = useState(0);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [expandedTerms, setExpandedTerms] = useState(new Set());
  const [architectureId, setArchitectureId] = useState(ARCHITECTURES[0].id);
  const [frameworkId, setFrameworkId] = useState(FRAMEWORK_LAYERS[0].id);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.GLOSSARY_CATEGORIES);
      const payload = await response.json();
      if (payload.success) setCategories(['全部', ...payload.data]);
    } catch {
      // 术语列表仍可独立加载。
    }
  }, []);

  const fetchGlossary = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ limit: '1500' });
      if (selectedCategory !== '全部') params.set('category', selectedCategory);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      const response = await fetch(`${API_ENDPOINTS.GLOSSARY}?${params}`);
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || '获取失败');
      setGlossary(payload.data || []);
      setTotalTerms(payload.total || 0);
    } catch (requestError) {
      setError(requestError.message || '知识库加载失败');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory]);

  const loadData = useCallback(() => {
    fetchCategories();
    fetchGlossary();
  }, [fetchCategories, fetchGlossary]);

  useRefreshOnVisible(loadData, selectedCategory);

  const toggleTerm = (termId) => setExpandedTerms((current) => {
    const next = new Set(current);
    if (next.has(termId)) next.delete(termId);
    else next.add(termId);
    return next;
  });

  const architecture = ARCHITECTURES.find((item) => item.id === architectureId);
  const framework = FRAMEWORK_LAYERS.find((item) => item.id === frameworkId);

  return (
    <div className="mx-auto max-w-[1320px] pb-16 text-[#292621]">
      <header className="border-b border-[#bdb3a5] pb-7 pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8c3f30]">AI knowledge desk</p>
        <div className="mt-3 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><h1 className="font-serif text-5xl font-semibold tracking-[-0.035em] sm:text-6xl">AI 知识库</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[#686057]">术语、模型结构和工程工具放在同一个页面里。先选择你要理解的层次，再逐项展开，不需要在几个长页面之间来回跳。</p></div>
          <p className="text-sm text-[#756d63]">收录 {totalTerms.toLocaleString('zh-CN')} 个知识条目</p>
        </div>
      </header>

      <nav className="mt-6 inline-flex max-w-full overflow-x-auto border border-[#cfc5b7] bg-[#f8f4ec] p-1" aria-label="知识库视图">
        {VIEWS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setView(id)} className={`inline-flex h-11 flex-none items-center gap-2 px-5 text-sm font-semibold transition ${view === id ? 'bg-[#28241f] text-white' : 'text-[#655d54] hover:text-[#8c3f30]'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </nav>

      {view === 'terms' && (
        <div className="mt-7 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside>
            <form onSubmit={(event) => { event.preventDefault(); fetchGlossary(); }}>
              <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8176]" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索术语" className="h-11 w-full border border-[#c9c0b3] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#9d4938]" /></label>
            </form>
            <div className="mt-5 border-t border-[#cbc1b4] pt-4"><p className="mb-3 text-xs font-semibold text-[#746c62]">按分类浏览</p><div className="space-y-1">{categories.map((category) => <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`block w-full px-3 py-2 text-left text-sm transition ${selectedCategory === category ? 'bg-[#9d4938] text-white' : 'text-[#5f584f] hover:bg-white'}`}>{category}</button>)}</div></div>
          </aside>
          <div>
            {loading && <div className="flex min-h-72 items-center justify-center text-sm text-[#6f675e]"><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在读取术语</div>}
            {error && !loading && <div className="border-l-2 border-red-600 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" onClick={fetchGlossary} className="ml-3 font-semibold underline">重试</button></div>}
            {!loading && !error && <div className="border-t border-[#bdb3a5]">{glossary.map((term) => <article key={term.id} className="border-b border-[#cec5b8]"><button type="button" onClick={() => toggleTerm(term.id)} className="flex w-full items-center justify-between gap-5 py-5 text-left"><div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="font-serif text-xl font-semibold">{term.term}</h3><span className="text-sm text-[#80776d]">{term.english}</span></div><p className="mt-2 text-xs text-[#8c3f30]">{term.category}{term.level ? ` · ${term.level}` : ''}</p></div>{expandedTerms.has(term.id) ? <ChevronUp className="h-5 w-5 flex-none text-[#82796f]" /> : <ChevronDown className="h-5 w-5 flex-none text-[#82796f]" />}</button>{expandedTerms.has(term.id) && <div className="grid gap-x-8 gap-y-6 pb-7 text-sm leading-7 text-[#5e574f] sm:grid-cols-2"><div className="sm:col-span-2"><p className="mb-1 text-xs font-semibold text-[#8a8176]">完整解释</p><p>{term.definition}</p></div><div><p className="mb-1 text-xs font-semibold text-[#8a8176]">为什么重要</p><p>{term.whyItMatters}</p></div><div><p className="mb-1 text-xs font-semibold text-[#8a8176]">怎么工作</p><p>{term.howItWorks}</p></div>{term.example && <div><p className="mb-1 text-xs font-semibold text-[#8a8176]">例子</p><p>{term.example}</p></div>}<div><p className="mb-1 text-xs font-semibold text-[#8a8176]">局限与误区</p><p>{term.limitations}</p></div>{term.useCases?.length > 0 && <div className="sm:col-span-2"><p className="mb-2 text-xs font-semibold text-[#8a8176]">常见场景</p><div className="flex flex-wrap gap-2">{term.useCases.map((item) => <span key={item} className="border border-[#d2c8ba] bg-[#f8f4ec] px-2.5 py-1 text-xs">{item}</span>)}</div></div>}{term.relatedTerms?.length > 0 && <div className="sm:col-span-2"><p className="mb-1 text-xs font-semibold text-[#8a8176]">继续了解</p><p>{term.relatedTerms.join('、')}</p></div>}</div>}</article>)}{!glossary.length && <p className="py-16 text-center text-sm text-[#746c62]">没有找到匹配的术语。</p>}</div>}
          </div>
        </div>
      )}

      {view === 'architectures' && (
        <div className="mt-7 grid border border-[#c9c0b3] bg-white lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="border-b border-[#c9c0b3] bg-[#ede6da] p-3 lg:border-b-0 lg:border-r">{ARCHITECTURES.map((item) => <button key={item.id} type="button" onClick={() => setArchitectureId(item.id)} className={`block w-full border-b border-[#d2c8ba] px-4 py-4 text-left transition last:border-b-0 ${item.id === architectureId ? 'bg-[#28241f] text-white' : 'hover:bg-white/70'}`}><span className="block font-serif text-lg font-semibold">{item.name}</span><span className={`mt-1 block text-xs ${item.id === architectureId ? 'text-white/55' : 'text-[#776e64]'}`}>{item.note}</span></button>)}</div>
          <article className="p-6 sm:p-10 lg:p-12"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c3f30]">模型架构</p><h2 className="mt-3 font-serif text-4xl font-semibold">{architecture.name}</h2><p className="mt-5 max-w-3xl text-base leading-8 text-[#5f584f]">{architecture.summary}</p><div className="mt-9 grid gap-7 md:grid-cols-3"><div><h3 className="text-sm font-semibold">擅长</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-[#6b635a]">{architecture.strengths.map((item) => <li key={item}>— {item}</li>)}</ul></div><div><h3 className="text-sm font-semibold">代价</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-[#6b635a]">{architecture.tradeoffs.map((item) => <li key={item}>— {item}</li>)}</ul></div><div><h3 className="text-sm font-semibold">常见用途</h3><p className="mt-3 text-sm leading-6 text-[#6b635a]">{architecture.uses}</p></div></div></article>
        </div>
      )}

      {view === 'frameworks' && (
        <div className="mt-7">
          <div className="grid gap-px bg-[#c9c0b3] sm:grid-cols-2 lg:grid-cols-4">{FRAMEWORK_LAYERS.map((item, index) => <button key={item.id} type="button" onClick={() => setFrameworkId(item.id)} className={`min-h-28 p-5 text-left transition ${item.id === frameworkId ? 'bg-[#28241f] text-white' : 'bg-[#f8f4ec] hover:bg-white'}`}><span className={`text-xs font-mono ${item.id === frameworkId ? 'text-[#e0a18f]' : 'text-[#9d4938]'}`}>0{index + 1}</span><span className="mt-3 block font-serif text-lg font-semibold">{item.name}</span></button>)}</div>
          <article className="border-x border-b border-[#c9c0b3] bg-white p-6 sm:p-10"><div className="grid gap-8 lg:grid-cols-[1fr_0.8fr]"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c3f30]">这一层负责什么</p><h2 className="mt-3 font-serif text-3xl font-semibold">{framework.name}</h2><p className="mt-4 text-base leading-8 text-[#5f584f]">{framework.role}</p><p className="mt-5 border-l-2 border-[#9d4938] pl-4 text-sm leading-7 text-[#665e55]"><strong>什么时候选：</strong>{framework.choose}</p></div><div><p className="text-xs font-semibold text-[#776e64]">常见工具</p><div className="mt-3 flex flex-wrap gap-2">{framework.examples.map((item) => <span key={item} className="border border-[#d2c8ba] bg-[#f8f4ec] px-3 py-2 text-sm font-semibold">{item}</span>)}</div></div></div></article>
        </div>
      )}
    </div>
  );
};

export default GlossaryPage;
