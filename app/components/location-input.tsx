'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { PROVINCES_DATA } from '@/lib/locations';

const places = [...new Set(PROVINCES_DATA.flatMap(province => [province.name, ...province.cities.filter(city => !city.startsWith('All ')).map(city => `${city.replace(/\s*\([^)]*\)/g, '')}, ${province.name}`)]))];
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function LocationInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = places.filter(place => normalize(place).includes(normalize(value)));
  const expanded = open && matches.length > 0;

  useEffect(() => {
    if (expanded && active >= 0) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, expanded]);

  function select(place: string) {
    onChange(place);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  }

  return <div className="location-combobox" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); }
  }}>
    <div className="input-icon">
      <Search size={17} />
      <input ref={input} id="location" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId} aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder="Try Cavite or Quezon City" value={value} maxLength={160} required autoComplete="off"
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(index => matches.length ? (event.key === 'ArrowDown' ? (index + 1) % matches.length : (index <= 0 ? matches.length - 1 : index - 1)) : -1);
          } else if (event.key === 'Enter' && expanded && active >= 0) {
            event.preventDefault(); select(matches[active]);
          } else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); }
        }} />
      <button type="button" className="location-toggle" aria-label="Toggle location suggestions" aria-controls={listId} aria-expanded={expanded}
        onMouseDown={event => event.preventDefault()} onClick={() => { input.current?.focus(); setOpen(!open); setActive(-1); }}><ChevronDown size={18} /></button>
    </div>
    {expanded && <div className="location-popup">
      <div className="location-popup-heading">Choose a location</div>
      <div ref={list} id={listId} role="listbox" aria-label="Locations" className="location-options">
        {matches.map((place, index) => <div id={`${listId}-${index}`} key={place} role="option" aria-selected={active === index} className="location-option"
          onMouseDown={event => event.preventDefault()} onClick={() => select(place)}>{place}</div>)}
      </div>
      <div className="location-popup-hint">Type to narrow the list, or enter another place.</div>
    </div>}
  </div>;
}
