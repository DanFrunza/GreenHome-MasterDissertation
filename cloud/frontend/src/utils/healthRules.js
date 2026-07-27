// Binary sensor device_classes that indicate a hardware fault state
export const FAULT_CLASSES = new Set([
  'problem', 'safety', 'moisture', 'smoke', 'carbon_monoxide',
  'heat', 'tamper', 'vibration', 'overcurrent', 'overheating', 'gas',
])

export function isFaultSensor(entity) {
  if (entity.domain !== 'binary_sensor') return false
  return FAULT_CLASSES.has(entity.device_class)
}

//  Helpers 

function countAnomalies(anomalies, entityId, days, severity = null) {
  const from = Date.now() - days * 86400 * 1000
  return anomalies.filter(a =>
    a.entity_id === entityId &&
    new Date(a.detected_at).getTime() >= from &&
    (severity ? a.severity === severity : true)
  ).length
}

function findEntity(device, device_class) {
  return device.entities.find(e => e.device_class === device_class) ?? null
}

function ov(overview, field) {
  if (!overview || overview[field] == null) return null
  return parseFloat(overview[field])
}

//  Device-level rules 
// Each function receives the full device (all entities), anomalies array,
// and entityOverviews map — enabling cross-entity correlations.

const DEVICE_RULES = {

  fridge: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    if (!power) return insights

    const n   = countAnomalies(anomalies, power.entity_id, 30, 'critical')
    const min = ov(overviews[power.entity_id], 'min_value')

    if (min !== null && min > 20) insights.push({
      severity: 'critical',
      title: 'Compressor may not be cycling off',
      body: `Minimum recorded power over the last 3 days is ${min.toFixed(1)} W — the compressor appears to never stop. A healthy fridge cycles on and off regularly. Likely causes: door seal failure, thermostat fault, or a very warm ambient environment. Check that the door closes properly and the condenser coils are clean.`,
      entityId: power.entity_id,
    })

    if (n >= 2) insights.push({
      severity: 'warning',
      title: 'Abnormal power spikes detected',
      body: `${n} critical power anomalies in the last 30 days. Possible causes: dirty condenser coils, a failing door seal letting warm air in, or a thermostat fault causing the compressor to run more frequently than normal.`,
      entityId: power.entity_id,
    })

    return insights
  },

  washing_machine: (device, anomalies, overviews) => {
    const insights = []
    const power   = findEntity(device, 'power')
    const voltage = findEntity(device, 'voltage')
    const freq    = findEntity(device, 'frequency')
    const current = findEntity(device, 'current')

    if (voltage) {
      const min = ov(overviews[voltage.entity_id], 'min_value')
      const max = ov(overviews[voltage.entity_id], 'max_value')
      if (min !== null && max !== null && (min < 207 || max > 253)) insights.push({
        severity: 'warning',
        title: 'Supply voltage outside EN 50160 limits',
        body: `Recorded voltage range: ${min.toFixed(1)} V – ${max.toFixed(1)} V. EN 50160 requires 207–253 V. Sustained deviations stress the motor controller and wash electronics, and may void the manufacturer warranty.`,
        entityId: voltage.entity_id,
      })
    }

    if (freq) {
      const nAnom      = countAnomalies(anomalies, freq.entity_id, 7)
      const min        = ov(overviews[freq.entity_id], 'min_value')
      const max        = ov(overviews[freq.entity_id], 'max_value')
      const outOfRange = min !== null && max !== null && (min < 49.5 || max > 50.5)
      if (outOfRange || nAnom > 5) insights.push({
        severity: 'warning',
        title: 'Grid frequency irregularities detected',
        body: [
          outOfRange ? `Recorded frequency range: ${min.toFixed(2)} Hz – ${max.toFixed(2)} Hz (EN 50160 allows 49.5–50.5 Hz).` : '',
          nAnom > 5  ? `${nAnom} statistical anomalies in the last 7 days.` : '',
          'Frequency instability can affect motor-driven appliances and indicates local wiring or grid issues.',
        ].filter(Boolean).join(' '),
        entityId: freq.entity_id,
      })
    }

    if (current) {
      const n = countAnomalies(anomalies, current.entity_id, 30, 'critical')
      if (n >= 3) insights.push({
        severity: 'warning',
        title: 'Abnormal current draw during wash cycles',
        body: `${n} critical current anomalies in the last 30 days. Unexpected current spikes during wash cycles can indicate a failing motor winding, worn carbon brushes, or a bearing issue in the drum.`,
        entityId: current.entity_id,
      })
    }

    if (power) {
      const n = countAnomalies(anomalies, power.entity_id, 30)
      if (n > 5) insights.push({
        severity: 'warning',
        title: 'Irregular wash cycle power pattern',
        body: `${n} power anomalies in the last 30 days. Wash cycles should follow a predictable power profile. Deviations may point to a heating element cycling erratically or a drum motor under unexpected load.`,
        entityId: power.entity_id,
      })
    }

    return insights
  },

  dishwasher: (device, anomalies, overviews) => {
    const insights = []
    const power   = findEntity(device, 'power')
    const current = findEntity(device, 'current')

    if (power) {
      const n   = countAnomalies(anomalies, power.entity_id, 30)
      const min = ov(overviews[power.entity_id], 'min_value')

      if (n > 4) insights.push({
        severity: 'warning',
        title: 'Irregular wash cycle power consumption',
        body: `${n} power anomalies in the last 30 days. Dishwasher cycles have a predictable load profile. Deviations may indicate a blocked water inlet filter, a failing heating element, or a spray arm that has lost water pressure.`,
        entityId: power.entity_id,
      })

      if (min !== null && min > 8) insights.push({
        severity: 'warning',
        title: 'Dishwasher not entering standby',
        body: `Minimum recorded power is ${min.toFixed(1)} W — the dishwasher does not appear to reach standby between cycles. A stuck drain pump or a control board in a fault state can keep the unit unnecessarily powered.`,
        entityId: power.entity_id,
      })
    }

    if (current) {
      const n = countAnomalies(anomalies, current.entity_id, 30, 'critical')
      if (n >= 2) insights.push({
        severity: 'warning',
        title: 'Abnormal current during wash cycle',
        body: `${n} critical current anomalies in the last 30 days. High current spikes may point to a seized wash pump motor or a blocked impeller creating excess load.`,
        entityId: current.entity_id,
      })
    }

    return insights
  },

  dryer: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    const temp  = findEntity(device, 'temperature')

    if (temp) {
      const n = countAnomalies(anomalies, temp.entity_id, 7, 'critical')
      if (n >= 1) insights.push({
        severity: 'critical',
        title: 'Overtemperature detected in dryer',
        body: `${n} critical temperature anomalies in the last 7 days. Overtemperature in a dryer is a fire risk. Clean the lint filter immediately, inspect the exhaust duct for blockages, and do not leave the dryer running unattended.`,
        entityId: temp.entity_id,
      })
    }

    if (power) {
      const n   = countAnomalies(anomalies, power.entity_id, 30)
      const avg = ov(overviews[power.entity_id], 'avg_value')

      if (n > 5) insights.push({
        severity: 'warning',
        title: 'Abnormal drying cycle power pattern',
        body: `${n} power anomalies in the last 30 days. Erratic consumption is most commonly caused by a clogged lint filter, a failing heating element cycling inconsistently, or a drum bearing under unusual load.`,
        entityId: power.entity_id,
      })

      if (avg !== null && avg > 1800) insights.push({
        severity: 'warning',
        title: 'Dryer running hotter or longer than expected',
        body: `Average power over the last 7 days is ${avg.toFixed(0)} W. Clean the lint filter and verify the exhaust duct is clear. A heat-pump dryer showing consistently high averages may have a refrigerant issue.`,
        entityId: power.entity_id,
      })
    }

    return insights
  },

  oven: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    if (!power) return insights

    const n   = countAnomalies(anomalies, power.entity_id, 30)
    const min = ov(overviews[power.entity_id], 'min_value')

    if (n > 4) insights.push({
      severity: 'warning',
      title: 'Irregular heating element power draw',
      body: `${n} power anomalies in the last 30 days. May indicate a failing element cycling inconsistently, a faulty thermostat, or an intermittent door seal causing heat loss and extended heating cycles.`,
      entityId: power.entity_id,
    })

    if (min !== null && min > 10) insights.push({
      severity: 'warning',
      title: 'Oven not reaching standby',
      body: `Minimum recorded power is ${min.toFixed(1)} W — the appliance does not appear to drop to true standby. A stuck relay on the heating element or a display module drawing excess power are common causes.`,
      entityId: power.entity_id,
    })

    return insights
  },

  boiler: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    const temp  = findEntity(device, 'temperature')

    if (power) {
      const n   = countAnomalies(anomalies, power.entity_id, 30)
      const avg = ov(overviews[power.entity_id], 'avg_value')

      if (n > 5) insights.push({
        severity: 'warning',
        title: 'Irregular heating element consumption',
        body: `${n} consumption anomalies in the last 30 days. Likely limescale buildup on the heating element — limescale acts as an insulator, causing the element to draw more power and heat less efficiently. Consider descaling if the unit has not been serviced recently.`,
        entityId: power.entity_id,
      })

      if (avg !== null && avg > 2500) insights.push({
        severity: 'warning',
        title: 'Above-average heating element load',
        body: `Average power over the last 7 days is ${avg.toFixed(0)} W. The thermostat may be set too high, causing frequent reheating cycles, or there may be heat loss from poor insulation on the hot water tank.`,
        entityId: power.entity_id,
      })
    }

    if (temp) {
      const n = countAnomalies(anomalies, temp.entity_id, 7, 'critical')
      if (n >= 1) insights.push({
        severity: 'warning',
        title: 'Water temperature irregularities',
        body: `${n} critical temperature anomalies in the last 7 days. Unexpected temperature spikes may indicate a faulty thermostat allowing the element to overshoot, or drops suggesting heat loss from a failing element or poor tank insulation.`,
        entityId: temp.entity_id,
      })
    }

    return insights
  },

  ac: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    const temp  = findEntity(device, 'temperature')

    if (power) {
      const n   = countAnomalies(anomalies, power.entity_id, 30)
      const min = ov(overviews[power.entity_id], 'min_value')

      if (n > 5) insights.push({
        severity: 'warning',
        title: 'AC overconsumption anomalies',
        body: `${n} power anomalies in the last 30 days. Check and clean the air filters — a clogged filter forces the compressor to work harder and can cause refrigerant pressure issues. Ensure no doors or windows are open while the unit runs.`,
        entityId: power.entity_id,
      })

      if (min !== null && min > 50) insights.push({
        severity: 'warning',
        title: 'AC compressor running continuously',
        body: `Minimum recorded power over the last 7 days is ${min.toFixed(0)} W — the compressor may not be reaching the set temperature or cycling off. Check refrigerant level, clean filters, and verify the condenser unit outdoors is unobstructed.`,
        entityId: power.entity_id,
      })
    }

    if (temp) {
      const n = countAnomalies(anomalies, temp.entity_id, 7, 'critical')
      if (n >= 2) insights.push({
        severity: 'warning',
        title: 'Temperature regulation issues detected',
        body: `${n} critical temperature anomalies in the last 7 days. The AC may be struggling to maintain setpoint — check for refrigerant leaks, a blocked outdoor condenser unit, or an undersized unit for the room.`,
        entityId: temp.entity_id,
      })
    }

    return insights
  },

  heat_pump: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    const temp  = findEntity(device, 'temperature')

    if (power) {
      const n   = countAnomalies(anomalies, power.entity_id, 30)
      const min = ov(overviews[power.entity_id], 'min_value')

      if (n > 5) insights.push({
        severity: 'warning',
        title: 'Heat pump consumption irregularities',
        body: `${n} power anomalies in the last 30 days. Erratic consumption may indicate a refrigerant issue, a defrost cycle problem, or a reversing valve fault. Heat pump efficiency varies with outdoor temperature but patterns should remain consistent.`,
        entityId: power.entity_id,
      })

      if (min !== null && min > 100) insights.push({
        severity: 'warning',
        title: 'Heat pump not entering standby',
        body: `Minimum recorded power over the last 7 days is ${min.toFixed(0)} W. Heat pumps should reach low standby power when heating demand is met. Continuous operation suggests the unit cannot reach target temperature or is overshooting its setpoint.`,
        entityId: power.entity_id,
      })
    }

    if (temp) {
      const n = countAnomalies(anomalies, temp.entity_id, 7)
      if (n > 5) insights.push({
        severity: 'warning',
        title: 'Unstable heat pump output temperature',
        body: `${n} temperature anomalies in the last 7 days. Unstable outlet temperature may indicate a refrigerant charge issue, a failing expansion valve, or interference from a secondary heat source in the system.`,
        entityId: temp.entity_id,
      })
    }

    return insights
  },

  heater: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    if (!power) return insights

    const n   = countAnomalies(anomalies, power.entity_id, 30)
    const min = ov(overviews[power.entity_id], 'min_value')

    if (n > 6) insights.push({
      severity: 'warning',
      title: 'Heater consumption spikes',
      body: `${n} power anomalies in the last 30 days. For an electric heater this may indicate thermostat hunting — the thermostat is switching the element on and off erratically rather than settling at the set temperature.`,
      entityId: power.entity_id,
    })

    if (min !== null && min > 30) insights.push({
      severity: 'warning',
      title: 'Heater not reaching low-power state',
      body: `Minimum recorded power is ${min.toFixed(0)} W — the heater may be running continuously without reaching its setpoint. Check the thermostat calibration and verify the room is not losing heat faster than the heater can compensate.`,
      entityId: power.entity_id,
    })

    return insights
  },

  ventilation_fan: (device, anomalies, overviews) => {
    const insights = []
    const power    = findEntity(device, 'power')
    const humidity = findEntity(device, 'humidity')

    if (power) {
      const avgPower = ov(overviews[power.entity_id], 'avg_value')
      if (avgPower !== null && avgPower > 25) insights.push({
        severity: 'warning',
        title: 'Ventilation fan running continuously',
        body: `Average power is ${avgPower.toFixed(1)} W — the fan appears to be running around the clock. Extractor fans are most effective when triggered by humidity or occupancy rather than left on continuously. Continuous operation adds unnecessary noise and wear without improving air quality once moisture has been removed.`,
        entityId: power.entity_id,
      })

      const n = countAnomalies(anomalies, power.entity_id, 30)
      if (n > 8) insights.push({
        severity: 'warning',
        title: 'Irregular fan motor consumption',
        body: `${n} power anomalies in the last 30 days. May indicate a worn motor bearing, a partially obstructed grille, or an intermittent electrical connection. Clean the grille and check the duct for obstructions.`,
        entityId: power.entity_id,
      })
    }

    if (humidity) {
      const humCritical = countAnomalies(anomalies, humidity.entity_id, 30, 'critical')
      if (humCritical >= 3) insights.push({
        severity: 'warning',
        title: 'Recurring high humidity despite fan presence',
        body: `${humCritical} critical humidity readings in the last 30 days. The fan may be undersized, the duct may be partially blocked, or run time after showers may be too short. Sustained humidity above 70% accelerates mold growth on walls and ceilings.`,
        entityId: humidity.entity_id,
      })
    }

    return insights
  },

  ventilation_system: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    const co2   = findEntity(device, 'carbon_dioxide')

    const avgPower    = power ? ov(overviews[power.entity_id], 'avg_value') : null
    const ventOff     = avgPower !== null && avgPower < 5
    const co2Critical = co2 ? countAnomalies(anomalies, co2.entity_id, 30, 'critical') : 0
    const co2Warning  = co2 ? countAnomalies(anomalies, co2.entity_id, 7) : 0

    if (ventOff && co2Critical >= 1) {
      insights.push({
        severity: 'critical',
        title: 'Ventilation system off — CO₂ critically elevated',
        body: `The ventilation system appears inactive (average power ${avgPower.toFixed(1)} W) while CO₂ has reached critical levels. Restart the unit immediately and open windows to ventilate the space. Prolonged high CO₂ impairs concentration and at very high levels is dangerous.`,
        entityId: power?.entity_id,
      })
      return insights
    }

    if (ventOff && power) insights.push({
      severity: 'warning',
      title: 'Ventilation system appears inactive',
      body: `Average power over the last 3 days is ${avgPower.toFixed(1)} W — the unit may not be running. Check that it is powered on, not set to minimum speed, and that there are no blockages in the intake or exhaust ducting.`,
      entityId: power.entity_id,
    })

    if (co2 && co2Critical >= 1) {
      const ventRunning = avgPower !== null && avgPower >= 5
      insights.push({
        severity: 'critical',
        title: 'Critical CO₂ level recorded',
        body: ventRunning
          ? `A CO₂ reading exceeded safe thresholds while the system appears to be running (avg. power ${avgPower.toFixed(1)} W). Check that filters are clean, that fan speed is adequate for the room volume, and that supply and extract grilles are not obstructed.`
          : `A CO₂ reading exceeded safe thresholds. Open windows for at least 20 minutes and investigate whether the ventilation system is operating correctly.`,
        entityId: co2.entity_id,
      })
    } else if (co2 && co2Warning > 10) insights.push({
      severity: 'warning',
      title: 'Persistent CO₂ elevation',
      body: `${co2Warning} elevated CO₂ readings in the last 7 days. The system may need its filter replaced, fan speed increased, or scheduling adjusted to match occupancy patterns.`,
      entityId: co2.entity_id,
    })

    if (!ventOff && power) {
      const n = countAnomalies(anomalies, power.entity_id, 30)
      if (n > 8) insights.push({
        severity: 'warning',
        title: 'Irregular motor consumption',
        body: `${n} power anomalies in the last 30 days. May indicate a partially blocked duct, a worn fan bearing, or a clogged filter causing the motor to hunt for a stable operating point.`,
        entityId: power.entity_id,
      })
    }

    return insights
  },

  heat_recovery: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    const co2   = findEntity(device, 'carbon_dioxide')

    const avgPower    = power ? ov(overviews[power.entity_id], 'avg_value') : null
    const unitOff     = avgPower !== null && avgPower < 5
    const co2Critical = co2 ? countAnomalies(anomalies, co2.entity_id, 30, 'critical') : 0
    const co2Warning  = co2 ? countAnomalies(anomalies, co2.entity_id, 7) : 0

    if (unitOff && co2Critical >= 1) {
      insights.push({
        severity: 'critical',
        title: 'MVHR unit off — CO₂ critically elevated',
        body: `The heat recovery unit appears inactive (average power ${avgPower.toFixed(1)} W) while CO₂ has reached critical levels. Restart the unit immediately and open windows to ventilate. An MVHR providing no airflow also means no heat recovery — check for a tripped fuse or fault indicator on the unit.`,
        entityId: power?.entity_id,
      })
      return insights
    }

    if (unitOff && power) insights.push({
      severity: 'warning',
      title: 'MVHR unit appears inactive',
      body: `Average power over the last 3 days is ${avgPower.toFixed(1)} W. The unit may be in standby, have a fault, or be set to a very low speed. An inactive MVHR provides no ventilation or heat recovery — check the control panel for fault codes and ensure filters are not blocking airflow.`,
      entityId: power.entity_id,
    })

    if (co2 && co2Critical >= 1) insights.push({
      severity: 'critical',
      title: 'Critical CO₂ level despite MVHR presence',
      body: `A CO₂ reading exceeded safe thresholds. With an MVHR system installed this may indicate filters are heavily clogged, the unit is set to recirculation mode, airflow rates are insufficient for the room volume, or supply/extract grilles are obstructed. Open windows immediately and inspect the unit.`,
      entityId: co2.entity_id,
    })
    else if (co2 && co2Warning > 10) insights.push({
      severity: 'warning',
      title: 'Persistent CO₂ elevation — check MVHR filters',
      body: `${co2Warning} elevated CO₂ readings in the last 7 days despite an MVHR system being present. The most common cause is a clogged filter reducing airflow below the design rate. Check and replace filters if overdue.`,
      entityId: co2.entity_id,
    })

    if (!unitOff && power) {
      const n = countAnomalies(anomalies, power.entity_id, 30)
      if (n > 8) insights.push({
        severity: 'warning',
        title: 'Irregular MVHR power consumption',
        body: `${n} power anomalies in the last 30 days. Variable-speed MVHR units hunting for a stable operating point often indicate a filter restriction or duct imbalance. Compare supply and extract airflow if sensors are available.`,
        entityId: power.entity_id,
      })
    }

    return insights
  },

  coffee_machine: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    if (!power) return insights

    const n   = countAnomalies(anomalies, power.entity_id, 30)
    const min = ov(overviews[power.entity_id], 'min_value')

    if (n > 4) insights.push({
      severity: 'warning',
      title: 'Unusual power draw pattern',
      body: `${n} power anomalies in the last 30 days. Coffee machines have a consistent heat-up and brew profile. Deviations may indicate limescale on the boiler, a thermoblock cycling erratically, or a milk frother under irregular load.`,
      entityId: power.entity_id,
    })

    if (min !== null && min > 5) insights.push({
      severity: 'warning',
      title: 'Coffee machine not entering standby',
      body: `Minimum recorded power is ${min.toFixed(1)} W. Modern machines should enter a low-power state between uses. A stuck heating element relay or an active display board are common sources of unnecessary standby draw.`,
      entityId: power.entity_id,
    })

    return insights
  },

  kettle: (device, anomalies) => {
    const insights = []
    const power = findEntity(device, 'power')
    if (!power) return insights

    const n = countAnomalies(anomalies, power.entity_id, 30, 'critical')
    if (n >= 3) insights.push({
      severity: 'warning',
      title: 'Kettle power spikes detected',
      body: `${n} critical power anomalies in the last 30 days. Electric kettles have a simple resistance heating profile. Spikes may indicate a failing auto-shutoff thermostat, a partially scaled element, or an intermittent connection at the base.`,
      entityId: power.entity_id,
    })

    return insights
  },

  lights: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    if (!power) return insights

    const n   = countAnomalies(anomalies, power.entity_id, 30)
    const avg = ov(overviews[power.entity_id], 'avg_value')

    if (n > 10) insights.push({
      severity: 'warning',
      title: 'Unusual lighting power consumption',
      body: `${n} power anomalies in the last 30 days. Smart bulbs or LED drivers can exhibit anomalies at the edge of their dimming range, with a loose connection, or when paired with an incompatible dimmer switch.`,
      entityId: power.entity_id,
    })

    if (avg !== null && avg > 50) insights.push({
      severity: 'warning',
      title: 'Above-average lighting consumption',
      body: `Average power over the last 7 days is ${avg.toFixed(0)} W. Consider whether older bulb types remain in the circuit, or whether occupancy and daylight sensors could reduce unnecessary on-time.`,
      entityId: power.entity_id,
    })

    return insights
  },

  tv: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    if (!power) return insights

    const n   = countAnomalies(anomalies, power.entity_id, 30)
    const min = ov(overviews[power.entity_id], 'min_value')

    if (min !== null && min > 15) insights.push({
      severity: 'warning',
      title: 'Entertainment system not entering standby',
      body: `Minimum recorded power is ${min.toFixed(0)} W — higher than typical standby (1–5 W). Connected set-top boxes, soundbars, or streaming devices may be keeping the system awake. Enable HDMI-CEC auto-off or use a smart plug schedule.`,
      entityId: power.entity_id,
    })

    if (n > 8) insights.push({
      severity: 'warning',
      title: 'Irregular entertainment system consumption',
      body: `${n} power anomalies in the last 30 days. May be caused by background software updates, an always-on gaming console, or a device that does not honour its sleep settings.`,
      entityId: power.entity_id,
    })

    return insights
  },

  ev_charger: (device, anomalies, overviews) => {
    const insights = []
    const power   = findEntity(device, 'power')
    const current = findEntity(device, 'current')
    const voltage = findEntity(device, 'voltage')

    if (voltage) {
      const min = ov(overviews[voltage.entity_id], 'min_value')
      const max = ov(overviews[voltage.entity_id], 'max_value')
      if (min !== null && max !== null && (min < 207 || max > 253)) insights.push({
        severity: 'warning',
        title: 'Supply voltage outside safe EV charging range',
        body: `Voltage recorded at ${min.toFixed(1)} – ${max.toFixed(1)} V. Charging outside EN 50160 limits (207–253 V) can trigger protective shutdowns and may reduce battery longevity over time.`,
        entityId: voltage.entity_id,
      })
    }

    if (current) {
      const n = countAnomalies(anomalies, current.entity_id, 30, 'critical')
      if (n >= 2) insights.push({
        severity: 'warning',
        title: 'Abnormal current during EV charging',
        body: `${n} critical current anomalies in the last 30 days. May indicate a fault in the charger's power electronics, a cable with high contact resistance, or communication issues between charger and vehicle BMS.`,
        entityId: current.entity_id,
      })
    }

    if (power) {
      const n = countAnomalies(anomalies, power.entity_id, 30)
      if (n > 6) insights.push({
        severity: 'warning',
        title: 'Irregular EV charging sessions',
        body: `${n} power anomalies in the last 30 days. Charging sessions should follow a smooth taper profile. Irregular patterns may indicate BMS temperature adjustments, ground fault interruptions, or dynamic load balancing interfering with sessions.`,
        entityId: power.entity_id,
      })
    }

    return insights
  },

  solar_panel: (device, anomalies, overviews) => {
    const insights = []
    const power  = findEntity(device, 'power')
    const energy = findEntity(device, 'energy')

    if (power) {
      const n = countAnomalies(anomalies, power.entity_id, 30, 'critical')
      if (n >= 3) insights.push({
        severity: 'warning',
        title: 'Irregular solar generation pattern',
        body: `${n} critical generation anomalies in the last 30 days. Sudden drops during clear periods may indicate shading from a new obstruction, panel soiling or bird fouling, or a string inverter fault. Check inverter display for error codes.`,
        entityId: power.entity_id,
      })
    }

    if (energy) {
      const avg = ov(overviews[energy.entity_id], 'avg_value')
      if (avg !== null && avg < 0.1) insights.push({
        severity: 'warning',
        title: 'Very low solar generation recorded',
        body: `Daily energy generation average is ${avg.toFixed(2)} kWh — significantly below what is expected from a functioning installation. Check the inverter for fault codes and verify the array is not shaded or significantly soiled.`,
        entityId: energy.entity_id,
      })
    }

    return insights
  },

  battery_storage: (device, anomalies) => {
    const insights = []
    const power = findEntity(device, 'power')
    if (!power) return insights

    const n = countAnomalies(anomalies, power.entity_id, 30, 'critical')
    if (n >= 3) insights.push({
      severity: 'warning',
      title: 'Irregular battery charge/discharge cycles',
      body: `${n} critical power anomalies in the last 30 days. Abnormal cycling may indicate a cell imbalance in the battery pack, a BMS fault causing premature charge cutoff, or a grid connection issue triggering unexpected mode switches.`,
      entityId: power.entity_id,
    })

    return insights
  },

  smart_meter: (device, anomalies, overviews) => {
    const insights = []
    const power   = findEntity(device, 'power')
    const voltage = findEntity(device, 'voltage')
    const freq    = findEntity(device, 'frequency')

    if (voltage) {
      const min = ov(overviews[voltage.entity_id], 'min_value')
      const max = ov(overviews[voltage.entity_id], 'max_value')
      if (min !== null && max !== null && (min < 207 || max > 253)) insights.push({
        severity: 'warning',
        title: 'Household supply voltage outside EN 50160',
        body: `Voltage at the meter: ${min.toFixed(1)} – ${max.toFixed(1)} V. This affects all appliances in the home. Contact your distribution network operator — sustained supply quality issues outside 207–253 V are a statutory obligation for them to resolve.`,
        entityId: voltage.entity_id,
      })
    }

    if (freq) {
      const min = ov(overviews[freq.entity_id], 'min_value')
      const max = ov(overviews[freq.entity_id], 'max_value')
      const n   = countAnomalies(anomalies, freq.entity_id, 7)
      if ((min !== null && max !== null && (min < 49.5 || max > 50.5)) || n > 10) insights.push({
        severity: 'warning',
        title: 'Grid frequency anomalies at household meter',
        body: [
          n > 0 ? `${n} frequency anomalies in the last 7 days.` : '',
          min !== null && max !== null ? `Recorded range: ${min.toFixed(2)} – ${max.toFixed(2)} Hz.` : '',
          'Deviations measured at meter level reflect a regional grid condition rather than local wiring.',
        ].filter(Boolean).join(' '),
        entityId: freq.entity_id,
      })
    }

    if (power) {
      const n = countAnomalies(anomalies, power.entity_id, 30, 'critical')
      if (n >= 5) insights.push({
        severity: 'warning',
        title: 'Unusually high household consumption spikes',
        body: `${n} critical total consumption anomalies in the last 30 days. Cross-reference with specific appliance usage — a newly connected high-draw device, an EV charger, or a faulty appliance on maximum load could be responsible.`,
        entityId: power.entity_id,
      })
    }

    return insights
  },

  air_purifier: (device, anomalies, overviews) => {
    const insights = []
    const pm25  = findEntity(device, 'pm25')
    const power = findEntity(device, 'power')

    const avgPower    = power ? ov(overviews[power.entity_id], 'avg_value') : null
    const purifierOff = avgPower !== null && avgPower < 3

    if (pm25) {
      const nCrit = countAnomalies(anomalies, pm25.entity_id, 30, 'critical')
      const avgPm = ov(overviews[pm25.entity_id], 'avg_value')

      // Correlated: purifier off AND PM2.5 elevated
      if (purifierOff && nCrit >= 2) {
        insights.push({
          severity: 'critical',
          title: 'Air purifier off — PM2.5 critically elevated',
          body: `PM2.5 has reached critical levels (${nCrit} events in 30 days) while the purifier appears inactive (average power ${avgPower.toFixed(1)} W). Switch on the purifier and reduce particle sources — cooking fumes, candles, and outdoor air infiltration are common causes.`,
          entityId: power?.entity_id ?? pm25.entity_id,
        })
        return insights
      }

      if (avgPm !== null && avgPm > 25) insights.push({
        severity: 'warning',
        title: 'Chronically elevated PM2.5 — filter check needed',
        body: `7-day average PM2.5 is ${avgPm.toFixed(1)} µg/m³ — above the WHO guideline of 15 µg/m³. If the purifier is running, the HEPA filter may be saturated. Check the filter indicator and replace if due.`,
        entityId: pm25.entity_id,
      })

      if (nCrit >= 2) insights.push({
        severity: 'warning',
        title: 'Repeated PM2.5 spikes detected',
        body: `${nCrit} critical PM2.5 events in the last 30 days. Recurring spikes suggest a recurring source — cooking without range hood extraction, candles, or periodic outdoor pollution infiltration.`,
        entityId: pm25.entity_id,
      })
    }

    if (power && !purifierOff) {
      const n = countAnomalies(anomalies, power.entity_id, 30)
      if (n > 8) insights.push({
        severity: 'warning',
        title: 'Irregular purifier motor consumption',
        body: `${n} power anomalies in the last 30 days. Erratic motor consumption can indicate a clogged pre-filter restricting airflow or an auto-speed sensor that is fluctuating.`,
        entityId: power.entity_id,
      })
    }

    return insights
  },

  humidifier: (device, anomalies, overviews) => {
    const insights = []
    const humidity = findEntity(device, 'humidity')
    const power    = findEntity(device, 'power')

    const avgHum = humidity ? ov(overviews[humidity.entity_id], 'avg_value') : null
    const avgPow = power    ? ov(overviews[power.entity_id],    'avg_value') : null
    const isOn   = avgPow !== null && avgPow > 5

    if (humidity) {
      if (avgHum !== null && avgHum > 65) insights.push({
        severity: 'warning',
        title: 'Over-humidification detected',
        body: `7-day average humidity is ${avgHum.toFixed(1)}% — above the 65% threshold where mold growth risk increases significantly. Lower the humidifier setpoint or reduce run time.`,
        entityId: humidity.entity_id,
      })
      else if (avgHum !== null && avgHum < 30 && isOn) insights.push({
        severity: 'warning',
        title: 'Humidifier running but humidity remains low',
        body: `Average humidity is ${avgHum.toFixed(1)}% while the humidifier appears active. The water tank may be empty, the output may be insufficient for the room volume, or a high air exchange rate is preventing humidity from building up.`,
        entityId: humidity.entity_id,
      })

      const n = countAnomalies(anomalies, humidity.entity_id, 7)
      if (n > 8) insights.push({
        severity: 'warning',
        title: 'Unstable humidity levels',
        body: `${n} humidity anomalies in the last 7 days. Rapid swings can indicate the humidifier is overshooting its setpoint or there are external moisture variability sources (open windows, cooking).`,
        entityId: humidity.entity_id,
      })
    }

    return insights
  },

  robot_vacuum: (device, anomalies, overviews) => {
    const insights = []
    const power = findEntity(device, 'power')
    if (!power) return insights

    const n   = countAnomalies(anomalies, power.entity_id, 30)
    const avg = ov(overviews[power.entity_id], 'avg_value')

    if (n > 6) insights.push({
      severity: 'warning',
      title: 'Irregular vacuum motor consumption',
      body: `${n} power anomalies in the last 30 days. Erratic consumption often means the brush roll is tangled with hair or debris, a side brush is jammed, or the suction path is partially blocked.`,
      entityId: power.entity_id,
    })

    if (avg !== null && avg > 40) insights.push({
      severity: 'warning',
      title: 'Higher than expected average power draw',
      body: `Average power over the last 7 days is ${avg.toFixed(0)} W. A full dustbin, clogged filter, or a unit that is frequently getting stuck and running at maximum suction are the most likely causes.`,
      entityId: power.entity_id,
    })

    return insights
  },
}

