import { extractVPXPhysics } from "./physics-extract.js";
// Shared by the Node converter and the browser worker. VPX scripts are never executed.
export const EXPORT_OPTIONS = Object.freeze({
  exportInvisibleItems: false,
  itemFilter: 'everything',
  skipEditorHiddenItems: false,
});

export function inspectGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2)
    throw new Error('不是有效的 GLB 2.0 文件');
  if (view.getUint32(8, true) !== bytes.length) throw new Error('GLB 文件长度不完整');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + length > bytes.length)
    throw new Error('GLB 缺少 JSON 数据');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  // The local-file workflow accepts self-contained GLBs only; no surprise remote requests.
  for (const resource of [...(json.buffers || []), ...(json.images || [])]) {
    if (resource.uri && !resource.uri.startsWith('data:'))
      throw new Error('请导出内嵌贴图和数据的 GLB；当前文件还引用外部资源');
  }
  return {
    meshes: json.meshes?.length || 0,
    nodes: json.nodes?.length || 0,
    materials: json.materials?.length || 0,
    textures: json.images?.length || 0,
    cameras: json.cameras?.length || 0,
    lights: json.extensions?.KHR_lights_punctual?.lights?.length || 0,
    extensions: json.extensionsUsed || [],
    bytes: bytes.length,
  };
}

export function convertVpx(api, bytes, filename, progress = () => {}) {
  if (bytes.byteLength > 512 * 1024 * 1024) throw new Error('VPX 超过 512 MB，请先用桌面工具导出 GLB');
  const warnings = [];
  const log = message => {
    const text = String(message);
    if (/warn|unsupported|missing|failed/i.test(text)) warnings.push(text);
    progress(text);
  };
  progress('读取 VPX 模型、材质与贴图…');
  const files = api.extract(bytes, log);
  // Audio is irrelevant to this visual validation and increases peak WASM memory.
  for (const key of Object.keys(files)) {
    if (key.startsWith('/vpx/sounds/') || key === '/vpx/sounds.json') delete files[key];
  }
  const jsonFile = path => files[path] ? JSON.parse(new TextDecoder().decode(files[path])) : null;
  const info = jsonFile('/vpx/info.json') || jsonFile('/vpx/tableinfo.json');
  const gameItems = Object.keys(files).filter(k => k.startsWith('/vpx/gameitems/') && k.endsWith('.json')).length;
  const physics = extractVPXPhysics(files);
  progress('将整桌导出为 GLB…');
  const glb = api.export_glb(files, EXPORT_OPTIONS, log);
  return {
    glb,
    report: {
      source: filename, converter: '@francisdb/vpin-wasm 0.38.4',
      options: EXPORT_OPTIONS, coordinateSystem: 'glTF Y-up, right-handed, meters',
      gameItems, tableInfo: info, physics, ...inspectGlb(glb), warnings,
      limitations: ['静态场景；未执行 VPX 的 VBScript、物理或任务逻辑。',
        'VPX 的特殊材质、灯光和脚本初始化不保证与 glTF 一致；需与 VPX 原生画面对照。'],
    },
  };
}
