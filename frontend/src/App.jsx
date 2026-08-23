import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { makeClient, CONTRACT_ADDRESS, readGame, listGameIds } from './genlayer.js';
import './styles.css';

export default function App() {
  const [client, setClient] = useState(() => makeClient(null));
  const [hasAccount, setHasAccount] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isOwner, setIsOwner] = useState(false);

  const [newId, setNewId] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [resolveId, setResolveId] = useState('');
  const [resolveUrl, setResolveUrl] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const ids = await listGameIds(client);
      const rows = [];
      for (const id of ids) {
        try {
          const g = await readGame(client, id);
          rows.push({ id, ...g });
        } catch {
          rows.push({ id, status: 'error' });
        }
      }
      setGames(rows);
      try {
        const owner = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'owner',
          args: [],
        });
        const me = client.account ? client.account.address : null;
        setIsOwner(!!me && String(owner).toLowerCase() === String(me).toLowerCase());
      } catch {
        setIsOwner(false);
      }
    } catch (e) {
      setError('Failed to load games: ' + (e && e.message ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function connect() {
    try {
      const c = makeClient(keyInput.trim());
      setClient(c);
      setHasAccount(true);
      setNotice('Wallet connected. Owner and write actions unlocked if you are the deployer.');
      refresh();
    } catch (e) {
      setError('Invalid private key: ' + (e && e.message ? e.message : String(e)));
    }
  }

  function disconnect() {
    const c = makeClient(null);
    setClient(c);
    setHasAccount(false);
    setNotice('Read-only mode.');
  }

  async function createGame() {
    if (!newId.trim() || !newDesc.trim()) return;
    setBusy('create');
    setError('');
    try {
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'create_game',
        args: [newId.trim(), newDesc.trim()],
      });
      await client.waitForTransactionReceipt({ hash, retries: 100 });
      setNewId('');
      setNewDesc('');
      setNotice('Game created on-chain.');
      await refresh();
    } catch (e) {
      setError('Create failed: ' + (e && e.message ? e.message : String(e)));
    } finally {
      setBusy('');
    }
  }

  async function submitResult() {
    if (!resolveId.trim() || !resolveUrl.trim()) return;
    setBusy('resolve');
    setError('');
    setNotice('Submitting to AI-validator consensus — validators fetch the scoreboard live. This can take a minute...');
    try {
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'submit_result',
        args: [resolveId.trim(), resolveUrl.trim()],
      });
      await client.waitForTransactionReceipt({ hash, retries: 300 });
      setResolveId('');
      setResolveUrl('');
      setNotice('Result settled on-chain.');
      await refresh();
    } catch (e) {
      setError('Settle failed: ' + (e && e.message ? e.message : String(e)));
    } finally {
      setBusy('');
    }
  }

  function winnerBadge(w) {
    if (w === 'home') return 'Home win';
    if (w === 'away') return 'Away win';
    if (w === 'draw') return 'Draw';
    return '—';
  }

  return (
    <div className="wrap">
      <header>
        <h1>Sports Score Oracle</h1>
        <p className="sub">
          Final scores settled by GenLayer AI-validator consensus — validators fetch the
          scoreboard live and must agree exactly before a result finalizes.
        </p>
        <p className="addr">Contract: {CONTRACT_ADDRESS}</p>
      </header>

      <section className="card">
        <h2>Wallet</h2>
        {hasAccount ? (
          <div className="row">
            <span className="pill ok">Connected</span>
            <button className="ghost" onClick={disconnect}>Disconnect</button>
          </div>
        ) : (
          <div className="row">
            <input
              type="password"
              placeholder="Private key (0x…) — kept in memory only"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button onClick={connect} disabled={!keyInput.trim()}>Connect</button>
            <span className="pill">Read-only mode</span>
          </div>
        )}
      </section>

      {isOwner && (
        <section className="card">
          <h2>Create game (owner)</h2>
          <div className="row">
            <input placeholder="game id (e.g. lakers-lakers2)" value={newId} onChange={(e) => setNewId(e.target.value)} />
            <input placeholder="description (e.g. Lakers vs Celtics)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <button onClick={createGame} disabled={busy === 'create'}>
              {busy === 'create' ? 'Creating…' : 'Create'}
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Settle a game</h2>
        <p className="hint">Paste the game id and a scoreboard URL returning JSON: {'{"status":"FINAL","home_score":n,"away_score":n}'}</p>
        <div className="row">
          <input placeholder="game id" value={resolveId} onChange={(e) => setResolveId(e.target.value)} />
          <input placeholder="https://…/scoreboard.json" value={resolveUrl} onChange={(e) => setResolveUrl(e.target.value)} />
          <button onClick={submitResult} disabled={busy === 'resolve'}>
            {busy === 'resolve' ? 'Validators working…' : 'Submit result'}
          </button>
        </div>
      </section>

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error">{error}</div>}

      <section className="card">
        <h2>Games</h2>
        {loading ? (
          <p>Loading…</p>
        ) : games.length === 0 ? (
          <p>No games yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Description</th><th>Status</th><th>Score</th><th>Winner</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td>{g.id}</td>
                  <td>{g.description || '—'}</td>
                  <td>
                    <span className={'pill ' + (g.status === 'final' ? 'ok' : '')}>{g.status || 'error'}</span>
                  </td>
                  <td>{g.status === 'final' ? `${g.home_score} : ${g.away_score}` : '—'}</td>
                  <td>{g.status === 'final' ? winnerBadge(g.winner) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="ghost" onClick={refresh}>Refresh</button>
      </section>

      <footer>
        Built on GenLayer StudioNet · gasless · results are appealable before finalization
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
