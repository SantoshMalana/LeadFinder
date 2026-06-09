import crypto from 'crypto'

export interface BrowserFingerprint {
  viewport: { width: number; height: number }
  userAgent: string
  locale: string
  timezone: string
  geolocation: { latitude: number; longitude: number }
  acceptLanguage: string
  secChUa: string
  platform: string
  canvasNoise: number
  webglVendor: string
  webglRenderer: string
  audioNoise: number
}

const VIEWPORT_POOL = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 2560, height: 1440 },
]

const CHROME_VERSION_POOL = [
  { major: 136, build: '136.0.7103.93' },
  { major: 135, build: '135.0.7049.115' },
  { major: 134, build: '134.0.6998.165' },
]

const PLATFORM_CONFIGS = [
  {
    platform: '"Windows"',
    ua: (v: string) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
    secChUa: (major: number) => `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not-A.Brand";v="99"`,
  },
  {
    platform: '"macOS"',
    ua: (v: string) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
    secChUa: (major: number) => `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not-A.Brand";v="99"`,
  },
]

const LOCALE_POOL = [
  { timezone: 'America/New_York',    geo: { latitude: 40.7128, longitude: -74.0060 }, locale: 'en-US' },
  { timezone: 'America/Chicago',     geo: { latitude: 41.8781, longitude: -87.6298 }, locale: 'en-US' },
  { timezone: 'America/Los_Angeles', geo: { latitude: 34.0522, longitude: -118.2437 }, locale: 'en-US' },
  { timezone: 'America/Denver',      geo: { latitude: 39.7392, longitude: -104.9903 }, locale: 'en-US' },
  { timezone: 'Europe/London',       geo: { latitude: 51.5074, longitude: -0.1278 }, locale: 'en-GB' },
  { timezone: 'Asia/Kolkata',        geo: { latitude: 19.0760, longitude: 72.8777 }, locale: 'en-IN' },
]

export function generateFingerprint(sessionSeed?: string): BrowserFingerprint {
  const seed = sessionSeed || crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(seed).digest('hex')
  const idx = (n: number, max: number) => parseInt(hash.slice(n * 2, n * 2 + 2), 16) % max

  const chromeVer = CHROME_VERSION_POOL[idx(0, CHROME_VERSION_POOL.length)]
  const platformConf = PLATFORM_CONFIGS[idx(1, PLATFORM_CONFIGS.length)]
  const localeEntry = LOCALE_POOL[idx(2, LOCALE_POOL.length)]

  return {
    viewport: VIEWPORT_POOL[idx(3, VIEWPORT_POOL.length)],
    userAgent: platformConf.ua(chromeVer.build),
    secChUa: platformConf.secChUa(chromeVer.major),
    platform: platformConf.platform,
    locale: localeEntry.locale,
    timezone: localeEntry.timezone,
    geolocation: {
      latitude: localeEntry.geo.latitude + (Math.random() - 0.5) * 0.01,
      longitude: localeEntry.geo.longitude + (Math.random() - 0.5) * 0.01,
    },
    acceptLanguage: `${localeEntry.locale},en;q=0.9`,
    canvasNoise: parseInt(hash.slice(4, 8), 16) % 10,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    audioNoise: parseInt(hash.slice(8, 12), 16) % 5,
  }
}

export function getFingerprintScript(fp: BrowserFingerprint): string {
  return `
    // Canvas fingerprint noise injection
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      const ctx = originalGetContext.call(this, type, ...args);
      if (type === '2d' && ctx) {
        const originalFillText = ctx.fillText.bind(ctx);
        ctx.fillText = function(...args) {
          ctx.shadowBlur = ${fp.canvasNoise};
          return originalFillText(...args);
        };
      }
      return ctx;
    };

    // WebGL vendor/renderer spoofing
    const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return '${fp.webglVendor}';
      if (parameter === 37446) return '${fp.webglRenderer}';
      return getParameterOriginal.call(this, parameter);
    };

    // Remove automation indicators
    delete Object.getPrototypeOf(navigator).webdriver;
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

    // AudioContext noise
    const origCreateOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() {
      const oscillator = origCreateOscillator.call(this);
      oscillator.frequency.value += ${fp.audioNoise} * 0.01;
      return oscillator;
    };

    // Chrome runtime spoofing
    window.chrome = { runtime: {} };
  `
}
