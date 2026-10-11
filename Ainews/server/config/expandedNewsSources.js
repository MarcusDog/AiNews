// 2026-08-08 verified expansion catalog.
// GitHub Atom endpoints are first-party release feeds owned by each project.

const release = (name, repository, options = {}) => ({
  name,
  url: `https://github.com/${repository}/releases.atom`,
  category: 'AI框架',
  language: 'multi',
  region: 'global',
  sourceGroup: 'engineering',
  priority: 2,
  catalogTier: 'expanded',
  ...options
});

const commit = (name, repository, branch = 'main', options = {}) => release(name, repository, {
  url: `https://github.com/${repository}/commits/${branch}.atom`,
  // 提交记录是工程活动，不是面向普通读者的新闻。保留配置便于后台审计，但不进入公开抓取队列。
  enabled: false,
  ...options
});

const feed = (name, url, options = {}) => ({
  name,
  url,
  category: 'AI新闻',
  language: 'en',
  region: 'global',
  sourceGroup: 'investment',
  priority: 2,
  catalogTier: 'expanded',
  ...options
});

const GLOBAL_RELEASE_SOURCES = [
  // 模型服务 SDK 与协议生态
  release('OpenAI Python SDK 发布', 'openai/openai-python', { category: '新工具', sourceGroup: 'product' }),
  release('OpenAI Node SDK 发布', 'openai/openai-node', { category: '新工具', sourceGroup: 'product' }),
  release('OpenAI Go SDK 发布', 'openai/openai-go', { category: '新工具', sourceGroup: 'product' }),
  release('OpenAI Java SDK 发布', 'openai/openai-java', { category: '新工具', sourceGroup: 'product' }),
  release('OpenAI .NET SDK 发布', 'openai/openai-dotnet', { category: '新工具', sourceGroup: 'product' }),
  release('OpenAI Agents Python SDK 发布', 'openai/openai-agents-python', { category: '新工具', sourceGroup: 'product' }),
  release('OpenAI Agents JS SDK 发布', 'openai/openai-agents-js', { category: '新工具', sourceGroup: 'product' }),
  release('Anthropic Python SDK 发布', 'anthropics/anthropic-sdk-python', { category: '新工具', sourceGroup: 'product' }),
  release('Anthropic TypeScript SDK 发布', 'anthropics/anthropic-sdk-typescript', { category: '新工具', sourceGroup: 'product' }),
  release('Anthropic Go SDK 发布', 'anthropics/anthropic-sdk-go', { category: '新工具', sourceGroup: 'product' }),
  release('Anthropic Java SDK 发布', 'anthropics/anthropic-sdk-java', { category: '新工具', sourceGroup: 'product' }),
  release('Google Gen AI Python SDK 发布', 'googleapis/python-genai', { category: '新工具', sourceGroup: 'product' }),
  release('Google Gen AI JS SDK 发布', 'googleapis/js-genai', { category: '新工具', sourceGroup: 'product' }),
  release('Google Gen AI Go SDK 发布', 'googleapis/go-genai', { category: '新工具', sourceGroup: 'product' }),
  release('Google Gen AI Java SDK 发布', 'googleapis/java-genai', { category: '新工具', sourceGroup: 'product' }),
  release('Mistral Python SDK 发布', 'mistralai/client-python', { category: '新工具', sourceGroup: 'product' }),
  release('Mistral JavaScript SDK 发布', 'mistralai/client-js', { category: '新工具', sourceGroup: 'product' }),

  // 训练、推理与模型工程
  release('Transformers 官方发布', 'huggingface/transformers'),
  release('Diffusers 官方发布', 'huggingface/diffusers'),
  release('Accelerate 官方发布', 'huggingface/accelerate'),
  release('PEFT 官方发布', 'huggingface/peft'),
  release('TRL 官方发布', 'huggingface/trl'),
  release('Text Generation Inference 发布', 'huggingface/text-generation-inference'),
  release('Safetensors 官方发布', 'huggingface/safetensors'),
  release('Tokenizers 官方发布', 'huggingface/tokenizers'),
  release('Hugging Face Hub 客户端发布', 'huggingface/huggingface_hub'),
  release('Hugging Face Datasets 发布', 'huggingface/datasets'),
  release('Hugging Face Evaluate 发布', 'huggingface/evaluate', { sourceGroup: 'research' }),
  release('LeRobot 官方发布', 'huggingface/lerobot'),
  release('vLLM 官方发布', 'vllm-project/vllm'),
  release('llama.cpp 官方发布', 'ggml-org/llama.cpp', { enabled: false, disabledReason: 'upstream_release_feed_empty_use_github_signal_adapter' }),
  release('whisper.cpp 官方发布', 'ggml-org/whisper.cpp'),
  release('Ollama 官方发布', 'ollama/ollama', { category: '新工具' }),
  release('PyTorch 官方发布', 'pytorch/pytorch'),
  release('TorchTune 官方发布', 'pytorch/torchtune'),
  commit('TorchChat 官方动态', 'pytorch/torchchat'),
  release('TensorFlow 官方发布', 'tensorflow/tensorflow'),
  release('JAX 官方发布', 'jax-ml/jax'),
  release('ONNX Runtime 官方发布', 'microsoft/onnxruntime'),
  release('Triton 编译器发布', 'triton-lang/triton'),
  release('TensorRT-LLM 官方发布', 'NVIDIA/TensorRT-LLM'),
  release('NVIDIA NeMo 官方发布', 'NVIDIA/NeMo'),
  release('Ray 官方发布', 'ray-project/ray'),
  release('DeepSpeed 官方发布', 'deepspeedai/DeepSpeed'),
  release('PyTorch Lightning 发布', 'Lightning-AI/pytorch-lightning'),
  release('Keras 官方发布', 'keras-team/keras'),
  release('scikit-learn 官方发布', 'scikit-learn/scikit-learn'),
  release('Apache TVM 发布', 'apache/tvm'),
  release('MLC LLM 发布', 'mlc-ai/mlc-llm'),

  // Agent、RAG、可观测性与数据基础设施
  release('LangChain 官方发布', 'langchain-ai/langchain'),
  release('LangGraph 官方发布', 'langchain-ai/langgraph'),
  release('LangServe 官方发布', 'langchain-ai/langserve'),
  release('LlamaIndex 官方发布', 'run-llama/llama_index'),
  release('Microsoft AutoGen 发布', 'microsoft/autogen'),
  release('CrewAI 官方发布', 'crewAIInc/crewAI'),
  release('Semantic Kernel 发布', 'microsoft/semantic-kernel'),
  release('Haystack 官方发布', 'deepset-ai/haystack'),
  release('Outlines 官方发布', 'dottxt-ai/outlines'),
  release('LiteLLM 官方发布', 'BerriAI/litellm'),
  release('Langfuse 官方发布', 'langfuse/langfuse'),
  release('Arize Phoenix 发布', 'Arize-ai/phoenix'),
  release('MLflow 官方发布', 'mlflow/mlflow'),
  release('Weights & Biases SDK 发布', 'wandb/wandb'),
  release('Qdrant 官方发布', 'qdrant/qdrant'),
  release('Milvus 官方发布', 'milvus-io/milvus'),
  release('Weaviate 官方发布', 'weaviate/weaviate'),
  release('Chroma 官方发布', 'chroma-core/chroma'),
  release('FAISS 官方发布', 'facebookresearch/faiss'),
  release('pgvector 官方发布', 'pgvector/pgvector'),
  release('Jina 官方发布', 'jina-ai/jina'),

  // 评测、安全与可信 AI
  release('LM Evaluation Harness 发布', 'EleutherAI/lm-evaluation-harness', { category: '新算法', sourceGroup: 'research' }),
  release('DeepEval 官方发布', 'confident-ai/deepeval', { category: '新算法', sourceGroup: 'research' }),
  release('TruLens 官方发布', 'truera/trulens', { category: '新算法', sourceGroup: 'research' }),
  release('Promptfoo 官方发布', 'promptfoo/promptfoo', { category: '新工具', sourceGroup: 'research' }),
  release('Guardrails AI 发布', 'guardrails-ai/guardrails', { category: '新工具', sourceGroup: 'research' }),
  release('NeMo Guardrails 发布', 'NVIDIA/NeMo-Guardrails', { category: '新工具', sourceGroup: 'research' }),
  commit('PurpleLlama 安全评测动态', 'meta-llama/PurpleLlama', 'main', { category: '新算法', sourceGroup: 'research' }),
  release('Microsoft Presidio 发布', 'microsoft/presidio', { category: '新工具', sourceGroup: 'research' }),
  release('LLM Guard 发布', 'protectai/llm-guard', { category: '新工具', sourceGroup: 'research' })
];

