import { z } from 'zod';
export const WeatherLocationSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  country: z.string().prefault(''),
  admin1: z.string().prefault(''),
  timezone: z.string().prefault('auto'),
});
export type WeatherLocation = z.infer<typeof WeatherLocationSchema>;
const number = z.number().nullable();
export const WeatherResponseSchema = z.object({
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    temperature_2m: number,
    relative_humidity_2m: number,
    precipitation: number,
    weather_code: number,
    wind_speed_10m: number,
  }),
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(number),
    temperature_2m_min: z.array(number),
  }),
});
export type WeatherResponse = z.infer<typeof WeatherResponseSchema>;
const cache = new Map<string, { time: number; data: WeatherResponse }>();
async function request(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`天气服务暂不可用（${response.status}）`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
export async function searchWeatherLocations(name: string, signal?: AbortSignal): Promise<WeatherLocation[]> {
  if (name.trim().length < 2) return [];
  const query = new URLSearchParams({ name: name.trim(), count: '8', language: 'zh', format: 'json' });
  const raw = await request(`https://geocoding-api.open-meteo.com/v1/search?${query}`, signal);
  return z.object({ results: z.array(WeatherLocationSchema).prefault([]) }).parse(raw).results;
}
export function weatherUrl(location: WeatherLocation): string {
  const query = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    wind_speed_unit: 'ms',
    forecast_days: '1',
  });
  return `https://api.open-meteo.com/v1/forecast?${query}`;
}
export async function fetchWeather(
  location: WeatherLocation,
  signal?: AbortSignal,
  force = false,
): Promise<WeatherResponse> {
  const key = `${location.latitude},${location.longitude}`;
  const previous = cache.get(key);
  if (!force && previous && Date.now() - previous.time < 15 * 60 * 1000) return previous.data;
  const data = WeatherResponseSchema.parse(await request(weatherUrl(location), signal));
  if (signal?.aborted) throw new Error('请求已取消');
  cache.set(key, { time: Date.now(), data });
  return data;
}
export function weatherLabel(code: number | null): { text: string; icon: string } {
  if (code === 0) return { text: '晴', icon: 'fa-sun' };
  if (code !== null && [1, 2, 3].includes(code)) return { text: '多云', icon: 'fa-cloud-sun' };
  if (code !== null && [45, 48].includes(code)) return { text: '雾', icon: 'fa-smog' };
  if (code !== null && [51, 53, 55, 56, 57].includes(code)) return { text: '毛毛雨', icon: 'fa-cloud-rain' };
  if (code !== null && [61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return { text: '雨', icon: 'fa-cloud-showers-heavy' };
  if (code !== null && [71, 73, 75, 77, 85, 86].includes(code)) return { text: '雪', icon: 'fa-snowflake' };
  if (code !== null && [95, 96, 99].includes(code)) return { text: '雷雨', icon: 'fa-cloud-bolt' };
  return { text: '天气未知', icon: 'fa-cloud' };
}
