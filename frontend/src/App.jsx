import React, { useEffect, useState } from 'react';
import {
  makeClient,
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  readGame,
  listGameIds,
  readOwner,
  listApprovedSources,
  writeAndWait,
} from './genlayer.js';
import WalletCard from './WalletCard.jsx';
import { truncateHash, winnerLabel, statusClass, explorerTxUrl } from './lib.js';

function TxToast({ label, hash, onClose }) {
  return (
    <div className="notice">
      <div className="notice-header">
        <strong>{label}</strong>
        <button className="linkish" onClick={onClose}>✕</button>
      </div>
      {hash && (
        <div className="txline" style={{ marginTop: 4 }}>
          Transaction Hash:{' '}
          <a href={explorerTxUrl(hash)} target="_blank" rel="noreferrer">
            {truncateHash(hash, 12, 10)}
          </a>
        </div>
      )}
    </div>
  );
}

function HowItWorks() {
  return (
    <details className="card how">
      <summary>How AI settlement works — why this needs GenLayer</summary>
      <ol>
        <li>
          <strong>Source Whitelisting & Binding:</strong> Every game is permanently bound at registration to an owner-approved HTTPS scoreboard source URL. Callers cannot supply fabricated JSON endpoints.
        </li>
        <li>
          <strong>Independent Validator Consensus:</strong> When settlement is triggered, independent AI validators fetch the live scoreboard page, verify status <code>FINAL</code> and game ID match, and must agree on the <em>exact integer score</em>.
        </li>
        <li>
          <strong>Optimistic Democracy Settlement:</strong> Results finalize on-chain through GenLayer consensus with zero single-source dependency.
        </li>
      </ol>
      <p className="hint">
        Deterministic smart contracts cannot securely read live web pages or understand unstructured web changes — GenLayer solves this natively with non-deterministic web fetching and equivalence validation.
      </p>
    </details>
  );
}

