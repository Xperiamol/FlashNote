// 非流式文本生成共用的响应检查。不要把“只有 reasoning / 拒答 / 截断”当成成功。
const extractTextResponse = (data, provider = 'openai') => {
  const choice = provider === 'qwen' ? data.output?.choices?.[0] : data.choices?.[0];
  const message = choice?.message;
  const finishReason = choice?.finish_reason ?? data.output?.finish_reason;
  const raw = provider === 'qwen' ? (data.output?.text ?? message?.content) : message?.content;
  const content = Array.isArray(raw)
    ? raw.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('')
    : (typeof raw === 'string' ? raw : '');
  if (message?.refusal || finishReason === 'content_filter') {
    throw new Error('模型内容审核拦截，未返回可用正文');
  }
  if (finishReason === 'length') {
    throw new Error('模型输出被 token 上限截断，请提高模型输出额度或缩小生成内容');
  }
  if (!content.trim()) {
    throw new Error(message?.reasoning_content || message?.reasoning
      ? '模型仅返回推理过程，未返回正文，请检查模型输出额度或更换模型'
      : '模型返回空正文，请检查 AI 服务配置后重试');
  }
  return { content, usage: data.usage, finishReason };
};

module.exports = { extractTextResponse };
