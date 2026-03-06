const express = require('express');
const router = express.Router();

// AI术语词典数据 - 根据SPEC要求提供至少30个常见AI术语的通俗解释
const aiGlossary = [
  {
    id: 1,
    term: '人工智能 (AI)',
    english: 'Artificial Intelligence',
    category: '基础概念',
    definition: '让计算机模拟人类智能的技术总称，包括学习、推理、感知、理解语言等能力。',
    example: 'Siri、ChatGPT都是AI应用的例子。'
  },
  {
    id: 2,
    term: '机器学习 (ML)',
    english: 'Machine Learning',
    category: '基础概念',
    definition: 'AI的一个分支，让计算机通过数据学习规律，而不需要明确编程指令。',
    example: '垃圾邮件过滤器通过学习大量邮件样本来判断新邮件是否为垃圾邮件。'
  },
  {
    id: 3,
    term: '深度学习 (DL)',
    english: 'Deep Learning',
    category: '基础概念',
    definition: '机器学习的一种方法，使用多层神经网络处理复杂数据，在图像、语音识别等领域表现出色。',
    example: '人脸识别、语音助手都依赖深度学习技术。'
  },
  {
    id: 4,
    term: '神经网络',
    english: 'Neural Network',
    category: '模型架构',
    definition: '受人脑启发的计算模型，由多个相互连接的节点（神经元）组成，可以学习复杂模式。',
    example: '就像大脑中的神经元传递信号一样，人工神经网络也通过节点传递和处理信息。'
  },
  {
    id: 5,
    term: 'Transformer',
    english: 'Transformer',
    category: '模型架构',
    definition: '一种革命性的神经网络架构，使用注意力机制处理序列数据，是GPT、BERT等模型的基础。',
    example: 'ChatGPT就是基于Transformer架构的大语言模型。'
  },
  {
    id: 6,
    term: '大语言模型 (LLM)',
    english: 'Large Language Model',
    category: '模型类型',
    definition: '在海量文本数据上训练的超大规模AI模型，能够理解和生成自然语言。',
    example: 'GPT-4、Claude、Gemini都是大语言模型。'
  },
  {
    id: 7,
    term: '自然语言处理 (NLP)',
    english: 'Natural Language Processing',
    category: '应用领域',
    definition: '让计算机理解、分析和生成人类语言的技术领域。',
    example: '机器翻译、情感分析、问答系统都属于NLP应用。'
  },
  {
    id: 8,
    term: '计算机视觉 (CV)',
    english: 'Computer Vision',
    category: '应用领域',
    definition: '让计算机"看懂"图像和视频的技术，包括图像识别、目标检测等。',
    example: '自动驾驶汽车需要计算机视觉来识别道路、行人和其他车辆。'
  },
  {
    id: 9,
    term: '生成式AI',
    english: 'Generative AI',
    category: '模型类型',
    definition: '能够创作新内容（文本、图像、音频、视频等）的AI技术。',
    example: 'Midjourney生成图片、ChatGPT生成文字都是生成式AI。'
  },
  {
    id: 10,
    term: '提示词工程',
    english: 'Prompt Engineering',
    category: '应用技术',
    definition: '设计和优化给AI的指令（提示词），以获得更好输出结果的技术和方法。',
    example: '通过精心设计提示词，可以让ChatGPT生成更准确、有用的回答。'
  },
  {
    id: 11,
    term: '微调 (Fine-tuning)',
    english: 'Fine-tuning',
    category: '训练方法',
    definition: '在预训练模型基础上，使用特定领域数据进一步训练，使模型更适合特定任务。',
    example: '将通用语言模型微调成专业的医疗问答机器人。'
  },
  {
    id: 12,
    term: '预训练',
    english: 'Pre-training',
    category: '训练方法',
    definition: '在大规模数据集上进行初始训练，让模型学习通用知识和语言规律。',
    example: 'GPT先在互联网文本上预训练，然后才能进行对话。'
  },
  {
    id: 13,
    term: '强化学习 (RL)',
    english: 'Reinforcement Learning',
    category: '学习方法',
    definition: '通过与环境交互、根据奖惩信号学习最优行为策略的机器学习方法。',
    example: 'AlphaGo通过强化学习自我对弈，最终战胜人类围棋冠军。'
  },
  {
    id: 14,
    term: 'RLHF',
    english: 'Reinforcement Learning from Human Feedback',
    category: '训练方法',
    definition: '利用人类反馈来训练AI模型，使其输出更符合人类期望。',
    example: 'ChatGPT使用RLHF来学习生成更有帮助、更安全的回答。'
  },
  {
    id: 15,
    term: '注意力机制',
    english: 'Attention Mechanism',
    category: '模型架构',
    definition: '让模型在处理信息时能够"关注"重要部分的技术，是Transformer的核心。',
    example: '翻译句子时，模型会注意与当前词相关的其他词。'
  },
  {
    id: 16,
    term: '嵌入 (Embedding)',
    english: 'Embedding',
    category: '数据表示',
    definition: '将文字、图像等转化为数字向量的方法，使计算机能够理解和处理。',
    example: '"猫"和"狗"的嵌入向量比较接近，因为它们都是动物。'
  },
  {
    id: 17,
    term: '向量数据库',
    english: 'Vector Database',
    category: '数据存储',
    definition: '专门存储和检索向量数据的数据库，常用于AI应用中的相似性搜索。',
    example: '用来存储文档嵌入，快速找到与用户问题最相关的内容。'
  },
  {
    id: 18,
    term: 'RAG',
    english: 'Retrieval-Augmented Generation',
    category: '应用技术',
    definition: '检索增强生成，让AI在回答问题时先检索相关知识，提高答案准确性。',
    example: '企业知识库问答系统常用RAG来确保回答基于公司内部文档。'
  },
  {
    id: 19,
    term: 'Token',
    english: 'Token',
    category: '基础概念',
    definition: 'AI模型处理文本的基本单位，可能是一个词、一个字符或词的一部分。',
    example: '"Hello World"可能被分成"Hello"和"World"两个token。'
  },
  {
    id: 20,
    term: 'GPU',
    english: 'Graphics Processing Unit',
    category: '硬件',
    definition: '图形处理器，因其并行计算能力强，被广泛用于AI模型训练和推理。',
    example: 'NVIDIA A100 GPU是训练大模型的常用硬件。'
  },
  {
    id: 21,
    term: '推理 (Inference)',
    english: 'Inference',
    category: '运行阶段',
    definition: '使用训练好的AI模型处理新数据，得出结果的过程。',
    example: '用ChatGPT回答问题时，模型正在进行推理。'
  },
  {
    id: 22,
    term: '幻觉 (Hallucination)',
    english: 'Hallucination',
    category: '模型问题',
    definition: 'AI模型生成看似合理但实际错误或虚构信息的现象。',
    example: '模型可能编造不存在的引用或错误的事实。'
  },
  {
    id: 23,
    term: '多模态',
    english: 'Multimodal',
    category: '模型类型',
    definition: '能够同时处理多种类型数据（如文本、图像、音频）的AI系统。',
    example: 'GPT-4V可以同时理解图片和文字。'
  },
  {
    id: 24,
    term: 'Agent (智能代理)',
    english: 'Agent',
    category: '应用技术',
    definition: '能够自主执行任务、做出决策的AI系统，可以使用工具完成复杂目标。',
    example: 'AI Agent可以自动浏览网页、编写代码、发送邮件来完成任务。'
  },
  {
    id: 25,
    term: 'API',
    english: 'Application Programming Interface',
    category: '技术接口',
    definition: '应用程序接口，让不同软件之间能够互相通信的标准方式。',
    example: '通过OpenAI的API，开发者可以在自己的应用中使用GPT模型。'
  },
  {
    id: 26,
    term: '边缘AI',
    english: 'Edge AI',
    category: '部署方式',
    definition: '在本地设备（如手机、IoT设备）上运行AI，而不是依赖云服务器。',
    example: '手机上的人脸解锁就是边缘AI的应用。'
  },
  {
    id: 27,
    term: 'Few-shot学习',
    english: 'Few-shot Learning',
    category: '学习方法',
    definition: '只用少量样本就能让模型学会新任务的技术。',
    example: '给ChatGPT几个例子，它就能理解你想要的输出格式。'
  },
  {
    id: 28,
    term: 'Zero-shot学习',
    english: 'Zero-shot Learning',
    category: '学习方法',
    definition: '不需要任何样本就能完成新任务的能力。',
    example: 'ChatGPT可以翻译它从未专门训练过的语言对。'
  },
  {
    id: 29,
    term: '量化',
    english: 'Quantization',
    category: '优化技术',
    definition: '降低模型参数精度以减少计算资源需求的技术。',
    example: '将32位模型量化为8位，可以在普通电脑上运行大模型。'
  },
  {
    id: 30,
    term: '知识蒸馏',
    english: 'Knowledge Distillation',
    category: '优化技术',
    definition: '将大模型的知识转移到小模型中，保持性能的同时降低计算成本。',
    example: '把GPT-4的能力"蒸馏"到更小的模型中，使其可以在手机上运行。'
  },
  {
    id: 31,
    term: '对抗性攻击',
    english: 'Adversarial Attack',
    category: 'AI安全',
    definition: '通过精心设计的输入来欺骗AI模型，使其产生错误输出。',
    example: '给图片添加人眼不可见的噪点，让AI将熊猫识别为长臂猿。'
  },
  {
    id: 32,
    term: 'Prompt',
    english: 'Prompt',
    category: '基础概念',
    definition: '给AI模型的输入指令或问题，引导模型产生期望的输出。',
    example: '"请用100字概括这篇文章"就是一个prompt。'
  },
  {
    id: 33,
    term: '上下文窗口',
    english: 'Context Window',
    category: '模型参数',
    definition: '模型一次能处理的最大token数量，决定了可以输入多少内容。',
    example: 'GPT-4的上下文窗口支持最多128K tokens。'
  },
  {
    id: 34,
    term: '温度 (Temperature)',
    english: 'Temperature',
    category: '模型参数',
    definition: '控制AI输出随机性的参数，温度越高输出越多样，越低越确定。',
    example: '写创意故事用高温度，写技术文档用低温度。'
  },
  {
    id: 35,
    term: '开源模型',
    english: 'Open Source Model',
    category: '模型类型',
    definition: '代码和权重公开的AI模型，任何人都可以免费使用和修改。',
    example: 'LLaMA、Mistral都是开源大语言模型。'
  },
  {
    id: 36,
    term: '卷积神经网络 (CNN)',
    english: 'Convolutional Neural Network',
    category: '模型架构',
    definition: '专门用于处理图像数据的神经网络，通过卷积层提取图像特征，在计算机视觉任务中表现优异。',
    example: '人脸识别、医学影像分析通常使用CNN架构。'
  },
  {
    id: 37,
    term: '循环神经网络 (RNN)',
    english: 'Recurrent Neural Network',
    category: '模型架构',
    definition: '能够处理序列数据的神经网络，通过循环结构记住之前的信息，适合文本和时间序列分析。',
    example: '语音识别、机器翻译早期主要使用RNN。'
  },
  {
    id: 38,
    term: 'LSTM',
    english: 'Long Short-Term Memory',
    category: '模型架构',
    definition: '长短期记忆网络，RNN的改进版，能够更好地记住长期依赖关系，解决了梯度消失问题。',
    example: '股票价格预测、长文本生成等需要长期记忆的任务。'
  },
  {
    id: 39,
    term: 'BERT',
    english: 'Bidirectional Encoder Representations from Transformers',
    category: '模型类型',
    definition: '谷歌开发的预训练语言模型，使用双向Transformer编码器，在理解任务上表现出色。',
    example: '搜索引擎理解查询意图、情感分析等NLP任务。'
  },
  {
    id: 40,
    term: 'GPT',
    english: 'Generative Pre-trained Transformer',
    category: '模型类型',
    definition: '生成式预训练Transformer，OpenAI开发的大语言模型系列，专注于文本生成。',
    example: 'ChatGPT基于GPT-4架构，能够进行对话、写作、编程等。'
  },
  {
    id: 41,
    term: 'Diffusion模型',
    english: 'Diffusion Model',
    category: '模型类型',
    definition: '通过逐步去噪生成数据的模型，在图像生成领域取得突破性成果。',
    example: 'Stable Diffusion、DALL-E、Midjourney都使用扩散模型技术。'
  },
  {
    id: 42,
    term: 'GAN',
    english: 'Generative Adversarial Network',
    category: '模型架构',
    definition: '生成对抗网络，由生成器和判别器两部分组成，通过对抗训练生成逼真数据。',
    example: 'DeepFake换脸、艺术风格转换、图像超分辨率。'
  },
  {
    id: 43,
    term: '自监督学习',
    english: 'Self-supervised Learning',
    category: '学习方法',
    definition: '不需要人工标注数据，通过设计预训练任务让模型从数据本身学习特征的方法。',
    example: 'BERT的掩码语言建模、对比学习都是自监督学习。'
  },
  {
    id: 44,
    term: '对比学习',
    english: 'Contrastive Learning',
    category: '学习方法',
    definition: '通过对比相似和不相似样本学习表示的方法，常用于无监督预训练。',
    example: 'CLIP模型使用对比学习将图像和文本映射到同一空间。'
  },
  {
    id: 45,
    term: '迁移学习',
    english: 'Transfer Learning',
    category: '学习方法',
    definition: '将在一个任务上学到的知识应用到不同但相关任务上的技术。',
    example: '用ImageNet预训练的模型进行特定医学图像分类。'
  },
  {
    id: 46,
    term: '过拟合',
    english: 'Overfitting',
    category: '模型问题',
    definition: '模型在训练数据上表现很好，但在新数据上表现差的现象，原因是模型记住了训练数据而非学习规律。',
    example: '模型在训练集上准确率99%，但测试集只有70%。'
  },
  {
    id: 47,
    term: '欠拟合',
    english: 'Underfitting',
    category: '模型问题',
    definition: '模型过于简单，未能捕捉数据中的规律，在训练集和测试集上都表现不佳。',
    example: '用线性模型拟合复杂非线性关系。'
  },
  {
    id: 48,
    term: '正则化',
    english: 'Regularization',
    category: '训练方法',
    definition: '防止过拟合的技术，通过添加约束限制模型复杂度。',
    example: 'L1正则化(Lasso)、L2正则化(Ridge)、Dropout都是常用正则化方法。'
  },
  {
    id: 49,
    term: 'Dropout',
    english: 'Dropout',
    category: '训练方法',
    definition: '训练时随机丢弃部分神经元，防止模型过度依赖特定特征的正则化技术。',
    example: '在神经网络训练时随机将50%的神经元输出设为0。'
  },
  {
    id: 50,
    term: '批量归一化',
    english: 'Batch Normalization',
    category: '训练方法',
    definition: '对每层输入进行归一化处理，加速训练收敛并提高模型稳定性的技术。',
    example: '在卷积层后添加BN层可以加快训练速度。'
  },
  {
    id: 51,
    term: '梯度下降',
    english: 'Gradient Descent',
    category: '训练方法',
    definition: '通过计算损失函数梯度并沿梯度反方向更新参数来优化模型的算法。',
    example: 'SGD随机梯度下降、Adam优化器都是梯度下降的变体。'
  },
  {
    id: 52,
    term: '学习率',
    english: 'Learning Rate',
    category: '训练方法',
    definition: '控制模型参数更新步长大小的超参数，太大导致不稳定，太小收敛慢。',
    example: '初始学习率0.001，使用学习率衰减策略逐步降低。'
  },
  {
    id: 53,
    term: '损失函数',
    english: 'Loss Function',
    category: '训练方法',
    definition: '衡量模型预测与真实值差距的函数，训练目标是最小化损失。',
    example: '交叉熵损失用于分类，均方误差用于回归。'
  },
  {
    id: 54,
    term: '激活函数',
    english: 'Activation Function',
    category: '模型架构',
    definition: '决定神经元是否激活以及输出多少的非线性函数，使神经网络能学习复杂模式。',
    example: 'ReLU、Sigmoid、Tanh、GELU都是常用激活函数。'
  },
  {
    id: 55,
    term: 'Softmax',
    english: 'Softmax',
    category: '模型架构',
    definition: '将任意实数向量转换为概率分布的函数，输出值在0-1之间且和为1。',
    example: '多分类任务最后一层常用Softmax输出各类别概率。'
  },
  {
    id: 56,
    term: 'Sigmoid',
    english: 'Sigmoid',
    category: '模型架构',
    definition: 'S型激活函数，将输入压缩到0-1之间，常用于二分类输出层。',
    example: '逻辑回归使用Sigmoid函数输出概率值。'
  },
  {
    id: 57,
    term: 'ReLU',
    english: 'Rectified Linear Unit',
    category: '模型架构',
    definition: '修正线性单元，将负值设为0，正值保持不变，计算简单且缓解梯度消失。',
    example: 'f(x) = max(0, x)，深度学习中最常用的激活函数。'
  },
  {
    id: 58,
    term: '词嵌入 (Word Embedding)',
    english: 'Word Embedding',
    category: '数据表示',
    definition: '将词语映射为低维连续向量的技术，语义相近的词在向量空间中距离近。',
    example: 'Word2Vec、GloVe是经典的词嵌入方法。'
  },
  {
    id: 59,
    term: '位置编码',
    english: 'Positional Encoding',
    category: '模型架构',
    definition: '为序列数据添加位置信息的方法，让模型知道token在序列中的位置。',
    example: 'Transformer使用正弦余弦函数作为位置编码。'
  },
  {
    id: 60,
    term: '多头注意力',
    english: 'Multi-Head Attention',
    category: '模型架构',
    definition: '并行使用多组注意力机制，从不同角度捕捉输入间的关系。',
    example: 'Transformer使用8个或16个注意力头。'
  },
  {
    id: 61,
    term: '自注意力',
    english: 'Self-Attention',
    category: '模型架构',
    definition: '序列中每个位置都能注意到其他位置，计算位置间的相关性。',
    example: '句子中"它"通过自注意力关联到前文的名词。'
  },
  {
    id: 62,
    term: '交叉注意力',
    english: 'Cross-Attention',
    category: '模型架构',
    definition: '一个序列的token注意另一个序列的token，用于编码器-解码器结构。',
    example: '翻译模型中解码器通过交叉注意力关注编码器的源语言表示。'
  },
  {
    id: 63,
    term: '编码器-解码器',
    english: 'Encoder-Decoder',
    category: '模型架构',
    definition: '编码器将输入压缩为表示，解码器根据表示生成输出的架构。',
    example: '机器翻译、语音识别常用此架构。'
  },
  {
    id: 64,
    term: '掩码语言模型',
    english: 'Masked Language Model',
    category: '训练方法',
    definition: '随机遮盖输入中的部分token，让模型预测被遮盖内容的预训练方法。',
    example: 'BERT通过"我今天[MASK]很开心"预测"非常"。'
  },
  {
    id: 65,
    term: '下一句预测',
    english: 'Next Sentence Prediction',
    category: '训练方法',
    definition: '让模型判断两个句子是否是连续的预训练任务。',
    example: 'BERT训练时让模型判断B句是否是A句的下一句。'
  },
  {
    id: 66,
    term: '因果语言模型',
    english: 'Causal Language Model',
    category: '模型类型',
    definition: '只能看到当前位置之前token的自回归模型，逐个生成token。',
    example: 'GPT系列从左到右逐个预测下一个词。'
  },
  {
    id: 67,
    term: '自回归模型',
    english: 'Autoregressive Model',
    category: '模型类型',
    definition: '基于之前生成的内容预测下一个内容的生成模型。',
    example: 'GPT生成文本时，每生成一个词都基于已生成的内容。'
  },
  {
    id: 68,
    term: '掩码',
    english: 'Mask',
    category: '基础概念',
    definition: '在注意力机制中屏蔽某些位置，防止模型看到不应看到的信息。',
    example: '解码器使用因果掩码确保只关注当前位置之前的token。'
  },
  {
    id: 69,
    term: 'Beam Search',
    english: 'Beam Search',
    category: '应用技术',
    definition: '解码时保留多个候选序列，选择整体概率最高的序列作为输出。',
    example: '机器翻译使用beam size=4保留4个最佳候选。'
  },
  {
    id: 70,
    term: 'Top-k采样',
    english: 'Top-k Sampling',
    category: '应用技术',
    definition: '从概率最高的k个token中随机采样，平衡多样性和质量。',
    example: 'top-k=50表示只在概率最高的50个词中选择。'
  },
  {
    id: 71,
    term: 'Top-p采样 (Nucleus)',
    english: 'Top-p Sampling',
    category: '应用技术',
    definition: '从累积概率达到p的最小token集合中采样，动态调整候选集大小。',
    example: 'top-p=0.9选择概率最高的词直到累积概率达90%。'
  },
  {
    id: 72,
    term: '困惑度',
    english: 'Perplexity',
    category: '模型参数',
    definition: '衡量语言模型预测能力的指标，越低表示模型对文本的预测越准确。',
    example: '好的语言模型在测试集上困惑度通常在10-100之间。'
  },
  {
    id: 73,
    term: 'BLEU分数',
    english: 'BLEU Score',
    category: '模型参数',
    definition: '评估机器翻译质量的指标，比较生成文本与参考文本的n-gram重叠度。',
    example: 'BLEU分数0-100，越高表示翻译质量越好。'
  },
  {
    id: 74,
    term: 'ROUGE分数',
    english: 'ROUGE Score',
    category: '模型参数',
    definition: '评估文本摘要质量的指标，基于召回率计算n-gram重叠。',
    example: 'ROUGE-1计算单个词重叠，ROUGE-L计算最长公共子序列。'
  },
  {
    id: 75,
    term: '分词器 (Tokenizer)',
    english: 'Tokenizer',
    category: '基础概念',
    definition: '将文本分割为token的工具，不同模型使用不同的分词策略。',
    example: 'BPE、WordPiece、SentencePiece是常用分词算法。'
  },
  {
    id: 76,
    term: 'BPE',
    english: 'Byte Pair Encoding',
    category: '数据表示',
    definition: '一种子词分词算法，通过合并高频字符对构建词汇表，能处理未登录词。',
    example: 'GPT-2、RoBERTa使用BPE分词器。'
  },
  {
    id: 77,
    term: 'WordPiece',
    english: 'WordPiece',
    category: '数据表示',
    definition: 'Google开发的子词分词算法，基于语言模型概率合并子词单元。',
    example: 'BERT使用WordPiece分词器。'
  },
  {
    id: 78,
    term: '标记化',
    english: 'Tokenization',
    category: '基础概念',
    definition: '将原始文本转换为token序列的过程，是NLP的第一步。',
    example: '"Hello world" → ["Hello", " world"]'
  },
  {
    id: 79,
    term: '停用词',
    english: 'Stop Words',
    category: '数据表示',
    definition: '在NLP任务中常被过滤的高频功能词，如"的"、"是"、"the"等。',
    example: '在信息检索中通常移除停用词以减少噪声。'
  },
  {
    id: 80,
    term: 'TF-IDF',
    english: 'Term Frequency-Inverse Document Frequency',
    category: '数据表示',
    definition: '衡量词在文档中重要性的统计方法，高频但罕见词权重高。',
    example: '关键词提取、文档相似度计算常用TF-IDF。'
  },
  {
    id: 81,
    term: '词干提取',
    english: 'Stemming',
    category: '数据表示',
    definition: '将词还原为词干的过程，如"running"→"run"，减少词汇变体。',
    example: 'Porter Stemmer是经典的英语词干提取算法。'
  },
  {
    id: 82,
    term: '词形还原',
    english: 'Lemmatization',
    category: '数据表示',
    definition: '基于词典将词还原为原形，考虑词性，比词干提取更精确。',
    example: '"better"还原为"good"，"was"还原为"be"。'
  },
  {
    id: 83,
    term: '命名实体识别 (NER)',
    english: 'Named Entity Recognition',
    category: '应用领域',
    definition: '识别文本中人名、地名、组织名等实体的任务。',
    example: '从"乔布斯创立了苹果公司"中提取"乔布斯"(人名)和"苹果公司"(组织名)。'
  },
  {
    id: 84,
    term: '依存句法分析',
    english: 'Dependency Parsing',
    category: '应用领域',
    definition: '分析句子中词与词之间的语法依赖关系。',
    example: '识别主谓宾结构、修饰关系等句法信息。'
  },
  {
    id: 85,
    term: '语义角色标注',
    english: 'Semantic Role Labeling',
    category: '应用领域',
    definition: '识别句子中谓词的论元及其语义角色（施事、受事等）。',
    example: '在"张三吃了苹果"中，"张三"是施事，"苹果"是受事。'
  },
  {
    id: 86,
    term: '文本分类',
    english: 'Text Classification',
    category: '应用领域',
    definition: '将文本分配到预定义类别的任务。',
    example: '情感分析（正面/负面）、垃圾邮件检测、新闻分类。'
  },
  {
    id: 87,
    term: '序列标注',
    english: 'Sequence Labeling',
    category: '应用领域',
    definition: '为序列中每个元素打上标签的任务。',
    example: '词性标注、命名实体识别都是序列标注任务。'
  },
  {
    id: 88,
    term: '机器翻译 (MT)',
    english: 'Machine Translation',
    category: '应用领域',
    definition: '使用计算机自动将一种语言翻译成另一种语言的技术。',
    example: 'Google翻译、DeepL都是神经机器翻译系统。'
  },
  {
    id: 89,
    term: '文本摘要',
    english: 'Text Summarization',
    category: '应用领域',
    definition: '自动生成文本简短版本的任务，可以是抽取式或生成式。',
    example: '自动生成新闻标题、长文档摘要。'
  },
  {
    id: 90,
    term: '问答系统 (QA)',
    english: 'Question Answering',
    category: '应用领域',
    definition: '自动回答用户问题的系统，可以是基于文档或知识库。',
    example: 'Siri回答天气问题、阅读理解模型回答文章相关问题。'
  },
  {
    id: 91,
    term: '对话系统',
    english: 'Dialogue System',
    category: '应用领域',
    definition: '能够与人类进行自然语言对话的AI系统。',
    example: 'ChatGPT、客服机器人、智能音箱。'
  },
  {
    id: 92,
    term: '语音识别 (ASR)',
    english: 'Automatic Speech Recognition',
    category: '应用领域',
    definition: '将语音信号转换为文本的技术。',
    example: '语音输入法、语音助手、会议转录。'
  },
  {
    id: 93,
    term: '语音合成 (TTS)',
    english: 'Text-to-Speech',
    category: '应用领域',
    definition: '将文本转换为自然语音的技术。',
    example: '导航语音、有声书、智能客服语音。'
  },
  {
    id: 94,
    term: '目标检测',
    english: 'Object Detection',
    category: '应用领域',
    definition: '在图像中识别并定位多个目标的任务，输出边界框和类别。',
    example: 'YOLO、R-CNN系列算法用于自动驾驶、安防监控。'
  },
  {
    id: 95,
    term: '图像分割',
    english: 'Image Segmentation',
    category: '应用领域',
    definition: '将图像分割成多个区域，精确到像素级别的识别。',
    example: '医学图像分割、自动驾驶场景理解。'
  },
  {
    id: 96,
    term: '图像分类',
    english: 'Image Classification',
    category: '应用领域',
    definition: '将图像分配到预定义类别的任务。',
    example: '识别照片中的动物是猫还是狗。'
  },
  {
    id: 97,
    term: '人脸识别',
    english: 'Face Recognition',
    category: '应用领域',
    definition: '识别图像或视频中人脸身份的技术。',
    example: '手机人脸解锁、机场安检、相册自动分类。'
  },
  {
    id: 98,
    term: '光学字符识别 (OCR)',
    english: 'Optical Character Recognition',
    category: '应用领域',
    definition: '将图像中的文字转换为可编辑文本的技术。',
    example: '扫描文档转文字、车牌识别、票据识别。'
  },
  {
    id: 99,
    term: '风格迁移',
    english: 'Style Transfer',
    category: '应用领域',
    definition: '将一张图片的风格应用到另一张图片内容上的技术。',
    example: '将照片转换成梵高、毕加索的画风。'
  },
  {
    id: 100,
    term: '超分辨率',
    english: 'Super-Resolution',
    category: '应用领域',
    definition: '从低分辨率图像恢复高分辨率图像的技术。',
    example: '将模糊的老照片修复清晰、视频画质增强。'
  },
  {
    id: 101,
    term: '数据增强',
    english: 'Data Augmentation',
    category: '训练方法',
    definition: '通过对训练数据进行变换（旋转、裁剪、噪声等）扩充数据集的方法。',
    example: '将训练图像随机旋转、翻转、调整亮度来增加数据多样性。'
  },
  {
    id: 102,
    term: '集成学习',
    english: 'Ensemble Learning',
    category: '学习方法',
    definition: '结合多个模型的预测结果来提高整体性能的方法。',
    example: '随机森林、XGBoost、模型投票都是集成学习方法。'
  },
  {
    id: 103,
    term: '早停法',
    english: 'Early Stopping',
    category: '训练方法',
    definition: '当验证集性能不再提升时提前停止训练，防止过拟合的策略。',
    example: '监控验证损失，连续5个epoch不下降就停止训练。'
  },
  {
    id: 104,
    term: '学习率调度',
    english: 'Learning Rate Scheduling',
    category: '训练方法',
    definition: '在训练过程中动态调整学习率的策略。',
    example: '预热学习率、余弦退火、阶梯衰减等策略。'
  },
  {
    id: 105,
    term: '梯度裁剪',
    english: 'Gradient Clipping',
    category: '训练方法',
    definition: '限制梯度大小防止梯度爆炸的技术。',
    example: '当梯度范数超过阈值时进行缩放。'
  },
  {
    id: 106,
    term: '权重初始化',
    english: 'Weight Initialization',
    category: '训练方法',
    definition: '设置神经网络初始参数的方法，影响训练稳定性和收敛速度。',
    example: 'Xavier初始化、He初始化是常用的初始化方法。'
  },
  {
    id: 107,
    term: '特征工程',
    english: 'Feature Engineering',
    category: '数据表示',
    definition: '利用领域知识从原始数据中提取有效特征的过程。',
    example: '从日期中提取星期几、是否为节假日等特征。'
  },
  {
    id: 108,
    term: '特征选择',
    english: 'Feature Selection',
    category: '数据表示',
    definition: '选择最相关的特征子集来提高模型性能和可解释性。',
    example: '使用卡方检验、互信息等方法筛选重要特征。'
  },
  {
    id: 109,
    term: '降维',
    english: 'Dimensionality Reduction',
    category: '数据表示',
    definition: '将高维数据映射到低维空间同时保留重要信息的技术。',
    example: 'PCA主成分分析、t-SNE可视化。'
  },
  {
    id: 110,
    term: '主成分分析 (PCA)',
    english: 'Principal Component Analysis',
    category: '数据表示',
    definition: '通过线性变换将数据投影到方差最大的方向上实现降维。',
    example: '将100维数据降维到10维同时保留90%信息量。'
  },
  {
    id: 111,
    term: 't-SNE',
    english: 't-Distributed Stochastic Neighbor Embedding',
    category: '数据表示',
    definition: '非线性降维技术，适合高维数据的可视化。',
    example: '将词向量降维到2D/3D进行可视化。'
  },
  {
    id: 112,
    term: '异常检测',
    english: 'Anomaly Detection',
    category: '应用领域',
    definition: '识别数据中异常或离群值的任务。',
    example: '信用卡欺诈检测、设备故障预警。'
  },
  {
    id: 113,
    term: '推荐系统',
    english: 'Recommender System',
    category: '应用领域',
    definition: '预测用户对物品的偏好并推荐相关物品的系统。',
    example: 'Netflix电影推荐、淘宝商品推荐。'
  },
  {
    id: 114,
    term: '协同过滤',
    english: 'Collaborative Filtering',
    category: '应用领域',
    definition: '基于用户行为相似性进行推荐的方法。',
    example: '和你相似的用户喜欢这部电影，所以推荐给你。'
  },
  {
    id: 115,
    term: '冷启动',
    english: 'Cold Start',
    category: '模型问题',
    definition: '新用户或新物品缺乏历史数据时的推荐难题。',
    example: '新注册用户还没有观看历史，难以推荐。'
  },
  {
    id: 116,
    term: 'A/B测试',
    english: 'A/B Testing',
    category: '应用技术',
    definition: '对比两个版本效果的实验方法，随机分配用户到不同组。',
    example: '测试新推荐算法是否能提高点击率。'
  },
  {
    id: 117,
    term: '混淆矩阵',
    english: 'Confusion Matrix',
    category: '模型参数',
    definition: '展示分类模型预测结果与实际标签对比的表格。',
    example: 'TP、FP、TN、FN四个指标评估分类性能。'
  },
  {
    id: 118,
    term: '准确率',
    english: 'Accuracy',
    category: '模型参数',
    definition: '正确预测的样本占总样本的比例。',
    example: '100个样本中90个预测正确，准确率90%。'
  },
  {
    id: 119,
    term: '精确率',
    english: 'Precision',
    category: '模型参数',
    definition: '预测为正例中实际为正例的比例。',
    example: '预测为垃圾邮件的邮件中确实是垃圾邮件的比例。'
  },
  {
    id: 120,
    term: '召回率',
    english: 'Recall',
    category: '模型参数',
    definition: '实际为正例中被正确预测为正例的比例。',
    example: '所有垃圾邮件中被成功识别出的比例。'
  },
  {
    id: 121,
    term: 'F1分数',
    english: 'F1 Score',
    category: '模型参数',
    definition: '精确率和召回率的调和平均数，综合衡量模型性能。',
    example: 'F1 = 2 * (Precision * Recall) / (Precision + Recall)'
  },
  {
    id: 122,
    term: 'ROC曲线',
    english: 'Receiver Operating Characteristic',
    category: '模型参数',
    definition: '展示不同阈值下真阳性率和假阳性率关系的曲线。',
    example: '曲线下面积(AUC)越接近1表示模型越好。'
  },
  {
    id: 123,
    term: 'AUC',
    english: 'Area Under Curve',
    category: '模型参数',
    definition: 'ROC曲线下的面积，衡量二分类模型整体性能。',
    example: 'AUC=0.5相当于随机猜测，AUC=1表示完美分类。'
  },
  {
    id: 124,
    term: '交叉验证',
    english: 'Cross-Validation',
    category: '训练方法',
    definition: '将数据分成多份轮流作为验证集，更可靠地评估模型性能。',
    example: '5折交叉验证：数据分5份，每份轮流作测试集。'
  },
  {
    id: 125,
    term: '训练集/验证集/测试集',
    english: 'Train/Validation/Test Split',
    category: '基础概念',
    definition: '将数据划分为训练模型、调参和最终评估的三部分。',
    example: '常见比例：70%训练、15%验证、15%测试。'
  },
  {
    id: 126,
    term: '数据泄露',
    english: 'Data Leakage',
    category: '模型问题',
    definition: '测试集信息在训练前就泄露到训练过程中，导致评估结果虚高。',
    example: '在划分训练测试集后才做特征归一化。'
  },
  {
    id: 127,
    term: '基准测试',
    english: 'Benchmark',
    category: '应用技术',
    definition: '使用标准数据集和评估方法比较不同模型性能。',
    example: 'GLUE、SuperGLUE是NLP的标准基准测试。'
  },
  {
    id: 128,
    term: 'SOTA',
    english: 'State of the Art',
    category: '基础概念',
    definition: '当前最优水平，指在某个任务上表现最好的模型或方法。',
    example: '这个模型在ImageNet上达到了SOTA性能。'
  },
  {
    id: 129,
    term: '消融实验',
    english: 'Ablation Study',
    category: '应用技术',
    definition: '系统地移除模型某些部分来研究其对性能贡献的实验方法。',
    example: '去掉注意力机制看模型性能下降多少。'
  },
  {
    id: 130,
    term: '可解释AI (XAI)',
    english: 'Explainable AI',
    category: 'AI安全',
    definition: '使AI模型的决策过程对人类可理解的技术和方法。',
    example: 'LIME、SHAP等工具帮助解释模型预测原因。'
  },
  {
    id: 131,
    term: '模型压缩',
    english: 'Model Compression',
    category: '优化技术',
    definition: '减少模型大小和计算量的技术，包括剪枝、量化、蒸馏等。',
    example: '将100MB的模型压缩到10MB以便在手机上运行。'
  },
  {
    id: 132,
    term: '模型剪枝',
    english: 'Model Pruning',
    category: '优化技术',
    definition: '移除神经网络中不重要的权重或神经元来减小模型大小。',
    example: '剪掉90%的权重但保持95%的性能。'
  },
  {
    id: 133,
    term: '模型并行',
    english: 'Model Parallelism',
    category: '硬件',
    definition: '将模型的不同部分放在不同设备上并行训练或推理。',
    example: '大模型的一层在一个GPU上，另一层在另一个GPU上。'
  },
  {
    id: 134,
    term: '数据并行',
    english: 'Data Parallelism',
    category: '硬件',
    definition: '将数据分成多份在不同设备上并行处理，梯度汇总后更新模型。',
    example: '4个GPU各自处理1/4的数据批次。'
  },
  {
    id: 135,
    term: '混合精度训练',
    english: 'Mixed Precision Training',
    category: '训练方法',
    definition: '同时使用FP16和FP32进行训练，加速并减少显存占用。',
    example: 'NVIDIA的Apex库支持混合精度训练。'
  },
  {
    id: 136,
    term: '梯度累积',
    english: 'Gradient Accumulation',
    category: '训练方法',
    definition: '多次前向传播后累积梯度再更新参数，模拟大批次训练。',
    example: '每4个小批次累积一次梯度，相当于批次大小扩大4倍。'
  },
  {
    id: 137,
    term: '检查点',
    english: 'Checkpoint',
    category: '基础概念',
    definition: '保存模型参数和优化器状态的快照，用于恢复训练或部署。',
    example: '每1000步保存一个检查点防止训练中断丢失进度。'
  },
  {
    id: 138,
    term: '推理加速',
    english: 'Inference Acceleration',
    category: '优化技术',
    definition: '优化模型推理速度的技术，包括量化、剪枝、算子融合等。',
    example: 'TensorRT、ONNX Runtime用于推理加速。'
  },
  {
    id: 139,
    term: '批处理推理',
    english: 'Batch Inference',
    category: '应用技术',
    definition: '同时处理多个输入样本以提高硬件利用率的推理方式。',
    example: '一次处理32张图片比处理32次单张更高效。'
  },
  {
    id: 140,
    term: '流式处理',
    english: 'Streaming Processing',
    category: '应用技术',
    definition: '持续接收和处理数据流，实时产生输出的方式。',
    example: '语音识别实时转录、视频流分析。'
  },
  {
    id: 141,
    term: '模型版本管理',
    english: 'Model Versioning',
    category: '应用技术',
    definition: '追踪和管理模型不同版本的技术，便于实验比较和回滚。',
    example: 'MLflow、DVC是常用的模型版本管理工具。'
  },
  {
    id: 142,
    term: '模型部署',
    english: 'Model Deployment',
    category: '应用技术',
    definition: '将训练好的模型集成到生产环境供用户使用的过程。',
    example: '将模型封装成REST API服务、部署到边缘设备。'
  },
  {
    id: 143,
    term: '模型服务化',
    english: 'Model Serving',
    category: '应用技术',
    definition: '将模型封装为可调用服务的技术，支持高并发和低延迟。',
    example: 'TensorFlow Serving、TorchServe用于模型服务化。'
  },
  {
    id: 144,
    term: 'AIOps',
    english: 'Artificial Intelligence for IT Operations',
    category: '应用领域',
    definition: '将AI应用于IT运维，实现智能监控、异常检测和自动化。',
    example: '自动检测服务器异常、智能告警、容量预测。'
  },
  {
    id: 145,
    term: 'MLOps',
    english: 'Machine Learning Operations',
    category: '应用领域',
    definition: '机器学习工程实践，涵盖模型开发、部署、监控全生命周期管理。',
    example: '自动化模型训练流水线、A/B测试、模型监控。'
  },
  {
    id: 146,
    term: 'AutoML',
    english: 'Automated Machine Learning',
    category: '应用领域',
    definition: '自动化机器学习流程的技术，自动进行特征工程、模型选择、超参调优。',
    example: 'Google AutoML、Auto-sklearn等工具。'
  },
  {
    id: 147,
    term: '神经架构搜索 (NAS)',
    english: 'Neural Architecture Search',
    category: '应用领域',
    definition: '自动搜索最优神经网络架构的技术。',
    example: '自动设计出比人工设计更好的图像分类网络。'
  },
  {
    id: 148,
    term: '联邦学习',
    english: 'Federated Learning',
    category: '学习方法',
    definition: '在不共享原始数据的前提下协同训练模型的分布式学习方法。',
    example: '多个医院联合训练医学模型而不共享患者数据。'
  },
  {
    id: 149,
    term: '持续学习',
    english: 'Continual Learning',
    category: '学习方法',
    definition: '模型能够持续学习新任务而不遗忘旧知识的能力。',
    example: '先学会识别猫，再学识别狗，同时不忘记猫的样子。'
  },
  {
    id: 150,
    term: '元学习',
    english: 'Meta Learning',
    category: '学习方法',
    definition: '学会如何学习的AI，通过以往经验快速适应新任务。',
    example: '看了几个例子就能学会识别新类别，无需大量训练。'
  },
  {
    id: 151,
    term: '模型窃取',
    english: 'Model Stealing',
    category: 'AI安全',
    definition: '通过大量查询目标模型来复制其功能的行为，可能侵犯知识产权。',
    example: '通过API反复查询来训练一个和原模型相似的替代品。'
  },
  {
    id: 152,
    term: '数据投毒',
    english: 'Data Poisoning',
    category: 'AI安全',
    definition: '在训练数据中注入恶意样本以操控模型行为。',
    example: '在训练集中插入特殊标记的图片让模型产生错误分类。'
  },
  {
    id: 153,
    term: '隐私保护',
    english: 'Privacy Preservation',
    category: 'AI安全',
    definition: '在训练和使用AI时保护数据隐私的技术和方法。',
    example: '差分隐私、同态加密、联邦学习等隐私保护技术。'
  },
  {
    id: 154,
    term: '公平性',
    english: 'Fairness',
    category: 'AI安全',
    definition: 'AI系统对不同群体一视同仁，不产生歧视性结果。',
    example: '招聘AI不因性别、种族产生偏向。'
  },
  {
    id: 155,
    term: '偏见',
    english: 'Bias',
    category: 'AI安全',
    definition: 'AI系统对某些群体存在系统性偏差，导致不公平结果。',
    example: '训练数据男性居多导致模型对女性识别率低。'
  },
  {
    id: 156,
    term: '鲁棒性',
    english: 'Robustness',
    category: '模型参数',
    definition: '模型在输入扰动、噪声或分布变化下保持稳定性能的能力。',
    example: '对抗训练提高模型对对抗样本的鲁棒性。'
  },
  {
    id: 157,
    term: '不确定性估计',
    english: 'Uncertainty Estimation',
    category: '模型参数',
    definition: '让模型预测时同时输出置信度，知道什么时候"不确定"。',
    example: '模型对陌生领域问题给出低置信度回答。'
  },
  {
    id: 158,
    term: '主动学习',
    english: 'Active Learning',
    category: '学习方法',
    definition: '模型主动选择最有价值的样本请求人工标注，减少标注成本。',
    example: '从大量未标注数据中选出对模型提升最大的100条。'
  },
  {
    id: 159,
    term: '弱监督学习',
    english: 'Weakly Supervised Learning',
    category: '学习方法',
    definition: '使用不精确、不完整或不准确的标签进行训练的方法。',
    example: '使用关键词匹配自动标注的数据训练模型。'
  },
  {
    id: 160,
    term: '半监督学习',
    english: 'Semi-supervised Learning',
    category: '学习方法',
    definition: '同时使用少量标注数据和大量未标注数据进行训练。',
    example: '1000条标注数据+100000条未标注数据训练分类器。'
  },
  {
    id: 161,
    term: '多任务学习',
    english: 'Multi-task Learning',
    category: '学习方法',
    definition: '同时学习多个相关任务，共享表示以提高泛化能力。',
    example: '同时训练情感分析和主题分类，共享词嵌入层。'
  },
  {
    id: 162,
    term: '课程学习',
    english: 'Curriculum Learning',
    category: '学习方法',
    definition: '模仿人类学习过程，从简单样本开始逐渐学习复杂样本。',
    example: '先学习短句翻译，再学习长句和复杂句。'
  },
  {
    id: 163,
    term: '对抗训练',
    english: 'Adversarial Training',
    category: '训练方法',
    definition: '在训练中加入对抗样本来提高模型鲁棒性的方法。',
    example: '同时用正常样本和对抗样本训练图像分类器。'
  },
  {
    id: 164,
    term: '集成梯度',
    english: 'Integrated Gradients',
    category: 'AI安全',
    definition: '一种可解释性方法，通过积分计算每个输入特征对预测的贡献。',
    example: '解释图像分类器中哪些像素对预测"猫"贡献最大。'
  },
  {
    id: 165,
    term: '注意力可视化',
    english: 'Attention Visualization',
    category: 'AI安全',
    definition: '可视化Transformer模型注意力权重的技术，理解模型关注哪里。',
    example: '看到翻译时源语言哪些词被目标语言每个词关注。'
  },
  {
    id: 166,
    term: '概念激活向量 (CAV)',
    english: 'Concept Activation Vectors',
    category: 'AI安全',
    definition: '用人类可理解的概念来解释神经网络内部表示的方法。',
    example: '分析模型是否学到了"条纹"概念来识别斑马。'
  },
  {
    id: 167,
    term: '对抗样本',
    english: 'Adversarial Examples',
    category: 'AI安全',
    definition: '经过精心设计的扰动能欺骗AI模型的输入样本。',
    example: '给熊猫图片添加人眼不可见的噪声让AI识别为长臂猿。'
  },
  {
    id: 168,
    term: '后门攻击',
    english: 'Backdoor Attack',
    category: 'AI安全',
    definition: '在模型中植入隐藏触发器，特定输入触发错误行为。',
    example: '带有特定水印的图片被分类为指定类别。'
  },
  {
    id: 169,
    term: '模型逆向',
    english: 'Model Inversion',
    category: 'AI安全',
    definition: '从模型输出生成或重建训练数据的方法，可能泄露隐私。',
    example: '通过人脸识别模型重建出训练集中某人的照片。'
  },
  {
    id: 170,
    term: '成员推理攻击',
    english: 'Membership Inference Attack',
    category: 'AI安全',
    definition: '判断某个样本是否被用于训练目标模型的攻击方法。',
    example: '知道某人的病历数据是否被用于训练医学AI。'
  },
  {
    id: 171,
    term: '差分隐私',
    english: 'Differential Privacy',
    category: 'AI安全',
    definition: '在数据分析中添加噪声保护个体隐私的数学框架。',
    example: '在模型训练梯度中添加噪声，保证无法推断单个样本。'
  },
  {
    id: 172,
    term: '同态加密',
    english: 'Homomorphic Encryption',
    category: 'AI安全',
    definition: '允许在加密数据上进行计算的加密技术。',
    example: '在加密的患者数据上直接进行医学分析而不解密。'
  },
  {
    id: 173,
    term: '安全多方计算',
    english: 'Secure Multi-Party Computation',
    category: 'AI安全',
    definition: '多方在不泄露各自输入的前提下协同计算的技术。',
    example: '多家医院共同计算统计指标而不泄露各自数据。'
  },
  {
    id: 174,
    term: '可信AI',
    english: 'Trustworthy AI',
    category: 'AI安全',
    definition: '可靠、公平、透明、安全、尊重隐私的AI系统。',
    example: '欧盟提出的可信AI七大关键要求。'
  },
  {
    id: 175,
    term: '负责任AI',
    english: 'Responsible AI',
    category: 'AI安全',
    definition: '以道德、公平、透明的方式开发和部署AI的实践。',
    example: '建立AI伦理委员会审查AI应用的社会影响。'
  },
  {
    id: 176,
    term: 'AI伦理',
    english: 'AI Ethics',
    category: 'AI安全',
    definition: '研究AI对社会、个人影响以及道德准则的学科。',
    example: '算法公平性、隐私保护、就业影响等伦理议题。'
  },
  {
    id: 177,
    term: '数据治理',
    english: 'Data Governance',
    category: '应用技术',
    definition: '管理数据可用性、可用性、完整性和安全性的框架。',
    example: '建立数据质量标准、访问控制、合规性审计。'
  },
  {
    id: 178,
    term: '数据标注',
    english: 'Data Annotation',
    category: '数据表示',
    definition: '为原始数据添加标签或元数据的过程，是监督学习的基础。',
    example: '为图片标注物体边界框、为文本标注情感标签。'
  },
  {
    id: 179,
    term: '众包标注',
    english: 'Crowdsourcing Annotation',
    category: '数据表示',
    definition: '通过众包平台将数据标注任务分发给大量标注员完成。',
    example: '使用Amazon Mechanical Turk进行图像分类标注。'
  },
  {
    id: 180,
    term: '主动标注',
    english: 'Active Annotation',
    category: '数据表示',
    definition: '模型辅助标注员提高效率的半自动标注方法。',
    example: '模型预标注后人工修正，比从零标注快5倍。'
  }
];

// 获取所有术语
router.get('/', async (req, res) => {
  try {
    const { category, search, limit = 50, page = 1 } = req.query;
    
    let filteredGlossary = [...aiGlossary];
    
    // 按分类过滤
    if (category && category !== '全部') {
      filteredGlossary = filteredGlossary.filter(item => item.category === category);
    }
    
    // 按搜索词过滤
    if (search) {
      const searchLower = search.toLowerCase();
      filteredGlossary = filteredGlossary.filter(item => 
        item.term.toLowerCase().includes(searchLower) ||
        item.english.toLowerCase().includes(searchLower) ||
        item.definition.toLowerCase().includes(searchLower)
      );
    }
    
    // 分页
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedData = filteredGlossary.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: paginatedData,
      total: filteredGlossary.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('获取术语词典失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取术语分类列表
router.get('/categories', async (req, res) => {
  try {
    const categories = [...new Set(aiGlossary.map(item => item.category))];
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('获取术语分类失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 根据ID获取术语详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const term = aiGlossary.find(item => item.id === parseInt(id));
    
    if (!term) {
      return res.status(404).json({
        success: false,
        error: '术语不存在'
      });
    }
    
    res.json({
      success: true,
      data: term
    });
  } catch (error) {
    console.error('获取术语详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