export default function App() {
  const [client, setClient] = useState(() => makeClient(null));
  const [me, setMe] = useState(null);
  const [games, setGames] = useState([]);
  const [approvedSources, setApprovedSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tx, setTx] = useState(null);
  const [isOwner, setIsOwner] = useState(false);

  // Form states
  const [newId, setNewId] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newPrefix, setNewPrefix] = useState('');
  const [newPrefixName, setNewPrefixName] = useState('');
  const [resolveId, setResolveId] = useState('');

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

      try {
        const sources = await listApprovedSources(client);
        setApprovedSources(sources);
      } catch {
        setApprovedSources([]);
      }

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

  async function approveSource() {
    if (!newPrefix.trim() || !newPrefixName.trim()) return;
    setBusy('approve_source');
    setError('');
    try {
      const hash = await writeAndWait(client, 'approve_source', [
        newPrefix.trim(),
        newPrefixName.trim(),
      ]);
      setTx({ label: 'Scoreboard source whitelisted successfully.', hash });
      setNewPrefix('');
      setNewPrefixName('');
      await refresh();
    } catch (e) {
      setError('Approve source failed: ' + (e?.message ?? String(e)));
    } finally {
      setBusy('');
    }
  }

  async function createGame() {
    if (!newId.trim() || !newDesc.trim() || !newSource.trim()) return;
    setBusy('create');
    setError('');
    try {
      const hash = await writeAndWait(client, 'create_game', [
        newId.trim(),
        newDesc.trim(),
        newSource.trim(),
      ]);
      setTx({ label: 'Game registered and permanently bound on-chain.', hash });
      setNewId('');
      setNewDesc('');
      setNewSource('');
      await refresh();
    } catch (e) {
      setError('Create failed: ' + (e?.message ?? String(e)));
    } finally {
      setBusy('');
    }
  }

  async function submitResult(targetId) {
    const gameToSettle = targetId || resolveId.trim();
    if (!gameToSettle) return;
    setBusy('resolve_' + gameToSettle);
    setError('');
    setTx({
      label: `Validators are fetching the scoreboard for "${gameToSettle}" and verifying scores…`,
      hash: null,
    });
    try {
      const hash = await writeAndWait(client, 'submit_result', [gameToSettle]);
      setTx({ label: `Result for "${gameToSettle}" settled by validator consensus!`, hash });
      setResolveId('');
      await refresh();
    } catch (e) {
      setError('Settlement failed: ' + (e?.message ?? String(e)));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="wrap">
      <header>
        <div className="brand">
          <span className="logo">⚽</span>
          <div>
            <h1>Sports Score Oracle</h1>
            <p className="sub">
              Decentralized sports oracle powered by GenLayer AI-validator consensus.
              Games permanently bind authoritative scoreboards; validators verify and agree on exact final scores.
            </p>
          </div>
        </div>
        <p className="addr">
          Contract:{' '}
          <a href={EXPLORER_URL} target="_blank" rel="noreferrer">
            {truncateHash(CONTRACT_ADDRESS, 10, 8)}
          </a>{' '}
          · StudioNet (Gasless)
        </p>
      </header>

      <HowItWorks />

      <section className="card">
        <h2>Wallet Connection</h2>
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
        <section className="card admin-card">
          <h2>Platform Admin Controls <span className="tag">Owner</span></h2>
          
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>1. Whitelist Scoreboard Source</h3>
            <p className="hint">Approve an HTTPS domain prefix for trusted scoreboard data feeds.</p>
            <div className="row">
              <input
                placeholder="Prefix URL (e.g. https://api.sportsdata.io/)"
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value)}
              />
              <input
                placeholder="Provider Name (e.g. SportsDataIO)"
                value={newPrefixName}
                onChange={(e) => setNewPrefixName(e.target.value)}
              />
              <button
                onClick={approveSource}
                disabled={busy === 'approve_source' || !newPrefix.trim() || !newPrefixName.trim()}
              >
                {busy === 'approve_source' ? 'Approving…' : 'Approve Source'}
              </button>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>2. Register New Game</h3>
            <p className="hint">
              Register a match. The scoreboard URL must start with an approved prefix and is permanently bound to this game.
            </p>
            <div className="row">
              <input
                placeholder="Game ID (e.g. ucl-final-2026)"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
              <input
                placeholder="Match Description (e.g. Real Madrid vs Man City)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <input
                style={{ flex: 2 }}
                placeholder="https://approved-source.example/game-123.json"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
              />
              <button
                onClick={createGame}
                disabled={busy === 'create' || !newId.trim() || !newDesc.trim() || !newSource.trim()}
              >
                {busy === 'create' ? 'Creating…' : 'Register Game'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Trigger Match Settlement</h2>
        <p className="hint">
          Anyone can trigger consensus once a match finishes. Validators independently fetch the bound scoreboard and verify scores.
        </p>
        <div className="row">
          <input
            placeholder="Enter Game ID to settle"
            value={resolveId}
            onChange={(e) => setResolveId(e.target.value)}
          />
          <button
            onClick={() => submitResult(resolveId)}
            disabled={Boolean(busy) || !resolveId.trim()}
          >
            {busy.startsWith('resolve_') ? 'Settling in Consensus…' : 'Trigger Settlement'}
          </button>
        </div>
      </section>

      {tx && (
        <TxToast label={tx.label} hash={tx.hash} onClose={() => setTx(null)} />
      )}
      {error && <div className="error">{error}</div>}

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Registered Games <span className="count">({games.length})</span></h2>
          <button className="ghost" style={{ marginTop: 0, padding: '4px 10px', fontSize: 12 }} onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="skeleton" />
        ) : games.length === 0 ? (
          <p className="hint">No games registered yet on this contract deployment.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Match</th>
                <th>Status</th>
                <th>Score</th>
                <th>Winner</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td className="mono">{g.id}</td>
                  <td>
                    <strong>{g.description || '—'}</strong>
                    {g.source_url && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        Source: {g.source_url}
                      </div>
                    )}
                  </td>
                  <td><span className={'pill ' + statusClass(g.status)}>{g.status}</span></td>
                  <td style={{ fontWeight: g.status === 'final' ? 700 : 400 }}>
                    {g.status === 'final' ? `${g.home_score} : ${g.away_score}` : '—'}
                  </td>
                  <td>{g.status === 'final' ? winnerLabel(g.winner) : '—'}</td>
                  <td>
                    {g.status === 'upcoming' ? (
                      <button
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => submitResult(g.id)}
                        disabled={Boolean(busy)}
                      >
                        {busy === 'resolve_' + g.id ? 'Settling…' : '⚡ Settle'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--ok)' }}>✓ Finalized</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {approvedSources.length > 0 && (
        <section className="card">
          <h2>Approved Scoreboard Domains <span className="count">({approvedSources.length})</span></h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--muted)' }}>
            {approvedSources.map((prefix, idx) => (
              <li key={idx} className="mono" style={{ margin: '4px 0' }}>{prefix}</li>
            ))}
          </ul>
        </section>
      )}

      <footer>
        <p>Built on GenLayer StudioNet · Non-Deterministic AI Consensus</p>
      </footer>
    </div>
  );
}
