type ExtensionTarget = { extensionName: string; global: boolean };
export type ExtensionVersion = {
  currentBranchName: string;
  currentCommitHash: string;
  isUpToDate: boolean;
  remoteUrl: string;
};
export type ExtensionBranch = { name: string; current: boolean };
let target: ExtensionTarget | undefined;
async function locate(): Promise<ExtensionTarget> {
  if (target) return target;
  const response = await fetch('/api/extensions/discover', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`无法读取扩展列表（${response.status}）`);
  const rows = await response.json();
  for (const row of rows) {
    if (!['local', 'global'].includes(row.type)) continue;
    const response = await fetch(`/scripts/extensions/${row.name}/manifest.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) continue;
    const manifest = await response.json();
    if (manifest.homePage?.replace(/\/$/, '').toLowerCase() !== 'https://github.com/colerith/electric-phone') continue;
    target = { extensionName: row.name.replace(/^third-party\//, ''), global: row.type === 'global' };
    return target;
  }
  throw Error('未找到电波手机扩展，请使用 Git 安装的扩展版');
}
export async function extensionRequest<T>(
  action: 'version' | 'update' | 'branches' | 'switch',
  extra: { branch?: string } = {},
): Promise<T> {
  const body = await locate();
  const host = (window as any).SillyTavern?.getContext?.();
  if (!host?.getRequestHeaders) throw Error('酒馆接口未就绪，请刷新后重试');
  const response = await fetch(`/api/extensions/${action}`, {
    method: 'POST',
    headers: host.getRequestHeaders(),
    body: JSON.stringify({ ...body, ...extra }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    if (response.status === 403) throw Error('没有修改此扩展的权限；全局安装需要管理员操作');
    if (response.status === 404) throw Error('当前酒馆不支持此操作，或分支／扩展目录不存在');
    throw Error(`扩展服务返回 ${response.status}，请检查网络和酒馆日志；本地改动也可能阻止更新或切换`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function branchChoices(rows: ExtensionBranch[]): Array<{ name: string; ref: string }> {
  const choices = new Map<string, string>();
  for (const row of rows) {
    const name = row.name.replace(/^origin\//, '');
    if (!name || name === 'HEAD' || name.includes(' -> ')) continue;
    if (!choices.has(name) || row.name.startsWith('origin/')) choices.set(name, row.name);
  }
  return [...choices].map(([name, ref]) => ({ name, ref }));
}
