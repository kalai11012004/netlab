import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetlabServer } from '../server.mjs';

const token='netlab-test-token-never-use-in-production-0123456789abcdef';
function testEnv(extra={}) { return {
  NETLAB_API_TOKEN:token, NETLAB_ALLOWED_ORIGINS:'http://localhost:8080,http://127.0.0.1:8787',
  NETLAB_BIND_HOST:'127.0.0.1', NETLAB_PORT:'0', NETLAB_VM_ROOT:'/tmp/netlab-runtime-test/vms',
  NETLAB_STATE_DIR:'/tmp/netlab-runtime-test/state', NETLAB_IMAGE_DIR:'/tmp/netlab-runtime-test/images',
  NETLAB_CAPTURE_DIR:'/tmp/netlab-runtime-test/captures', NETLAB_IMAGE_REGISTRY_FILE:'/tmp/netlab-runtime-test/registry.json',
  NETLAB_PUBLIC_BASE_URL:'http://127.0.0.1:8787',
  NETLAB_NETWORKS_JSON:JSON.stringify({networks:[{id:'test-net',name:'default',label:'Test virtual network'}]}),
  NETLAB_CAPTURE_INTERFACES_JSON:JSON.stringify({interfaces:[{id:'test-bridge',name:'virbr0',label:'Test bridge'}]}), ...extra
}; }
function fakeDriver({secureTpm=true}={}) {
  const vms=new Map();
  return {
    vms,
    async capabilities(){return {driver:'fake-test-only',available:true,vmRuntime:true,vncConsole:true,pcap:false,uefiSecureTpm2:secureTpm};},
    async listNetworks(nets){return nets.map(n=>({...n,active:true}));},
    async listDomains(){return [...vms.keys()];},
    async createVm(spec){if(vms.has(spec.id))return {id:spec.id,state:vms.get(spec.id).state,created:false,mediaType:vms.get(spec.id).image?.mediaType||'disk',installMediaAttached:!!vms.get(spec.id).installMediaAttached};vms.set(spec.id,{...spec,state:'stopped',installMediaAttached:spec.image?.mediaType==='installer-iso'});return {id:spec.id,state:'stopped',created:true,mediaType:spec.image?.mediaType||'disk',firmware:spec.image?.firmware||'bios',installMediaAttached:spec.image?.mediaType==='installer-iso'};},
    async domainExists(id){return vms.has(id);},
    async domainState(id){if(!vms.has(id))throw Object.assign(new Error('VM not found.'),{statusCode:404});return vms.get(id).state;},
    async startVm(id){if(!vms.has(id))throw Object.assign(new Error('VM not found.'),{statusCode:404});vms.get(id).state='running';return {id,state:'running'};},
    async stopVm(id){if(!vms.has(id))throw Object.assign(new Error('VM not found.'),{statusCode:404});vms.get(id).state='stopped';return {id,state:'stopped'};},
    async vmInfo(id){if(!vms.has(id))throw Object.assign(new Error('VM not found.'),{statusCode:404});return {id,name:vms.get(id).name||id,state:vms.get(id).state,vcpus:vms.get(id).vcpus||2,installMediaAttached:!!vms.get(id).installMediaAttached,_vncPort:vms.get(id).state==='running'?5900:null,vncAvailable:vms.get(id).state==='running'};},
    async ejectInstallMedia(id){if(!vms.has(id))throw Object.assign(new Error('VM not found.'),{statusCode:404});vms.get(id).installMediaAttached=false;return {id,state:vms.get(id).state,installMediaAttached:false,notice:'Installer media was ejected; writable disk retained.'};},
    async deleteVm(id){if(!vms.has(id))throw Object.assign(new Error('VM not found.'),{statusCode:404});if(vms.get(id).state!=='stopped')throw Object.assign(new Error('Stop VM first.'),{statusCode:409});vms.delete(id);return {id,deleted:true};}
  };
}
async function setup(t, { driver=fakeDriver(), images=null }={}) {
  images ||= [{id:'ubuntu-test',label:'Test Ubuntu',path:'/not-used-in-fake-driver.qcow2',format:'qcow2',mediaType:'disk',firmware:'bios',guestOS:'Ubuntu Linux'},{id:'windows-iso-test',label:'Owner supplied Windows installer',path:'/not-used-in-fake-driver.iso',format:'iso',mediaType:'installer-iso',firmware:'uefi-secure-tpm2',guestOS:'Windows 11'}];
  const app=createNetlabServer({env:testEnv(),driver,images});
  const address=await app.listen(); const base=`http://127.0.0.1:${address.port}`;
  t.after(()=>new Promise(resolve=>{app.server.close(()=>resolve());}));
  const api=async(path, {method='GET',body,auth=true,origin='http://localhost:8080'}={})=>fetch(base+path,{method,headers:{...(auth?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});
  return {app,driver,base,api};
}

test('health is public but runtime API requires bearer token', async t=>{
  const {api}=await setup(t);
  assert.equal((await api('/api/health',{auth:false})).status,200);
  const response=await api('/api/v1/capabilities',{auth:false}); assert.equal(response.status,401);
});

test('refuses unapproved browser origins', async t=>{
  const {api}=await setup(t); const response=await api('/api/v1/images',{origin:'https://evil.example'});
  assert.equal(response.status,403);
});

test('creates an allowlisted VM profile then starts and stops via server-authoritative state', async t=>{
  const {api}=await setup(t);
  const create=await api('/api/v1/vms',{method:'POST',body:{labId:'lab-test-01',nodeId:'dev-xyz123',name:'Training Linux',imageId:'ubuntu-test',vcpus:2,ramMiB:2048,diskGiB:20,networkIds:['test-net'],macs:['52:54:00:00:00:01']}});
  assert.equal(create.status,201); const made=await create.json(); assert.equal(made.created,true); assert.equal(made.state,'stopped');
  const start=await api(`/api/v1/vms/${made.id}/start`,{method:'POST',body:{}}); assert.equal(start.status,200); assert.equal((await start.json()).state,'running');
  const info=await api(`/api/v1/vms/${made.id}`); assert.equal((await info.json()).state,'running');
  const stop=await api(`/api/v1/vms/${made.id}/stop`,{method:'POST',body:{}}); assert.equal(stop.status,200); assert.equal((await stop.json()).state,'stopped');
});

test('rejects user-supplied image paths and network IDs outside admin allowlists', async t=>{
  const {api}=await setup(t);
  const base={labId:'lab-2',nodeId:'dev-2',name:'x',vcpus:2,ramMiB:2048,diskGiB:20,networkIds:['test-net']};
  const badImage=await api('/api/v1/vms',{method:'POST',body:{...base,imageId:'/tmp/evil.qcow2'}}); assert.equal(badImage.status,400);
  const badNet=await api('/api/v1/vms',{method:'POST',body:{...base,imageId:'ubuntu-test',networkIds:['physical-eth0']}}); assert.equal(badNet.status,400);
});

test('does not allow deletion of a running VM', async t=>{
  const {api}=await setup(t);
  const made=await (await api('/api/v1/vms',{method:'POST',body:{labId:'lab-3',nodeId:'dev-3',name:'x',imageId:'ubuntu-test',vcpus:1,ramMiB:1024,diskGiB:10,networkIds:['test-net']}})).json();
  await api(`/api/v1/vms/${made.id}/start`,{method:'POST',body:{}});
  const del=await api(`/api/v1/vms/${made.id}`,{method:'DELETE',body:{confirm:true}}); assert.equal(del.status,409);
});

test('PCAP endpoints expose only allowlisted capture interfaces and reject invalid filters', async t=>{
  const {api}=await setup(t);
  const result=await api('/api/v1/captures/interfaces'); assert.deepEqual((await result.json()).interfaces.map(i=>i.id),['test-bridge']);
  const bad=await api('/api/v1/captures',{method:'POST',body:{interfaceId:'eth0;touch /tmp/x',durationSeconds:10,filter:''}}); assert.equal(bad.status,400);
  const filter=await api('/api/v1/captures',{method:'POST',body:{interfaceId:'test-bridge',durationSeconds:10,filter:'tcp;touch /tmp/x'}}); assert.equal(filter.status,400);
});


test('Windows installer ISO creates a blank guest disk profile and can eject installer media', async t=>{
  const {api}=await setup(t);
  const response=await api('/api/v1/vms',{method:'POST',body:{labId:'win-lab',nodeId:'windows-11',name:'Windows 11 test',imageId:'windows-iso-test',vcpus:4,ramMiB:8192,diskGiB:80,networkIds:['test-net'],macs:['52:54:00:00:00:20']}});
  assert.equal(response.status,201);const made=await response.json();
  assert.equal(made.mediaType,'installer-iso');assert.equal(made.firmware,'uefi-secure-tpm2');assert.equal(made.installMediaAttached,true);
  assert.match(made.notice,/confirm the guest OS boot/i);
  const eject=await api(`/api/v1/vms/${made.id}/eject-media`,{method:'POST',body:{}});assert.equal(eject.status,200);assert.equal((await eject.json()).installMediaAttached,false);
});

test('Windows 11 Secure Boot profile enforces VM resource minimums and host capability',async t=>{
  const {api}=await setup(t);
  const common={labId:'win-lab-2',nodeId:'windows-11',name:'Windows 11',imageId:'windows-iso-test',networkIds:['test-net']};
  const undersized=await api('/api/v1/vms',{method:'POST',body:{...common,vcpus:2,ramMiB:2048,diskGiB:64}});assert.equal(undersized.status,400);
  assert.match((await undersized.json()).error,/requires at least 2 vCPU, 4096 MiB RAM and a 64 GiB disk/i);
});

test('backend image catalogue exposes only administrator-defined image IDs, not host filesystem paths',async t=>{
  const {api}=await setup(t);const response=await api('/api/v1/images');assert.equal(response.status,200);
  const body=await response.json();const win=body.images.find(i=>i.id==='windows-iso-test');
  assert.equal(win.mediaType,'installer-iso');assert.equal(win.firmware,'uefi-secure-tpm2');assert.equal(Object.hasOwn(win,'path'),false);
});


test('Windows 11 request is rejected when host Secure Boot/TPM capability is not available',async t=>{
  const {api}=await setup(t,{driver:fakeDriver({secureTpm:false})});
  const response=await api('/api/v1/vms',{method:'POST',body:{labId:'win-lab-caps',nodeId:'windows-11',name:'Windows 11',imageId:'windows-iso-test',vcpus:4,ramMiB:8192,diskGiB:80,networkIds:['test-net']}});
  assert.equal(response.status,503);assert.match((await response.json()).error,/Secure Boot OVMF firmware or swtpm/i);
});

test('real console ticket is short-lived, backend-origin scoped and opens the noVNC page only for running VMs',async t=>{
  const {api,app}=await setup(t);
  const made=await (await api('/api/v1/vms',{method:'POST',body:{labId:'console-lab',nodeId:'windows-11',name:'Windows console',imageId:'windows-iso-test',vcpus:4,ramMiB:8192,diskGiB:80,networkIds:['test-net']}})).json();
  const stopped=await api(`/api/v1/vms/${made.id}/console-ticket`,{method:'POST',body:{}});assert.equal(stopped.status,409);
  await api(`/api/v1/vms/${made.id}/start`,{method:'POST',body:{}});
  const response=await api(`/api/v1/vms/${made.id}/console-ticket`,{method:'POST',body:{}});assert.equal(response.status,200);
  const ticketData=await response.json();assert.equal(ticketData.oneTime,true);assert.equal(ticketData.expiresInSeconds,30);
  const consoleUrl=new URL(ticketData.consoleUrl);assert.equal(consoleUrl.pathname,'/console');assert.ok(consoleUrl.searchParams.get('ticket'));assert.equal(consoleUrl.port,'8787');assert.doesNotMatch(ticketData.consoleUrl,/:5900\b/i);
  // The external hostname is configured separately from the ephemeral test listener.
  const page=await fetch(`http://127.0.0.1:${app.server.address().port}/console?ticket=${encodeURIComponent(consoleUrl.searchParams.get('ticket'))}`);
  assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await page.text(),/new RFB/);
});

test('console page rejects missing, unknown and expired-style tickets',async t=>{
  const {base}=await setup(t);
  for(const url of ['/console','/console?ticket=not-a-valid-ticket']){
    const response=await fetch(base+url);assert.equal(response.status,401);
  }
});