const CHINA_RELEASE_SOURCES = [
  // 国内高质量框架的正式版本发布；用于替代不可读的 commit Atom 工程流水。
  release('阿里 MNN 官方发布', 'alibaba/MNN', { region: 'cn' }),
  release('腾讯 ncnn 官方发布', 'Tencent/ncnn', { region: 'cn' }),
  release('OpenMMLab MMEngine 发布', 'open-mmlab/mmengine', { region: 'cn' }),
  release('OpenMMLab MMCV 发布', 'open-mmlab/mmcv', { region: 'cn' }),
  release('OpenMMLab MMDetection 发布', 'open-mmlab/mmdetection', { region: 'cn' }),
  release('OpenMMLab MMSegmentation 发布', 'open-mmlab/mmsegmentation', { region: 'cn' }),
  release('OpenMMLab MMPreTrain 发布', 'open-mmlab/mmpretrain', { region: 'cn' }),
  release('飞桨 PaddleMIX 发布', 'PaddlePaddle/PaddleMIX', { region: 'cn' }),
  release('飞桨 PaddleSeg 发布', 'PaddlePaddle/PaddleSeg', { region: 'cn' }),
  release('飞桨 PaddleDetection 发布', 'PaddlePaddle/PaddleDetection', { region: 'cn' }),
  release('Qwen Agent 官方发布', 'QwenLM/Qwen-Agent', { region: 'cn' }),
  commit('Qwen3 Coder 官方动态', 'QwenLM/Qwen3-Coder', 'main', { region: 'cn', category: '新工具' }),
  commit('Qwen3 VL 官方动态', 'QwenLM/Qwen3-VL', 'main', { region: 'cn', category: '新工具' }),
  commit('Qwen3 Embedding 官方动态', 'QwenLM/Qwen3-Embedding', 'main', { region: 'cn', sourceGroup: 'research' }),
  release('DeepSeek R1 官方发布', 'deepseek-ai/DeepSeek-R1', { region: 'cn', category: '新工具' }),
  commit('DeepSeek Coder V2 官方动态', 'deepseek-ai/DeepSeek-Coder-V2', 'main', { region: 'cn', category: '新工具' }),
  commit('DeepSeek V2 官方动态', 'deepseek-ai/DeepSeek-V2', 'main', { region: 'cn', category: '新工具' }),
  commit('DeepSeek Math 官方动态', 'deepseek-ai/DeepSeek-Math', 'main', { region: 'cn', category: '新算法', sourceGroup: 'research' }),
  commit('ChatGLM3 官方动态', 'zai-org/ChatGLM3', 'main', { region: 'cn', category: '新工具' }),
  commit('GLM-4 官方动态', 'zai-org/GLM-4', 'main', { region: 'cn', category: '新工具' }),
  commit('GLM-V 官方动态', 'zai-org/GLM-V', 'main', { region: 'cn', category: '新工具' }),
  release('XTuner 官方发布', 'InternLM/xtuner', { region: 'cn' }),
  release('LMDeploy 官方发布', 'InternLM/lmdeploy', { region: 'cn' }),
  release('MiniCPM 官方基础模型发布', 'OpenBMB/MiniCPM', { region: 'cn', category: '新工具' }),
  release('ChatDev 官方发布', 'OpenBMB/ChatDev', { region: 'cn', category: '新工具' }),
  release('PaddleOCR 官方发布', 'PaddlePaddle/PaddleOCR', { region: 'cn' }),
  release('PaddleSpeech 官方发布', 'PaddlePaddle/PaddleSpeech', { region: 'cn' }),
  release('FunASR 官方发布', 'modelscope/FunASR', { region: 'cn' }),
  release('AgentScope 官方发布', 'modelscope/agentscope', { region: 'cn', category: '新工具' }),
  release('ModelScope Swift 官方发布', 'modelscope/ms-swift', { region: 'cn' }),
  release('MindNLP 官方发布', 'mindspore-lab/mindnlp', { region: 'cn' }),
  release('VLMEvalKit 官方发布', 'open-compass/VLMEvalKit', { region: 'cn', category: '新算法', sourceGroup: 'research' }),
  release('InternVL 官方发布', 'OpenGVLab/InternVL', { region: 'cn', category: '新工具' }),
  release('CosyVoice 官方发布', 'FunAudioLLM/CosyVoice', { region: 'cn', category: '新工具' }),
  release('GPT-SoVITS 官方发布', 'RVC-Boss/GPT-SoVITS', { region: 'cn', category: '新工具' }),
  commit('Hunyuan3D 官方动态', 'Tencent-Hunyuan/Hunyuan3D-2', 'main', { region: 'cn', category: '新工具' }),
  commit('Step Audio 官方动态', 'stepfun-ai/Step-Audio', 'main', { region: 'cn', category: '新工具' }),
  commit('MobileAgent 官方动态', 'X-PLUG/MobileAgent', 'main', { region: 'cn', category: '新工具' }),
  commit('Alibaba DeepResearch 动态', 'Alibaba-NLP/DeepResearch', 'main', { region: 'cn', category: '新工具', sourceGroup: 'research' }),
  commit('BAAI Cradle Agent 动态', 'BAAI-Agents/Cradle', 'main', { region: 'cn', category: '新工具', sourceGroup: 'research' }),
  commit('Datawhale Self-LLM 动态', 'datawhalechina/self-llm', 'master', { region: 'cn', category: '新思路', sourceGroup: 'research' }),
  release('Datawhale Happy-LLM 发布', 'datawhalechina/happy-llm', { region: 'cn', category: '新思路', sourceGroup: 'research' })
];

