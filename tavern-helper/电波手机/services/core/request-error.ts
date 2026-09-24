export type RequestStage = '配置检查' | '准备上下文' | '请求接口' | '读取响应' | '校验回复' | '应用回复';

export function redactDiagnostic(text: string, secrets: string[] = []): string {
  for (const secret of secrets.filter(Boolean)) text = text.replaceAll(secret, '[已隐藏]');
  return text
    .replace(/(Bearer\s+)\S+/gi, '$1[已隐藏]')
    .replace(/([?&](?:key|api_key|token|access_token)=)[^&\s]+/gi, '$1[已隐藏]');
}

export function describeRequestError(error: unknown, stage: RequestStage, secrets: string[] = []) {
  const record = error && typeof error === 'object' ? (error as Record<string, any>) : {};
  const raw =
    [
      record.message || (typeof error === 'string' ? error : ''),
      record.statusText,
      record.responseJSON?.error?.message,
      record.cause?.message,
    ]
      .filter(Boolean)
      .join(' · ') || String(error);
  const text = redactDiagnostic(raw, secrets).slice(0, 2400);
  const status =
    Number(
      record.status ||
        record.response?.status ||
        raw.match(/\b(?:HTTP(?:\/[\d.]+)?|status(?: code)?|状态码)[^\d]{0,12}([45]\d{2})\b/i)?.[1] ||
        raw.match(/^\s*(?:error:?\s*)?([45]\d{2})\b/i)?.[1],
    ) || undefined;
  let category = '未知错误',
    hint = '接口未提供足够信息，请结合酒馆控制台和服务端日志排查。',
    retryable = stage === '请求接口';
  if (/abort|cancel|停止|取消/i.test(raw) || record.name === 'AbortError') {
    category = '已取消';
    hint = '请求已停止或聊天已切换。';
    retryable = false;
  } else if (/timeout|timed out|超时/i.test(raw)) {
    category = '请求超时';
    hint = '可增加单次超时，或缩短正式聊天上下文。';
    retryable = true;
  } else if (
    /context.{0,30}(length|limit|window)|maximum.{0,20}tokens|token.{0,20}(limit|exceed)|上下文预算|上下文.{0,8}(超|不足)/i.test(
      raw,
    ) ||
    status === 413
  ) {
    category = '上下文超限';
    hint = '减少历史和世界书内容，并为回复预留空间；连接测试不包含正式上下文。';
    retryable = false;
  } else if (status === 401 || status === 403) {
    category = '鉴权或权限';
    hint = '检查密钥、模型权限及代理访问限制。';
    retryable = false;
  } else if (status === 429 || /quota|余额|配额|rate.limit/i.test(raw)) {
    category = '限流或配额';
    hint = '检查余额和请求频率，稍后重试。';
    retryable = true;
  } else if (/content.filter|safety|blocked|拒绝|安全策略/i.test(raw)) {
    category = '内容被拦截';
    hint = '检查服务端返回的拦截原因。';
    retryable = false;
  } else if (status && status >= 500) {
    category = '服务端故障';
    hint = 'API 或代理服务暂时异常，可稍后重试。';
    retryable = true;
  } else if (status === 400 || status === 422 || status === 404) {
    category = '请求参数或地址';
    hint = '检查模型、Endpoint 和采样参数是否受服务端支持。';
    retryable = false;
  } else if (
    /failed to fetch|network|fetch failed|load failed|cors|连接|断网|网络/i.test(raw) &&
    stage === '请求接口'
  ) {
    category = '网络或跨域';
    hint = '浏览器无法区分断网、代理故障与 CORS 拦截，请查看网络面板。';
    retryable = true;
  } else if (stage === '校验回复') {
    category = '回复格式不匹配';
    hint = '接口已返回内容，但 JSON、字段类型或回复条数不符合协议；检查原始回复及最大回复长度。';
    retryable = true;
  } else if (stage === '读取响应') {
    category = /空内容/.test(raw) ? '空响应' : '响应类型不匹配';
    hint = '检查模型是否只返回思考内容、回复被截断或代理响应格式不兼容。';
    retryable = true;
  } else if (stage === '配置检查') {
    category = '配置错误';
    hint = '检查副 API 开关、模型和地址。';
  } else if (stage === '准备上下文') {
    category = '上下文准备失败';
    hint = '检查角色卡、历史楼层及世界书读取；此阶段尚未请求 API。';
  } else if (stage === '应用回复') {
    category = '本地处理失败';
    hint = '接口可能已成功，请检查数据合并或存储错误。';
  }
  return {
    category,
    status,
    retryable,
    detail: `${category}｜阶段：${stage}${status ? `｜HTTP ${status}` : ''}｜${text}\n${hint}`,
  };
}
