import { reactive } from 'vue';
export const diagnostics = reactive({
  logs: [] as Array<{ time: string; event: string; detail: string }>,
  prompt: '',
  response: '',
  requestTime: '',
  cacheError: '',
});
export function logDiagnostic(event: string, detail = '') {
  diagnostics.logs.unshift({ time: new Date().toLocaleTimeString(), event, detail });
  diagnostics.logs.splice(80);
}
