import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadImageRegistry } from '../server.mjs';

async function withRegistry(t, build) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'netlab-image-registry-'));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  const imageRoot = path.join(root, 'images');
  await fs.mkdir(imageRoot);
  const registryFile = path.join(root, 'registry.json');
  const config = { imageDir: imageRoot, registryFile };
  await build({root,imageRoot,registryFile,config});
  return {root,imageRoot,registryFile,config};
}

test('registry allows owner-supplied Windows ISO under the image root and carries secure firmware profile', async t => {
  const {config,imageRoot,registryFile} = await withRegistry(t, async x => {
    await fs.writeFile(path.join(x.imageRoot, 'Win11.iso'), Buffer.from('fake-iso-for-path-validation'));
    await fs.writeFile(x.registryFile, JSON.stringify({images:[{id:'windows11-installer',label:'Windows 11 installer',path:path.join(x.imageRoot,'Win11.iso'),format:'iso',mediaType:'installer-iso',firmware:'uefi-secure-tpm2',guestOS:'Windows 11'}]}));
  });
  const [image] = await loadImageRegistry({imageDir:imageRoot,registryFile});
  assert.equal(image.mediaType,'installer-iso');
  assert.equal(image.firmware,'uefi-secure-tpm2');
  assert.equal(image.guestOS,'Windows 11');
  assert.ok(image.path.startsWith(imageRoot));
});

test('registry rejects image paths outside configured image root', async t => {
  const outside = await withRegistry(t, async x => {
    const external = path.join(x.root, 'outside.iso');
    await fs.writeFile(external, 'image');
    await fs.writeFile(x.registryFile, JSON.stringify({images:[{id:'escape',path:external,format:'iso',mediaType:'installer-iso'}]}));
  });
  await assert.rejects(loadImageRegistry(outside.config), /path must be inside NETLAB_IMAGE_DIR/i);
});

test('registry rejects symlink escapes and invalid media/firmware combinations', async t => {
  const {root,imageRoot,registryFile,config} = await withRegistry(t, async x => {
    const external = path.join(x.root, 'external.iso');
    await fs.writeFile(external,'external image');
    await fs.symlink(external, path.join(x.imageRoot,'escape.iso'));
    await fs.writeFile(x.registryFile, JSON.stringify({images:[{id:'escape',path:path.join(x.imageRoot,'escape.iso'),format:'iso',mediaType:'installer-iso'}]}));
  });
  await assert.rejects(loadImageRegistry(config), /resolves outside NETLAB_IMAGE_DIR/i);
  await fs.rm(path.join(imageRoot,'escape.iso'));
  await fs.writeFile(path.join(imageRoot,'bad.iso'),'fake image');
  await fs.writeFile(registryFile, JSON.stringify({images:[{id:'bad',path:path.join(imageRoot,'bad.iso'),format:'qcow2',mediaType:'installer-iso'}]}));
  await assert.rejects(loadImageRegistry(config), /installer-iso with format iso/i);
});
