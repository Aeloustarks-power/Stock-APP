import React from 'react';
import { BarChart3, ShieldAlert, Lock } from 'lucide-react';

/**
 * Password gate only. App.jsx still owns the password value and unlock logic.
 * This file is just the screen: what it looks like and which events it reports.
 */
export default function LockScreen({
  checking,
  password,
  error,
  busy,
  onPasswordChange,
  onSubmit,
}) {
  return (
    <div className="lock-screen">
      <form className="lock-card" onSubmit={onSubmit}>
        <div className="lock-brand">
          <BarChart3 size={26} color="#1c1917" />
          <h1>US Stock Sentinel</h1>
        </div>
        {checking ? (
          <p className="empty">Checking access…</p>
        ) : (
          <>
            <p className="lock-copy">Enter the site password to view and edit portfolios.</p>
            <label htmlFor="site-password">Password</label>
            <input
              id="site-password"
              className="lock-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              autoFocus
            />
            {error && (
              <div className="banner" role="alert">
                <ShieldAlert size={16} />
                <span>{error}</span>
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy || !password}>
              <Lock size={14} />
              {busy ? 'Checking…' : 'Unlock'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
