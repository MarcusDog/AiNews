// 为模型架构和算法框架术语添加详细内容的补丁
// 这个文件用于在前端动态加载详细内容

const detailedGlossary = {
  '神经网络': {
    detail: '神经网络是深度学习的基础，由输入层、隐藏层和输出层组成。每层包含多个神经元，神经元之间通过权重连接。数据从输入层流入，经过隐藏层的非线性变换，最终从输出层得到预测结果。',
    workflow: '输入数据 -> 加权求和 -> 激活函数 -> 输出传递 -> 反向传播 -> 权重更新',
    steps: [
      {
        title: '输入层接收数据',
        description: '原始数据（如图像像素、文本编码）进入网络的第一层',
        formula: 'x = [x₁, x₂, x₃, ..., xₙ]'
      },
      {
        title: '加权求和',
        description: '每个神经元将输入与权重相乘后求和，加上偏置项',
        formula: 'z = Σ(wᵢ × xᵢ) + b'
      },
      {
        title: '激活函数',
        description: '通过非线性函数引入非线性，使网络能学习复杂模式',
        formula: 'a = σ(z) = 1 / (1 + e^(-z))'
      },
      {
        title: '前向传播',
        description: '数据逐层传递，直到输出层产生预测结果'
      },
      {
        title: '计算损失',
        description: '比较预测结果与真实值的差异',
        formula: 'Loss = Σ(y_pred - y_true)² / 2'
      },
      {
        title: '反向传播',
        description: '计算梯度，将误差从输出层传回输入层',
        formula: '∂L/∂w = ∂L/∂a × ∂a/∂z × ∂z/∂w'
      },
      {
        title: '权重更新',
        description: '使用梯度下降优化权重',
        formula: 'w_new = w_old - α × ∂L/∂w'
      }
    ],
    keyFeatures: [
      '非线性映射能力：能学习任意复杂函数',
      '并行计算：可高效利用GPU加速',
      '自适应学习：自动调整参数优化性能',
      '容错性：部分神经元损坏仍能工作',
      '泛化能力：能处理未见过的数据'
    ],
    visualization: '神经网络结构：输入层神经元 -> 隐藏层神经元(加权求和+激活) -> 输出层神经元'
  },
  
  'Transformer': {
    detail: 'Transformer是2017年Google提出的革命性架构，完全基于注意力机制，摒弃了RNN和CNN。它由编码器和解码器组成，通过多头自注意力机制捕捉全局依赖关系，实现了高度并行化训练。',
    workflow: '输入嵌入 -> 位置编码 -> 多头自注意力 -> 残差连接&层归一化 -> 前馈网络 -> 残差连接&层归一化 -> 输出',
    steps: [
      {
        title: '输入嵌入 (Input Embedding)',
        description: '将输入词汇转换为高维向量表示',
        formula: 'E = Embedding(x)'
      },
      {
        title: '位置编码 (Positional Encoding)',
        description: '为序列添加位置信息，使用正弦和余弦函数',
        formula: 'PE(pos, 2i) = sin(pos / 10000^(2i/d_model))'
      },
      {
        title: '多头自注意力 (Multi-Head Self-Attention)',
        description: '核心机制！让序列中每个位置都能关注到其他所有位置',
        formula: 'Attention(Q,K,V) = softmax(QK^T / √d_k) × V'
      },
      {
        title: '残差连接与层归一化',
        description: '稳定训练，帮助梯度流动',
        formula: 'LayerNorm(x + Sublayer(x))'
      },
      {
        title: '前馈神经网络 (Feed Forward)',
        description: '每个位置独立应用相同的全连接网络',
        formula: 'FFN(x) = max(0, xW₁ + b₁)W₂ + b₂'
      },
      {
        title: '编码器-解码器结构',
        description: '编码器处理输入，解码器生成输出'
      }
    ],
    keyFeatures: [
      '自注意力机制：直接建模任意位置间的关系',
      '并行计算：不同于RNN的顺序处理，可高度并行',
      '长距离依赖：能捕捉远距离的语义关系',
      '可扩展性：容易扩展到超大规模'
    ],
    visualization: 'Transformer: 输入 -> 编码器(自注意力+前馈)×N -> 解码器(掩码自注意力+交叉注意力+前馈)×N -> 输出'
  },
  
  '卷积神经网络 (CNN)': {
    detail: 'CNN是计算机视觉的基石，通过卷积操作提取图像的局部特征。它利用局部连接和权重共享减少参数量，通过池化降低维度，层次化地学习从简单到复杂的特征。',
    workflow: '输入图像 -> 卷积层 -> 激活函数 -> 池化层 -> (重复卷积-激活-池化) -> 展平 -> 全连接层 -> Softmax -> 输出',
    steps: [
      {
        title: '卷积操作',
        description: '使用卷积核在图像上滑动，提取局部特征',
        formula: '输出[i,j] = Σ Σ 输入[i+m, j+n] × 卷积核[m, n]'
      },
      {
        title: '特征图生成',
        description: '多个卷积核产生多个特征图，每个检测不同特征'
      },
      {
        title: '激活函数',
        description: '引入非线性',
        formula: 'ReLU(x) = max(0, x)'
      },
      {
        title: '池化层',
        description: '降维，保留主要特征'
      },
      {
        title: '层次化特征学习',
        description: '浅层学习简单特征，深层学习复杂组合'
      },
      {
        title: '全连接层',
        description: '将特征展平后进行分类'
      }
    ],
    keyFeatures: [
      '局部连接：每个神经元只连接局部区域',
      '权重共享：同一卷积核在整个输入上共享权重',
      '平移不变性：物体位置变化仍能识别',
      '层次化特征：自动学习从简单到复杂的特征'
    ],
    visualization: 'CNN: 输入(28×28) -> Conv(32通道) -> Pool -> Conv(64通道) -> Pool -> Flatten -> FC -> Softmax -> 输出(10类)'
  },
  
  '循环神经网络 (RNN)': {
    detail: 'RNN通过循环连接将隐藏状态传递到下一个时间步，从而具有记忆能力。它适合处理变长序列，但存在梯度消失问题，难以捕捉长期依赖。',
    workflow: '输入序列 -> 时间步1(隐藏状态初始化) -> 时间步2(传递隐藏状态) -> ... -> 时间步N -> 输出',
    steps: [
      {
        title: '循环结构',
        description: '当前时刻的输出依赖当前输入和前一时刻的隐藏状态',
        formula: 'h_t = tanh(W_hh × h_{t-1} + W_xh × x_t + b)'
      },
      {
        title: '前向传播',
        description: '依次处理序列中的每个元素',
        formula: 'h_t = σ(W · [h_{t-1}, x_t] + b)'
      },
      {
        title: '反向传播(BPTT)',
        description: '通过时间反向传播算法计算梯度'
      },
      {
        title: '梯度问题',
        description: '长期依赖导致梯度消失或爆炸'
      }
    ],
    keyFeatures: [
      '记忆能力：能记住序列历史信息',
      '变长输入：可处理不同长度的序列',
      '参数共享：同一参数应用到所有时间步'
    ],
    visualization: 'RNN循环结构：x_t和h_{t-1}输入 -> 计算h_t -> 输出h_t并传递给下一时刻'
  },
  
  'LSTM': {
    detail: 'LSTM通过门控机制控制信息的流动，包括遗忘门、输入门和输出门。它可以学习长期依赖关系，是序列建模的重要工具。',
    workflow: '输入x_t -> 遗忘门 -> 输入门 -> 细胞状态更新 -> 输出门 -> 隐藏状态h_t',
    steps: [
      {
        title: '遗忘门(Forget Gate)',
        description: '决定从细胞状态中丢弃哪些信息',
        formula: 'f_t = σ(W_f · [h_{t-1}, x_t] + b_f)'
      },
      {
        title: '输入门(Input Gate)',
        description: '决定哪些新信息存储到细胞状态中',
        formula: 'i_t = σ(W_i · [h_{t-1}, x_t] + b_i)'
      },
      {
        title: '更新细胞状态',
        description: '结合遗忘门和输入门的结果更新细胞状态',
        formula: 'C_t = f_t × C_{t-1} + i_t × C_tilde'
      },
      {
        title: '输出门(Output Gate)',
        description: '决定输出什么值',
        formula: 'o_t = σ(W_o · [h_{t-1}, x_t] + b_o), h_t = o_t × tanh(C_t)'
      }
    ],
    keyFeatures: [
      '门控机制：三个门控制信息流',
      '细胞状态：直接传递信息，缓解梯度消失',
      '长期记忆：能记住长期依赖关系',
      '选择性遗忘：自动学习忘记不重要的信息'
    ],
    visualization: 'LSTM单元：输入x_t -> 遗忘门(f_t) -> 输入门(i_t) -> 细胞状态C_t -> 输出门(o_t) -> 隐藏状态h_t'
  },
  
  'TensorFlow': {
    detail: 'TensorFlow是Google Brain团队开发的开源机器学习框架，采用数据流图进行数值计算。它提供了完整的机器学习工具链，从模型构建、训练到生产部署都有成熟的解决方案。',
    workflow: '定义计算图 -> 会话(Session)创建 -> 变量初始化 -> 前向传播 -> 计算损失 -> 反向传播 -> 优化器更新 -> 模型保存',
    steps: [
      {
        title: '定义计算图',
        description: '构建数据流图，定义操作和变量'
      },
      {
        title: '定义损失和优化器',
        description: '计算损失函数并选择优化算法'
      },
      {
        title: '初始化会话',
        description: '创建会话并初始化所有变量'
      },
      {
        title: '训练循环',
        description: '迭代训练数据，更新模型参数'
      },
      {
        title: '模型评估',
        description: '在测试集上评估模型性能'
      },
      {
        title: '保存模型',
        description: '保存训练好的模型用于部署'
      }
    ],
    keyFeatures: [
      '静态计算图：先定义图结构，后执行计算',
      '跨平台：支持CPU、GPU、TPU',
      '可视化：TensorBoard强大的可视化工具',
      '生产部署：TensorFlow Serving支持高并发'
    ],
    visualization: 'TensorFlow架构：前端API -> 计算图优化 -> 分布式执行引擎 -> 设备层(CPU/GPU/TPU)'
  },
  
  'PyTorch': {
    detail: 'PyTorch是Facebook AI Research开发的深度学习框架，基于Torch。它采用动态计算图，允许在运行时修改图结构，非常适合研究和实验。',
    workflow: '定义模型(nn.Module) -> 数据加载(DataLoader) -> 前向传播 -> 计算损失 -> 反向传播(backward) -> 优化器更新(step) -> 清零梯度(zero_grad)',
    steps: [
      {
        title: '定义模型',
        description: '继承nn.Module，定义__init__和forward方法'
      },
      {
        title: '数据加载',
        description: '使用Dataset和DataLoader准备数据'
      },
      {
        title: '前向传播',
        description: '数据通过网络得到输出'
      },
      {
        title: '反向传播',
        description: '计算梯度并更新参数',
        code: 'optimizer.zero_grad(); loss.backward(); optimizer.step()'
      },
      {
        title: '保存加载模型',
        description: '保存和加载训练好的模型'
      }
    ],
    keyFeatures: [
      '动态计算图：边定义边执行，调试方便',
      'Pythonic：代码直观，符合Python习惯',
      '自动求导：Autograd自动计算梯度',
      'GPU加速：简单调用.cuda()即可',
      '研究友好：学术界首选框架'
    ],
    visualization: 'PyTorch架构：动态图计算 -> Autograd自动微分 -> 优化器更新 -> GPU加速 -> 分布式训练'
  },
  
  'Hugging Face Transformers': {
    detail: 'Hugging Face Transformers是目前最流行的预训练模型库，提供了超过10万个预训练模型，涵盖BERT、GPT等主流架构。它支持PyTorch和TensorFlow两种后端，提供了统一的API接口。',
    workflow: '安装库 -> 加载模型和分词器 -> 预处理输入 -> 模型推理/训练 -> 结果解码',
    steps: [
      {
        title: 'Pipeline快速使用',
        description: '最简单的使用方式，一行代码完成任务'
      },
      {
        title: '加载模型和分词器',
        description: '使用AutoModel和AutoTokenizer加载特定模型'
      },
      {
        title: '预处理文本',
        description: '使用分词器将文本转换为模型输入'
      },
      {
        title: '模型推理',
        description: '使用模型进行预测'
      },
      {
        title: '模型微调',
        description: '在特定任务上微调预训练模型'
      }
    ],
    keyFeatures: [
      '海量模型：10万+预训练模型',
      '统一API：跨模型一致的接口',
      '多框架：支持PyTorch和TensorFlow',
      '社区活跃：持续更新，文档完善',
      'Pipeline：快速使用预训练模型'
    ],
    visualization: 'Hugging Face生态：Transformers(模型库) + Datasets(数据集) + Tokenizers(分词器) + Accelerate(分布式)'
  }
};

module.exports = detailedGlossary;