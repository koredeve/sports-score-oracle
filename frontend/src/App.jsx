import React, { useEffect, useState } from 'react';
import {
  makeClient,
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  readGame,
  listGameIds,
  readOwner,
  writeAndWait,
} from './genlayer.js';
import WalletCard from './WalletCard.jsx';
import { truncateHash, winnerLabel, statusClass, explorerTxUrl } from './lib.js';

function TxToast({ label, hash, onClose }) {
  return (
    <div className="notice">
      <strong>{label}</strong>
      {hash && (
        <span className="txline">
          {' '}tx:{' '}
          <a href={explorerTxUrl(hash)} target="_blank" rel="noreferrer">
            {truncateHash(hash)}
          </a>
        </span>
      )}
      <button className="linkish" onClick={onClose}>dismiss</button>
    </div>
  );
}

function HowItWorks() {
  return (
    <details className="card how">
      <summary>How settlement works — why this needs GenLayer</summary>
      <ol>
        <li>
          <strong>Leader proposes.</strong> Anyone submits a scoreboard URL; the leader
          execution fetches the page live and proposes the final score.
        </li>
        <li>
          <strong>Validators verify independently.</strong> Other AI validators re-fetch the
          same source themselves and must see status FINAL with exactly identical scores —
          the leader's word alone is never trusted.
        </li>
        <li>
          <strong>Appeal window.</strong> A result enters GenLayer's Optimistic Democracy
          lifecycle: accepted, appealable, then finalized permanently on-chain.
        </li>
      </ol>
      <p className="hint">
        Deterministic chains cannot read live web pages or agree on their meaning — this is
        exactly what GenLayer's AI-validator consensus is for.
      </p>
    </details>
  );
}

export default function App() {
  const [client, setClient] = useState(() => makeClient(null));
  const [me, setMe] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tx, setTx] = useState(null);
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
          rows.push({ id, ...(await readGame(client, id)) });
        } catch {
          rows.push({ id, status: 'unavailable' });
        }
      }
      setGames(rows);
      if (me) {
        try {
          const owner = await readOwner(client);
          setIsOwner(String(owner).toLowerCase() === me.toLowerCase());
        } catch {
          setIsOwner(false);
        }
      } else {
        setIsOwner(false);
      }
    } catch (e) {
      setError('Failed to load games: ' + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [me]);

  async function createGame() {
    if (!newId.trim() || !newDesc.trim()) return;
    setBusy('create');
    setError('');
    try {
      const hash = await writeAndWait(client, 'create_game', [newId.trim(), newDesc.trim()]);
      setTx({ label: 'Game created on-chain.', hash });
      setNewId('');
      setNewDesc('');
      await refresh();
    } catch (e) {
      setError('Create failed: ' + (e?.message ?? String(e)));
    } finally {
      setBusy('');
    }
  }

  async function submitResult() {
    if (!resolveId.trim() || !resolveUrl.trim()) return;
    setBusy('resolve');
    setError('');
    setTx({
      label: 'Validators are fetching the scoreboard and comparing results…',
      hash: null,
    });
    try {
      const hash = await writeAndWait(client, 'submit_result', [
        resolveId.trim(),
        resolveUrl.trim(),
      ]);
      setTx({ label: 'Result settled by validator consensus.', hash });
      setResolveId('');
      setResolveUrl('');
      await refresh();
    } catch (e) {
      setError('Settle failed: ' + (e?.message ?? String(e)));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="wrap">
      <header>
        <div className="brand">
          <span className="logo">◉</span>
          <div>
            <h1>Sports Score Oracle</h1>
            <p className="sub">
              Final scores settled by AI-validator consensus — validators fetch the
              scoreboard live and must agree exactly before a result finalizes.
            </p>
          </div>
        </div>
        <p className="addr">
          Contract{' '}
          <a href={EXPLORER_URL} target="_blank" rel="noreferrer">
            {truncateHash(CONTRACT_ADDRESS, 10, 8)}
          </a>{' '}
          · StudioNet · gasless
        </p>
      </header>

      <HowItWorks />

      <section className="card">
        <h2>Wallet</h2>
        <WalletCard
          me={me}
          onUnlock={(pk, address) => {
            setClient(makeClient(pk));
            setMe(address);
          }}
          onLock={() => {
            setClient(makeClient(null));
            setMe(null);
          }}
        />
      </section>

      {isOwner && (
        <section className="card">
          <h2>Create game <span className="tag">owner</span></h2>
          <div className="row">
            <input placeholder="game id (e.g. lakers-celtics-4)" value={newId} onChange={(e) => setNewId(e.target.value)} />
            <input placeholder="description (e.g. Lakers vs Celtics, game 4)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <button onClick={createGame} disabled={busy === 'create'}>
              {busy === 'create' ? 'Creating…' : 'Create game'}
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Settle a game</h2>
        <p className="hint">
          Paste the game id and a scoreboard URL returning{' '}
          <code>{'{"status":"FINAL","home_score":n,"away_score":n}'}</code>. Validators
          re-fetch it independently — expect ~a minute for consensus.
        </p>
        <div className="row">
          <input placeholder="game id" value={resolveId} onChange={(e) => setResolveId(e.target.value)} />
          <input placeholder="https://…/scoreboard.json" value={resolveUrl} onChange={(e) => setResolveUrl(e.target.value)} />
          <button onClick={submitResult} disabled={busy === 'resolve'}>
            {busy === 'resolve' ? 'In consensus…' : 'Submit result'}
          </button>
        </div>
      </section>

      {tx && (
        <TxToast label={tx.label} hash={tx.hash} onClose={() => setTx(null)} />
      )}
      {error && <div className="error">{error}</div>}

      <section className="card">
        <h2>Games <span className="count">{games.length}</span></h2>
        {loading ? (
          <div className="skeleton" />
        ) : games.length === 0 ? (
          <p className="hint">No games registered yet — connect the owner key to create the first one.</p>
        ) : (
          <table>
            <thead>
              <tr><th>ID</th><th>Match</th><th>Status</th><th>Score</th><th>Result</th></tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td className="mono">{g.id}</td>
                  <td>{g.description || '—'}</td>
                  <td><span className={'pill ' + statusClass(g.status)}>{g.status}</span></td>
                  <td>{g.status === 'final' ? `${g.home_score} : ${g.away_score}` : '—'}</td>
                  <td>{g.status === 'final' ? winnerLabel(g.winner) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="ghost" onClick={refresh}>Refresh</button>
      </section>

      <footer>
        <a href="https://github.com/koredeve/sports-score-oracle" target="_blank" rel="noreferrer">source</a>
        {' · '}
        <a href={EXPLORER_URL} target="_blank" rel="noreferrer">contract on explorer</a>
        {' · built on GenLayer StudioNet — results are appealable before finalization'}
      </footer>
    </div>
  );
}
