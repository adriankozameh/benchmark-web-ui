import type { GladiatorHorizon, GladiatorWindow, UserLanguage } from '@benchmark/domain';
import { t } from '../language';
import { GLADIATOR_HORIZONS, GLADIATOR_WINDOWS, type GladiatorDisplay } from './gladiator';

export function GladiatorControls({ days, horizon, mode, language, onDays, onHorizon, onMode }: {
  days: GladiatorWindow; horizon: GladiatorHorizon; mode: GladiatorDisplay; language: UserLanguage;
  onDays: (days: GladiatorWindow) => void; onHorizon: (horizon: GladiatorHorizon) => void;
  onMode: (mode: GladiatorDisplay) => void;
}) {
  return <section className="gladiator-controls" aria-label={t('Gladiator Ring', language)}>
    <div className="gladiator-intro"><h3>{t('Gladiator Ring', language)}</h3>
      <p>{t('Compare model performance against past observations for this station.', language)}</p></div>
    <div className="gladiator-fields">
      <label className="field"><span>{t('Evaluation period', language)}</span>
        <select value={days} onChange={event => onDays(Number(event.target.value) as GladiatorWindow)}>
          {GLADIATOR_WINDOWS.map(value => <option key={value} value={value}>
            {t('Past {days} completed days', language).replace('{days}', String(value))}
          </option>)}
        </select></label>
      <label className="field"><span>{t('Forecast lead time', language)}</span>
        <select value={horizon} onChange={event => onHorizon(Number(event.target.value) as GladiatorHorizon)}>
          {GLADIATOR_HORIZONS.map(value => <option key={value} value={value}>
            {t('{hours} h ({days} {dayLabel})', language).replace('{hours}', String(value))
              .replace('{days}', String(value / 24)).replace('{dayLabel}', t(value === 24 ? 'day' : 'days', language))}
          </option>)}
        </select></label>
      <div className="gladiator-display" role="group" aria-label={t('Models shown per metric', language)}>
        <button type="button" aria-pressed={mode === 'all'} onClick={() => onMode('all')}>{t('All providers', language)}</button>
        <button type="button" aria-pressed={mode === 'top3'} onClick={() => onMode('top3')}>{t('Top 3', language)}</button>
      </div>
    </div>
    <p className="gladiator-help">{t('These filters rank the current forecast lines using past predictions. They do not change the forecast period above.', language)}</p>
  </section>;
}
