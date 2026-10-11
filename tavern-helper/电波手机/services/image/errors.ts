import { logDiagnostic } from '../core/diagnostics';

/** Keep service diagnostics useful without retaining credentials or request payloads. */
export async function checkImageResponse(response: Response, apiKey: string): Promise<Response> {
  if (response.ok) return response;
  let detail = '';
  try {
    const raw = await response.text();
    try {
      const data = JSON.parse(raw);
      const message = data?.error?.message ?? data?.message ?? data?.error ?? data?.detail;
      detail = typeof message === 'string' ? message : '';
    } catch {
      // Proxy errors may be plain text; HTML error pages are not useful in the phone UI.
      if (!/<(?:!doctype|html|body)\b/i.test(raw)) detail = raw;
    }
  } catch {
    // Preserve HTTP status even when reading the error body fails.
  }
  if (apiKey.trim()) {
    for (const secret of [apiKey.trim(), encodeURIComponent(apiKey.trim())])
      detail = detail.split(secret).join('[已隐藏密钥]');
  }
  detail = detail
    .replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏密钥]')
    .replace(/\b(?:sk-|nai-)[\w-]+/gi, '[已隐藏密钥]')
    .replace(/https?:\/\/\S+/gi, '[服务地址]')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 1000);
  const message = `生图服务返回 ${response.status}：${detail || '服务未提供可显示的错误详情，请检查模型权限、密钥、额度与参数'}`;
  logDiagnostic('生图请求失败', message);
  throw Error(message);
}
