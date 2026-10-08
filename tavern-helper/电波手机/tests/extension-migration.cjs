const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(fs.existsSync('src/util/酒馆助手脚本/电波手机') ? 'src/util/酒馆助手脚本/电波手机' : 'tavern-helper/电波手机');
const schema = { safeParse(value) { return value.invalid ? { success: false } : { success: true, data: structuredClone(value) }; } };
let scripts, globals, extension, writes, applied, flushed;
const reset = () => {
 scripts = [{ id: 'old', active: false, data: { settings: { data: { api: 'old' } }, profiles: { hero: 1 } } }];
 globals = { settings: { data: { api: 'new' } }, unrelated: 42, chat: ['keep'] };
 extension = { settings: { data: { stale: true } }, unrelated: 'keep' }; writes = applied = flushed = 0;
};
const mocks = {
 '../schemas': { SCRIPT_VARIABLE_KEY: 'settings', PROFILE_VARIABLE_KEY: 'profiles', USER_PROFILE_VARIABLE_KEY: 'users', CARD_ROSTER_VARIABLE_KEY: 'rosters', WAVE_PHONE_IDENTIFIER: 'wave', WAVE_PHONE_STORAGE_VERSION: 1, ScriptSettingsSchema: schema, CharacterProfileMapSchema: schema, CardRosterMapSchema: schema },
 '../services/core/character-defaults': { CHARACTER_DEFAULTS_KEY: 'defaults', CharacterDefaultsMapSchema: schema },
 '../services/space/moments': { MomentUserProfileMapSchema: schema },
 '../services/core/durable-storage': { readPhoneGlobals: () => structuredClone(globals), writePhoneGlobals: value => { globals = value; writes++; }, flushPhoneStorage: async () => { flushed++; } },
 './bridge': { legacyScripts: () => structuredClone(scripts), getVariables: () => structuredClone(extension), replaceVariables: value => { extension = value; writes++; } },
};
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'extension/migration.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = { exports: {} };
new Function('require', 'module', 'exports', code)(id => mocks[id] || require(id), m, m.exports);
const migrate = id => m.exports.migrateScriptSettings(id, async () => { applied++; });
(async () => {
 reset(); const original = structuredClone(scripts);
 assert.equal(await migrate('old'), 2);
 assert.equal(globals.settings.data.api, 'old');
 assert.equal(globals.unrelated, 42); assert.deepEqual(globals.chat, ['keep']);
 assert.equal(extension.settings, undefined); assert.equal(extension.unrelated, 'keep');
 assert.ok(extension.__wave_manual_migration_backup); assert.deepEqual(scripts, original);
 assert.equal(applied, 1); assert.equal(flushed, 1);
 reset(); scripts[0].data.profiles = { invalid: true };
 await assert.rejects(migrate('old'), /格式不兼容/); assert.equal(writes, 0);
 reset(); scripts[0].active = true;
 await assert.rejects(migrate('old'), /停用/); assert.equal(writes, 0);
 reset(); scripts.push({ id: 'other', data: {} });
 await assert.rejects(migrate(''), /选择/); assert.equal(writes, 0);
 reset(); await assert.rejects(migrate('missing'), /不存在/); assert.equal(writes, 0);
 reset(); scripts = []; assert.equal(await migrate(''), 1); assert.equal(globals.settings.data.api, 'new');
 reset(); scripts = []; globals = {}; extension = {};
 await assert.rejects(migrate(''), /没有找到/); assert.equal(writes, 0);
 console.log('PASS: manual settings migration, validation, source selection, shared storage and preservation');
})().catch(error => { console.error(error); process.exitCode = 1; });
