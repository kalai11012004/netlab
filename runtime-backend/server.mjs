import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { LibvirtDriver, spawnCapture } from './lib/libvirt-driver.mjs';
import { safeId, safeDomainName, constantTimeEqual, validMac } from './lib/security.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const noVncRoot = path.join(HERE, 'node_modules', '@novnc', 'novnc');
const MAX_BODY_BYTES = 1024 * 1024;

function jsonEnv(env, key, fallback) {
  if (!env[key]) return fallback;
  try { return JSON.parse(env[key]); }
  catch { throw new Error(`${key} must contain valid JSON.`); }
}
function exactBaseUrl(value) {
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || (u.protocol === 'http:' && !['localhost','127.0.0.1','::1'].includes(u.hostname))) throw new Error();
    return u.href.replace(/\/$/, '');
  } catch { throw new Error('NETLAB_PUBLIC_BASE_URL must be an HTTPS URL (HTTP is allowed only for localhost).'); }
}
function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Length':Buffer.byteLength(body) }); res.end(body);
}
async function readJson(req) {
  let length = 0, chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > MAX_BODY_BYTES) throw Object.assign(new Error('Request body exceeds 1 MiB.'), { statusCode:413 }); chunks.push(chunk); }
  if (!length) return {};
  if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) throw Object.assign(new Error('Content-Type must be application/json.'), { statusCode:415 });
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Malformed JSON request body.'), { statusCode:400 }); }
}
function validateConfig(env) {
  const token = String(env.NETLAB_API_TOKEN || '');
  if (token.length < 40 || /replace-with|change-me|example-token/i.test(token)) throw new Error('NETLAB_API_TOKEN must be a unique random secret with at least 40 characters. Generate one before starting the service.');
  const allowedOrigins = new Set(String(env.NETLAB_ALLOWED_ORIGINS || 'http://localhost:8080').split(',').map(s=>s.trim()).filter(Boolean).map(s=>{
    let url; try { url = new URL(s); } catch { throw new Error(`Invalid origin in NETLAB_ALLOWED_ORIGINS: ${s}`); }
    if (!['https:','http:'].includes(url.protocol) || url.origin !== s.replace(/\/$/,'')) throw new Error(`Allowed origins must be exact scheme/host origins without paths: ${s}`);
    if (url.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('HTTP is allowed only for local development origins. Use HTTPS otherwise.');
    return url.origin;
  }));
  if (!allowedOrigins.size) throw new Error('Set at least one exact origin in NETLAB_ALLOWED_ORIGINS.');
  const networksRaw = jsonEnv(env, 'NETLAB_NETWORKS_JSON', { networks: [] });
  if (!Array.isArray(networksRaw.networks)) throw new Error('NETLAB_NETWORKS_JSON must be {"networks":[...]}');
  const networkIds = new Set(), networkNames = new Set();
  const networks = networksRaw.networks.map(n=>{
    if (!n || typeof n.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(n.id) || typeof n.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,31}$/.test(n.name)) throw new Error('Each network needs a safe id and a libvirt network name.');
    if (networkIds.has(n.id) || networkNames.has(n.name)) throw new Error('Network IDs and libvirt names must be unique.');
    networkIds.add(n.id); networkNames.add(n.name);
    return { id:n.id, name:n.name, label:String(n.label || n.id).slice(0,100) };
  });
  const captureRaw = jsonEnv(env, 'NETLAB_CAPTURE_INTERFACES_JSON', { interfaces: [] });
  if (!Array.isArray(captureRaw.interfaces)) throw new Error('NETLAB_CAPTURE_INTERFACES_JSON must be {"interfaces":[...]}');
  const captureIds = new Set(), captureNames = new Set();
  const captureInterfaces = captureRaw.interfaces.map(i=>{
    if (!i || typeof i.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(i.id) || typeof i.name !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(i.name)) throw new Error('Capture interface IDs/names are invalid.');
    if (captureIds.has(i.id) || captureNames.has(i.name)) throw new Error('Capture interface IDs and names must be unique.');
    captureIds.add(i.id); captureNames.add(i.name);
    return { id:i.id, name:i.name, label:String(i.label || i.id).slice(0,100) };
  });
  const publicBaseUrl = env.NETLAB_PUBLIC_BASE_URL ? exactBaseUrl(env.NETLAB_PUBLIC_BASE_URL) : null;
  if (publicBaseUrl && !allowedOrigins.has(new URL(publicBaseUrl).origin)) throw new Error('NETLAB_PUBLIC_BASE_URL origin must also appear in NETLAB_ALLOWED_ORIGINS for the VNC console WebSocket.');
  return {
    token, allowedOrigins, networks, captureInterfaces, publicBaseUrl,
    bindHost: env.NETLAB_BIND_HOST || '127.0.0.1', port: intEnv(env.NETLAB_PORT,8787,0,65535),
    maxVmsPerLab: intEnv(env.NETLAB_MAX_VMS_PER_LAB,12,1,100), maxTotalVms:intEnv(env.NETLAB_MAX_TOTAL_VMS,48,1,500),
    maxCaptureSeconds:intEnv(env.NETLAB_MAX_CAPTURE_SECONDS,60,1,3600), maxCaptureMb:intEnv(env.NETLAB_MAX_CAPTURE_MB,64,1,256),
    vmRoot:path.resolve(env.NETLAB_VM_ROOT || '/var/lib/libvirt/images/netlab-vms'), stateDir:path.resolve(env.NETLAB_STATE_DIR || '/var/lib/netlab/state'),
    captureDir:path.resolve(env.NETLAB_CAPTURE_DIR || '/var/lib/netlab/captures'),
    registryFile:path.resolve(env.NETLAB_IMAGE_REGISTRY_FILE || '/etc/netlab/image-registry.json'),
    imageDir:path.resolve(env.NETLAB_IMAGE_DIR || '/var/lib/libvirt/images/netlab-base')
  };
}
function intEnv(v, fallback, min, max) { const n = v == null || v === '' ? fallback : Number(v); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Integer setting must be in range ${min}–${max}.`); return n; }
function labPrefix(labId) { return `nl-${safeId(labId,'lab ID').slice(0,24)}-`; }
function domainFor(labId, nodeId) { return `${labPrefix(labId)}${safeId(nodeId,'node ID').slice(0,24)}`.slice(0,63).replace(/-+$/,''); }
function publicVm(info) { const { _vncPort, ...result } = info; return result; }

export async function loadImageRegistry(config) {
  let data;
  try { data = JSON.parse(await fs.readFile(config.registryFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw new Error(`Cannot read image registry (${error.message}).`); }
  if (!Array.isArray(data.images)) throw new Error('Image registry must contain an images array.');
  const ids = new Set(); const result = [];
  const imageRootReal = await fs.realpath(config.imageDir).catch(() => null);
  if (!imageRootReal) throw new Error(`NETLAB_IMAGE_DIR does not exist: ${config.imageDir}`);
  for (const img of data.images) {
    if (!img || typeof img.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(img.id) || ids.has(img.id)) throw new Error('Image registry contains an invalid or duplicate image ID.');
    const mediaType = img.mediaType || 'disk';
    const format = String(img.format || (mediaType === 'installer-iso' ? 'iso' : 'qcow2')).toLowerCase();
    if (!['disk','installer-iso'].includes(mediaType) || (mediaType === 'disk' && !['qcow2','raw'].includes(format)) || (mediaType === 'installer-iso' && format !== 'iso')) {
      throw new Error(`Image ${img.id} must be a qcow2/raw disk or an installer-iso with format iso.`);
    }
    const firmware = img.firmware || 'bios';
    if (!['bios','uefi','uefi-secure-tpm2'].includes(firmware)) throw new Error(`Image ${img.id} has an unsupported firmware profile.`);
    if (typeof img.path !== 'string' || !path.isAbsolute(img.path)) throw new Error(`Image ${img.id} must have an absolute path inside NETLAB_IMAGE_DIR.`);
    const requested = path.resolve(img.path), requestedRel = path.relative(config.imageDir, requested);
    if (requestedRel.startsWith('..') || path.isAbsolute(requestedRel)) throw new Error(`Image ${img.id} path must be inside NETLAB_IMAGE_DIR.`);
    let full; try { full = await fs.realpath(requested); } catch { throw new Error(`Image ${img.id} file does not exist: ${requested}`); }
    const rel = path.relative(imageRootReal, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Image ${img.id} resolves outside NETLAB_IMAGE_DIR through a symlink.`);
    const stat = await fs.stat(full);
    if (!stat.isFile() || stat.size <= 0) throw new Error(`Image ${img.id} must refer to a non-empty regular file.`);
    ids.add(img.id);
    result.push({ id:img.id, label:String(img.label || img.id).slice(0,100), path:full, format, mediaType, firmware, guestOS:String(img.guestOS || 'Custom Linux').slice(0,100), notes:String(img.notes || '').slice(0,240) });
  }
  return result;
}
function bpfValid(s) { return typeof s === 'string' && s.length <= 300 && /^[a-zA-Z0-9_.:/()\s&|!\-<>]+$/.test(s) && !/[\n\r\0]/.test(s); }

