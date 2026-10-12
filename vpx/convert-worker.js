import init, * as vpin from '../node_modules/@francisdb/vpin-wasm/vpin.js';
import { convertVpx } from './conversion.js';

self.onmessage = async ({ data }) => {
  try {
    await init();
    let lastProgress = 0;
    const { glb, report } = convertVpx(vpin, new Uint8Array(data.buffer), data.name, message => {
      const now = performance.now();
      if (now - lastProgress > 80) {
        self.postMessage({ type: 'progress', message });
        lastProgress = now;
      }
    });
    const buffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
    self.postMessage({ type: 'done', buffer, report }, [buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || String(error) });
  }
};
