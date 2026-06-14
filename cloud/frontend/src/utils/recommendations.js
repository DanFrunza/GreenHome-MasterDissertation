function calcSavings(saving_calc, tariff) {
  if (!saving_calc || !tariff) return null
  const peak    = parseFloat(tariff.tariff_peak)
  const offpeak = parseFloat(tariff.tariff_offpeak)
  const flat    = parseFloat(tariff.tariff_flat ?? tariff.tariff_peak)
  const { type, kwh_unit, units_per_month, kwh_year, kwh_month } = saving_calc
  if (type === 'offpeak')    return (peak - offpeak) * kwh_unit * units_per_month
  if (type === 'flat_annual') return flat * kwh_year / 12
  if (type === 'flat_monthly') return flat * kwh_month
  return null
}

function buildBody(rec, tariff) {
  const body     = rec.body ?? ''
  const saving   = calcSavings(rec.saving_calc, tariff)
  const currency = tariff?.currency ?? 'RON'
  let suffix = null
  if (rec.saving_calc) {
    suffix = saving != null
      ? `~${saving.toFixed(0)} ${currency}/month based on your configured tariff.`
      : 'Configure your electricity tariff in Settings for a personalised savings estimate.'
  }
  return suffix ? `${body}\n\n${suffix}` : body
}

export function getRecommendations(applianceType, tariff, recommendationsData) {
  if (!recommendationsData) return null
  const rec = recommendationsData[applianceType]
  if (!rec) return null
  return {
    energy: rec.energy ? rec.energy.map(item => ({ ...item, body: buildBody(item, tariff) })) : null,
    health: rec.health ? rec.health.map(item => ({ ...item, body: buildBody(item, tariff) })) : null,
  }
}

// Appliance types that carry an EU energy efficiency label
export const ENERGY_CLASS_TYPES = new Set([
  // Kitchen & appliances
  'fridge', 'washing_machine', 'dishwasher', 'dryer', 'oven', 'boiler',
  // HVAC
  'ac', 'heater', 'heat_pump', 'heat_recovery',
  // Lighting & entertainment
  'lights', 'tv',
  // Cleaning
  'robot_vacuum',
])

export const ENERGY_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

// Consumption relative to class A (A = 1.0 baseline, higher = less efficient)
// Based on approximate EU label scale steps (~12% per class)
export const CLASS_EFFICIENCY = { A: 1.00, B: 1.12, C: 1.26, D: 1.41, E: 1.58, F: 1.77, G: 1.98 }

export function getRoiMessage(energyClass, targetClass = 'A') {
  if (!energyClass) return null
  if (energyClass === targetClass) return {
    title: `Already at class ${energyClass} — no upgrade available`,
    body: `This appliance is rated class ${energyClass}, which is the selected target. Choose a less efficient class as the baseline or a better class as the target to calculate ROI.`,
  }
  const currentIdx = ENERGY_CLASSES.indexOf(energyClass)
  const targetIdx  = ENERGY_CLASSES.indexOf(targetClass)
  if (currentIdx <= targetIdx) return null  // current is already better than target
  const savingPct = Math.round((1 - CLASS_EFFICIENCY[targetClass] / CLASS_EFFICIENCY[energyClass]) * 100)
  return {
    title: `Class ${energyClass} — upgrading to class ${targetClass} saves approximately ${savingPct}% of this appliance's energy use`,
    body: `The EU energy label rates this appliance as class ${energyClass}. Replacing it with a class ${targetClass} equivalent would reduce energy consumption by approximately ${savingPct}%. Open the ROI Calculator to see the exact payback period based on your tariff and the cost of a replacement appliance.`,
  }
}

// Flat list of all tips for a list of devices — used by rotating card on Home
export function getAllTips(devices, tariff, recommendationsData) {
  if (!recommendationsData) return []
  const tips = []
  for (const device of devices) {
    if (!device.appliance_type) continue
    const rec = recommendationsData[device.appliance_type]
    if (!rec) continue
    if (rec.energy) {
      for (const item of rec.energy) {
        tips.push({
          deviceName: device.name,
          category: 'Energy savings',
          title: item.title,
          body: buildBody(item, tariff),
          impact: item.impact,
          automation_hint: item.automation_hint,
        })
      }
    }
    if (rec.health) {
      for (const item of rec.health) {
        tips.push({
          deviceName: device.name,
          category: 'Health & comfort',
          title: item.title,
          body: buildBody(item, tariff),
          impact: item.impact,
          automation_hint: item.automation_hint,
        })
      }
    }
  }
  return tips
}
