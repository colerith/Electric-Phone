const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('src/util/酒馆助手脚本/电波手机');
const memo = fs.readFileSync(path.join(root, 'components/WaveMemoPanel.vue'), 'utf8');
const style = fs.readFileSync(path.join(root, 'memo.scss'), 'utf8');

assert.match(memo, /@pointerdown="startDoodleDrag"/);
assert.match(memo, /scrollLeft = doodleDrag\.scrollLeft - \(event\.clientX - doodleDrag\.startX\)/);
assert.match(memo, /event\.pointerType !== 'mouse'/);
assert.match(style, /\.memo-doodle-sheet pre\s*\{[\s\S]*?overflow-x: auto;[\s\S]*?scrollbar-width: none;/);
assert.match(style, /\.memo-doodle-sheet pre::-webkit-scrollbar\s*\{[\s\S]*?display: none;/);
assert.match(style, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?cursor: grab;/);
assert.match(style, /\.memo-doodle-sheet pre\.is-dragging\s*\{[\s\S]*?cursor: grabbing;/);

console.log('PASS: memo doodles support scrollbar-free horizontal mouse dragging.');
