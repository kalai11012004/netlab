import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { xmlEscape, safeDomainName, generatedMac, validMac } from './security.mjs';

const execFileAsync = promisify(execFile);
const VM_STATES = new Set(['running','blocked','paused','shutdown','shut off','crashed','dying','pmsuspended']);

export class LibvirtDriver {
  constructor({ uri = process.env.NETLAB_LIBVIRT_URI || 'qemu:///system', vmRoot = process.env.NETLAB_VM_ROOT || '/var/lib/libvirt/images/netlab-vms', imageDir = process.env.NETLAB_IMAGE_DIR || '/var/lib/libvirt/images/netlab-base', stateDir = process.env.NETLAB_STATE_DIR || '/var/lib/netlab/state', nvramRoot = process.env.NETLAB_NVRAM_DIR || '/var/lib/libvirt/qemu/nvram', ovmfCodePath = process.env.NETLAB_OVMF_CODE || '/usr/share/OVMF/OVMF_CODE_4M.fd', ovmfVarsTemplatePath = process.env.NETLAB_OVMF_VARS || '/usr/share/OVMF/OVMF_VARS_4M.fd', ovmfSecureCodePath = process.env.NETLAB_OVMF_SECURE_CODE || '/usr/share/OVMF/OVMF_CODE_4M.ms.fd', ovmfSecureVarsTemplatePath = process.env.NETLAB_OVMF_SECURE_VARS || '/usr/share/OVMF/OVMF_VARS_4M.ms.fd', kvmDevicePath = '/dev/kvm', runner = execFileAsync } = {}) {
    this.uri = uri; this.vmRoot = path.resolve(vmRoot); this.imageDir = path.resolve(imageDir); this.stateDir = path.resolve(stateDir); this.nvramRoot = path.resolve(nvramRoot);
    this.ovmfCodePath=ovmfCodePath; this.ovmfVarsTemplatePath=ovmfVarsTemplatePath; this.ovmfSecureCodePath=ovmfSecureCodePath; this.ovmfSecureVarsTemplatePath=ovmfSecureVarsTemplatePath; this.kvmDevicePath=kvmDevicePath; this.runner = runner;
  }
  async run(binary, args, { timeout = 10000, maxBuffer = 1024 * 1024 } = {}) {
    try {
      const { stdout = '', stderr = '' } = await this.runner(binary, [...(binary === 'virsh' ? ['-c', this.uri] : []), ...args], { timeout, maxBuffer, windowsHide: true });
      return String(stdout).trim();
    } catch (error) {
      const stderr = String(error.stderr || '').trim().slice(0, 500);
      if (error.code === 'ENOENT') throw Object.assign(new Error(`${binary} is not installed on this host.`), { statusCode: 503 });
      if (error.killed || error.code === 'ETIMEDOUT') throw Object.assign(new Error(`${binary} did not complete within its time limit.`), { statusCode: 504 });
      if (/failed to connect to the hypervisor|cannot connect to libvirt|no connection driver/i.test(stderr)) throw Object.assign(new Error('Cannot connect to the libvirt hypervisor. Check the service account and NETLAB_LIBVIRT_URI.'), { statusCode: 503 });
      throw Object.assign(new Error(stderr || `${binary} failed.`), { statusCode: 502, detailCode: error.code || null });
    }
  }
  async capabilities() {
    let version = null, uriReachable = false, libvirtResponding = false;
    try { version = await this.run('virsh', ['version']); uriReachable = true; } catch (e) { return { driver: 'libvirt', available: false, error: e.message, vmRuntime: false, vncConsole: false, pcap: false, kvmDevice: false, uefiSecureTpm2: false }; }
    try { await this.run('virsh', ['list', '--all', '--name']); libvirtResponding = true; } catch {}
    let qemu = false, tcpdump = false, swtpm = false, kvmDevice = false;
    try { await this.run('qemu-img', ['--version']); qemu = true; } catch {}
    try { await this.run('tcpdump', ['--version']); tcpdump = true; } catch {}
    try { await this.run('swtpm', ['--version']); swtpm = true; } catch {}
    try { await fs.access(this.kvmDevicePath, fsConstants.R_OK | fsConstants.W_OK); kvmDevice = true; } catch {}
    let uefi = false, secureUefi = false;
    try { await fs.access(this.ovmfCodePath, fsConstants.R_OK); await fs.access(this.ovmfVarsTemplatePath, fsConstants.R_OK); uefi = true; } catch {}
    try { await fs.access(this.ovmfSecureCodePath, fsConstants.R_OK); await fs.access(this.ovmfSecureVarsTemplatePath, fsConstants.R_OK); secureUefi = true; } catch {}
    const vmRuntime = uriReachable && libvirtResponding && qemu && kvmDevice;
    return { driver: 'libvirt', available: vmRuntime, version: version.slice(0, 300), vmRuntime, vncConsole: vmRuntime, pcap: tcpdump, kvmDevice, uefi, uefiSecureTpm2: vmRuntime && secureUefi && swtpm };
  }
  async domainExists(domain) {
    if (!safeDomainName(domain)) throw Object.assign(new Error('Invalid VM identifier.'), { statusCode: 400 });
    try { await this.run('virsh', ['dominfo', domain]); return true; }
    catch (error) { if (error.statusCode === 502 && /domain not found|failed to get domain/i.test(error.message)) return false; if (error.message?.toLowerCase().includes('domain not found')) return false; throw error; }
  }
  async domainState(domain) {
    if (!safeDomainName(domain)) throw Object.assign(new Error('Invalid VM identifier.'), { statusCode: 400 });
    const raw = await this.run('virsh', ['domstate', domain]);
    const state = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!VM_STATES.has(state)) throw Object.assign(new Error(`Unexpected hypervisor state: ${state}`), { statusCode: 502 });
    if (state === 'running' || state === 'blocked') return 'running';
    if (state === 'paused' || state === 'pmsuspended') return 'paused';
    if (state === 'crashed' || state === 'dying') return 'failed';
    return 'stopped';
  }
  async listDomains() {
    const names = await this.run('virsh', ['list', '--all', '--name']);
    return names.split(/\r?\n/).map(x => x.trim()).filter(x => safeDomainName(x) && x.startsWith('nl-'));
  }
  async listNetworks(allowed) {
    const networks = [];
    for (const net of allowed) {
      try {
        const raw = await this.run('virsh', ['net-info', net.name]);
        networks.push({ id: net.id, label: net.label || net.id, name: net.name, active: /^Active:\s+yes/im.test(raw), persistent: /^Persistent:\s+yes/im.test(raw), autostart: /^Autostart:\s+yes/im.test(raw) });
      } catch { networks.push({ id: net.id, label: net.label || net.id, name: net.name, active: false, configured: true }); }
    }
    return networks;
  }
  async createVm({ id, name, image, vcpus, ramMiB, diskGiB, networkIds, networks, macs }) {
    if (!safeDomainName(id)) throw Object.assign(new Error('Invalid VM identifier.'), { statusCode: 400 });
    if (await this.domainExists(id)) return { id, state: await this.domainState(id), created: false };
    if (!image?.path || !path.isAbsolute(image.path)) throw Object.assign(new Error('Selected image is not in the server image registry.'), { statusCode: 400 });
    const mediaType = image.mediaType || 'disk';
    if (!['disk','installer-iso'].includes(mediaType)) throw Object.assign(new Error('Unsupported administrator registry image media type.'), { statusCode: 400 });
    if (mediaType === 'installer-iso' && image.format !== 'iso') throw Object.assign(new Error('Installer media must be registered with format iso.'), { statusCode: 400 });
    if (mediaType === 'disk' && !['qcow2','raw'].includes(image.format || 'qcow2')) throw Object.assign(new Error('Boot disk image format must be qcow2 or raw.'), { statusCode: 400 });
    const firmware = image.firmware || 'bios';
    if (!['bios','uefi','uefi-secure-tpm2'].includes(firmware)) throw Object.assign(new Error('Unsupported firmware profile.'), { statusCode: 400 });
    const windowsGuest = /windows/i.test(String(image.guestOS || ''));
    let loaderPath = null, varsTemplatePath = null, nvramPath = null;
    if (firmware === 'uefi' || firmware === 'uefi-secure-tpm2') {
      loaderPath = firmware === 'uefi-secure-tpm2' ? this.ovmfSecureCodePath : this.ovmfCodePath;
      varsTemplatePath = firmware === 'uefi-secure-tpm2' ? this.ovmfSecureVarsTemplatePath : this.ovmfVarsTemplatePath;
      try { await fs.access(loaderPath, fsConstants.R_OK); await fs.access(varsTemplatePath, fsConstants.R_OK); }
      catch { throw Object.assign(new Error('Required OVMF firmware files are not installed or readable on the KVM host.'), { statusCode: 503 }); }
      if (firmware === 'uefi-secure-tpm2') {
        try { await this.run('swtpm', ['--version']); }
        catch { throw Object.assign(new Error('Secure UEFI requires swtpm-tools on the host.'), { statusCode: 503 }); }
      }
      nvramPath = path.join(this.nvramRoot, `${id}_VARS.fd`);
      try { await fs.access(nvramPath); throw Object.assign(new Error('A firmware NVRAM file already exists for this VM ID. It was not overwritten.'), { statusCode: 409 }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }

    await fs.mkdir(this.vmRoot, { recursive: true, mode: 0o750 });
    await fs.mkdir(this.stateDir, { recursive: true, mode: 0o750 });
    const diskPath = path.join(this.vmRoot, `${id}.qcow2`);
    try { await fs.access(diskPath); throw Object.assign(new Error('A disk file for this VM already exists. It was not overwritten.'), { statusCode: 409 }); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }

    const ifaces = networkIds.map((networkId, idx) => {
      const mapping = networks.find(n => n.id === networkId);
      if (!mapping) throw Object.assign(new Error(`Unknown virtual network ID: ${networkId}`), { statusCode: 400 });
      return { name: mapping.name, mac: validMac(macs?.[idx]) ? macs[idx].toLowerCase() : generatedMac() };
    });
    const xml = this.domainXml({ id, name, vcpus, ramMiB, diskPath, ifaces, image, windowsGuest, loaderPath, varsTemplatePath, nvramPath });
    const tempXml = path.join(os.tmpdir(), `${id}-${process.pid}-${Date.now()}.xml`);
    let defined = false;
    try {
      if (mediaType === 'installer-iso') {
        // A fresh writable OS disk is created; the owner-provided ISO is attached read-only as a CD-ROM.
        await this.run('qemu-img', ['create', '-f', 'qcow2', diskPath, `${diskGiB}G`], { timeout: 30000 });
      } else {
        await this.run('qemu-img', ['create', '-f', 'qcow2', '-F', image.format || 'qcow2', '-b', image.path, diskPath, `${diskGiB}G`], { timeout: 30000 });
      }
      await fs.writeFile(tempXml, xml, { mode: 0o600, flag: 'wx' });
      await this.run('virsh', ['define', tempXml], { timeout: 15000 });
      defined = true;
    } catch (error) {
      if (!defined) await fs.rm(diskPath, { force: true }).catch(() => {});
      if (!defined && nvramPath) await fs.rm(nvramPath, { force: true }).catch(() => {});
      throw error;
    } finally { await fs.rm(tempXml, { force: true }).catch(() => {}); }
    return { id, state: 'stopped', created: true, diskGiB, vcpus, ramMiB, networks: networkIds, mediaType, firmware, installMediaAttached: mediaType === 'installer-iso' };
  }
  domainXml({ id, name, vcpus, ramMiB, diskPath, ifaces, image, windowsGuest, loaderPath, varsTemplatePath, nvramPath }) {
    const mediaType = image.mediaType || 'disk';
    const windows = windowsGuest || /windows/i.test(String(image.guestOS || ''));
    const interfaceModel = windows ? 'e1000e' : 'virtio';
    const interfaceXml = ifaces.map(iface => `<interface type='network'><mac address='${xmlEscape(iface.mac)}'/><source network='${xmlEscape(iface.name)}'/><model type='${interfaceModel}'/><alias name='net-${xmlEscape(iface.mac.replaceAll(':',''))}'/></interface>`).join('');
    const sataDisk = windows || mediaType === 'installer-iso';
    const diskTarget = sataDisk ? "<target dev='sda' bus='sata'/>" : "<target dev='vda' bus='virtio'/>";
    const diskXml = `<disk type='file' device='disk'><driver name='qemu' type='qcow2' cache='none' io='native'/><source file='${xmlEscape(diskPath)}'/>${diskTarget}</disk>`;
    const cdromXml = mediaType === 'installer-iso' ? `<disk type='file' device='cdrom'><driver name='qemu' type='raw'/><source file='${xmlEscape(image.path)}'/><target dev='sdb' bus='sata'/><readonly/></disk>` : '';
    const bootXml = mediaType === 'installer-iso' ? "<boot dev='cdrom'/><boot dev='hd'/><bootmenu enable='yes' timeout='5000'/>" : "<boot dev='hd'/><bootmenu enable='yes' timeout='5000'/>";
    const firmwareXml = loaderPath && varsTemplatePath && nvramPath
      ? `<loader readonly='yes' type='pflash' format='raw'${image.firmware === 'uefi-secure-tpm2' ? " secure='yes'" : ''}>${xmlEscape(loaderPath)}</loader><nvram template='${xmlEscape(varsTemplatePath)}' format='raw'>${xmlEscape(nvramPath)}</nvram>`
      : '';
    const smmXml = image.firmware === 'uefi-secure-tpm2' ? "<smm state='on'/>" : '';
    const tpmXml = image.firmware === 'uefi-secure-tpm2' ? "<tpm model='tpm-crb'><backend type='emulator' version='2.0'/></tpm>" : '';
    return `<domain type='kvm'>
<name>${xmlEscape(id)}</name><title>${xmlEscape(String(name).slice(0,120))}</title>
<memory unit='MiB'>${ramMiB}</memory><currentMemory unit='MiB'>${ramMiB}</currentMemory><vcpu placement='static'>${vcpus}</vcpu>
<os><type arch='x86_64' machine='q35'>hvm</type>${firmwareXml}${bootXml}</os>
<features><acpi/><apic/>${smmXml}</features><cpu mode='host-passthrough' check='none'/>
<clock offset='utc'/><on_poweroff>destroy</on_poweroff><on_reboot>restart</on_reboot><on_crash>destroy</on_crash>
<devices>${diskXml}${cdromXml}
${interfaceXml}<input type='tablet' bus='usb'/><graphics type='vnc' port='-1' autoport='yes' listen='127.0.0.1'><listen type='address' address='127.0.0.1'/></graphics><video><model type='vga' vram='16384' heads='1' primary='yes'/></video>
<serial type='pty'><target port='0'/></serial><console type='pty'><target type='serial' port='0'/></console>${tpmXml}
</devices></domain>`;
  }
  async startVm(domain) {
    if (!await this.domainExists(domain)) throw Object.assign(new Error('VM has not been created. Choose an authorized image and create it first.'), { statusCode: 404 });
    if (await this.domainState(domain) !== 'running') await this.run('virsh', ['start', domain], { timeout: 30000 });
    const state = await this.domainState(domain);
    if (state !== 'running') throw Object.assign(new Error(`Hypervisor did not confirm a running state (reported: ${state}).`), { statusCode: 502 });
    return { id: domain, state };
  }
  async stopVm(domain, timeoutMs = 25000) {
    if (!await this.domainExists(domain)) throw Object.assign(new Error('VM not found.'), { statusCode: 404 });
    if (await this.domainState(domain) === 'stopped') return { id: domain, state: 'stopped' };
    await this.run('virsh', ['shutdown', domain], { timeout: 10000 }).catch(error => { if (!/domain is not running/i.test(error.message)) throw error; });
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 250));
      const state = await this.domainState(domain);
      if (state === 'stopped') return { id: domain, state };
      if (state === 'failed') throw Object.assign(new Error('VM failed while shutting down; inspect libvirt logs before recovery.'), { statusCode: 502 });
    }
    throw Object.assign(new Error('Guest did not shut down before timeout. No force-stop was issued; use the hypervisor admin console after checking guest data.'), { statusCode: 409 });
  }
  async vmInfo(domain) {
    if (!await this.domainExists(domain)) throw Object.assign(new Error('VM not found.'), { statusCode: 404 });
    const info = await this.run('virsh', ['dominfo', domain]);
    const val = key => info.match(new RegExp(`^${key}:\\s*(.*)$`, 'im'))?.[1]?.trim() || '';
    let vnc = null;
    try {
      const disp = await this.run('virsh', ['vncdisplay', domain]);
      const m = disp.match(/:(\d+)$/); if (m) vnc = 5900 + Number(m[1]);
      const hostMatch = disp.match(/^([^:]+):(\d+)$/); if (hostMatch) vnc = 5900 + Number(hostMatch[2]);
    } catch {}
    let installMediaAttached = false;
    try { const blocks = await this.run('virsh', ['domblklist', domain, '--details']); installMediaAttached = blocks.split(/\r?\n/).some(line => /\bcdrom\b/i.test(line) && /\bsdb\b/i.test(line) && /\.iso(?:\s|$)/i.test(line)); } catch {}
    const state = await this.domainState(domain);
    return { id: domain, name: val('Name') || domain, state, maxMemoryKiB: Number(val('Max memory')) || null, vcpus: Number(val('CPU(s)')) || null, persistent: val('Persistent') === 'yes', vncAvailable: state === 'running' && Number.isInteger(vnc), installMediaAttached, _vncPort: vnc };
  }
  async ejectInstallMedia(domain) {
    if (!await this.domainExists(domain)) throw Object.assign(new Error('VM not found.'), { statusCode: 404 });
    const state = await this.domainState(domain);
    const args = ['change-media', domain, 'sdb', '--eject'];
    if (state === 'running' || state === 'paused') args.push('--live');
    args.push('--config');
    await this.run('virsh', args, { timeout: 15000 });
    return { id: domain, state, installMediaAttached: false, notice: 'Installer media was ejected; the writable VM disk was retained.' };
  }
  async deleteVm(domain) {
    const info = await this.vmInfo(domain);
    if (info.state !== 'stopped') throw Object.assign(new Error('Stop the VM normally and confirm the guest is stopped before deleting it.'), { statusCode: 409 });
    await this.run('virsh', ['undefine', domain, '--nvram'], { timeout: 15000 });
    await fs.rm(path.join(this.vmRoot, `${domain}.qcow2`), { force: true });
    await fs.rm(path.join(this.stateDir, `${domain}.json`), { force: true });
    await fs.rm(path.join(this.nvramRoot, `${domain}_VARS.fd`), { force: true });
    return { id: domain, deleted: true };
  }
}

