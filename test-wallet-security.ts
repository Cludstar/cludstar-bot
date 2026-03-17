import { WalletService } from './src/services/wallet.service';
import fs from 'fs';
import path from 'path';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';

async function testSecurity() {
    console.log('--- Testing WalletService Security ---');

    const mockSecretPath = path.resolve(process.cwd(), 'mock_secret.txt');
    const testKeypair = Keypair.generate();
    const testSecretBase58 = bs58.encode(testKeypair.secretKey);
    
    // 1. Test File Priority
    fs.writeFileSync(mockSecretPath, testSecretBase58);
    console.log('Created mock secret file.');

    const walletSvc = new WalletService('ANOTHER_KEY_BASE58_THAT_SHOULD_BE_IGNORED', mockSecretPath);
    if (walletSvc.getPublicKey() === testKeypair.publicKey.toBase58()) {
        console.log('✅ PASS: Secret file took priority over env string.');
    } else {
        console.log('❌ FAIL: Secret file was ignored or incorrect key loaded.');
    }

    // 2. Test Production Mode (.env protection)
    console.log('\nTesting Production Mode protection...');
    process.env.NODE_ENV = 'production';
    
    // Create a new wallet service without a key (should generate one but NOT save to .env)
    const productionWallet = new WalletService();
    const envPath = path.resolve(process.cwd(), '.env');
    const envContentBefore = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    if (!envContentBefore.includes(productionWallet.getSecretKeyBase58())) {
        console.log('✅ PASS: New wallet was NOT saved to .env in production mode.');
    } else {
        console.log('❌ FAIL: New wallet WAS saved to .env in production mode!');
    }

    // Cleanup
    if (fs.existsSync(mockSecretPath)) fs.unlinkSync(mockSecretPath);
    console.log('\n--- Security Tests Complete ---');
}

testSecurity().catch(console.error);
