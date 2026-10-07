import { ref, watch } from 'vue';
import { parseCivilTime, type SystemClockSettings } from './system-clock';
import { logDiagnostic } from './diagnostics';
export const chatTimeStatus = ref('尚未发送时间戳请求');
export const CHAT_TIME_PATTERN = /<wave_time(?:_(start|end))?>[\s\S]*?<\/wave_time(?:_\1)?>/gi;
export function timeFromText(text: string): string {
  for (const tag of ['wave_time', 'wave_time_end', 'wave_time_start']) {
    const matches = [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi'))];
    for (const match of matches.reverse()) if (parseCivilTime(match[1]) !== null) return match[1].trim();
  }
  return '';
}
export function readPhoneChatTime(skipLastAssistant = false): string {
  const rows = SillyTavern.chat || [];
  let skipped = !skipLastAssistant;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || row.is_user || row.extra?.type === 'narrator') continue;
    if (!skipped) {
      skipped = true;
      continue;
    }
    const time = timeFromText(row.mes || '');
    if (time) return time;
  }
  return '';
}
export function registerChatTime(getSettings: () => SystemClockSettings) {
  let release: (() => void) | undefined;
  let requested = false;
  const clear = () => {
    release?.();
    release = undefined;
    requested = false;
  };
  function refresh(type = 'normal', notify = false) {
    clear();
    const settings = getSettings();
    if (settings.source !== 'phone') {
      chatTimeStatus.value = '未启用电波手机聊天时间戳';
      return;
    }
    const anchor = readPhoneChatTime(type === 'swipe' || type === 'regenerate') || settings.storyInitialTime;
    try {
      release = injectPrompts(
        [
          {
            id: 'wave-phone-chat-time-v1',
            role: 'system',
            position: 'in_chat',
            depth: 0,
            should_scan: false,
            content: `【电波手机：剧情结束时间记录】
每次正文回复的最后必须输出且只输出一个时间标签，表示本轮全部剧情结束时的当前时间：
<wave_time>2028/1/20 22:30</wave_time>
示例日期仅说明格式，请替换为实际剧情时间。只使用 wave_time，不再输出 wave_time_start 或 wave_time_end。时间写成 YYYY/M/D HH:mm，包含完整年份、日期和24小时制时分，标签内不加说明，不放进代码块。
${parseCivilTime(anchor) !== null ? `此前剧情结束时间基准：${anchor}。` : '如果前文没有完整时间，请根据世界观与剧情建立一个具体的剧情日期时间作为起始基准，这是剧情设定所需；不能省略标签或使用“某天”“稍后”等占位。'}
优先遵循用户明确指定的日期时间，结合本轮对话、行动、休息和跳时合理推进，跨日时更新日期；无时间经过可保持原值。不要用现实电脑时间替代剧情时间，不机械固定增加分钟。续写时在新增正文末尾输出最新结束时间；重写或切换候选时根据前文重新推算。该标签只记录剧情时间，不要求生成任何其他手机模块。`,
          },
        ],
        { once: false },
      ).uninject;
      if (notify) {
        requested = true;
        chatTimeStatus.value = '已注入本轮时间戳要求，等待正文返回';
        logDiagnostic('聊天时间已注入', `类型：${type}；基准：${anchor || '由模型按剧情建立'}`);
      }
    } catch (error) {
      clear();
      chatTimeStatus.value = `时间戳注入失败：${String(error)}`;
      logDiagnostic('聊天时间注入失败', String(error));
    }
  }
  const stopWatch = watch(
    () => [getSettings().source, getSettings().storyInitialTime],
    () => refresh(),
    { immediate: true },
  );
  const events = [
    eventOn(tavern_events.GENERATION_AFTER_COMMANDS, (type, _options, dry) => {
      if (dry) return;
      if (!['normal', 'continue', 'swipe', 'regenerate'].includes(type || 'normal')) {
        clear();
        return;
      }
      refresh(type || 'normal', true);
    }),
    eventOn(tavern_events.GENERATION_ENDED, () => {
      let result = '';
      if (requested) {
        const row = [...(SillyTavern.chat || [])].reverse().find(row => !row.is_user && row.extra?.type !== 'narrator');
        const time = timeFromText(row?.mes || '');
        result = time
          ? `本轮时间：${time}（标签已隐藏，编辑原文可查看）`
          : '已注入要求，但本轮正文未返回有效时间戳；请检查预设或模型是否遵循格式';
        logDiagnostic(time ? '聊天时间已返回' : '聊天时间未返回', result);
      }
      refresh();
      if (result) chatTimeStatus.value = result;
    }),
    eventOn(tavern_events.GENERATION_STOPPED, () => refresh()),
    eventOn(tavern_events.CHAT_CHANGED, () => {
      chatTimeStatus.value = '已切换聊天，等待新时间戳';
      refresh();
    }),
  ];
  return () => {
    stopWatch();
    clear();
    events.forEach(event => event.stop());
  };
}
