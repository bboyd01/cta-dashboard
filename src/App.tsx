import { useHashRoute } from './hooks/useHashRoute.ts'
import { useConfig } from './hooks/useConfig.ts'
import { Dashboard } from './pages/Dashboard.tsx'
import { Options } from './pages/Options.tsx'

export function App() {
  const [route, navigate] = useHashRoute()
  // Held here so both pages share one copy and a change on either is reflected.
  const configState = useConfig()

  return (
    <div className="page">
      <header className="header">
        <h1>CTA Dashboard</h1>
        {route === 'options' ? (
          <div className="header-actions">
            <button type="button" className="btn" onClick={() => navigate('dashboard')}>
              Back to dashboard
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Options"
            onClick={() => navigate('options')}
          >
            ⚙
          </button>
        )}
      </header>

      {route === 'options'
        ? <Options configState={configState} />
        : <Dashboard configState={configState} />}
    </div>
  )
}
