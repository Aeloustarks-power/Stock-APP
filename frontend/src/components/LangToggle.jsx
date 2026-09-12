import React from 'react';

export default function LangToggle({ lang, onChange }) {
  return (
    <div className="lang-switch" role="group" aria-label="Language / 语言">
      <button
        type="button"
        className={lang === 'en' ? 'active' : ''}
        aria-pressed={lang === 'en'}
        onClick={() => onChange('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={lang === 'zh' ? 'active' : ''}
        aria-pressed={lang === 'zh'}
        onClick={() => onChange('zh')}
      >
        中文
      </button>
    </div>
  );
}