const EDITORIAL_AND_RESEARCH_FEEDS = [
  feed('MIT News AI', 'https://news.mit.edu/rss/topic/artificial-intelligence2', { sourceGroup: 'research' }),
  feed('AI Snake Oil', 'https://www.aisnakeoil.com/feed', { sourceGroup: 'research', category: '新思路' }),
  feed('The Gradient', 'https://thegradient.pub/rss/', { sourceGroup: 'research', category: '新思路' }),
  feed('Latent Space', 'https://www.latent.space/feed', { category: '新思路' }),
  feed('Simon Willison AI', 'https://simonwillison.net/atom/everything/', { sourceGroup: 'engineering', category: '新工具' }),
  feed('The Register AI/ML', 'https://www.theregister.com/software/ai_ml/headlines.atom'),
  feed('InfoQ AI/ML/Data Engineering', 'https://feed.infoq.com/ai-ml-data-eng/', { sourceGroup: 'engineering', category: 'AI框架' }),
  feed('Lilian Weng Research Notes', 'https://lilianweng.github.io/index.xml', { sourceGroup: 'research', category: '新思路' }),
  feed('Chip Huyen', 'https://huyenchip.com/feed.xml', { sourceGroup: 'engineering', category: '新思路' }),
  feed('Jay Alammar', 'https://jalammar.github.io/feed.xml', { sourceGroup: 'research', category: '新思路' }),
  feed('Colah Blog', 'https://colah.github.io/rss.xml', { sourceGroup: 'research', category: '新算法' }),
  feed('Roboflow Blog', 'https://blog.roboflow.com/rss/', { sourceGroup: 'engineering', category: 'AI框架' }),
  feed('Weaviate Blog', 'https://weaviate.io/blog/rss.xml', { sourceGroup: 'engineering', category: 'AI框架' }),
  feed('Together AI Blog', 'https://www.together.ai/blog/rss.xml', { sourceGroup: 'product' }),
  feed('JetBrains AI Blog', 'https://blog.jetbrains.com/ai/feed/', { sourceGroup: 'product', category: '新工具' }),
  feed('Runpod Blog', 'https://www.runpod.io/blog/rss.xml', { sourceGroup: 'engineering', category: 'AI框架' })
];

const EXPANDED_NEWS_SOURCES = [
  ...GLOBAL_RELEASE_SOURCES,
  ...CHINA_RELEASE_SOURCES,
  ...EDITORIAL_AND_RESEARCH_FEEDS
];

module.exports = {
  EXPANDED_NEWS_SOURCES
};
