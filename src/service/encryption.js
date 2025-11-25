import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

// Fixed salt for deterministic key generation
// This is safe because pbkdf2 with a large number of iterations protects against brute-force attacks
const FIXED_SALT = 'steam-account-manager-v1-fixed-salt';

class EncryptionService {
  constructor() {
    this.masterKey = null;
  }

  // Initialize with password
  async initialize(password) {
    if (!password) {
      throw new Error('Password is required for initialization');
    }
    
    // Generate key from password and fixed salt
    this.masterKey = await this.deriveKey(password, FIXED_SALT);
    return true;
  }

  // Derive key from password
  async deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        ITERATIONS,
        KEY_LENGTH,
        'sha512',
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }

  // Encryption
  encrypt(text) {
    if (!this.masterKey) {
      throw new Error('Encryption service is not initialized');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  // Decryption
  decrypt(encryptedText) {
    if (!this.masterKey) {
      throw new Error('Encryption service is not initialized');
    }

    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // Encrypt object
  encryptObject(obj) {
    return this.encrypt(JSON.stringify(obj));
  }

  // Decrypt object
  decryptObject(encryptedText) {
    const decrypted = this.decrypt(encryptedText);
    return JSON.parse(decrypted);
  }

  // Check if initialized
  isInitialized() {
    return this.masterKey !== null;
  }

  // Password verification (optional)
  // Can be used for validation before decryption
  async verifyPassword(password, encryptedTestData) {
    try {
      const tempKey = await this.deriveKey(password, FIXED_SALT);
      const currentKey = this.masterKey;
      
      this.masterKey = tempKey;
      this.decrypt(encryptedTestData);
      this.masterKey = currentKey;
      
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();
export default EncryptionService;