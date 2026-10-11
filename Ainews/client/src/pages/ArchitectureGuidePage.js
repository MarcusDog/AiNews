import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Brain,
  Layers3,
  Network,
  Rocket,
  Scale,
  Sigma,
  Workflow,
  ArrowRight,
  Check,
  X,
  ChevronDown,
  Zap,
  Cpu,
  Database,
  Boxes
} from 'lucide-react';

const architectureFamilies = [
  {
    name: 'Transformer',
    badge: '主流基础设施',
    icon: Network,
    accent: '#3b82f6',
    summary: '靠自注意力一次性建立全局上下文，是大模型时代的默认骨架。',
    strengths: ['长上下文建模强', '易于并行训练', '生态最成熟'],
    tradeoffs: ['推理显存开销高', '长序列成本随上下文上升', '需配套 KV Cache 与并行'],
    scores: { 全局依赖: 95, 并行训练: 90, 长序列效率: 50, 部署成本: 40, 生态成熟: 98 },
    fit: '通用大语言模型、多模态主干、代码模型、长文档理解',
    detail:
      '核心价值不是"更聪明"，而是更擅长在任意两个 token 之间直接建立关系。训练端容易大规模并行，推理端则需围绕 KV Cache、量化、Paged Attention 和批处理做大量工程优化。',
  },
  {
    name: 'CNN',
    badge: '局部归纳偏置',
    icon: Boxes,
    accent: '#10b981',
    summary: '用卷积核提取局部结构，参数共享强，擅长空间模式识别。',
    strengths: ['图像特征提取稳定', '参数利用率高', '边缘部署成熟'],
    tradeoffs: ['长距离依赖弱', '任务迁移灵活性有限'],
    scores: { 全局依赖: 40, 并行训练: 80, 长序列效率: 70, 部署成本: 90, 生态成熟: 85 },
    fit: '图像分类、检测、分割、工业视觉、轻量端侧推理',
    detail:
      'CNN 的价值在于把"局部平移不变性"写进模型先验。对规则明确、分布稳定的视觉任务，它往往仍比"大一统模型"更便宜、更稳、更易解释。',
  },
  {
    name: 'RNN / LSTM',
    badge: '时序递归建模',
    icon: Sigma,
    accent: '#f59e0b',
    summary: '按时间步逐步更新隐藏状态，天然适合流式处理和低延迟时序任务。',
    strengths: ['流式输入自然', '状态量小', '资源受限场景仍有价值'],
    tradeoffs: ['并行度低', '长依赖易衰减', '训练效率不如 Transformer'],
    scores: { 全局依赖: 55, 并行训练: 30, 长序列效率: 60, 部署成本: 85, 生态成熟: 70 },
    fit: '语音片段流处理、传感器时序、传统预测系统',
    detail:
      '它不是"过时模型"，而是更适合输入逐帧到来、上下文窗口不大、延迟预算极紧的场景。若系统重视稳定的在线状态更新，RNN 仍然可用。',
  },
  {
    name: 'State Space / Mamba',
    badge: '长序列新路线',
    icon: Zap,
    accent: '#8b5cf6',
    summary: '尝试以更线性的方式处理长序列，目标是兼顾长上下文与更优吞吐。',
    strengths: ['长序列推理潜力大', '理论上更省内存', '适合序列扫描'],
    tradeoffs: ['生态仍在成熟', '工具链不如 Transformer 完整', '泛化看实现'],
    scores: { 全局依赖: 75, 并行训练: 70, 长序列效率: 92, 部署成本: 75, 生态成熟: 45 },
    fit: '超长日志、DNA 序列、流式信号、超长上下文探索',
    detail:
      '这一类架构最值得关注的不是概念新，而是它在工程账本上的可能优势。如果你的瓶颈是长序列成本而不是通用生态，State Space 模型值得继续跟进。',
  },
  {
    name: 'Diffusion / MoE',
    badge: '专用能力增强',
    icon: Layers3,
    accent: '#ec4899',
    summary: '前者擅长生成连续信号，后者擅长在固定算力内扩张参数容量。',
    strengths: ['Diffusion 图像视频质量强', 'MoE 可扩大容量', '便于按任务分工'],
    tradeoffs: ['Diffusion 采样慢', 'MoE 路由复杂', '训练与服务链路更重'],
    scores: { 全局依赖: 70, 并行训练: 65, 长序列效率: 60, 部署成本: 50, 生态成熟: 60 },
    fit: '文生图、视频生成、大规模专家模型、任务分工明显的系统',
    detail:
      '这两类不应混成"更高级模型"。Diffusion 解决连续生成质量，MoE 解决参数容量与计算预算的矛盾。它们都更像策略组件，而不是默认底座。',
  },
];

