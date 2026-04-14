/**
 * Parse version string "1.2.3" atau "v1.2.3" menjadi object {major, minor, patch}
 */
function parseVersion(versionStr) {
  const cleaned = versionStr.replace(/^v/, '');
  const parts = cleaned.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * Compare dua versi.
 * Returns: 1 jika a > b, -1 jika a < b, 0 jika sama
 */
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1;
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1;
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1;
  return 0;
}

/**
 * Validasi format semantic versioning
 */
function isValidVersion(versionStr) {
  const regex = /^v?\d+\.\d+\.\d+$/;
  return regex.test(versionStr);
}

module.exports = { parseVersion, compareVersions, isValidVersion };
