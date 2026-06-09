const REQUIRED_VARS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL:    'Supabase project URL',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Supabase anon key (public)',
  SUPABASE_SERVICE_ROLE_KEY:   'Supabase service role key (secret)',
  GROQ_API_KEY:                'Groq API key for LLaMA inference',
  GEMINI_API_KEY:              'Google Gemini API key',
  UPSTASH_REDIS_REST_URL:      'Upstash Redis REST URL',
  UPSTASH_REDIS_REST_TOKEN:    'Upstash Redis REST token',
  INTERNAL_HMAC_SECRET:        'Secret for signing internal API requests',
  NEXT_PUBLIC_APP_URL:         'Public URL of the Next.js app',
}

const OPTIONAL_VARS: Record<string, string> = {
  RESEND_API_KEY:              'Resend email API key (alerts only)',
  RESEND_FROM_EMAIL:           'From address for Resend emails',
  GMAIL_USER:                  'Gmail address for IMAP inbox tracking',
  GMAIL_APP_PASSWORD:          'Gmail App Password (not your real password)',
  REDDIT_USERNAME:             'Reddit account username for bot',
  REDDIT_PASSWORD:             'Reddit account password for bot',
  TELEGRAM_API_ID:             'Telegram API ID from my.telegram.org',
  TELEGRAM_API_HASH:           'Telegram API hash from my.telegram.org',
  UPWORK_RSS_URL:              'Upwork RSS feed URL for job discovery',
  CAPTCHA_API_KEY:             '2Captcha or CapSolver API key',
  STRIPE_SECRET_KEY:           'Stripe secret key for billing',
  STRIPE_WEBHOOK_SECRET:       'Stripe webhook signing secret',
}

export function validateEnv(mode: 'server' | 'daemon' = 'server'): void {
  const missing: string[] = []

  for (const [key, description] of Object.entries(REQUIRED_VARS)) {
    if (!process.env[key]) {
      missing.push(`  ✗ ${key.padEnd(35)} — ${description}`)
    }
  }

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:\n')
    console.error(missing.join('\n'))
    console.error('\nAdd these to your .env.local file.\n')
    process.exit(1)
  }

  // Warn about optional but commonly needed vars
  const missingOptional = Object.entries(OPTIONAL_VARS)
    .filter(([key]) => !process.env[key])
    .map(([key, desc]) => `  ⚠ ${key.padEnd(35)} — ${desc}`)

  if (missingOptional.length > 0 && mode === 'daemon') {
    console.warn('\n⚠ Optional env vars not set (some features will be disabled):')
    console.warn(missingOptional.join('\n'))
    console.warn('')
  }

  console.log('✅ Environment validation passed\n')
}
