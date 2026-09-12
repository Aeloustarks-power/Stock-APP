import React, { useState } from 'react';
import { BarChart3, ShieldAlert, Lock, Eye, EyeOff } from 'lucide-react';
import LangToggle from './LangToggle.jsx';
import { t } from '../i18n.js';

/**
 * Password gate only. App.jsx still owns the password value and unlock logic.
 * Show/hide is local UI state — default stays masked.
 */
export default function LockScreen({
  lang,
  onLangChange,
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
          <h1>{t(lang, 'brand')}</h1>
          <LangToggle lang={lang} onChange={onLangChange} />
        </div>
        {checking ? (
          <p className="empty">{t(lang, 'checkingAccess')}</p>
        ) : (
          <>
            <p className="lock-copy">{t(lang, 'lockCopy')}</p>
            <label htmlFor="site-password">{t(lang, 'password')}</label>
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
                aria-label={showPassword ? t(lang, 'hidePassword') : t(lang, 'showPassword')}
                title={showPassword ? t(lang, 'hidePassword') : t(lang, 'showPassword')}
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
              {busy ? t(lang, 'checking') : t(lang, 'unlock')}
            </button>
            {onRetry ? (
              <button type="button" className="btn" onClick={onRetry} disabled={busy}>
                {t(lang, 'retryConnection')}
              </button>
            ) : null}
          </>
        )}
      </form>
    </div>
  );
}