// ─── Generic entity rules — fallback for sensor types and unmatched devices ───
// Used when no DEVICE_RULES entry exists for the appliance_type.

const GENERIC_ENTITY_RULES = {
  temperature: (entity, anomalies) => {
    const n = countAnomalies(anomalies, entity.entity_id, 7, 'critical')
    if (n >= 1) return {
      severity: 'warning',
      title: 'Unusual temperature spike recorded',
      body: `${n} critical temperature anomal${n === 1 ? 'y' : 'ies'} in the last 7 days. Check that heating or cooling equipment near this sensor is operating normally and that the sensor is not exposed to drafts or direct sunlight.`,
      entityId: entity.entity_id,
    }
    return null
  },

  humidity: (entity, anomalies, overview) => {
    const avg = ov(overview, 'avg_value')
    if (avg !== null && avg > 65) return {
      severity: 'warning',
      title: 'Average humidity above safe level',
      body: `7-day average humidity is ${avg.toFixed(1)}%. Sustained levels above 65% significantly increase mold growth and dust mite proliferation risk. Improve ventilation or add a dehumidifier.`,
      entityId: entity.entity_id,
    }
    const n = countAnomalies(anomalies, entity.entity_id, 7)
    if (n > 8) return {
      severity: 'warning',
      title: 'Chronic humidity anomalies',
      body: `${n} humidity anomalies in the last 7 days. Indicates a ventilation problem or a recurring moisture source. Check bathroom and kitchen extraction.`,
      entityId: entity.entity_id,
    }
    return null
  },

  carbon_dioxide: (entity, anomalies) => {
    const critical = countAnomalies(anomalies, entity.entity_id, 30, 'critical')
    if (critical >= 1) return {
      severity: 'critical',
      title: 'Critical CO₂ level recorded',
      body: `A CO₂ reading exceeded safe thresholds. Increase ventilation immediately — open windows for at least 20 minutes. Persistent critical readings warrant inspection of ventilation equipment.`,
      entityId: entity.entity_id,
    }
    const warning = countAnomalies(anomalies, entity.entity_id, 7)
    if (warning > 10) return {
      severity: 'warning',
      title: 'Persistent CO₂ elevation',
      body: `${warning} elevated CO₂ readings in the last 7 days. The space may have chronic ventilation issues — check that ventilation operates on an appropriate schedule for the room's occupancy.`,
      entityId: entity.entity_id,
    }
    return null
  },

  pressure: (entity, anomalies) => {
    const n = countAnomalies(anomalies, entity.entity_id, 7, 'critical')
    if (n >= 2) return {
      severity: 'warning',
      title: 'Atmospheric pressure anomalies recorded',
      body: `${n} critical pressure readings in the last 7 days. Rapid changes are associated with incoming weather fronts. If this sensor is indoors, verify it is not near an HVAC vent causing localised fluctuations.`,
      entityId: entity.entity_id,
    }
    return null
  },

  pm25: (entity, anomalies, overview) => {
    const avg = ov(overview, 'avg_value')
    if (avg !== null && avg > 25) return {
      severity: 'warning',
      title: 'Elevated average PM2.5',
      body: `7-day average PM2.5 is ${avg.toFixed(1)} µg/m³ — above the WHO guideline of 15 µg/m³. Common sources: cooking without extraction, candles, and outdoor pollution infiltration. Consider an air purifier with HEPA filtration.`,
      entityId: entity.entity_id,
    }
    const n = countAnomalies(anomalies, entity.entity_id, 30, 'critical')
    if (n >= 2) return {
      severity: 'warning',
      title: 'Recurring PM2.5 spikes',
      body: `${n} critical PM2.5 events in the last 30 days. Identify and reduce the particle source — cooking fumes, candles, and outdoor air events are the most common contributors in residential settings.`,
      entityId: entity.entity_id,
    }
    return null
  },

  frequency: (entity, anomalies, overview) => {
    const min        = ov(overview, 'min_value')
    const max        = ov(overview, 'max_value')
    const n          = countAnomalies(anomalies, entity.entity_id, 7)
    const outOfRange = min !== null && max !== null && (min < 49.5 || max > 50.5)
    if (outOfRange || n > 5) return {
      severity: 'warning',
      title: 'Grid frequency variations detected',
      body: [
        outOfRange ? `Recorded range: ${min.toFixed(2)} – ${max.toFixed(2)} Hz (EN 50160: 49.5–50.5 Hz).` : '',
        n > 5 ? `${n} statistical anomalies in the last 7 days.` : '',
        'Frequency deviations indicate grid instability and can affect motor-driven appliances over time.',
      ].filter(Boolean).join(' '),
      entityId: entity.entity_id,
    }
    return null
  },

  voltage: (entity, anomalies, overview) => {
    const min = ov(overview, 'min_value')
    const max = ov(overview, 'max_value')
    if (min !== null && max !== null && (min < 207 || max > 253)) return {
      severity: 'warning',
      title: 'Supply voltage outside EN 50160 limits',
      body: `Recorded voltage range: ${min.toFixed(1)} – ${max.toFixed(1)} V. EN 50160 requires 207–253 V. Contact your distribution network operator if deviations persist.`,
      entityId: entity.entity_id,
    }
    const n = countAnomalies(anomalies, entity.entity_id, 7, 'critical')
    if (n >= 2) return {
      severity: 'warning',
      title: 'Voltage spikes detected',
      body: `${n} critical voltage anomalies in the last 7 days. Voltage spikes can damage sensitive electronics — consider a surge protector for high-value equipment on this circuit.`,
      entityId: entity.entity_id,
    }
    return null
  },

  power: (entity, anomalies) => {
    const n = countAnomalies(anomalies, entity.entity_id, 30, 'critical')
    if (n >= 3) return {
      severity: 'warning',
      title: 'Repeated power consumption spikes',
      body: `${n} critical power anomalies in the last 30 days. Classify this device for more specific diagnostics. In the meantime, check for loose connections, aging components, or unusual usage patterns.`,
      entityId: entity.entity_id,
    }
    return null
  },

  current: (entity, anomalies) => {
    const n = countAnomalies(anomalies, entity.entity_id, 30, 'critical')
    if (n >= 3) return {
      severity: 'warning',
      title: 'Abnormal current readings',
      body: `${n} critical current anomalies in the last 30 days. Unexpected spikes can indicate a partial short circuit, a motor under excessive load, or a component beginning to fail.`,
      entityId: entity.entity_id,
    }
    return null
  },

  energy: (entity, anomalies) => {
    const n = countAnomalies(anomalies, entity.entity_id, 30, 'critical')
    if (n >= 2) return {
      severity: 'warning',
      title: 'Energy accumulation anomalies',
      body: `${n} critical energy meter anomalies in the last 30 days. Spikes may indicate metering issues or genuinely high-consumption events worth investigating.`,
      entityId: entity.entity_id,
    }
    return null
  },
}

