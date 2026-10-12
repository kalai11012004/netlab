import test from 'node:test';
import assert from 'node:assert/strict';
import { LibvirtDriver } from '../lib/libvirt-driver.mjs';

const base = {
  id: 'nl-windows-lab01-pc01',
  name: "Windows 11 'Workstation'",
  vcpus: 4,
  ramMiB: 8192,
  diskPath: '/var/lib/libvirt/images/netlab-vms/nl-windows-lab01-pc01.qcow2',
  ifaces: [{ name: 'default', mac: '52:54:00:00:00:10' }],
  image: {
    id: 'windows11-installer',
    path: '/var/lib/libvirt/images/netlab-base/Win11.iso',
    format: 'iso',
    mediaType: 'installer-iso',
    firmware: 'uefi-secure-tpm2',
    guestOS: 'Windows 11'
  },
  windowsGuest: true,
  loaderPath: '/usr/share/OVMF/OVMF_CODE_4M.ms.fd',
  varsTemplatePath: '/usr/share/OVMF/OVMF_VARS_4M.ms.fd',
  nvramPath: '/var/lib/libvirt/qemu/nvram/nl-windows-lab01-pc01_VARS.fd'
};

test('Windows installer XML includes a blank writable SATA disk and read-only installer CD-ROM', () => {
  const xml = new LibvirtDriver().domainXml(base);
  assert.match(xml, /<disk type='file' device='disk'>[\s\S]*?<target dev='sda' bus='sata'\/>/);
  assert.match(xml, /<disk type='file' device='cdrom'>[\s\S]*?<target dev='sdb' bus='sata'\/><readonly\/>/);
  assert.match(xml, /<boot dev='cdrom'\/><boot dev='hd'\/>/);
  assert.match(xml, /<source file='\/var\/lib\/libvirt\/images\/netlab-base\/Win11\.iso'\/>/);
});

test('Windows guest uses installer-compatible e1000e NIC, UEFI Secure Boot and TPM 2.0', () => {
  const xml = new LibvirtDriver().domainXml(base);
  assert.match(xml, /<model type='e1000e'\/>/);
  assert.match(xml, /<loader readonly='yes' type='pflash' format='raw' secure='yes'>/);
  assert.match(xml, /<smm state='on'\/>/);
  assert.match(xml, /<tpm model='tpm-crb'><backend type='emulator' version='2\.0'\/><\/tpm>/);
});

test('domain XML escapes user-controlled title and device strings', () => {
  const xml = new LibvirtDriver().domainXml({
    ...base,
    name: "desktop <admin> & team",
    ifaces: [{ name: "network&safe", mac: '52:54:00:00:00:20' }],
  });
  assert.match(xml, /<title>desktop &lt;admin&gt; &amp; team<\/title>/);
  assert.match(xml, /<source network='network&amp;safe'\/>/);
});

test('preinstalled Linux disk retains the efficient virtio disk and virtio NIC path', () => {
  const xml = new LibvirtDriver().domainXml({
    ...base,
    id: 'nl-linux-lab01-pc01',
    name: 'Ubuntu training host',
    ifaces: [{ name: 'default', mac: '52:54:00:00:00:21' }],
    image: {
      path: '/var/lib/libvirt/images/netlab-base/ubuntu.qcow2', format: 'qcow2',
      mediaType: 'disk', firmware: 'uefi', guestOS: 'Ubuntu Linux'
    },
    windowsGuest: false,
    loaderPath: '/usr/share/OVMF/OVMF_CODE_4M.fd',
    varsTemplatePath: '/usr/share/OVMF/OVMF_VARS_4M.fd',
    nvramPath: '/var/lib/libvirt/qemu/nvram/nl-linux-lab01-pc01_VARS.fd'
  });
  assert.match(xml, /<target dev='vda' bus='virtio'\/>/);
  assert.match(xml, /<model type='virtio'\/>/);
  assert.doesNotMatch(xml, /device='cdrom'/);
  assert.match(xml, /<boot dev='hd'\/>/);
});
