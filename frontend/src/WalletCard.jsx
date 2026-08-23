import React, { useRef, useState } from 'react';
import { generatePrivateKey, createAccount } from 'genlayer-js';
import {
  encryptToKeystore,
  decryptKeystore,
  normalizePrivateKey,
  downloadKeystore,
} from './wallet.js';
import { truncateHash } from './lib.js';

export default function WalletCard({ onUnlock, onLock, me }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'import' | 'advanced'
  const [password, setPassword] = useState('');
  const [rawKey, setRawKey] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  function unlockWith(privateKey) {
    const account = createAccount(privateKey);
    onUnlock(privateKey, account.address);
    setMode(null);
    setPassword('');
    setRawKey('');
    setFile(null);
    setErr('');
  }

  async function create() {
    setBusy(true);
    setErr('');
    try {
      const pk = normalizePrivateKey(generatePrivateKey());
      const ks = await encryptToKeystore(pk, password);
      unlockWith(pk);
      downloadKeystore(ks, 'wallet');
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importFile() {
    setBusy(true);
    setErr('');
    try {
      const text = await file.text();
      const pk = await decryptKeystore(JSON.parse(text), password);
      unlockWith(normalizePrivateKey(pk));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (me) {
    return (
      <div className="row">
        <span className="pill ok">◉ {truncateHash(me, 8, 6)}</span>
        <button className="ghost" onClick={onLock}>Lock</button>
      </div>
    );
  }

  return (
    <div>
      {!mode && (
        <div className="row">
          <button onClick={() => setMode('create')}>Create wallet</button>
          <button className="ghost2" onClick={() => setMode('import')}>Import keystore</button>
          <button className="ghost" onClick={() => setMode('advanced')}>Advanced</button>
          <span className="pill">read-only mode works without a wallet</span>
        </div>
      )}

      {mode === 'create' && (
        <div className="walletbox">
          <p className="hint">
            A new GenLayer account is generated <em>in your browser</em> and encrypted
            with your password (AES-GCM, PBKDF2 310k). Download the keystore file as
            your backup — we never see the key and it is never stored.
          </p>
          <div className="row">
            <input
              type="password"
              placeholder="Choose a password (encrypts your keystore)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={create} disabled={password.length < 8 || busy}>
              {busy ? 'Generating…' : 'Generate & download backup'}
            </button>
            <button className="ghost" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'import' && (
        <div className="walletbox">
          <p className="hint">Import a <code>gl-keystore</code> JSON file you downloaded from any GenLayer dApp.</p>
          <div className="row">
            <input type="file" accept="application/json" ref={fileRef}
              onChange={(e) => setFile(e.target.files[0] ?? null)} />
            <input
              type="password"
              placeholder="Keystore password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={importFile} disabled={!file || !password || busy}>
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
            <button className="ghost" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'advanced' && (
        <div className="walletbox">
          <p className="hint">Advanced: paste a raw private key. It stays in memory for this tab only.</p>
          <div className="row">
            <input
              type="password"
              placeholder="Private key (0x…)"
              value={rawKey}
              onChange={(e) => setRawKey(e.target.value)}
            />
            <button onClick={() => { try { unlockWith(normalizePrivateKey(rawKey)); } catch (e) { setErr(e?.message ?? String(e)); } }}
              disabled={!rawKey.trim()}>
              Connect
            </button>
            <button className="ghost" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}

      {err && <div className="error">{err}</div>}
    </div>
  );
}
