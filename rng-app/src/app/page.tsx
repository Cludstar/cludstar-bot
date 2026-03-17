'use client';

import { useState, useEffect } from 'react';
import { Connection, Transaction, PublicKey } from '@solana/web3.js';
import { Loader2, Sparkles, Wallet, Zap, ShieldCheck, Dice5 } from 'lucide-react';

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [randomNumber, setRandomNumber] = useState<number | null>(null);
  const [isGated, setIsGated] = useState(true);

  // Check if Phantom is installed
  const getProvider = () => {
    if (typeof window !== 'undefined' && 'solana' in window) {
      return (window as any).solana;
    }
    return null;
  };

  const connectWallet = async () => {
    const provider = getProvider();
    if (provider) {
      try {
        const response = await provider.connect();
        setWalletAddress(response.publicKey.toString());
      } catch (err) {
        console.error("Connection failed", err);
      }
    } else {
      window.open("https://phantom.app/", "_blank");
    }
  };

  const generateNumber = async () => {
    if (!walletAddress) {
      connectWallet();
      return;
    }

    setLoading(true);
    setStatus('Generating invoice...');
    setRandomNumber(null);

    try {
      // 1. Get Transaction from Backend
      const invResp = await fetch('/api/payment/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userWallet: walletAddress })
      });
      
      const { transaction: serializedTx, paymentParams, error: invError } = await invResp.json();
      if (invError) throw new Error(invError);

      // 2. Sign and Send Transaction
      setStatus('Waiting for signature...');
      const provider = getProvider();
      const transaction = Transaction.from(Buffer.from(serializedTx, 'base64'));
      
      const { signature } = await provider.signAndSendTransaction(transaction);
      
      setStatus('Confirming transaction...');
      const connection = new Connection(process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com');
      await connection.confirmTransaction(signature, 'confirmed');

      // 3. Verify Payment
      setStatus('Verifying proof...');
      const verifyResp = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentParams })
      });

      const { success, result, error: verError } = await verifyResp.json();
      if (!success) throw new Error(verError || 'Verification failed');

      setRandomNumber(result);
      setStatus('Success!');
      setIsGated(false);
      
      // Reset gate after 10 seconds for fun
      setTimeout(() => setIsGated(true), 10000);

    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message || 'Something went wrong'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 blur-[120px] rounded-full" />
      
      <div className="z-10 w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-medium tracking-wider uppercase mb-2">
            <ShieldCheck size={14} />
            Solana Payment Gated
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-br from-white via-white to-emerald-400 bg-clip-text text-transparent">
            CludRNG
          </h1>
          <p className="text-zinc-400 text-lg font-light">
            Secure agent-verified random generation.
          </p>
        </header>

        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-emerald-500/0 rounded-3xl blur opacity-0 group-hover:opacity-100 transition duration-1000" />
          
          <div className="relative space-y-8 text-center">
            {randomNumber !== null ? (
              <div className="py-8 animate-in zoom-in duration-500">
                <div className="text-2xl text-emerald-400 font-medium mb-2 uppercase tracking-widest">Result</div>
                <div className="text-8xl font-black text-white tabular-nums drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  {randomNumber}
                </div>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="w-24 h-24 bg-zinc-800/50 rounded-2xl flex items-center justify-center border border-zinc-700/50">
                  <Dice5 className="text-zinc-600" size={48} />
                </div>
                <div className="text-zinc-500 text-sm italic">Verification required to unlock</div>
              </div>
            )}

            <div className="space-y-4">
              {!walletAddress ? (
                <button
                  onClick={connectWallet}
                  className="w-full py-4 px-6 bg-white text-black hover:bg-zinc-200 font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <Wallet size={20} />
                  Connect Wallet
                </button>
              ) : (
                <button
                  onClick={generateNumber}
                  disabled={loading}
                  className="w-full py-4 px-6 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:cursor-not-allowed font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 text-black shadow-lg shadow-emerald-500/20"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <Zap size={20} fill="currentColor" />
                  )}
                  {loading ? 'Processing...' : 'Generate (0.00 SOL)'}
                </button>
              )}
              
              <div className="text-xs text-zinc-500 font-medium tracking-wide">
                {status || (walletAddress ? `Wallet: ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}` : 'Phantom wallet recommended')}
              </div>
            </div>
          </div>
        </div>

        <footer className="grid grid-cols-2 gap-4">
          {[
            { label: 'Secure', icon: ShieldCheck, color: 'text-emerald-400' },
            { label: 'Agent Verified', icon: Sparkles, color: 'text-emerald-400' }
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-3 bg-zinc-900/30 border border-zinc-800 rounded-2xl text-xs text-zinc-400">
              <item.icon size={14} className={item.color} />
              {item.label}
            </div>
          ))}
        </footer>
      </div>
    </main>
  );
}
