import { useCallback, useEffect, useState } from 'react'
import type { Config } from '../../shared/types.ts'
import { api } from '../api.ts'

export type ConfigState = {
  config: Config | null
  error: string | null
  saving: boolean
  save: (next: Config) => Promise<void>
  update: (mutate: (config: Config) => Config) => Promise<void>
}

/**
 * Loads config once and saves optimistically: the UI applies the change
 * immediately and reverts only if the server rejects it, so toggling a display
 * option never feels like it lags behind the click.
 */
export function useConfig(): ConfigState {
  const [config, setConfig] = useState<Config | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load settings'),
      )
  }, [])

  const save = useCallback(
    async (next: Config) => {
      const previous = config
      setConfig(next)
      setSaving(true)
      try {
        setConfig(await api.saveConfig(next))
        setError(null)
      } catch (cause) {
        setConfig(previous)
        setError(cause instanceof Error ? cause.message : 'Could not save settings')
      } finally {
        setSaving(false)
      }
    },
    [config],
  )

  const update = useCallback(
    async (mutate: (config: Config) => Config) => {
      if (!config) return
      await save(mutate(structuredClone(config)))
    },
    [config, save],
  )

  return { config, error, saving, save, update }
}