const lifecycleLayers = [
  {
    phase: '训练层',
    title: 'PyTorch / TensorFlow / JAX',
    icon: Cpu,
    accent: '#10b981',
    description: '定义模型、执行训练、分布式并行和自动微分的底层训练框架。决定研发习惯、调试方式和大规模训练路径。',
  },
  {
    phase: '模型生态层',
    title: 'Transformers / timm / Diffusers / Lightning',
    icon: Boxes,
    accent: '#3b82f6',
    description: '复用现成模型、Trainer、权重格式和微调套路的中间层。大多数团队不从零造轮子，而是靠这一层提速。',
  },
  {
    phase: '推理服务层',
    title: 'vLLM / TensorRT-LLM / ONNX Runtime / TGI',
    icon: Zap,
    accent: '#f59e0b',
    description: '只关心"如何更快、更省显存、更稳地把模型跑起来"。训练框架选型正确，不代表线上吞吐就高。',
  },
  {
    phase: '应用编排层',
    title: 'LangGraph / DSPy / LlamaIndex / 自研工作流',
    icon: Workflow,
    accent: '#8b5cf6',
    description: '负责多步调用、工具接入、记忆、路由和评估闭环。它不是模型框架，而是把模型变成产品能力的流程层。',
  },
];

const frameworkTable = [
  {
    name: 'PyTorch',
    role: '研究到产品的默认训练框架',
    strengths: '动态图直接，社区最大，调试成本最低，Hugging Face 生态配合最好',
    caution: '超大规模训练通常还要叠加 DeepSpeed、FSDP、Megatron',
    bestFor: '大多数创业团队、应用团队、模型迭代快的研发组织',
    tag: '训练',
  },
  {
    name: 'TensorFlow / Keras',
    role: '成熟工业栈与部分历史系统',
    strengths: '部署工具链广，历史存量大，部分企业流程仍围绕它搭建',
    caution: '前沿大模型生态明显弱于 PyTorch',
    bestFor: '已有 TensorFlow 资产、移动端和既有生产系统迁移成本高的团队',
    tag: '训练',
  },
  {
    name: 'JAX / Flax',
    role: '高性能数值计算与大规模训练研究',
    strengths: 'XLA 编译、函数式风格、在 TPU 和部分大规模研究训练中突出',
    caution: '上手门槛高，团队协作和招聘面相对窄',
    bestFor: '研究型团队、追求极限训练效率、具备强基础设施能力的组织',
    tag: '训练',
  },
  {
    name: 'vLLM',
    role: 'LLM 推理服务引擎',
    strengths: 'Paged Attention、批量吞吐高、OpenAI 兼容服务能力成熟',
    caution: '它不负责训练，也不替你解决业务链路设计',
    bestFor: '要把大语言模型稳定变成线上接口的产品团队',
    tag: '推理',
  },
];

const decisionChecklist = [
  {
    title: '先问任务结构',
    icon: Sigma,
    body: '输入是文本、图像、视频还是时序信号？是单轮分类，还是长链路生成？如果任务结构都没定清，谈"最先进架构"只会空转。',
  },
  {
    title: '再问工程账本',
    icon: Scale,
    body: '训练预算、推理显存、响应时延、并发规模要一起算。很多方案论文里更强，但一上线就被显存和吞吐打回去。',
  },
  {
    title: '最后问组织能力',
    icon: Cpu,
    body: '团队熟悉 PyTorch 还是 TensorFlow？有没有服务化经验、评估体系和 GPU 调度能力？架构选择本质上也是组织选择。',
  },
];

