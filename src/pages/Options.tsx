import { useEffect, useState } from 'react'
import type { ColumnSetting, DigestRule, TimeFormat } from '../../shared/types.ts'
import { api, type Health } from '../api.ts'
import type { ConfigState } from '../hooks/useConfig.ts'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function newRule(): DigestRule {
  return {
    id: `digest_${Math.random().toString(36).slice(2, 10)}`,
    enabled: true,
    name: 'Morning commute',
    cardIds: [],
    days: [1, 2, 3, 4, 5],
    time: '06:00',
    windowMinutes: 30,
    format: 'clock',
  }
}

export function Options({ configState }: { configState: ConfigState }) {
  const { config, update, error } = configState
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [])

  if (!config) return <p className="banner">Loading…</p>

  const { display, digests, cards } = config

  const setDisplay = (patch: Partial<typeof display>) =>
    void update((current) => ({ ...current, display: { ...current.display, ...patch } }))

  const setRule = (id: string, patch: Partial<DigestRule>) =>
    void update((current) => ({
      ...current,
      digests: current.digests.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    }))

  return (
    <>
      {error && <p className="banner banner-error">{error}</p>}

      <section className="section">
        <h2>Display</h2>
        <p className="section-hint">Applies to every card.</p>

        <div className="setting">
          <div>
            <div className="setting-label">Departure times</div>
            <div className="setting-hint">
              Countdown shows minutes away; clock shows the literal departure time.
            </div>
          </div>
          <div className="choice-row">
            {(['countdown', 'clock'] as TimeFormat[]).map((value) => (
              <button
                key={value}
                type="button"
                className="choice"
                aria-pressed={display.timeFormat === value}
                onClick={() => setDisplay({ timeFormat: value })}
              >
                {value === 'countdown' ? 'Countdown' : 'Arrival time'}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <div>
            <div className="setting-label">Columns</div>
            <div className="setting-hint">
              Auto fits the window. A fixed count is an upper bound — narrow screens still
              drop to fewer columns.
            </div>
          </div>
          <div className="choice-row">
            {(['auto', '1', '2', '3', '4'] as ColumnSetting[]).map((value) => (
              <button
                key={value}
                type="button"
                className="choice"
                aria-pressed={display.columns === value}
                onClick={() => setDisplay({ columns: value })}
              >
                {value === 'auto' ? 'Auto' : value}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <div>
            <div className="setting-label">Departures per card</div>
          </div>
          <input
            type="number"
            min={1}
            max={6}
            value={display.departuresPerCard}
            aria-label="Departures per card"
            onChange={(e) => setDisplay({ departuresPerCard: Number(e.target.value) })}
          />
        </div>
      </section>

      <section className="section">
        <h2>Discord digests</h2>
        <p className="section-hint">
          Scheduled messages to your Discord channel. Each digest looks a set number of
          minutes ahead from the time it sends.
        </p>

        {health && !health.discordConfigured && (
          <p className="banner">
            No webhook configured. Set <code>DISCORD_WEBHOOK_URL</code> in the server
            environment to enable sending. You can still set rules up here.
          </p>
        )}

        {cards.length === 0 && (
          <p className="banner">Add a card on the dashboard first — digests report on cards.</p>
        )}

        {digests.map((rule) => (
          <div className="digest" key={rule.id}>
            <div className="digest-head">
              <input
                type="text"
                value={rule.name}
                aria-label="Digest name"
                onChange={(e) => setRule(rule.id, { name: e.target.value })}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => setRule(rule.id, { enabled: e.target.checked })}
                />
                Enabled
              </label>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() =>
                  void update((current) => ({
                    ...current,
                    digests: current.digests.filter((item) => item.id !== rule.id),
                  }))
                }
              >
                Delete
              </button>
            </div>

            <div className="field">
              <label id={`days-${rule.id}`}>Days</label>
              <div className="day-row" role="group" aria-labelledby={`days-${rule.id}`}>
                {DAY_LABELS.map((label, index) => (
                  <button
                    key={index}
                    type="button"
                    className="day"
                    aria-label={DAY_NAMES[index]}
                    aria-pressed={rule.days.includes(index)}
                    onClick={() =>
                      setRule(rule.id, {
                        days: rule.days.includes(index)
                          ? rule.days.filter((day) => day !== index)
                          : [...rule.days, index].sort(),
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor={`time-${rule.id}`}>Send at (Chicago time)</label>
              <input
                id={`time-${rule.id}`}
                type="time"
                value={rule.time}
                onChange={(e) => setRule(rule.id, { time: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor={`window-${rule.id}`}>Look ahead</label>
              <select
                id={`window-${rule.id}`}
                value={rule.windowMinutes}
                onChange={(e) => setRule(rule.id, { windowMinutes: Number(e.target.value) })}
              >
                {[15, 20, 30, 45, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>next {minutes} minutes</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label id={`format-${rule.id}`}>Time format</label>
              <div className="choice-row" role="group" aria-labelledby={`format-${rule.id}`}>
                {(['clock', 'countdown'] as TimeFormat[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="choice"
                    aria-pressed={rule.format === value}
                    onClick={() => setRule(rule.id, { format: value })}
                  >
                    {value === 'clock' ? 'Arrival time' : 'Countdown'}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label id={`cards-${rule.id}`}>Cards</label>
              <div className="checks" role="group" aria-labelledby={`cards-${rule.id}`}>
                {cards.map((card) => (
                  <label className="check" key={card.id}>
                    <input
                      type="checkbox"
                      checked={rule.cardIds.includes(card.id)}
                      onChange={(e) =>
                        setRule(rule.id, {
                          cardIds: e.target.checked
                            ? [...rule.cardIds, card.id]
                            : rule.cardIds.filter((id) => id !== card.id),
                        })
                      }
                    />
                    {card.title} — {card.stationName}
                    {card.direction ? ` · ${card.direction}` : ' · Both directions'}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          className="btn"
          onClick={() =>
            void update((current) => ({ ...current, digests: [...current.digests, newRule()] }))
          }
        >
          Add a digest
        </button>
      </section>

      <section className="section">
        <h2>Server</h2>
        <p className="section-hint">Read-only. These come from the server environment.</p>
        <div className="setting">
          <div className="setting-label">Data source</div>
          <div className="setting-hint">
            {health?.mock ? 'Mock fixtures (CTA_MOCK is on)' : 'Live CTA API'}
          </div>
        </div>
        <div className="setting">
          <div className="setting-label">Discord webhook</div>
          <div className="setting-hint">
            {health?.discordConfigured ? 'Configured' : 'Not configured'}
          </div>
        </div>
        <div className="setting">
          <div className="setting-label">Station list</div>
          <div className="setting-hint">
            {health
              ? health.stations.source === 'portal'
                ? `${health.stations.count} stations from the city data portal`
                : `${health.stations.count} stations from the built-in seed`
              : 'Unknown'}
          </div>
        </div>
      </section>
    </>
  )
}
