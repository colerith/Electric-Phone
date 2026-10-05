const fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const base = path.resolve('src/util/酒馆助手脚本/电波手机');
const compile = text =>
  ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
    .outputText;
require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);
const { bindFloatingEntry, floatingBounds } = require(base + '/services/core/floating-entry.ts');
for (const pointerSupport of [true, false]) {
  const dom = new JSDOM('<button></button>');
  const w = dom.window,
    button = w.document.querySelector('button');
  if (pointerSupport) w.PointerEvent = w.MouseEvent;
  else delete w.PointerEvent;
  Object.defineProperty(w, 'innerWidth', { value: 320, writable: true });
  Object.defineProperty(w, 'innerHeight', { value: 600, writable: true });
  const vv = new w.EventTarget();
  Object.assign(vv, { width: 280, height: 300, offsetLeft: 20, offsetTop: 50 });
  Object.defineProperty(w, 'visualViewport', { value: vv });
  let saved,
    clicks = 0;
  const stop = bindFloatingEntry(button, { x: 1, y: 0.56, edge: 'right' }, p => (saved = p));
  button.addEventListener('click', () => clicks++);
  const inside = () => {
    const b = floatingBounds(w),
      x = parseFloat(button.style.left),
      y = parseFloat(button.style.top);
    assert(x >= b.left && x <= b.maxX);
    assert(y >= b.top && y <= b.maxY);
    assert(parseFloat(button.style.width) <= Math.min(vv.width, vv.height));
  };
  inside();
  const send = (target, type, x, y) =>
    target.dispatchEvent(
      new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }),
    );
  send(button, pointerSupport ? 'pointerdown' : 'mousedown', 250, 200);
  send(w.document, pointerSupport ? 'pointermove' : 'mousemove', -500, 9999);
  send(w.document, pointerSupport ? 'pointerup' : 'mouseup', -500, 9999);
  assert.equal(saved.edge, 'left');
  inside();
  button.dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.equal(clicks, 0, 'drag must not open phone');
  button.dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 0 }));
  assert.equal(clicks, 1, 'keyboard remains accessible');
  if (!pointerSupport) {
    const touch = (target, type, x, y) => {
      const event = new w.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: [{ identifier: 7, clientX: x, clientY: y }] });
      target.dispatchEvent(event);
    };
    touch(button, 'touchstart', 20, 300);
    touch(w.document, 'touchmove', 999, -999);
    touch(w.document, 'touchend', 999, -999);
    assert.equal(saved.edge, 'right');
    inside();
  }
  Object.assign(vv, { width: 15, height: 20, offsetLeft: 0, offsetTop: 0 });
  vv.dispatchEvent(new w.Event('resize'));
  inside();
  stop();
  const before = button.style.cssText;
  Object.assign(vv, { width: 280, height: 300 });
  vv.dispatchEvent(new w.Event('resize'));
  assert.equal(button.style.cssText, before, 'listeners removed');
}
if (process.env.WAVE_QA_DIR) {
  const { parse, compileStyle } = require('vue/compiler-sfc');
  const { descriptor } = parse(fs.readFileSync(base + '/components/shared/WaveFloatingEntry.vue', 'utf8'));
  const css = compileStyle({
    source: descriptor.styles[0].content,
    filename: 'floating.vue',
    id: 'qa',
    scoped: false,
  }).code;
  const icon = require(base + '/assets/icons/floating-icon.ts').floatingIcon;
  const controller = compile(fs.readFileSync(base + '/services/core/floating-entry.ts', 'utf8'));
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%}button{min-width:999px;padding:100px}#wave-phone-script-root{position:fixed;inset:0;pointer-events:none}.wave-phone-host{position:fixed;inset:0}${css}</style><div id="wave-phone-script-root"><div class="wave-phone-host"><div class="wave-floating-viewport"><button class="wave-floating-entry" aria-label="打开电波手机"><img src="${icon}"></button></div></div></div><output id="result"></output><script>const exports={};${controller}\nconst button=document.querySelector('button');const stop=exports.bindFloatingEntry(button,{x:1,y:.56,edge:'right'},()=>{});let passed=true;for(const [x,y] of [[-500,-500],[9999,9999]]){button.dispatchEvent(new PointerEvent('pointerdown',{clientX:10,clientY:10,pointerId:1,isPrimary:true}));document.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,pointerId:1,cancelable:true}));document.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));passed=passed&&document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight;}document.querySelector('#result').textContent=passed?'PASS_NO_OVERFLOW':'FAIL_OVERFLOW';</script>`;
  fs.mkdirSync(process.env.WAVE_QA_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.WAVE_QA_DIR, 'floating.html'), html);
}
console.log(
  'PASS floating entry: host viewport, keyboard/zoom bounds, pointer/mouse drag, click suppression and cleanup',
);
