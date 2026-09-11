import { useEffect, useId, useRef, useState } from 'react'

type ComboboxProps<T> = {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
  disabled?: boolean
  placeholder?: string
  getDisplayLabel?: (value: T) => string
}

export function Combobox<T extends string | number>({
  value,
  onChange,
  options,
  disabled = false,
  placeholder,
  getDisplayLabel,
}: ComboboxProps<T>) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const displayLabel = getDisplayLabel?.(value) ?? options.find((o) => o.value === value)?.label ?? ''
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(filter.toLowerCase()),
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(e.target.value)
    setHighlighted(0)
    setOpen(true)
  }

  const handleSelect = (selected: T) => {
    onChange(selected)
    setFilter('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'Enter' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
      return
    }

    if (!open) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlighted((prev) => Math.min(prev + 1, filteredOptions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlighted((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredOptions[highlighted]) {
          handleSelect(filteredOptions[highlighted].value)
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setFilter('')
        break
      default:
        break
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setFilter('')
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  useEffect(() => {
    const highlighted_item = listRef.current?.querySelector('[data-highlighted="true"]')
    if (highlighted_item) {
      highlighted_item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlighted])

  return (
    <div ref={containerRef} className="combobox-wrapper">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={open ? filter : displayLabel}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
      />

      {open && filteredOptions.length > 0 && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          className="combobox-listbox"
          role="listbox"
        >
          {filteredOptions.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={value === option.value}
              data-highlighted={index === highlighted}
              className="combobox-option"
              onClick={() => handleSelect(option.value)}
            >
              {option.label}
              {value === option.value && <span className="combobox-checkmark">✓</span>}
            </li>
          ))}
        </ul>
      )}

      {open && filteredOptions.length === 0 && (
        <div className="combobox-empty">No options found</div>
      )}
    </div>
  )
}
