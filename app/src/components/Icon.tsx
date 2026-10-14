// Stroke icons drawn inline so they take the text colour. Decorative by default (aria-hidden).

const PATHS = {
  pin: 'M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  home: 'M3.5 11.5L12 4l8.5 7.5M6 9.5V20h12V9.5M10 20v-5.5h4V20',
  plane: 'M2.5 16.5l19-8.5M10.5 20l3-8.5M4.5 10.5l5 2M13.5 11.5l6.5-7.5',
  train: 'M6 3h12a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM4 10.5h16M8 21l1.5-3.5M16 21l-1.5-3.5M9 7h6',
  bus: 'M5 4h14a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM4 11h16M7.5 21v-3M16.5 21v-3M7.5 14.5h.01M16.5 14.5h.01',
  bed: 'M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  warn: 'M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.5h.01',
  external: 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
  back: 'M19 12H5M12 19l-7-7 7-7',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  star: 'M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8h.01',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  thermo: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v7',
  rain: 'M7 15.5h10.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 7.6 7.7 4 4 0 0 0 7 15.5zM8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  snow: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5',
  calendar: 'M5 5h14v15H5zM5 9.5h14M9 3v4M15 3v4',
  eye: 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  museum: 'M3 20.5h18M4 9.5h16M12 3.5l8.5 4.5h-17zM6.5 9.5v8M10.5 9.5v8M13.5 9.5v8M17.5 9.5v8',
  food: 'M7 3v7.5a2 2 0 0 0 2 2V21M11 3v7.5a2 2 0 0 1-2 2M7 3v4M17.5 3c-2.2 2-2.2 7 0 9V21',
  glass: 'M7 3.5h10l-1 6.5a4 4 0 0 1-8 0zM12 14v6.5M8.5 20.5h7',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 21l2-6 3 3v3M9 11l3-4 3 2 3 1M12 7l-2 6',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  beer: 'M5 8.5h10V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM15 11h1.5a2.5 2.5 0 0 1 2.5 2.5v1a2.5 2.5 0 0 1-2.5 2.5H15M5 8.5a2.8 2.8 0 0 1 3.4-3.6 3 3 0 0 1 5.3.3A2.4 2.4 0 0 1 15 8.5M8.5 12v5.5M11.5 12v5.5',
  coffee: 'M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10.5h1a2.5 2.5 0 0 1 0 5h-1.5M7.5 3.5V6M10.5 3.5V6M13.5 3.5V6',
  cart: 'M3 4h2.2l2.3 10.5h10l2-7.5H6.4M9 19.5h.01M17 19.5h.01',
  ticket: 'M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4zM14.5 7v10',
  bag: 'M6 7.5h12a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2zM9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M9 11.5v4.5M15 11.5v4.5',
  transfer: 'M4 8h14M14.5 4.5L18 8l-3.5 3.5M20 16H6M9.5 12.5L6 16l3.5 3.5',
  passport: 'M6.5 3h10A1.5 1.5 0 0 1 18 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3zM11.5 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.5 17h6',
  sparkle: 'M11 3.5l1.9 5.6 5.6 1.9-5.6 1.9L11 18.5l-1.9-5.6L3.5 11l5.6-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  down: 'M12 4.5v15M5.5 13l6.5 6.5 6.5-6.5',
  compare: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h3A1.5 1.5 0 0 1 10 5.5v13A1.5 1.5 0 0 1 8.5 20h-3A1.5 1.5 0 0 1 4 18.5zM14 5.5A1.5 1.5 0 0 1 15.5 4h3A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5zM6.5 8h1M16.5 8h1M6.5 11h1M16.5 11h1',
  contrast: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18M12 7h4.6M12 11h6.6M12 15h6.2M12 19h3.6',
  users: 'M15.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V20M9.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20.5 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.6a3.5 3.5 0 0 1 0 6.8',
  sort: 'M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5',
  bulb: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16, label, filled = false }: { name: IconName; size?: number; label?: string; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className="icon"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
