const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('src/util/酒馆助手脚本/电波手机');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const weather = read('services/core/weather.ts');
const calendar = read('components/apps/WaveCalendarPanel.vue');
const schemas = read('schemas.ts');
const store = read('stores/phone.ts');
const app = read('app.vue');
const chatPreferences = read('components/chat/WaveChatPreferences.vue');
const settingsStyle = read('styles/settings/settings.scss');

assert.match(weather, /apparent_temperature: number/);
assert.match(
  weather,
  /current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m'/,
);
assert.doesNotMatch(weather, /precipitation/);
assert.match(calendar, /<small>体感<\/small><b>{{ number\(weather\.current\.apparent_temperature\) }}°C<\/b>/);
assert.doesNotMatch(calendar, /降水|precipitation/);

assert.match(schemas, /weatherLocation: WeatherLocationSchema\.nullable\(\)\.optional\(\)/);
assert.match(store, /const weatherLocation = computed<WeatherLocation \| null>/);
assert.match(store, /characterProfiles\.value\[profileKey\][\s\S]*?weatherLocation:/);
assert.match(store, /function migrateLegacyWeatherLocation\(\)/);
assert.match(app, /:weather-location="store\.weatherLocation"/);
assert.match(app, /:location="store\.weatherLocation"/);
assert.match(chatPreferences, /phone\.weatherLocation/);

assert.match(settingsStyle, /\.credits-card-heading \.wave-settings-title\s*\{[\s\S]*?padding: 2px 0 0;/);

console.log('PASS: per-character calendar locations, apparent temperature and compact credits headings are wired.');
