const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  prepareVerifiedInstaller,
  updateAssetMatches
} = require('../core-update');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function withTempDirectory(t) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'storm-core-update-'));
  t.after(async () => fs.promises.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('updateAssetMatches requires version, filename, size, and hash to match', () => {
  const latest = { version: '0.3.5', fileName: 'StormChaseTracker Core Setup 0.3.5.exe', sizeBytes: 12, sha256: 'A'.repeat(64) };
  assert.equal(updateAssetMatches({ ...latest, sha256: 'a'.repeat(64) }, latest), true);
  assert.equal(updateAssetMatches({ ...latest, version: '0.3.4' }, latest), false);
  assert.equal(updateAssetMatches({ ...latest, sizeBytes: 13 }, latest), false);
  assert.equal(updateAssetMatches(null, latest), false);
});

test('prepareVerifiedInstaller atomically prepares a verified executable', async (t) => {
  const dir = await withTempDirectory(t);
  const sourcePath = path.join(dir, 'source.exe');
  const pendingDir = path.join(dir, 'pending');
  const contents = Buffer.from('verified installer bytes');
  await fs.promises.writeFile(sourcePath, contents);
  const asset = {
    version: '0.3.5',
    fileName: 'StormChaseTracker Core Setup 0.3.5.exe',
    sizeBytes: contents.length,
    sha256: sha256(contents)
  };

  const result = await prepareVerifiedInstaller({ sourcePath, asset, pendingDir, uniqueId: 'test-id' });
  assert.equal(path.basename(result), 'StormChaseTracker-Core-Update-0.3.5-test-id.exe');
  assert.deepEqual(await fs.promises.readFile(result), contents);
  assert.equal(fs.existsSync(`${result}.download`), false);
});

test('prepareVerifiedInstaller removes staging files after verification failure', async (t) => {
  const dir = await withTempDirectory(t);
  const sourcePath = path.join(dir, 'source.exe');
  const pendingDir = path.join(dir, 'pending');
  const contents = Buffer.from('corrupt installer bytes');
  await fs.promises.writeFile(sourcePath, contents);
  const asset = {
    version: '0.3.5',
    fileName: 'StormChaseTracker Core Setup 0.3.5.exe',
    sizeBytes: contents.length,
    sha256: '0'.repeat(64)
  };

  await assert.rejects(
    prepareVerifiedInstaller({ sourcePath, asset, pendingDir, uniqueId: 'bad-hash' }),
    /checksum verification/
  );
  assert.deepEqual(await fs.promises.readdir(pendingDir), []);
});

test('prepareVerifiedInstaller rejects missing verification metadata', async (t) => {
  const dir = await withTempDirectory(t);
  const sourcePath = path.join(dir, 'source.exe');
  await fs.promises.writeFile(sourcePath, 'installer');
  await assert.rejects(
    prepareVerifiedInstaller({ sourcePath, asset: { fileName: 'update.exe' }, pendingDir: path.join(dir, 'pending') }),
    /invalid byte size/
  );
});
