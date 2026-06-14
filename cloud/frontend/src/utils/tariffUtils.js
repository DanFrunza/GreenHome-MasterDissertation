export function effectiveTariff(tariff) {
  if (!tariff) return null
  const flat    = parseFloat(tariff.tariff_flat)
  const peak    = parseFloat(tariff.tariff_peak)
  const offpeak = parseFloat(tariff.tariff_offpeak)
  const weekend = parseFloat(tariff.tariff_weekend)
  if (!peak && !offpeak) return flat || null
  const s = parseInt((tariff.peak_start || '07:00').slice(0, 2))
  const e = parseInt((tariff.peak_end   || '23:00').slice(0, 2))
  const peakH       = e > s ? e - s : 24 - s + e
  const offpeakH    = 24 - peakH
  const weekdayRate = (peakH * (peak || flat || 0) + offpeakH * (offpeak || flat || 0)) / 24
  const weekendRate = (tariff.tariff_weekend != null && !isNaN(weekend)) ? weekend : weekdayRate
  return (5 * weekdayRate + 2 * weekendRate) / 7
}
