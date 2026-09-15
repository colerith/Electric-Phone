export type PowerState = { level: number; charging: boolean; updatedAt: number; lastWarning: number };
export const POWER_KEY = 'wave_phone_power';
export function normalizePower(value: Partial<PowerState> | null | undefined, now = Date.now()): PowerState {
  return {
    level: Number.isFinite(value?.level) ? Math.max(0, Math.min(100, Number(value!.level))) : 100,
    charging: value?.charging === true,
    updatedAt:
      Number.isFinite(value?.updatedAt) && Number(value!.updatedAt) > 0 ? Math.min(now, Number(value!.updatedAt)) : now,
    lastWarning: [0, 5, 20].includes(Number(value?.lastWarning)) ? Number(value!.lastWarning) : 0,
  };
}
export function advancePower(value: PowerState, now = Date.now()): PowerState {
  const minutes = Math.max(0, now - value.updatedAt) / 60000;
  const level = Math.max(0, Math.min(100, value.level + minutes * (value.charging ? 1 : -0.12)));
  return {
    ...value,
    level,
    updatedAt: Math.max(now, value.updatedAt),
    lastWarning: level > 20 ? 0 : value.lastWarning,
  };
}
export function powerPrompt(value: PowerState): string {
  const percent = Math.ceil(value.level);
  return `[手机设备状态（电波手机内的持久电量，不代表现实设备电池）]\nUser 手机剩余电量 ${percent}%，${value.charging ? '已接上充电器，正在充电' : '未充电，按实际经过时间耗电'}。${percent <= 5 ? '系统低电量提醒：电量即将耗尽。' : percent <= 20 ? '系统低电量提醒：电量不足 20%。' : ''}\n此状态已共享给当前 Char；可以自然提醒充电或理解回复变慢，不责备、不连续催促，不虚构断线或已替 User 接上充电器。充电只能由用户操作，角色的文字不能改变电量。`;
}
