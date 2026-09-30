import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AppException } from '../exceptions/app.exception';

@Injectable()
export class CryptoService {
  private key: Buffer;
  constructor(private config: ConfigService) {
    const raw = (this.config.get<string>('TOKEN_ENCRYPTION_KEY') || '').trim();
    let buf: Buffer;
    if (/^[0-9a-f]{64}$/i.test(raw)) {
      buf = Buffer.from(raw, 'hex');
    } else if (Buffer.byteLength(raw, 'utf8') === 32) {
      buf = Buffer.from(raw, 'utf8');
    } else {
      buf = Buffer.from(raw, 'base64');
    }
    if (buf.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes (provide 64 hex chars, 44 base64 chars, or 32 UTF-8 bytes)');
    }
    this.key = buf;
  }
  encrypt(plain: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({ version: 1, nonce: nonce.toString('base64'), ciphertext: enc.toString('base64'), authTag: tag.toString('base64') });
  }
  decrypt(data: string): string {
    try {
      const obj = JSON.parse(data);
      const nonce = Buffer.from(obj.nonce, 'base64');
      const ct = Buffer.from(obj.ciphertext, 'base64');
      const tag = Buffer.from(obj.authTag, 'base64');
      const dec = createDecipheriv('aes-256-gcm', this.key, nonce);
      dec.setAuthTag(tag);
      return dec.update(ct).toString('utf8') + dec.final('utf8');
    } catch (err: any) {
      throw new AppException('TOKEN_DECRYPTION_FAILED', 500, `Failed to decrypt token: ${err?.message || 'invalid ciphertext'}`);
    }
  }
}
