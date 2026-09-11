import { useEffect, useState } from 'react'

export type Route = 'dashboard' | 'options'

function currentRoute(): Route {
  return window.location.hash === '#/options' ? 'options' : 'dashboard'
}

/** Two pages do not justify a router dependency. */
export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(currentRoute)

  useEffect(() => {
    const onChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return [route, (next) => { window.location.hash = next === 'options' ? '#/options' : '#/' }]
}
