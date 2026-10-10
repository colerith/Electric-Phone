// In-memory implementation of ST binary file endpoints; delegates provider requests to each test.
const nativeFetch = global.fetch.bind(global);
let provider = nativeFetch;
const files = new Map();
const state = { files, uploads: 0, failNext: false };
global.SillyTavern ||= {};
Object.defineProperty(global, 'fetch', { configurable: true,
  get: () => async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith('data:')) return nativeFetch(input, init);
    if (url === '/api/files/upload') {
      const body = JSON.parse(init.body);
      if (!body.name.startsWith('wave-resource-')) return provider(input, init);
      if (state.failNext) { state.failNext = false; return new Response('', {status:500}); }
      const path = '/user/files/' + body.name;
      files.set(path, Buffer.from(body.data, 'base64')); state.uploads++;
      return Response.json({path});
    }
    if (/^\/user\/files\/wave-resource-/.test(url)) {
      const bytes = files.get(url);
      const type = ({png:'image/png',jpg:'image/jpeg',webp:'image/webp',mp3:'audio/mpeg',svg:'image/svg+xml'})[url.split('.').pop()] || 'application/octet-stream';
      return new Response(init.method === 'HEAD' ? null : bytes || '', {status:bytes ? 200 : 404, headers:{'Content-Type':type}});
    }
    return provider(input, init);
  },
  set: value => { provider = value; }
});
module.exports = state;
