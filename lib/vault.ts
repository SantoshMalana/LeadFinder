import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const VAULT_PATH = path.join(process.cwd(), '.leadfinder', 'vault.enc')
const ALGORITHM = 'aes-256-gcm'

function getDerivedKey(): Buffer {
  const masterSecret = process.env.VAULT_MASTER_KEY
  if (!masterSecret) throw new Error('VAULT_MASTER_KEY not set in .env.local')
  return crypto.scryptSync(masterSecret, 'leadfinder-salt-v1', 32)
}

export function vaultSet(key: string, value: string): void {
  let vault: Record<string, string> = {}
  
  if (fs.existsSync(VAULT_PATH)) {
    vault = vaultReadAll()
  }
  
  vault[key] = value
  
  const iv = crypto.randomBytes(16)
  const derivedKey = getDerivedKey()
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv)
  
  const plain = JSON.stringify(vault)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  
  const vaultDir = path.dirname(VAULT_PATH)
  if (!fs.existsSync(vaultDir)) {
    fs.mkdirSync(vaultDir, { recursive: true })
  }
  
  fs.writeFileSync(VAULT_PATH, JSON.stringify({
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted.toString('hex'),
  }))
}

export function vaultGet(key: string): string | undefined {
  return vaultReadAll()[key]
}

function vaultReadAll(): Record<string, string> {
  if (!fs.existsSync(VAULT_PATH)) return {}
  
  try {
    const raw = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'))
    const derivedKey = getDerivedKey()
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      derivedKey,
      Buffer.from(raw.iv, 'hex')
    )
    decipher.setAuthTag(Buffer.from(raw.authTag, 'hex'))
    
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(raw.data, 'hex')),
      decipher.final(),
    ])
    
    return JSON.parse(decrypted.toString('utf8'))
  } catch (err) {
    console.error('[Vault] Failed to read vault:', err)
    return {}
  }
}