const deliverySteps = [
  { label: '1. 模型主干', text: '确定 Transformer、视觉骨干、扩散模型还是其他结构，先决定"信息如何在模型内部流动"。', icon: Network, accent: '#3b82f6' },
  { label: '2. 训练框架', text: '确定用 PyTorch、TensorFlow 或 JAX 管训练、微调、实验和分布式作业。', icon: Cpu, accent: '#10b981' },
  { label: '3. 推理引擎', text: '为线上吞吐和时延选择 vLLM、TensorRT-LLM、ONNX Runtime 等，不要把训练工具错当服务层。', icon: Zap, accent: '#f59e0b' },
  { label: '4. 产品流程', text: '再决定是否需要 Agent 工作流、RAG、记忆、评估与反馈闭环，把模型真正接进网站功能。', icon: Workflow, accent: '#8b5cf6' },
];

const architectureFlow = [
  { title: '输入表示', body: '文本切成 token，图像切成 patch，语音变成声学特征。模型接收统一的数值表示，而非"句子"或"图片"。', icon: Database, accent: '#3b82f6' },
  { title: '上下文混合', body: 'Transformer 用注意力做全局混合，CNN 用局部卷积做空间提取，State Space 尝试用更线性的状态更新保留长依赖。', icon: Network, accent: '#10b981' },
  { title: '中间表征', body: '经过多层堆叠后形成更高层语义表征。这阶段决定它能否把局部模式变成跨句、跨模态、跨时间的理解。', icon: Brain, accent: '#8b5cf6' },
  { title: '任务头输出', body: '最后接分类头、生成头、检测头或策略头。很多"能力差异"不是底座不同，而是最后输出结构和训练目标不同。', icon: Rocket, accent: '#f59e0b' },
];

const foldableTerms = [
  {
    term: 'Attention / 自注意力',
    explain: '让每个 token 在计算时都能查看其他 token 的信息，因此模型可以直接建立远距离依赖。这是 Transformer 能处理长文本和复杂关系的关键。',
    why: '如果你页面里提 Transformer，却不解释 attention，读者很难理解它为什么替代了很多传统序列模型。'
  },
  {
    term: 'KV Cache',
    explain: '在推理时缓存历史 token 的 key/value，避免每次生成新 token 都把前文完整重算。',
    why: '它直接决定 LLM 在线服务的延迟和显存账本，是"训练会了"到"线上跑得动"之间最重要的工程桥梁之一。'
  },
  {
    term: 'Context Window / 上下文窗口',
    explain: '模型一次最多能读取和利用的上下文长度。窗口越大，不代表一定越聪明，只代表它有机会参考更多历史信息。',
    why: '很多公开页面把长上下文写成绝对优势，但真正的成本会落在显存、吞吐和注意力复杂度上。'
  },
  {
    term: 'MoE / Mixture of Experts',
    explain: '让不同输入只激活部分专家网络，用更少的实时计算换取更大的总参数规模。',
    why: '它解释了为什么一些模型参数量极大，但单次推理的实际激活成本并没有等比例上升。'
  },
  {
    term: 'Quantization / 量化',
    explain: '把模型权重从更高精度压缩到更低精度表示，比如从 FP16 到 INT8 / INT4，以换取更低显存占用和更高吞吐。',
    why: '公开网站如果面向工程读者，量化是必须提的，因为很多产品能不能上线，靠的不是训练，而是量化后能否装进预算内的卡。'
  },
  {
    term: 'Fine-tuning / 微调',
    explain: '在基础模型上继续训练，让它适应特定数据、任务或风格。它和 RAG 不同，前者修改参数，后者主要补上下文。',
    why: '很多读者会把"给模型更多资料"和"改模型本身"混为一谈，这里需要明确拆开。'
  }
];

// ============ 可视化 SVG 组件 ============

// 信息流图：4 阶段横向连接
const FlowDiagram = () => (
  <svg viewBox="0 0 680 200" className="w-full h-auto" role="img" aria-label="模型信息流图">
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
        <path d="M0,0 L10,4 L0,8 Z" fill="#94a3b8" />
      </marker>
      <linearGradient id="flowBg" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor="#eff6ff" />
        <stop offset="100%" stopColor="#faf5ff" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="680" height="200" rx="16" fill="url(#flowBg)" />
    {architectureFlow.map((step, i) => {
      const x = 20 + i * 165;
      const y = 30;
      return (
        <g key={step.title}>
          <rect x={x} y={y} width="140" height="140" rx="12" fill="#ffffff" stroke={step.accent} strokeWidth="2" />
          <circle cx={x + 70} cy={y + 30} r="14" fill={step.accent} opacity="0.15" />
          <text x={x + 70} y={y + 35} textAnchor="middle" fontSize="13" fontWeight="700" fill={step.accent}>{i + 1}</text>
          <text x={x + 70} y={y + 66} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">{step.title}</text>
          {i < architectureFlow.length - 1 && (
            <line x1={x + 140} y1={y + 70} x2={x + 165} y2={y + 70} stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrowhead)" />
          )}
        </g>
      );
    })}
  </svg>
);

