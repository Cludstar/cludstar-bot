import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';

export class WalletService {
  private keypair: Keypair;

  constructor(privateKeyBase58?: string) {
    if (privateKeyBase58) {
      this.keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
    } else {
      console.log('Generating new keypair...');
      this.keypair = Keypair.generate();
      this.saveToEnv();
    }
  }

  getPublicKey() {
    return this.keypair.publicKey.toBase58();
  }

  getSecretKeyBase58() {
    return bs58.encode(this.keypair.secretKey);
  }

  getKeypair() {
      return this.keypair;
  }

  private saveToEnv() {
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
  }
}