export function spawnCapture({ interfaceName, durationSeconds, maxMb, filter, outputPath, onDone = () => {} }) {
  const args = ['-i', interfaceName, '-s', '0', '-U', '-nn', '-w', outputPath, '-C', String(maxMb), '-W', '1'];
  if (filter) args.push(filter);
  const child = spawn('tcpdump', args, { shell: false, stdio: ['ignore','ignore','pipe'] });
  let stderr = '', settled = false;
  const finish = (result) => { if(settled)return; settled=true; onDone(result); };
  child.stderr.on('data', b => { if (stderr.length < 4096) stderr += b.toString().slice(0, 4096 - stderr.length); });
  const timer = setTimeout(() => { if (!child.killed) child.kill('SIGINT'); }, durationSeconds * 1000);
  child.once('error', error => { clearTimeout(timer); finish({ ok: false, error: error.code === 'ENOENT' ? 'tcpdump is not installed on this host.' : 'Could not start packet capture.' }); });
  child.once('close', (code, signal) => { clearTimeout(timer); finish({ ok: code === 0 || signal === 'SIGINT', code, signal, error: code === 0 || signal === 'SIGINT' ? null : stderr.trim().slice(0,400) || 'Packet capture failed.' }); });
  return { pid: child.pid, stop: () => { clearTimeout(timer); if (!child.killed) child.kill('SIGINT'); } };
}
