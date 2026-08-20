import React, { useState } from 'react';
import { BarChart3, ShieldAlert, Lock, Eye, EyeOff } from 'lucide-react';

/**
 * Password gate only. App.jsx still owns the password value and unlock logic.
 * Show/hide is local UI state — default stays masked.
 */
export default function LockScreen({
  checking,
  password,
  error,
  busy,
  onPasswordChange,
  onSubmit,
  onRetry,
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="lock-screen">
      <form className="lock-card" onSubmit={onSubmit}>
        <div className="lock-brand">
          <BarChart3 size={26} color="#1c1917" />
          <h1>US Stock Sentinel</h1>
        </div>
        {checking ? (
          <p className="empty">
            Checking access… If the API has been idle, Render may take 30–60 seconds to wake.
          </p>
        ) : (
          <>
            <p className="lock-copy">Enter the site password to view and edit portfolios.</p>
            <label htmlFor="site-password">Password</label>
            <div className="lock-input-wrap">
              <input
                id="site-password"
                className="lock-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="lock-toggle"
                onClick={() => setShowPassword((open) => !open)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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
            {onRetry ? (
              <button type="button" className="btn" onClick={onRetry} disabled={busy}>
                Retry connection
              </button>
            ) : null}
          </>
        )}
      </form>
    </div>
  );
}
