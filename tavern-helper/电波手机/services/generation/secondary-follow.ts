import { APP_IDS } from '../../schemas';
import { appApiMode } from './app-api';
import { watchEffect } from 'vue';
import type { AppId, ScriptSettings } from '../../schemas';
import { readChatFloor, readChatFloors } from '../chat/chat-reader';
import { logDiagnostic } from '../core/diagnostics';
import { chooseFollowModules } from './follow-generation';

export type SecondaryFollowJob = {
  modules: AppId[];
  message: ChatMessage;
  signal: AbortSignal;
  isCurrent: () => boolean;
};

/** Pair a real generation with its final render, never an edit, reload or our own writeback. */
export function registerSecondaryFollow(
  getContext: () => { key: string; settings: ScriptSettings } | null,
  run: (job: SecondaryFollowJob) => Promise<void>,
  selectModules: typeof chooseFollowModules = chooseFollowModules,
): () => void {
  let pending: { key: string; modules: AppId[]; minFloor: number } | null = null;
  let controller: AbortController | undefined;
  let activeKey = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const enabled = () => {
    const context = getContext();
    return context?.settings.generation.followEnabled &&
      APP_IDS.some(app => appApiMode(context.settings, app) === 'secondary_api')
      ? {
          ...context,
          key: JSON.stringify([context.key, context.settings.sendMode, context.settings.generation.appApis]),
        }
      : null;
  };
  const clear = () => {
    pending = null;
    clearTimeout(timer);
    controller?.abort();
    controller = undefined;
    activeKey = '';
  };
  const stopWatch = watchEffect(() => {
    const context = enabled();
    if (!context || (pending && pending.key !== context.key) || (activeKey && activeKey !== context.key)) clear();
  });
  const events = [
    eventOn(tavern_events.GENERATION_AFTER_COMMANDS, (type, _options, dry) => {
      // Auxiliary/quiet requests must not cancel the real generation's pending job.
      if (dry || !['normal', 'continue', 'swipe', 'regenerate'].includes(type)) return;
      clear();
      const context = enabled();
      if (context)
        pending = {
          key: context.key,
          minFloor: Math.max(-1, ...readChatFloors().map(row => row.message_id)) + (type === 'normal' ? 1 : 0),
          modules: selectModules(context.settings.generation).filter(
            app => appApiMode(context.settings, app) === 'secondary_api',
          ),
        };
    }),
    eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, id => {
      const captured = pending;
      if (!captured || captured.key !== enabled()?.key || id < captured.minFloor) return;
      if (readChatFloor(id)?.role !== 'assistant') return;
      pending = null;
      const active = new AbortController();
      controller = active;
      activeKey = captured.key;
      const swipe = SillyTavern.chat?.[id]?.swipe_id;
      // Let ST finish saving the generated floor before reading context and starting the side request.
      timer = setTimeout(() => {
        const latest = readChatFloor(id);
        if (!latest || latest.role !== 'assistant') return;
        const message = { ...latest };
        const isCurrent = () =>
          !active.signal.aborted &&
          enabled()?.key === captured.key &&
          SillyTavern.chat?.[id]?.swipe_id === swipe &&
          readChatFloor(id)?.message === message.message;
        if (!isCurrent()) return;
        void run({ modules: captured.modules, message, signal: active.signal, isCurrent })
          .catch(error => {
            if (!active.signal.aborted) logDiagnostic('副 API 跟随失败', String(error));
          })
          .finally(() => {
            if (controller === active) {
              controller = undefined;
              activeKey = '';
            }
          });
      }, 0);
    }),
    eventOn(tavern_events.GENERATION_STOPPED, clear),
    eventOn(tavern_events.CHAT_CHANGED, clear),
    eventOn(tavern_events.MESSAGE_SWIPED, () => {
      // A generated swipe is still waiting for its final render. A manual swipe only cancels in-flight work.
      if (!pending) clear();
    }),
    eventOn(tavern_events.MESSAGE_DELETED, clear),
  ];
  return () => {
    stopWatch();
    clear();
    events.forEach(event => event.stop());
  };
}
