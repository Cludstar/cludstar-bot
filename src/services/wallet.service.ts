import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';

export class WalletService {
  private keypair: Keypair;

  constructor(privateKeyBase58?: string, secretFilePath?: string) {
    if (secretFilePath && fs.existsSync(secretFilePath)) {
      try {
        const fileContent = fs.readFileSync(secretFilePath, 'utf8').trim();
        this.keypair = Keypair.fromSecretKey(bs58.decode(fileContent));
        console.log(`✅ WALLET SUCCESS: Loaded from Secret File: ${this.getPublicKey()}`);
        return;
      } catch (err: any) {
        console.warn(`⚠️ WALLET WARNING: Failed to load from file ${secretFilePath}: ${err.message}`);
      }
    } else if (secretFilePath) {
      console.log(`ℹ️ WALLET INFO: Secret file not found at ${secretFilePath}, checking Environment Variables...`);
    }

    if (privateKeyBase58) {
      try {
        this.keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
        console.log(`⚠️ WALLET NOTICE: Loaded from Environment Variable (LESS SECURE): ${this.getPublicKey()}`);
      } catch (err: any) {
        console.error(`❌ WALLET ERROR: Failed to decode Environment Variable key: ${err.message}`);
        this.generateNew();
      }
    } else {
      this.generateNew();
    }
  }

  private generateNew() {
    console.log('🔄 WALLET: Generating new keypair...');
    this.keypair = Keypair.generate();
    
    // Skip saving to .env in production-like environments or if explicitly disabled
    if (process.env.NODE_ENV !== 'production' && !process.env.NO_ENV_WRITE) {
      this.saveToEnv();
    } else {
      console.log('🔒 WALLET: New wallet generated but NOT saved (Production Mode)');
      console.log(`Public Key: ${this.getPublicKey()}`);
    }
  }

  getPublicKey() {
    return this.keypair.publicKey.toBase58();
  }

  /**
   * Hard-block the documented compromised wallet to prevent accidental use.
   */
  public checkSecurity() {
      const addr = this.getPublicKey();
      // Block the documented compromised wallet (handles potential base58 variations)
      if (addr.startsWith('FDA5XuGjjrc7uqXdfAvWum5S') || addr === 'FDA5XuGjjrc7uqXdfAvWum5ScQfJtUqjE5E512HGWVcc') {
          console.error('\n\n' + '!'.repeat(80));
          console.error('!!! SECURITY ALERT: YOU ARE ATTEMPTING TO USE A COMPROMISED WALLET !!!');
          console.error(`!!! Wallet ${addr} has been drained. !!!`);
          console.error('!!! The bot will REFUSE to start until you update your configuration. !!!');
          console.error('!'.repeat(80) + '\n\n');
          process.exit(1);
      }
  }

  getSecretKeyBase58() {
    return bs58.encode(this.keypair.secretKey);
  }

  getKeypair() {
      return this.keypair;
  }

  private saveToEnv() {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      let envContent = '';

      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }

      const newKey = this.getSecretKeyBase58();
      
      // Update existing or append new
      if (envContent.includes('BOT_PRIVATE_KEY=')) {
        envContent = envContent.replace(
          /BOT_PRIVATE_KEY=.*/,
          `BOT_PRIVATE_KEY="${newKey}"`
        );
      } else {
        envContent += `\nBOT_PRIVATE_KEY="${newKey}"\n`;
      }

      fs.writeFileSync(envPath, envContent);
      console.log(`New wallet generated: ${this.getPublicKey()}`);
      console.log('Secret key saved to .env file');
    } catch (err: any) {
      console.error(`Failed to save wallet to .env: ${err.message}`);
    }
  }
}
