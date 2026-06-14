const DECIMALS = {
  carbon_dioxide: 0,
  temperature:    1,
  humidity:       1,
  power:          1,
  energy:         2,
  voltage:        1,
  frequency:      2,
  pressure:       1,
  pm25:           1,
}

export function formatSensorValue(value, deviceClass) {
  if (value == null) return '—'
  const n = Number(value)
  if (isNaN(n)) return '—'
  const decimals = DECIMALS[deviceClass] ?? 2
  return n.toFixed(decimals)
}
