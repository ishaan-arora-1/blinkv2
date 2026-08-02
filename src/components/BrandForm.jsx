import React from 'react'

const CATEGORIES = ['productivity', 'fitness', 'finance', 'health', 'social', 'education', 'photo & video', 'utilities', 'lifestyle', 'games']

export default function BrandForm({ brand, onChange }) {
  const set = (k) => (e) => onChange({ [k]: e.target.value })
  return (
    <div>
      <div className="grid cols-2">
        <div className="field">
          <label>App name</label>
          <input className="input" value={brand.appName} onChange={set('appName')} placeholder="e.g. Sunrise" />
        </div>
        <div className="field">
          <label>Category</label>
          <select className="input" value={brand.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>One-line pitch</label>
        <input className="input" value={brand.tagline} onChange={set('tagline')} placeholder="e.g. The alarm clock that gets you out of bed" />
      </div>
      <div className="grid cols-2">
        <div className="field">
          <label>What does your user do with it? (a verb phrase)</label>
          <input className="input" value={brand.verb} onChange={set('verb')} placeholder="e.g. wake up early / track macros / save money" />
        </div>
        <div className="field">
          <label>Accent color</label>
          <div className="row">
            <input type="color" value={brand.accent} onChange={set('accent')} />
            <span className="mono small muted">{brand.accent}</span>
          </div>
        </div>
      </div>
      <div className="field">
        <label>Voice / tone</label>
        <div className="seg">
          {['bold', 'friendly', 'expert'].map((t) => (
            <button key={t} className={brand.tone === t ? 'on' : ''} onClick={() => onChange({ tone: t })}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
