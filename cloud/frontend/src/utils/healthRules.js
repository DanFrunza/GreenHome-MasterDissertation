// Binary sensor device_classes that indicate a hardware fault state
export const FAULT_CLASSES = new Set([
  'problem', 'safety', 'moisture', 'smoke', 'carbon_monoxide',
  'heat', 'tamper', 'vibration', 'overcurrent', 'overheating', 'gas',
])

// Binary sensor device_classes that are "normal" functional states — excluded from Card 1
const INFORMATIONAL_CLASSES = new Set([
  'motion', 'door', 'window', 'occupancy', 'presence', 'lock',
  'opening', 'garage_door', 'plug', 'running', 'connectivity',
  'cold', 'light', 'sound', 'update', 'moving', 'battery', 'battery_charging',
])

export function isFaultSensor(entity) {
  if (entity.domain !== 'binary_sensor') return false
  if (!entity.device_class) return true
  return FAULT_CLASSES.has(entity.device_class) || !INFORMATIONAL_CLASSES.has(entity.device_class)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countAnomalies(anomalies, entityId, days, severity = null) {
  const from = Date.now() - days * 86400 * 1000
  return anomalies.filter(a =>
    a.entity_id === entityId &&
    new Date(a.detected_at).getTime() >= from &&
    (severity ? a.severity === severity : true)
  ).length
}

// ─── Quick rules (anomaly count only) ────────────────────────────────────────

const QUICK_RULES = {
  fridge: {
    power: (entity, anomalies) => {
      const n = countAnomalies(anomalies, entity.entity_id, 30, 'critical')
      if (n >= 2) return {
        severity: 'warning',
        title: 'Abnormal power spikes detected',
        body: `${n} critical power anomalies in the last 30 days. Possible causes: dirty condenser coils, door seal failure, or a thermostat fault causing the compressor to run more than normal.`,
        entityId: entity.entity_id,
      }
      return null
    },
  },
  boiler: {
    power: (entity, anomalies) => {
      const n = countAnomalies(anomalies, entity.entity_id, 30)
      if (n > 5) return {
        severity: 'warning',
        title: 'Irregular heating element consumption',
        body: `${n} consumption anomalies in the last 30 days. Possible limescale buildup on the heating element, causing efficiency loss and uneven heating cycles.`,
        entityId: entity.entity_id,
      }
      return null
    },
  },
  ac: {
    power: (entity, anomalies) => {
      const n = countAnomalies(anomalies, entity.entity_id, 30)
      if (n > 5) return {
        severity: 'warning',
        title: 'AC overconsumption anomalies',
        body: `${n} consumption anomalies in the last 30 days. Check and clean the air filters — a clogged filter forces the compressor to work harder and can cause refrigerant pressure issues.`,
        entityId: entity.entity_id,
      }
      return null
    },
  },
}

const QUICK_RULES_ANY = {
  carbon_dioxide: (entity, anomalies) => {
    const critical = countAnomalies(anomalies, entity.entity_id, 30, 'critical')
    if (critical >= 1) return {
      severity: 'critical',
      title: 'Critical CO₂ level recorded',
      body: `A CO₂ reading exceeded safe thresholds. If you have mechanical ventilation, check that it is running. If not, increase natural ventilation — open windows for at least 20 minutes and investigate the source.`,
      entityId: entity.entity_id,
    }
    const warning = countAnomalies(anomalies, entity.entity_id, 7)
    if (warning > 10) return {
      severity: 'warning',
      title: 'Persistent CO₂ elevation',
      body: `${warning} elevated CO₂ readings in the last 7 days. The space may have chronic ventilation issues — check that ventilation is operating correctly and consider increasing airflow.`,
      entityId: entity.entity_id,
    }
    return null
  },
  humidity: (entity, anomalies) => {
    const n = countAnomalies(anomalies, entity.entity_id, 7)
    if (n > 8) return {
      severity: 'warning',
      title: 'Chronic high humidity',
      body: `${n} humidity anomalies in the last 7 days. Sustained elevated humidity creates conditions for mold growth and dust mite proliferation.`,
      entityId: entity.entity_id,
    }
    return null
  },
  frequency: (entity, anomalies) => {
    const n = countAnomalies(anomalies, entity.entity_id, 7)
    if (n > 5) return {
      severity: 'warning',
      title: 'Persistent grid frequency variations',
      body: `${n} frequency anomalies in the last 7 days. This may indicate grid instability in your area or a local wiring issue. Sustained deviations can affect motor-driven appliances over time.`,
      entityId: entity.entity_id,
    }
    return null
  },
  temperature: (entity, anomalies) => {
    const n = countAnomalies(anomalies, entity.entity_id, 7, 'critical')
    if (n >= 1) return {
      severity: 'warning',
      title: 'Unusual temperature spike detected',
      body: `${n} critical temperature anomal${n === 1 ? 'y' : 'ies'} in the last 7 days. Check that any heating or cooling equipment near this sensor is operating normally.`,
      entityId: entity.entity_id,
    }
    return null
  },
}

// ─── Deep rules (need overview fetch per entity) ──────────────────────────────

const DEEP_RULES = {
  fridge: {
    power: (entity, overview) => {
      if (!overview || overview.min_value == null) return null
      const min = parseFloat(overview.min_value)
      if (min > 20) return {
        severity: 'critical',
        title: 'Compressor may not be cycling off',
        body: `Minimum recorded power over the last 3 days is ${min.toFixed(1)} W — the compressor appears to never stop. A healthy fridge compressor cycles on and off. Possible causes: door seal failure, thermostat fault, or a very warm ambient temperature.`,
        entityId: entity.entity_id,
      }
      return null
    },
  },
  washing_machine: {
    voltage: (entity, overview) => {
      if (!overview || overview.min_value == null || overview.max_value == null) return null
      const min = parseFloat(overview.min_value)
      const max = parseFloat(overview.max_value)
      if (min < 207 || max > 253) return {
        severity: 'warning',
        title: 'Supply voltage outside EU limits',
        body: `Recorded range: ${min.toFixed(1)} V – ${max.toFixed(1)} V. EN 50160 allows 207–253 V. Sustained deviations can damage appliance electronics and may void the manufacturer warranty.`,
        entityId: entity.entity_id,
      }
      return null
    },
    frequency: (entity, overview) => {
      if (!overview || overview.min_value == null || overview.max_value == null) return null
      const min = parseFloat(overview.min_value)
      const max = parseFloat(overview.max_value)
      if (min < 49.5 || max > 50.5) return {
        severity: 'warning',
        title: 'Grid frequency deviation detected',
        body: `Recorded range: ${min.toFixed(2)} Hz – ${max.toFixed(2)} Hz. EN 50160 allows 49.5–50.5 Hz. Frequency deviations indicate grid instability and can affect motor-driven appliances.`,
        entityId: entity.entity_id,
      }
      return null
    },
  },
  ventilation: {
    power: (entity, overview) => {
      if (!overview || overview.avg_value == null) return null
      if (parseFloat(overview.avg_value) < 5) return {
        severity: 'warning',
        title: 'Ventilation unit appears inactive',
        body: `Average power over the last 48 hours is ${parseFloat(overview.avg_value).toFixed(1)} W — the unit may not be running. Check that it is powered on and not physically blocked.`,
        entityId: entity.entity_id,
      }
      return null
    },
  },
}

const DEEP_RULES_ANY = {
  humidity: (entity, overview) => {
    if (!overview || overview.avg_value == null) return null
    if (parseFloat(overview.avg_value) > 65) return {
      severity: 'warning',
      title: 'Average humidity above safe level',
      body: `7-day average humidity is ${parseFloat(overview.avg_value).toFixed(1)}%. Sustained levels above 65% significantly increase mold growth and dust mite proliferation risk.`,
      entityId: entity.entity_id,
    }
    return null
  },
}

// Days of history needed per device_class for deep rules
const DEEP_FETCH_DAYS = {
  power: 3,
  voltage: 7,
  frequency: 7,
  humidity: 7,
}

// Returns list of { entity_id, fromDays } to batch-fetch overview for
export function getDeepRuleEntities(devices) {
  const needed = []
  for (const device of devices) {
    if (!device.appliance_type) continue
    for (const entity of device.entities) {
      const dc = entity.device_class
      if (!dc) continue
      const hasDeviceRule = !!(DEEP_RULES[device.appliance_type]?.[dc])
      const hasAnyRule    = !!(DEEP_RULES_ANY[dc])
      if (hasDeviceRule || hasAnyRule) {
        needed.push({ entity_id: entity.entity_id, fromDays: DEEP_FETCH_DAYS[dc] || 7 })
      }
    }
  }
  return needed
}

// Main evaluation function — returns insights[] for a single device
export function evaluateDevice(device, anomalies, entityOverviews) {
  const insights = []
  for (const entity of device.entities) {
    const dc = entity.device_class

    const quickDeviceRule = QUICK_RULES[device.appliance_type]?.[dc]
    if (quickDeviceRule) {
      const r = quickDeviceRule(entity, anomalies)
      if (r) insights.push(r)
    }

    const quickAnyRule = QUICK_RULES_ANY[dc]
    if (quickAnyRule) {
      const r = quickAnyRule(entity, anomalies)
      if (r) insights.push(r)
    }

    const deepDeviceRule = DEEP_RULES[device.appliance_type]?.[dc]
    if (deepDeviceRule) {
      const r = deepDeviceRule(entity, entityOverviews[entity.entity_id] ?? null)
      if (r) insights.push(r)
    }

    const deepAnyRule = DEEP_RULES_ANY[dc]
    if (deepAnyRule) {
      const r = deepAnyRule(entity, entityOverviews[entity.entity_id] ?? null)
      if (r) insights.push(r)
    }
  }
  return insights
}