// 架构能力雷达对比（简化为分组柱状）
const ScoreBars = ({ family }) => {
  const entries = Object.entries(family.scores);
  const max = 100;
  return (
    <div className="mt-4 space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3">
          <span className="w-24 text-xs text-slate-500 shrink-0">{k}</span>
          <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(v / max) * 100}%`, backgroundColor: family.accent }} />
          </div>
          <span className="w-8 text-right text-xs font-semibold text-slate-700">{v}</span>
        </div>
      ))}
    </div>
  );
};

// 技术栈分层图（自下而上堆叠）
const StackDiagram = () => (
  <svg viewBox="0 0 680 260" className="w-full h-auto" role="img" aria-label="技术栈分层图">
    <defs>
      <linearGradient id="layerGrad" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#f8fafc" />
      </linearGradient>
    </defs>
    {lifecycleLayers.map((layer, i) => {
      const y = 20 + i * 58;
      return (
        <g key={layer.phase}>
          <rect x="40" y={y} width="600" height="46" rx="10" fill="url(#layerGrad)" stroke={layer.accent} strokeWidth="1.5" />
          <rect x="40" y={y} width="8" height="46" rx="4" fill={layer.accent} />
          <text x="70" y={y + 28} fontSize="13" fontWeight="700" fill="#0f172a">{layer.phase}</text>
          <text x="180" y={y + 28} fontSize="12" fill="#475569">{layer.title}</text>
          {i < lifecycleLayers.length - 1 && (
            <line x1="70" y1={y + 46} x2="70" y2={y + 58} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="3 3" />
          )}
        </g>
      );
    })}
    <text x="340" y="14" textAnchor="middle" fontSize="11" fill="#94a3b8">自下而上：从训练到产品</text>
  </svg>
);

const ArchitectureGuidePage = () => {
  const [openTerm, setOpenTerm] = useState(null);

  return (
    <div className="mx-auto max-w-7xl pb-16">
      {/* Hero */}
      <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_22%),linear-gradient(135deg,_#09111f_0%,_#11263e_46%,_#10404f_100%)] px-6 py-8 text-white shadow-[0_28px_90px_rgba(15,23,42,0.18)] sm:px-8 lg:px-10 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_340px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-200">
              Architecture Field Manual
            </div>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
              AI模型架构与算法框架详解
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200 sm:text-lg">
              这页不是"术语拼盘"，而是一份给公开网站读者看的判断手册。它把模型内部结构、训练框架、推理引擎和应用编排拆开讲，
              配以可视化图示，让读者知道为什么选某条路线，而不是只看到一堆看似高级的名字。
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/glossary"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-slate-950"
              >
                <ArrowLeft className="h-4 w-4" />
                返回 AI 知识库
              </Link>
              <a
                href="#framework-stack"
                className="inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-300/10 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-300/20"
              >
                <Workflow className="h-4 w-4" />
                直接看工程框架选择
              </a>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[26px] border border-white/12 bg-white/10 p-5 backdrop-blur">
              <div className="text-xs uppercase tracking-[0.28em] text-sky-100/80">核心目标</div>
              <div className="mt-3 text-2xl font-semibold">把"模型"和"框架"分清楚</div>
              <p className="mt-2 text-sm leading-7 text-slate-200">
                模型架构回答"信息怎么流"，框架回答"模型怎么训、怎么跑、怎么接进产品"。这两个层次混在一起，是很多 AI 页面看起来空泛的根源。
              </p>
            </div>
            <div className="rounded-[26px] border border-white/12 bg-white/10 p-5 backdrop-blur">
              <div className="text-xs uppercase tracking-[0.28em] text-amber-100/80">适合谁看</div>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                产品经理用它建立判断标准，工程师用它拆训练与服务栈，研究者用它对齐面向公众的解释口径。
              </p>
            </div>
            <div className="rounded-[26px] border border-white/12 bg-white/10 p-5 backdrop-blur">
              <div className="text-xs uppercase tracking-[0.28em] text-emerald-100/80">可视化要点</div>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                每个架构都配能力评分图，每层栈都配分层图，让你一眼看出强弱，而不是只看文字描述。
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* 信息流图 + 卡片 */}
          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_16px_60px_rgba(15,23,42,0.07)] sm:p-8">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">
              <Network className="h-4 w-4" />
              图示结构图
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              用一张信息流图，把模型内部过程真正讲清楚
            </h2>
            <p className="mt-4 max-w-4xl text-base leading-8 text-slate-600">
              下面这张图不是数学公式，而是给公开网站读者看的结构图。它说明模型从输入到输出经过哪些阶段，也解释了为什么"同样叫 AI 模型"，不同架构的强项完全不同。
            </p>

            <div className="mt-8 rounded-[20px] border border-slate-200 p-4 bg-slate-50/50">
              <FlowDiagram />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-4">
              {architectureFlow.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="relative rounded-[20px] border border-slate-200 bg-white p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Step {index + 1}</span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${step.accent}1a` }}>
                        <Icon className="h-4 w-4" style={{ color: step.accent }} />
                      </div>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-slate-950">{step.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{step.body}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 架构家族 + 能力评分图 */}
          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_16px_60px_rgba(15,23,42,0.07)] sm:p-8">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
              <Brain className="h-4 w-4" />
              架构判断图
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              先看模型如何处理信息，再谈它是否"先进"
            </h2>
            <p className="mt-4 max-w-4xl text-base leading-8 text-slate-600">
              一个模型架构最核心的问题只有三个：如何接收上下文、如何保留状态、如何在计算预算内提取关键信息。
              真正的选择往往不是"哪个好"，而是你的任务更需要全局依赖、局部归纳偏置、长序列吞吐，还是生成质量。每个架构下方的能力评分图一眼看出强弱。
            </p>

            <div className="mt-8 grid gap-4 xl:grid-cols-2">
              {architectureFamilies.map((family) => {
                const Icon = family.icon;
                return (
                  <article
                    key={family.name}
                    className="rounded-[26px] border border-slate-200 bg-white p-6"
                    style={{ borderTopColor: family.accent, borderTopWidth: 3 }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${family.accent}1a` }}>
                          <Icon className="h-5 w-5" style={{ color: family.accent }} />
                        </div>
                        <h3 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                          {family.name}
                        </h3>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                        {family.badge}
                      </span>
                    </div>
                    <p className="mt-3 text-base leading-7 text-slate-700">{family.summary}</p>

                    {/* 能力评分可视化 */}
                    <ScoreBars family={family} />

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                          <Check className="h-3.5 w-3.5" /> 优势
                        </div>
                        <ul className="mt-2 space-y-1.5 text-sm leading-7 text-slate-600">
                          {family.strengths.map((item) => (
                            <li key={item} className="flex items-start gap-1.5">
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
                          <X className="h-3.5 w-3.5" /> 代价
                        </div>
                        <ul className="mt-2 space-y-1.5 text-sm leading-7 text-slate-600">
                          {family.tradeoffs.map((item) => (
                            <li key={item} className="flex items-start gap-1.5">
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600">
                      <span className="font-semibold text-slate-950">典型适配场景：</span>
                      {family.fit}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* 工程栈分层图 */}
          <section
            id="framework-stack"
            className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_16px_60px_rgba(15,23,42,0.07)] sm:p-8"
          >
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
              <Layers3 className="h-4 w-4" />
              工程栈拆解
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              框架不止一层，训练、推理、编排必须拆开理解
            </h2>
            <p className="mt-4 max-w-4xl text-base leading-8 text-slate-600">
              很多网站把 PyTorch、Transformers、vLLM、LangChain 都写成"AI 框架"，结果读者根本分不清谁负责训练，谁负责推理，谁负责业务流程。正确的解释方式应该按生命周期展开。
            </p>

            {/* 分层图 */}
            <div className="mt-8 rounded-[20px] border border-slate-200 p-4 bg-slate-50/50">
              <StackDiagram />
            </div>

            {/* 分层卡片 */}
            <div className="mt-6 space-y-3">
              {lifecycleLayers.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.phase}
                    className="grid gap-4 rounded-[20px] border border-slate-200 bg-white p-5 md:grid-cols-[140px_minmax(0,1fr)]"
                    style={{ borderLeftColor: item.accent, borderLeftWidth: 3 }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${item.accent}1a` }}>
                        <Icon className="h-4 w-4" style={{ color: item.accent }} />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: item.accent }}>
                        {item.phase}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 框架对比卡片 */}
            <h3 className="mt-8 text-xl font-semibold text-slate-950">主流框架速查</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {frameworkTable.map((row) => (
                <div key={row.name} className="rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,_#fff_0%,_#f8fafc_100%)] p-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold text-slate-950">{row.name}</h4>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${row.tag === '训练' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {row.tag}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-700">{row.role}</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="text-slate-600">{row.strengths}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <X className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span className="text-slate-600">{row.caution}</span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">适合：</span>{row.bestFor}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 上线决策时间线 */}
          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_16px_60px_rgba(15,23,42,0.07)] sm:p-8">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-violet-700">
              <Rocket className="h-4 w-4" />
              上线决策顺序
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              真正做公开站点时，应该按这四步做选择
            </h2>
            <div className="mt-8 relative">
              {/* 连接线 */}
              <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gradient-to-b from-blue-300 via-emerald-300 via-amber-300 to-violet-300 hidden sm:block" />
              <div className="space-y-4">
                {deliverySteps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.label} className="relative flex gap-4 rounded-[20px] border border-slate-200 bg-white p-5 sm:pl-14">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 hidden sm:flex h-9 w-9 items-center justify-center rounded-full border-2 border-white shadow-md" style={{ backgroundColor: step.accent }}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: step.accent }}>
                          {step.label}
                        </div>
                        <p className="mt-2 text-base leading-8 text-slate-700">{step.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 折叠术语 */}
          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_16px_60px_rgba(15,23,42,0.07)] sm:p-8">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-700">
              <Layers3 className="h-4 w-4" />
              折叠术语解释
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              读者真正会卡住的术语，应该能展开看详细解释
            </h2>
            <p className="mt-4 max-w-4xl text-base leading-8 text-slate-600">
              公开网站不适合把所有解释一次性摊平。更好的方式是把高频术语做成可折叠结构，让第一次阅读的人先过主线，想深入时再展开细节。
            </p>

            <div className="mt-8 space-y-3">
              {foldableTerms.map((item, idx) => {
                const isOpen = openTerm === idx;
                return (
                  <div
                    key={item.term}
                    className="rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] overflow-hidden"
                  >
                    <button
                      onClick={() => setOpenTerm(isOpen ? null : idx)}
                      className="w-full cursor-pointer text-left p-5 flex items-center justify-between gap-4"
                    >
                      <span className="text-lg font-semibold text-slate-950">{item.term}</span>
                      <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 space-y-3 text-sm leading-8 text-slate-600 border-t border-slate-100 pt-4">
                        <p>{item.explain}</p>
                        <p>
                          <span className="font-semibold text-slate-950">为什么这项术语值得单独解释：</span>
                          {item.why}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-[#f6f2e8] p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-700">
              <Scale className="h-4 w-4" />
              三条判断线
            </div>
            <div className="mt-5 space-y-4">
              {decisionChecklist.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-slate-500" />
                      <h3 className="text-base font-semibold text-slate-950">{item.title}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-700">
              <Sigma className="h-4 w-4" />
              页面要传达的边界
            </div>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
              <li className="flex items-start gap-2"><ArrowRight className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" /> Transformer 是架构，不是训练框架。</li>
              <li className="flex items-start gap-2"><ArrowRight className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" /> PyTorch 是训练框架，不是线上吞吐优化器。</li>
              <li className="flex items-start gap-2"><ArrowRight className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" /> vLLM 是推理引擎，不负责你的业务流程设计。</li>
              <li className="flex items-start gap-2"><ArrowRight className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" /> LangGraph 这类工具是编排层，不是模型本身。</li>
            </ul>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_#09111f_0%,_#13253d_100%)] p-6 text-white shadow-[0_14px_40px_rgba(15,23,42,0.12)]">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-sky-100">
              <Network className="h-4 w-4" />
              写给公开网站的建议
            </div>
            <p className="mt-4 text-sm leading-8 text-slate-200">
              公众页面最怕两件事：第一，所有概念都只写一句漂亮话；第二，把训练、推理、应用编排混成一层。这页已改成"能让人做判断"的结构，配可视化图示，而不是"看上去像 AI 页面"的结构。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default ArchitectureGuidePage;
