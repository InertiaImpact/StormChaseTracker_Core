const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256FileAsync(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function updateAssetMatches(expected, actual) {
  return !!expected
    && !!actual
    && String(expected.version || '') === String(actual.version || '')
    && String(expected.fileName || '') === String(actual.fileName || '')
    && Number(expected.sizeBytes) === Number(actual.sizeBytes)
    && String(expected.sha256 || '').toLowerCase() === String(actual.sha256 || '').toLowerCase();
}

async function prepareVerifiedInstaller({ sourcePath, asset, pendingDir, uniqueId = crypto.randomUUID() }) {
  const expectedSize = Number(asset?.sizeBytes);
  const expectedHash = String(asset?.sha256 || '').toLowerCase();
  if (!Number.isInteger(expectedSize) || expectedSize < 0) {
    throw new Error('Published Core update has an invalid byte size');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error('Published Core update has an invalid SHA-256');
  }

  await fs.promises.mkdir(pendingDir, { recursive: true });
  const destination = path.join(pendingDir, `StormChaseTracker-Core-Update-${asset.version || 'unknown'}-${uniqueId}.exe`);
  const stagingPath = `${destination}.download`;

  try {
    await fs.promises.copyFile(sourcePath, stagingPath, fs.constants.COPYFILE_EXCL);
    const stat = await fs.promises.stat(stagingPath);
    if (stat.size !== expectedSize) {
      throw new Error('Prepared Core update failed size verification');
    }
    const hash = await sha256FileAsync(stagingPath);
    if (hash.toLowerCase() !== expectedHash) {
      throw new Error('Prepared Core update failed checksum verification');
    }
    await fs.promises.rename(stagingPath, destination);
    return destination;
  } catch (err) {
    try { await fs.promises.unlink(stagingPath); } catch { /* ignore */ }
    try { await fs.promises.unlink(destination); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = {
  prepareVerifiedInstaller,
  sha256FileAsync,
  updateAssetMatches
};
