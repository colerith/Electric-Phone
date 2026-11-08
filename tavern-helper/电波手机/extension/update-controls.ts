import {
  branchChoices,
  preparePhoneRelease,
  checkExtensionUpdate,
  updateExtension,
  extensionRequest,
  type ExtensionBranch,
  type ExtensionVersion,
} from '../services/core/extension-update';

export function installUpdateControls(container: HTMLElement): void {
  const section = document.createElement('section');
  section.className = 'wave-ext-updates';
  section.innerHTML = `<div class="wave-ext-section-head"><strong>版本与更新</strong><span class="wave-ext-branch">尚未检查分支</span></div>
    <div class="wave-ext-update-banner" role="status" hidden><strong></strong><span>点击下方更新，完成后刷新页面</span></div>
    <div class="wave-ext-actions"><button type="button" class="menu_button wave-ext-check"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> 检查更新</button><button type="button" class="menu_button wave-ext-update" hidden><i class="fa-solid fa-download" aria-hidden="true"></i> 更新并刷新</button></div>
    <div class="wave-ext-section-head"><strong>切换分支</strong><small>切换完成后刷新页面</small></div>
    <div class="wave-ext-channels"><button type="button" class="menu_button" data-branch="main"><strong>main</strong><small>正式版</small></button><button type="button" class="menu_button" data-branch="beta"><strong>beta</strong><small>测试版</small></button></div>
    <div class="wave-ext-actions wave-ext-branch-picker"><select aria-label="其他分支"><option value="">选择其他分支</option></select><button type="button" class="menu_button wave-ext-list">获取分支</button><button type="button" class="menu_button wave-ext-switch" disabled>切换</button></div>
    <p class="wave-ext-update-status" role="status" aria-live="polite">检查当前分支更新，或选择要使用的分支。</p><button type="button" class="menu_button wave-ext-reload" hidden>刷新以加载已切换分支</button>`;
  container.append(section);
  const badge = document.createElement('span');
  badge.className = 'wave-ext-new';
  badge.textContent = 'New!';
  badge.hidden = true;
  container.parentElement?.querySelector('.inline-drawer-header strong')?.append(badge);
  const get = <T extends HTMLElement>(selector: string) => section.querySelector<T>(selector)!;
  const check = get<HTMLButtonElement>('.wave-ext-check');
  const update = get<HTMLButtonElement>('.wave-ext-update');
  const list = get<HTMLButtonElement>('.wave-ext-list');
  const select = get<HTMLSelectElement>('select');
  const change = get<HTMLButtonElement>('.wave-ext-switch');
  const reload = get<HTMLButtonElement>('.wave-ext-reload');
  const status = get<HTMLParagraphElement>('.wave-ext-update-status');
  let busy = false,
    current = '',
    choices: ReturnType<typeof branchChoices> = [];
  function render() {
    section.setAttribute('aria-busy', String(busy));
    section.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select').forEach(el => {
      el.disabled = busy;
    });
    change.disabled = busy || !select.value || select.value === current;
    section.querySelectorAll<HTMLButtonElement>('[data-branch]').forEach(button => {
      const selected = button.dataset.branch === current;
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = busy || selected;
    });
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    render();
    try {
      await action();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '操作失败，请重试';
    } finally {
      busy = false;
      render();
    }
  }
  function showVersion(data: ExtensionVersion) {
    if (!data.remoteUrl) throw Error('当前安装不是 Git 仓库，无法在线更新或切换分支');
    current = data.currentBranchName;
    get('.wave-ext-branch').textContent = current ? `当前：${current}` : '未关联分支';
    update.hidden = data.isUpToDate;
    badge.hidden = data.isUpToDate;
    get('.wave-ext-update-banner').hidden = data.isUpToDate;
    get('.wave-ext-update-banner strong').textContent = data.latestVersion
      ? `发现新版本：${data.latestVersion}`
      : '发现当前分支的新更新';
    status.textContent = data.isUpToDate ? '当前分支已是最新版本。' : '发现新提交，点击“更新并刷新”安装。';
  }
  async function loadBranches() {
    choices = branchChoices(await extensionRequest<ExtensionBranch[]>('branches'));
    select.replaceChildren(new Option('选择其他分支', ''));
    for (const row of choices) select.add(new Option(row.name, row.name));
  }
  async function switchBranch(name: string) {
    status.textContent = `正在切换到 ${name}…`;
    await loadBranches();
    const target = choices.find(row => row.name === name);
    if (!target) throw Error(`未找到 ${name} 分支`);
    await extensionRequest('switch', { branch: target.ref });
    current = name;
    badge.hidden = true;
    get('.wave-ext-update-banner').hidden = true;
    update.hidden = true;
    reload.hidden = false;
    get('.wave-ext-branch').textContent = `当前：${current}（待刷新）`;
    status.textContent = '分支已切换，正在拉取最新提交…';
    try {
      await updateExtension();
    } catch (error) {
      throw Error(
        `已切换到 ${name}，但更新失败。可重试检查更新，或点击下方刷新。${error instanceof Error ? error.message : ''}`,
      );
    }
    window.location.reload();
  }
  check.onclick = () =>
    void run(async () => {
      status.textContent = '正在检查当前分支…';
      showVersion(await checkExtensionUpdate());
    });
  update.onclick = () =>
    void run(async () => {
      status.textContent = '正在更新，完成后刷新页面…';
      await updateExtension();
      window.location.reload();
    });
  list.onclick = () =>
    void run(async () => {
      status.textContent = '正在获取分支…';
      await loadBranches();
      status.textContent = '已获取分支，请选择后点击切换。';
    });
  section.querySelectorAll<HTMLButtonElement>('[data-branch]').forEach(button => {
    button.onclick = () => void run(() => switchBranch(button.dataset.branch!));
  });
  select.onchange = render;
  change.onclick = () => {
    const name = select.value;
    if (name) void run(() => switchBranch(name));
  };
  reload.onclick = () =>
    void run(async () => {
      await preparePhoneRelease();
      window.location.reload();
    });
  render();
  check.click();
}
