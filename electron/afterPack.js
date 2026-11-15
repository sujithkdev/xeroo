'use strict';
/**
 * electron-builder afterPack hook.
 * Flips the EnableEmbeddedAsarIntegrityValidation fuse OFF so that
 * electron-builder doesn't try to rewrite the .exe with ASAR integrity
 * data (which fails on Windows due to an NTFS file-lock race condition
 * in electron-builder 25.x with Electron 33).
 */
const { flipFuses, FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = async ({ appOutDir, packager }) => {
  if (packager.platform.name !== 'windows') return;

  const exeName = `${packager.appInfo.productFilename}.exe`;
  const exePath = path.join(appOutDir, exeName);

  console.log('[afterPack] Flipping ASAR integrity fuse OFF:', exePath);
  await flipFuses(exePath, {
    version: FuseVersion.V1,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
  });
  console.log('[afterPack] Fuse flipped successfully');
};