// Overview fetch requirements 
// device_class → days of history needed, per appliance_type.

const DEEP_FETCH = {
  fridge:          { power: 3 },
  washing_machine: { voltage: 7, frequency: 7, power: 7, current: 7 },
  dishwasher:      { power: 7, current: 7 },
  dryer:           { power: 7 },
  oven:            { power: 3 },
  boiler:          { power: 7 },
  ac:              { power: 7 },
  heat_pump:       { power: 7, temperature: 7 },
  heater:          { power: 7 },
  ventilation_fan:    { power: 3 },
  ventilation_system: { power: 5 },
  heat_recovery:      { power: 5 },
  coffee_machine:  { power: 3 },
  kettle:          { power: 3 },
  lights:          { power: 7 },
  tv:              { power: 3 },
  ev_charger:      { power: 7, current: 7, voltage: 7 },
  solar_panel:     { power: 7, energy: 7 },
  battery_storage: { power: 7 },
  smart_meter:     { power: 7, voltage: 7, frequency: 7 },
  air_purifier:    { pm25: 7, power: 3 },
  humidifier:      { humidity: 7, power: 7 },
  robot_vacuum:    { power: 7 },
  // Sensor-type fallbacks
  sensor_temp:     { temperature: 7 },
  sensor_humidity: { humidity: 7 },
  sensor_co2:      { carbon_dioxide: 7 },
  sensor_pressure: { pressure: 7 },
  sensor_generic:  { temperature: 7, humidity: 7, carbon_dioxide: 7, pressure: 7, pm25: 7 },
}

// Returns list of { entity_id, fromDays } to batch-fetch overviews for
export function getDeepRuleEntities(devices) {
  const needed = []
  for (const device of devices) {
    const dcMap = DEEP_FETCH[device.appliance_type] ?? {}
    for (const entity of device.entities) {
      const fromDays = dcMap[entity.device_class]
      if (fromDays) needed.push({ entity_id: entity.entity_id, fromDays })
    }
  }
  return needed
}

// Main evaluation — device-specific rules first, generic fallback for unmatched types
export function evaluateDevice(device, anomalies, entityOverviews) {
  const deviceRule = DEVICE_RULES[device.appliance_type]
  if (deviceRule) return deviceRule(device, anomalies, entityOverviews)

  const insights = []
  for (const entity of device.entities) {
    const rule = GENERIC_ENTITY_RULES[entity.device_class]
    if (rule) {
      const r = rule(entity, anomalies, entityOverviews[entity.entity_id] ?? null)
      if (r) insights.push(r)
    }
  }
  return insights
}
