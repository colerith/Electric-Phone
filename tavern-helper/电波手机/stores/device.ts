import { defineStore } from 'pinia';
import { ref } from 'vue';
import { advancePower, normalizePower, powerPrompt, POWER_KEY } from '../services/core/power';
export const useDeviceStore = defineStore('wave-device-power', () => {
  const power = ref(advancePower(normalizePower(getVariables({ type: 'script' })?.[POWER_KEY])));
  const signal = ref(4);
  function persist() {
    const variables = getVariables({ type: 'script' }) || {};
    replaceVariables({ ...variables, [POWER_KEY]: { ...power.value } }, { type: 'script' });
  }
  function tick() {
    power.value = advancePower(power.value);
    const previous = signal.value;
    signal.value = Math.max(2, Math.min(4, previous + (Math.random() < 0.5 ? -1 : 1)));
    const threshold = power.value.level <= 5 ? 5 : power.value.level <= 20 ? 20 : 0;
    let warning = '';
    if (!power.value.charging && threshold && power.value.lastWarning !== threshold) {
      power.value.lastWarning = threshold;
      warning = `手机电量剩余 ${Math.ceil(power.value.level)}%，点击右上角电池可以充电。下次请求回复时，角色也会收到低电量提示。`;
    }
    persist();
    return warning;
  }
  function toggleCharging() {
    power.value = advancePower(power.value);
    power.value.charging = !power.value.charging;
    persist();
  }
  function context() {
    power.value = advancePower(power.value);
    persist();
    return powerPrompt(power.value);
  }
  return { power, signal, tick, toggleCharging, context };
});
