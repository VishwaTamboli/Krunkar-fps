// SQLite storage on the host only (data/game.sqlite). Built on node:sqlite,
// so no native database dependency is needed. Only this backend opens the
// file; it is never served to clients. Scores are written server-side only —
// player_stats rows are created by match code, never from client claims.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS sessions(
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS matches(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      ended_at TEXT,
      winner_user_id INTEGER REFERENCES users(id),
      win_reason TEXT
    );
    CREATE TABLE IF NOT EXISTS player_stats(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      kills INTEGER NOT NULL DEFAULT 0,
      deaths INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      UNIQUE(match_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_stats_user ON player_stats(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

  const q = {
    insertUser: db.prepare('INSERT INTO users (username, pass_hash) VALUES (?, ?)'),
    findUser: db.prepare('SELECT id, username, pass_hash FROM users WHERE username = ? COLLATE NOCASE'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)'),
    findSession: db.prepare(
      'SELECT s.token, s.user_id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    insertMatch: db.prepare('INSERT INTO matches (started_at) VALUES (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'))'),
    endMatch: db.prepare('UPDATE matches SET ended_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ? AND ended_at IS NULL'),
    insertStat: db.prepare(
      'INSERT INTO player_stats (match_id, user_id, kills, deaths, score) VALUES (?, ?, ?, ?, ?)'
    ),
    setWinner: db.prepare('UPDATE matches SET winner_user_id = ?, win_reason = ? WHERE id = ?'),
    history: db.prepare(`
      SELECT m.id AS matchId, m.started_at AS startedAt, m.ended_at AS endedAt,
             m.winner_user_id AS winnerUserId, m.win_reason AS winReason,
             s.kills, s.deaths, s.score
      FROM player_stats s JOIN matches m ON m.id = s.match_id
      WHERE s.user_id = ? ORDER BY m.id DESC LIMIT ?
    `),
  };

  return {
    createUser(username, hash) {
      try {
        const r = q.insertUser.run(username, hash);
        return { ok: true, id: Number(r.lastInsertRowid) };
      } catch (e) {
        if (String(e?.message ?? e).includes('UNIQUE')) return { ok: false, taken: true };
        throw e;
      }
    },
    findUser: (username) => q.findUser.get(username) ?? null,
    createSession: (token, userId) => void q.insertSession.run(token, userId),
    findSession: (token) => q.findSession.get(token) ?? null,
    deleteSession: (token) => void q.deleteSession.run(token),
    insertMatch: () => Number(q.insertMatch.run().lastInsertRowid),
    endMatch: (id) => void q.endMatch.run(id),
    // Server-computed results only. No client score input exists or is accepted.
    // node:sqlite has no transaction() helper: use explicit BEGIN/COMMIT.
    writeStats: (matchId, results) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const r of results) q.insertStat.run(matchId, r.userId, r.kills, r.deaths, r.score);
        db.exec('COMMIT');
      } catch (e) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw e;
      }
    },
    setWinner: (matchId, userId, reason) => void q.setWinner.run(userId, reason, matchId),
    // Own match history with win/loss derived from the stored winner (no new tables).
    getUserHistory: (userId, limit = 10) =>
      q.history.all(userId, Math.max(1, Math.min(25, limit))).map((r) => ({
        ...r,
        won: r.winnerUserId === userId,
      })),
    close: () => db.close(),
  };
}
