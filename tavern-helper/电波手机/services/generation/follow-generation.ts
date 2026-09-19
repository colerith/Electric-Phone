import { readChatFloor, writeChatFloor } from '../chat/chat-reader';
import { SPEECH_TAG_PATTERN } from '../chat/speech-tags';
import { validateWalletPatch, type WalletAuthorization } from '../wallet/wallet-accounts';
import { ModuleSettingsSchema, type ModuleSettings } from './module-settings';
import { isLimitedApp, limitModulePatch, mergeLimitedModule, type RoundBudget } from './module-updates';
import { ELECTRIC_PATTERN } from './electric';
import { MOMENTS_PATTERN } from '../space/moments';
import type { AppId, AppSnapshot, ScriptSettings } from '../../schemas';
import { buildModulePrompt, type PhonePromptInput } from '../../prompts';
import { isCardExcluded, stripExcludedTags } from './context-controls';
import { logDiagnostic } from '../core/diagnostics';
import {
  DATA_PATTERN,
  HTML_PATTERN,
  MODULE_LABELS,
  readModuleDeltas,
  serializeDelta,
  stripInlineCards,
} from './module-protocol';
const PROMPT_ID = 'wave-phone-follow-v1';
export function chooseFollowModule(settings: ScriptSettings['generation'], random = Math.random): AppId | null {
  if (!settings.followEnabled || !settings.modules.length || random() * 100 >= settings.probability) return null;
  return (
    settings.modules[Math.min(settings.modules.length - 1, Math.floor(random() * settings.modules.length))] || null
  );
}
export function chooseFollowModules(settings: ScriptSettings['generation'], random = Math.random): AppId[] {
  if (!settings.followEnabled) return [];
  const required = [...new Set(settings.requiredModules || [])];
  const pool = [...new Set(settings.modules)].filter(id => !required.includes(id));
  if (!pool.length || random() * 100 >= settings.probability) return required;
  const low = Math.max(1, Math.min(4, settings.randomMin ?? 1, settings.randomMax ?? 2));
  const high = Math.max(low, Math.min(4, Math.max(settings.randomMin ?? 1, settings.randomMax ?? 2)));
  const count = Math.min(pool.length, low + Math.floor(random() * (high - low + 1)));
  const chosen: AppId[] = [];
  for (let i = 0; i < count; i++)
    chosen.push(pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1)[0]);
  return [...required, ...chosen];
}
export async function installPhoneRegexes(): Promise<void> {
  const base = {
    enabled: true,
    run_on_edit: true,
    scope: 'global' as const,
    replace_string: '',
    source: { user_input: true, ai_output: true, slash_command: false, world_info: false },
    min_depth: null,
    max_depth: null,
  };
  const rules: TavernRegex[] = [
    {
      ...base,
      id: 'wave-phone-speech-display-v1',
      script_name: '电波手机 · 语音标签视觉隐藏',
      find_regex: `/${SPEECH_TAG_PATTERN.source}/g`,
      destination: { display: true, prompt: false },
    },
    {
      ...base,
      id: 'wave-phone-inline-prompt-v1',
      script_name: '电波手机 · 旧卡片与 Ecot 不发送',
      find_regex: `/(?:${HTML_PATTERN.source}|${ELECTRIC_PATTERN.source})/gi`,
      destination: { display: false, prompt: true },
    },
    {
      ...base,
      id: 'wave-phone-data-display-v1',
      script_name: '电波手机 · 数据块隐藏',
      find_regex: `/(?:${DATA_PATTERN.source}|${MOMENTS_PATTERN.source}|${ELECTRIC_PATTERN.source})/gi`,
      destination: { display: true, prompt: false },
    },
  ];
  const current = getTavernRegexes({ scope: 'global' });
  if (
    rules.every(rule => {
      const existing = current.find(item => item.id === rule.id);
      return (
        existing &&
        Object.entries(rule).every(
          ([key, value]) => JSON.stringify(existing[key as keyof TavernRegex]) === JSON.stringify(value),
        )
      );
    })
  )
    return;
  await updateTavernRegexesWith(
    existing => [...existing.filter(item => !rules.some(rule => rule.id === item.id)), ...rules],
    { scope: 'global' },
  );
  logDiagnostic('正则已安装', '只维护电波手机的内置规则，保留其他全局正则');
}
/** Apply the request-time caps before persisted floor data is synchronized. */
export function constrainPhoneFloor(
  text: string,
  policy: ModuleSettings,
  charId: string,
  previous: AppSnapshot,
  walletGrant?: WalletAuthorization,
): string {
  const snapshots = new Map<string, Partial<AppSnapshot>>([[charId, { ...previous }]]);
  const budgets = new Map<string, RoundBudget>();
  return stripInlineCards(text).replace(new RegExp(DATA_PATTERN.source, 'g'), block => {
    const delta = readModuleDeltas(block)[0];
    if (!delta) return block;
    if (delta.app_updates.wallet !== undefined) {
      try {
        if (!walletGrant || delta.char_id !== charId) throw Error('未授权的钱包更新');
        delta.app_updates.wallet = { ...validateWalletPatch(delta.app_updates.wallet, walletGrant), ...walletGrant };
      } catch {
        delete delta.app_updates.wallet;
      }
    }
    const snapshot = snapshots.get(delta.char_id) || {};
    const budget = budgets.get(delta.char_id) || {};
    for (const [app, update] of Object.entries(delta.app_updates)) {
      if (!isLimitedApp(app)) continue;
      const current = snapshot[app] || '';
      const patch = limitModulePatch(app, current, update, policy, budget);
      delta.app_updates[app] = patch;
      snapshot[app] = mergeLimitedModule(app, current, patch, policy);
    }
    snapshots.set(delta.char_id, snapshot);
    budgets.set(delta.char_id, budget);
    return serializeDelta(delta);
  });
}
export function registerFollowGeneration(
  getInput: () => { settings: ScriptSettings; input: PhonePromptInput; chatReference?: string } | null,
  isManualBusy: () => boolean,
  onRequest?: (settings: ScriptSettings, type: string) => void,
): () => void {
  let injection: { uninject: () => void } | null = null;
  let generationContext = '';
  let request: {
    policy: ModuleSettings;
    charId: string;
    snapshot: AppSnapshot;
    walletGrant?: WalletAuthorization;
  } | null = null;
  const clear = () => {
    injection?.uninject();
    injection = null;
    generationContext = '';
    request = null;
  };
  const events = [
    eventOn(tavern_events.GENERATION_AFTER_COMMANDS, (type, _options, dryRun) => {
      try {
        clear();
        if (dryRun || !['normal', 'continue', 'swipe', 'regenerate'].includes(type) || isManualBusy()) return;
        const runtime = getInput();
        if (!runtime || isCardExcluded(runtime.settings, runtime.input.cardName)) return;
        generationContext = JSON.stringify([runtime.input.cardKey, runtime.input.chatKey]);
        const modules =
          runtime.input.identity.source === 'local_group' ? [] : chooseFollowModules(runtime.settings.generation);
        const reference = runtime.settings.generation.shareChatContext ? runtime.chatReference || '' : '';
        if (!modules.length && !reference) return;
        request = {
          policy: ModuleSettingsSchema.parse(runtime.settings.moduleSettings),
          charId: runtime.input.identity.stableId || runtime.input.identity.charKey,
          snapshot: { ...runtime.input.appSnapshot },
          walletGrant: runtime.input.walletAuthorization ? { ...runtime.input.walletAuthorization } : undefined,
        };
        onRequest?.(runtime.settings, type);
        injection = injectPrompts(
          [
            {
              id: PROMPT_ID,
              role: 'system',
              position: 'in_chat',
              depth: 0,
              should_scan: false,
              content: stripExcludedTags(
                [reference, modules.length ? buildModulePrompt(runtime.input, modules, true) : '']
                  .filter(Boolean)
                  .join('\n\n'),
                runtime.settings.basic.excludedTags,
              ),
            },
          ],
          { once: true },
        );
        logDiagnostic(
          '跟随生成',
          `模块：${modules.map(id => MODULE_LABELS[id]).join('、') || '无'}；手机上下文：${reference ? '已提供' : '无'}，system 深度 0`,
        );
      } catch (error) {
        clear();
        logDiagnostic('跟随注入失败', String(error));
      }
    }),
    eventOn(tavern_events.GENERATION_ENDED, messageId => {
      const namespace = generationContext;
      const captured = request;
      clear();
      const runtime = getInput();
      if (
        !runtime ||
        namespace !== JSON.stringify([runtime.input.cardKey, runtime.input.chatKey]) ||
        !captured ||
        isCardExcluded(runtime.settings, runtime.input.cardName)
      )
        return;
      try {
        const message = readChatFloor(messageId);
        if (!message || message.role !== 'assistant') return;
        const constrained = constrainPhoneFloor(
          message.message,
          captured.policy,
          captured.charId,
          captured.snapshot,
          captured.walletGrant,
        );
        if (constrained !== message.message)
          void writeChatFloor(message.message_id, message.message, constrained).catch(error =>
            logDiagnostic('手机数据整理失败', String(error)),
          );
      } catch (error) {
        logDiagnostic('手机数据整理失败', String(error));
      }
    }),
    eventOn(tavern_events.GENERATION_STOPPED, clear),
    eventOn(tavern_events.CHAT_CHANGED, clear),
  ];
  return () => {
    clear();
    events.forEach(event => event.stop());
  };
}
