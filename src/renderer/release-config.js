(function (root, factory) {
  const config = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = config;
  else root.PMRelease = config;
})(typeof window === 'object' ? window : globalThis, () => ({
  provider: 'github', owner: 'JimMinseay3', repo: 'release',
  releaseUrl: 'https://github.com/JimMinseay3/release/releases/latest',
}));
