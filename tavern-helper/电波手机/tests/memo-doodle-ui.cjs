const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('src/util/酒馆助手脚本/电波手机');
const memo = fs.readFileSync(path.join(root, 'components/apps/WaveMemoPanel.vue'), 'utf8');
const style = fs.readFileSync(path.join(root, 'styles/apps/memo.scss'), 'utf8');

assert.match(memo, /@pointerdown="startDoodleDrag"/);
assert.match(memo, /scrollLeft = doodleDrag\.scrollLeft - \(event\.clientX - doodleDrag\.startX\)/);
assert.match(memo, /event\.pointerType !== 'mouse'/);
assert.match(style, /\.memo-doodle-sheet pre\s*\{[\s\S]*?overflow-x: auto;[\s\S]*?scrollbar-width: none;/);
assert.match(style, /\.memo-doodle-sheet pre::-webkit-scrollbar\s*\{[\s\S]*?display: none;/);
assert.match(style, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?cursor: grab;/);
assert.match(style, /\.memo-doodle-sheet pre\.is-dragging\s*\{[\s\S]*?cursor: grabbing;/);
assert.match(memo, /class="memo-paper-actions"[\s\S]*?class="wave-content-delete"/);
assert.match(memo, /class="memo-ticket-footer"[\s\S]*?class="wave-content-delete"/);
assert.match(style, /\.memo-paper-actions\s*\{[\s\S]*?justify-content: space-between;/);

console.log(
  'PASS: memo doodles support scrollbar-free horizontal mouse dragging and card deletes stay at bottom-right.',
);