export function createNetlabServer({ env = process.env, driver = null, images: injectedImages = null } = {}) {
  const config = validateConfig(env);
  const runtime = driver || new LibvirtDriver({ uri: env.NETLAB_LIBVIRT_URI || 'qemu:///system', vmRoot:config.vmRoot, imageDir:config.imageDir, stateDir:config.stateDir, nvramRoot:env.NETLAB_NVRAM_DIR || '/var/lib/libvirt/qemu/nvram', ovmfCodePath:env.NETLAB_OVMF_CODE || '/usr/share/OVMF/OVMF_CODE_4M.fd', ovmfVarsTemplatePath:env.NETLAB_OVMF_VARS || '/usr/share/OVMF/OVMF_VARS_4M.fd', ovmfSecureCodePath:env.NETLAB_OVMF_SECURE_CODE || '/usr/share/OVMF/OVMF_CODE_4M.ms.fd', ovmfSecureVarsTemplatePath:env.NETLAB_OVMF_SECURE_VARS || '/usr/share/OVMF/OVMF_VARS_4M.ms.fd' });
  const tickets = new Map(), captures = new Map();
  const MAX_CONSOLE_TICKETS = 256, MAX_CAPTURE_RECORDS = 256;
  let imagesPromise = null;
  async function images() { if (injectedImages) return injectedImages; if (!imagesPromise) imagesPromise = loadImageRegistry(config); try { return await imagesPromise; } catch (e) { imagesPromise=null; throw e; } }
  const server = http.createServer(async (req,res)=>{
    const origin = req.headers.origin;
    if (origin) {
      if (!config.allowedOrigins.has(origin)) return json(res,403,{error:'Browser origin is not allowed. Add the exact origin to NETLAB_ALLOWED_ORIGINS.'});
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
    }
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    let url; try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch { return json(res,400,{error:'Invalid URL.'}); }
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res,200,{status:'ok',service:'netlab-kvm-runtime',version:'1.0.0'});
      if (url.pathname === '/console' && req.method === 'GET') {
        const ticket = url.searchParams.get('ticket'), item = tickets.get(ticket);
        if (!ticket || !item || item.expiresAt < Date.now()) return json(res,401,{error:'Console ticket is missing, expired or already used. Request a new console link from NetLab Studio.'});
        res.writeHead(200,{ 'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src data: blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" });
        return res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NetLab VM Console</title><style>body{margin:0;background:#0b1220;color:#e8eefb;font:14px system-ui}header{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:.8rem 1rem;background:#111c2d}#screen{height:calc(100vh - 56px);width:100%;overflow:auto}#status{color:#94a9ca}button{background:#24334d;color:#fff;border:1px solid #526781;border-radius:6px;padding:.45rem .7rem;cursor:pointer}</style><header><strong>NetLab Studio · Real VM console</strong><span id="status">Connecting…</span><button id="sendCtrlAltDel" disabled>Ctrl + Alt + Del</button></header><div id="screen"></div><script type="module">import RFB from '/novnc/core/rfb.js';const ticket=new URL(location.href).searchParams.get('ticket');const status=document.getElementById('status');try{const ws=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/v1/console?ticket='+encodeURIComponent(ticket);const rfb=new RFB(document.getElementById('screen'),ws);rfb.scaleViewport=true;rfb.resizeSession=true;rfb.viewOnly=false;rfb.addEventListener('connect',()=>status.textContent='Connected to hypervisor console');rfb.addEventListener('disconnect',e=>status.textContent=e.detail.clean?'Console disconnected':'Connection lost');document.getElementById('sendCtrlAltDel').disabled=false;document.getElementById('sendCtrlAltDel').onclick=()=>rfb.sendCtrlAltDel();}catch(e){status.textContent='Console failed: '+String(e.message||e);}</script></html>`);
      }
      if (url.pathname.startsWith('/novnc/')) {
        const rel = decodeURIComponent(url.pathname.slice('/novnc/'.length));
        if (!rel || rel.includes('..') || rel.includes('\\') || rel.startsWith('/')) return json(res,404,{error:'Not found.'});
        const full = path.resolve(noVncRoot, rel);
        if (!full.startsWith(noVncRoot + path.sep)) return json(res,404,{error:'Not found.'});
        let body; try { body = await fs.readFile(full); } catch { return json(res,404,{error:'noVNC asset not found; run npm install in runtime-backend.'}); }
        const ext = path.extname(full).toLowerCase(); const types={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
        res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); return res.end(body);
      }
      if (!url.pathname.startsWith('/api/v1/')) return json(res,404,{error:'Not found.'});
      const auth = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
      if (!auth || !constantTimeEqual(auth[1],config.token)) return json(res,401,{error:'Unauthorized. Configure a valid backend token in this browser session.'});
      if (req.method === 'GET' && url.pathname === '/api/v1/capabilities') {
        const capabilities = await runtime.capabilities(); return json(res,200,{...capabilities, imageRegistry: (await images()).map(({id,label,guestOS,format,mediaType,firmware,notes})=>({id,label,guestOS,format,mediaType,firmware,notes})), networkCount:config.networks.length,captureInterfaceCount:config.captureInterfaces.length,limits:{maxVmsPerLab:config.maxVmsPerLab,maxTotalVms:config.maxTotalVms,maxCaptureSeconds:config.maxCaptureSeconds,maxCaptureMb:config.maxCaptureMb}});
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/images') return json(res,200,{images:(await images()).map(({id,label,guestOS,format,mediaType,firmware,notes})=>({id,label,guestOS,format,mediaType,firmware,notes}))});
      if (req.method === 'GET' && url.pathname === '/api/v1/networks') return json(res,200,{networks:await runtime.listNetworks(config.networks)});
      if (req.method === 'GET' && url.pathname === '/api/v1/vms') {
        const labId = url.searchParams.get('labId'); if (!labId) throw Object.assign(new Error('labId query parameter is required.'),{statusCode:400});
        const prefix = labPrefix(labId);
        const names = (await runtime.listDomains()).filter(n=>n.startsWith(prefix));
        const vms = await Promise.all(names.map(async id => { const info=await runtime.vmInfo(id); return publicVm(info); }));
        return json(res,200,{vms});
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/vms') {
        const body = await readJson(req);
        const labId=safeId(body.labId,'lab ID'), nodeId=safeId(body.nodeId,'node ID');
        const name = typeof body.name === 'string' ? body.name.trim().slice(0,120) : nodeId;
        if (!name) throw Object.assign(new Error('VM name is required.'),{statusCode:400});
        const vcpus=Number(body.vcpus), ramMiB=Number(body.ramMiB), diskGiB=Number(body.diskGiB);
        if (!Number.isInteger(vcpus)||vcpus<1||vcpus>16) throw Object.assign(new Error('vcpus must be 1–16.'),{statusCode:400});
        if (!Number.isInteger(ramMiB)||ramMiB<512||ramMiB>65536||ramMiB%256!==0) throw Object.assign(new Error('ramMiB must be 512–65536 in 256 MiB steps.'),{statusCode:400});
        if (!Number.isInteger(diskGiB)||diskGiB<1||diskGiB>512) throw Object.assign(new Error('diskGiB must be 1–512.'),{statusCode:400});
        const registry=await images(), image=registry.find(x=>x.id===body.imageId);
        if (!image) throw Object.assign(new Error('imageId must match an administrator-configured image registry ID.'),{statusCode:400});
        if (image.firmware === 'uefi-secure-tpm2') {
          if (vcpus < 2 || ramMiB < 4096 || diskGiB < 64) throw Object.assign(new Error('Windows 11 secure-boot profile requires at least 2 vCPU, 4096 MiB RAM and a 64 GiB disk.'),{statusCode:400});
          const caps = await runtime.capabilities();
          if (!caps.uefiSecureTpm2) throw Object.assign(new Error('This KVM host is missing Secure Boot OVMF firmware or swtpm. Install ovmf and swtpm-tools, then recheck capabilities.'),{statusCode:503});
        }
        if (!Array.isArray(body.networkIds)||body.networkIds.length<1||body.networkIds.length>16||body.networkIds.some(n=>typeof n!=='string')) throw Object.assign(new Error('networkIds must list one to sixteen configured network IDs, one per virtual NIC.'),{statusCode:400});
        if (body.networkIds.some(n=>!config.networks.some(net=>net.id===n))) throw Object.assign(new Error('A networkId is not in the administrator network allowlist.'),{statusCode:400});
        const macs=Array.isArray(body.macs)?body.macs:[];
        if (macs.some(m=>!validMac(m))) throw Object.assign(new Error('MAC addresses must be valid unicast addresses.'),{statusCode:400});
        const domains=await runtime.listDomains(), domain=domainFor(labId,nodeId);
        const activeNetworks=await runtime.listNetworks(config.networks);
        for(const networkId of body.networkIds){const attached=activeNetworks.find(n=>n.id===networkId);if(!attached?.active)throw Object.assign(new Error(`Libvirt network ${networkId} is not active. Ask the host administrator to configure and start it.`),{statusCode:409});}
        if (!domains.some(d=>d===domain) && domains.length>=config.maxTotalVms) throw Object.assign(new Error('Server VM capacity limit reached.'),{statusCode:429});
        const inLab=domains.filter(d=>d.startsWith(labPrefix(labId)));
        if (!domains.includes(domain) && inLab.length>=config.maxVmsPerLab) throw Object.assign(new Error('This lab has reached its VM limit.'),{statusCode:429});
        // A registry path is admin-controlled; the caller sends only imageId and cannot choose a filesystem path.
        const created=await runtime.createVm({id:domain,name,image,vcpus,ramMiB,diskGiB,networkIds:body.networkIds,networks:config.networks,macs});
        return json(res,created.created?201:200,{...created,labId,nodeId,imageId:image.id,mediaType:image.mediaType||'disk',firmware:image.firmware||'bios',installMediaAttached:created.installMediaAttached===true,notice:'The hypervisor will report VM power state only. Confirm the guest OS boot in its live console; a running QEMU process alone does not prove the OS finished booting.'});
      }
      const vmMatch = url.pathname.match(/^\/api\/v1\/vms\/([a-z0-9-]{1,63})(?:\/(start|stop|console-ticket|eject-media))?$/);
      if (vmMatch) {
        const id=vmMatch[1], action=vmMatch[2]||'';
        if (!safeDomainName(id)) throw Object.assign(new Error('Invalid VM identifier.'),{statusCode:400});
        if (req.method==='GET'&&!action) return json(res,200,publicVm(await runtime.vmInfo(id)));
        if (req.method==='POST'&&action==='start') return json(res,200,await runtime.startVm(id));
        if (req.method==='POST'&&action==='stop') return json(res,200,await runtime.stopVm(id));
        if (req.method==='POST'&&action==='eject-media') return json(res,200,await runtime.ejectInstallMedia(id));
        if (req.method==='POST'&&action==='console-ticket') {
          const info=await runtime.vmInfo(id); if (info.state!=='running'||!Number.isInteger(info._vncPort)) throw Object.assign(new Error('The VM must be running and its localhost VNC console must be available.'),{statusCode:409});
          if (!config.publicBaseUrl) throw Object.assign(new Error('Set NETLAB_PUBLIC_BASE_URL before issuing a console URL.'),{statusCode:503});
          const now=Date.now(); for (const [key,value] of tickets) if (value.expiresAt < now) tickets.delete(key);
          if (tickets.size >= MAX_CONSOLE_TICKETS) throw Object.assign(new Error('Console ticket capacity reached. Retry shortly.'),{statusCode:429});
          const ticket=crypto.randomBytes(32).toString('base64url'); tickets.set(ticket,{id,port:info._vncPort,expiresAt:now+30000});
          return json(res,200,{consoleUrl:`${config.publicBaseUrl}/console?ticket=${encodeURIComponent(ticket)}`,expiresInSeconds:30,oneTime:true});
        }
        if (req.method==='DELETE'&&!action) {
          const body=await readJson(req); if (body.confirm!==true) throw Object.assign(new Error('Send {"confirm":true} only after confirming the guest is stopped.'),{statusCode:400});
          return json(res,200,await runtime.deleteVm(id));
        }
      }
      if (req.method==='GET'&&url.pathname==='/api/v1/captures/interfaces') return json(res,200,{interfaces:config.captureInterfaces});
      if (req.method==='POST'&&url.pathname==='/api/v1/captures') {
        const body=await readJson(req), iface=config.captureInterfaces.find(i=>i.id===body.interfaceId);
        if (!iface) throw Object.assign(new Error('interfaceId must match an administrator-approved capture interface.'),{statusCode:400});
        const durationSeconds=Number(body.durationSeconds||15);
        if (!Number.isInteger(durationSeconds)||durationSeconds<1||durationSeconds>config.maxCaptureSeconds) throw Object.assign(new Error(`durationSeconds must be between 1 and ${config.maxCaptureSeconds}.`),{statusCode:400});
        const filter=body.filter||''; if (filter&&!bpfValid(filter)) throw Object.assign(new Error('Capture filter contains unsupported characters or is too long.'),{statusCode:400});
        await fs.mkdir(config.captureDir,{recursive:true,mode:0o750});
        for (const [oldId,old] of captures) if (old.state !== 'capturing' && old.finishedAt && Date.now()-Date.parse(old.finishedAt)>60*60*1000) captures.delete(oldId);
        if (captures.size >= MAX_CAPTURE_RECORDS) throw Object.assign(new Error('Capture-record capacity reached. Retry after older records expire.'),{statusCode:429});
        const id=crypto.randomUUID(), file=path.join(config.captureDir,`${id}.pcap`);
        const record={id,interfaceId:iface.id,interfaceName:iface.name,durationSeconds,startedAt:new Date().toISOString(),state:'capturing',file}; captures.set(id,record);
        const task=spawnCapture({interfaceName:iface.name,durationSeconds,maxMb:config.maxCaptureMb,filter,outputPath:file,onDone:async result=>{record.finishedAt=new Date().toISOString();record.state=result.ok?'complete':'failed';record.error=result.error||null;try{const names=(await fs.readdir(config.captureDir)).filter(n=>n.startsWith(id+'.pcap'));const candidate=names.map(n=>path.join(config.captureDir,n))[0];if(!candidate)throw new Error('Capture file was not created.');const st=await fs.stat(candidate);record.bytes=st.size;if(st.size>config.maxCaptureMb*1024*1024){record.state='failed';record.error='Capture exceeded the configured file-size limit.';await fs.rm(candidate,{force:true});}else if(candidate!==file){await fs.rename(candidate,file);}}catch{if(result.ok){record.state='failed';record.error='tcpdump exited without creating a capture file.';}}}});
        record.pid=task.pid; record.stop=task.stop;
        return json(res,202,{id,state:record.state,interfaceId:record.interfaceId,durationSeconds,pollUrl:`/api/v1/captures/${id}`,fileUrl:`/api/v1/captures/${id}/file`,notice:'This is a real host packet capture on the allowlisted interface; host tcpdump permissions are required.'});
      }
      const capMatch=url.pathname.match(/^\/api\/v1\/captures\/([0-9a-f-]{36})(?:\/file)?$/i);
      if (capMatch) {
        const id=capMatch[1], cap=captures.get(id); if(!cap) throw Object.assign(new Error('Capture not found or backend restarted; capture IDs are held in memory for this service process.'),{statusCode:404});
        if(url.pathname.endsWith('/file')) {
          if(cap.state==='capturing') throw Object.assign(new Error('Capture is still running. Poll status and retry the file download.'),{statusCode:409});
          if(cap.state!=='complete') throw Object.assign(new Error(cap.error||'Capture failed.'),{statusCode:500});
          const stat=await fs.stat(cap.file); if(stat.size>config.maxCaptureMb*1024*1024) throw Object.assign(new Error('Capture file exceeds configured size limit.'),{statusCode:413});
          res.writeHead(200,{'Content-Type':'application/vnd.tcpdump.pcap','Content-Disposition':`attachment; filename="netlab-${id}.pcap"`,'Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); return fs.createReadStream(cap.file).pipe(res);
        }
        return json(res,200,{id:cap.id,interfaceId:cap.interfaceId,interfaceName:cap.interfaceName,durationSeconds:cap.durationSeconds,startedAt:cap.startedAt,finishedAt:cap.finishedAt||null,state:cap.state,bytes:cap.bytes||0,error:cap.error||null,fileUrl:`/api/v1/captures/${id}/file`});
      }
      return json(res,404,{error:'Not found.'});
    } catch (error) {
      const status=Number.isInteger(error.statusCode)?error.statusCode:500;
      if(status>=500) console.error(`[runtime-api] ${req.method} ${url.pathname}: ${error.message}`);
      return json(res,status,{error:status===500?'Internal backend error. Check the server log using the request time.':error.message||'Request failed.'});
    }
  });
  server.on('upgrade',(req,socket,head)=>{
    let url; try{url=new URL(req.url,`http://${req.headers.host||'localhost'}`);}catch{return socket.destroy();}
    const origin=req.headers.origin;
    const key=String(req.headers['sec-websocket-key']||'');
    if(url.pathname!=='/api/v1/console'||!origin||!config.allowedOrigins.has(origin)||!key||req.headers['sec-websocket-version']!=='13'){
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return socket.destroy();
    }
    const ticket=url.searchParams.get('ticket'), item=tickets.get(ticket);
    if(!ticket||!item||item.expiresAt<Date.now()){socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return socket.destroy();}
    tickets.delete(ticket); // single use, even if the VNC connection fails
    if(String(req.headers.upgrade||'').toLowerCase()!=='websocket'||!String(req.headers.connection||'').toLowerCase().split(',').map(s=>s.trim()).includes('upgrade')){socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return socket.destroy();}
    const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols','Upgrade: websocket','Connection: Upgrade',`Sec-WebSocket-Accept: ${accept}`,'\r\n'].join('\r\n'));
    let clientBuffer=Buffer.alloc(0), upstream=null, closed=false;
    const cleanup=()=>{if(closed)return;closed=true;upstream?.destroy();if(!socket.destroyed)socket.end();};
    const writeFrame=(opcode,payload=Buffer.alloc(0))=>{
      if(socket.destroyed)return;
      const data=Buffer.isBuffer(payload)?payload:Buffer.from(payload);let header;
      if(data.length<126){header=Buffer.from([0x80|opcode,data.length]);}
      else if(data.length<=0xffff){header=Buffer.alloc(4);header[0]=0x80|opcode;header[1]=126;header.writeUInt16BE(data.length,2);}
      else {header=Buffer.alloc(10);header[0]=0x80|opcode;header[1]=127;header.writeBigUInt64BE(BigInt(data.length),2);}
      socket.write(Buffer.concat([header,data]));
    };
    const parseFrames=()=>{
      while(clientBuffer.length>=2&&!closed){
        const b0=clientBuffer[0],b1=clientBuffer[1],fin=!!(b0&0x80),opcode=b0&0x0f,masked=!!(b1&0x80);let length=b1&0x7f,offset=2;
        if(!masked){writeFrame(8,Buffer.from('Client frame must be masked'));return cleanup();}
        if(length===126){if(clientBuffer.length<4)return;length=clientBuffer.readUInt16BE(2);offset=4;}
        else if(length===127){if(clientBuffer.length<10)return;const huge=clientBuffer.readBigUInt64BE(2);if(huge>8n*1024n*1024n){writeFrame(8,Buffer.from('Frame too large'));return cleanup();}length=Number(huge);offset=10;}
        if(length>8*1024*1024){writeFrame(8,Buffer.from('Frame too large'));return cleanup();}
        if(clientBuffer.length<offset+4+length)return;
        const mask=clientBuffer.subarray(offset,offset+4);offset+=4;const payload=Buffer.from(clientBuffer.subarray(offset,offset+length));clientBuffer=clientBuffer.subarray(offset+length);
        for(let i=0;i<payload.length;i++)payload[i]^=mask[i&3];
        if(opcode===8){writeFrame(8,payload.subarray(0,125));return cleanup();}
        if(opcode===9){writeFrame(10,payload.subarray(0,125));continue;}
        if(opcode===10)continue;
        if(opcode!==0&&opcode!==2){writeFrame(8,Buffer.from('Only binary VNC data is supported'));return cleanup();}
        if(payload.length&&upstream&&!upstream.destroyed)upstream.write(payload);
        // VNC byte stream semantics are preserved across binary/continuation frames.
        if(!fin&&clientBuffer.length===0) return;
      }
    };
    socket.on('data',chunk=>{if(clientBuffer.length+chunk.length>10*1024*1024){writeFrame(8,Buffer.from('Input buffer too large'));return cleanup();}clientBuffer=Buffer.concat([clientBuffer,chunk]);parseFrames();});
    socket.on('error',cleanup);socket.on('close',cleanup);
    upstream=net.createConnection({host:'127.0.0.1',port:item.port});
    // VNC connections are intentionally long-lived; an idle desktop must not be disconnected by an inactivity timeout.
    upstream.on('data',data=>{if(!closed)writeFrame(2,data);});
    upstream.on('error',()=>{if(!closed)writeFrame(8,Buffer.from('VNC upstream unavailable'));cleanup();});
    upstream.on('timeout',()=>cleanup());
    if(head?.length){clientBuffer=Buffer.concat([clientBuffer,head]);parseFrames();}
  });
  server.on('close',()=>{ for(const c of captures.values()) if(c.state==='capturing') c.stop?.(); for(const t of tickets.values()) void t; });
  return { server, config, runtime, async listen(){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.bindHost,()=>resolve(server.address()));});} };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const app=createNetlabServer();
    const address=await app.listen();
    console.log(`NetLab KVM Runtime API listening on ${typeof address==='object'?`${address.address}:${address.port}`:address}`);
    console.log(`Allowed browser origins: ${[...app.config.allowedOrigins].join(', ')}`);
    console.log('Only allowlisted registry images and libvirt network names can be used. TLS must be terminated by a trusted reverse proxy outside localhost.');
  } catch(error) { console.error(`Fatal configuration: ${error.message}`); process.exitCode=1; }
}
