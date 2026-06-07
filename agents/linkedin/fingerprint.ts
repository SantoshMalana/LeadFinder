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

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
]

export function generateFingerprint(sessionSeed?: string): BrowserFingerprint {
  const seed = sessionSeed || crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(seed).digest('hex')
  const idx = (n: number, max: number) => parseInt(hash.slice(n * 2, n * 2 + 2), 16) % max

  return {
    viewport: VIEWPORT_POOL[idx(0, VIEWPORT_POOL.length)],
    userAgent: UA_POOL[idx(1, UA_POOL.length)],
    locale: 'en-US',
    timezone: 'America/New_York',
    geolocation: {
      latitude: 40.7128 + (Math.random() - 0.5) * 0.01,
      longitude: -74.006 + (Math.random() - 0.5) * 0.01,
    },
    acceptLanguage: 'en-US,en;q=0.9',
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    platform: '"Windows"',
    canvasNoise: parseInt(hash.slice(4, 8), 16) % 10,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
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
