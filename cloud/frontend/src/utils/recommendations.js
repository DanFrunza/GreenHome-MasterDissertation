// Returns savings string if tariff available, otherwise a prompt to configure it
function savingsOrPrompt(value, currency, tariff) {
  if (value != null && tariff) return `~${value.toFixed(0)} ${currency}/month based on your configured tariff.`
  return 'Configure your electricity tariff in Settings for a personalised savings estimate.'
}

// RECOMMENDATIONS[appliance_type] = { energy, health }
// Each section: { title, body(tariff) } — body is a function receiving the tariff object (may be null)
export const RECOMMENDATIONS = {
  washing_machine: {
    energy: {
      title: 'Shift cycles to off-peak hours and wash at lower temperatures',
      body: (tariff) => {
        const kwhPerCycle = 1.5
        const cyclesPerMonth = 15
        const saving = tariff
          ? (parseFloat(tariff.tariff_peak) - parseFloat(tariff.tariff_offpeak)) * kwhPerCycle * cyclesPerMonth
          : null
        return `Heating water accounts for 80–90% of a washing machine's energy use per cycle. Switching from 60°C to 30°C saves up to 60% of the cycle's energy with no meaningful difference in cleaning performance for lightly soiled loads. Always run with a full load — half-loads waste water and electricity.

Shifting your cycles to off-peak hours (after ${tariff?.peak_end?.slice(0,5) ?? '23:00'}) reduces the cost per cycle significantly. ${savingsOrPrompt(saving, tariff?.currency ?? 'RON', tariff)}`
      },
    },
    health: {
      title: 'Remove laundry promptly to prevent mold and bacteria buildup',
      body: () =>
        `Leaving wet laundry in a closed drum for more than 1–2 hours creates ideal conditions for mold and bacteria to proliferate. The resulting musty odour comes from microbial colonies established on the fabric — removing it will require rewashing. More importantly, mold spores and bacteria released when the drum is opened or during subsequent drying can irritate the respiratory tract, particularly in people with asthma or mold allergies.

Run a drum-cleaning cycle with a dedicated cleaner or at 90°C every 1–2 months to prevent buildup inside the machine. Leave the door and detergent drawer ajar between washes to allow the drum to dry out. If your washing machine is connected, an automation that notifies you when the cycle ends makes it easier to unload promptly.`,
    },
  },

  dishwasher: {
    energy: {
      title: 'Schedule during off-peak hours and use eco mode',
      body: (tariff) => {
        const kwhPerCycle = 1.2
        const cyclesPerMonth = 20
        const saving = tariff
          ? (parseFloat(tariff.tariff_peak) - parseFloat(tariff.tariff_offpeak)) * kwhPerCycle * cyclesPerMonth
          : null
        return `Most modern dishwashers have a delayed start feature — use it to schedule cycles overnight. The eco programme uses less water and lower temperatures, reducing energy use by 20–40% compared to intensive cycles. Only run when fully loaded. ${savingsOrPrompt(saving, tariff?.currency ?? 'RON', tariff)}`
      },
    },
    health: {
      title: 'Allow the interior to dry fully after each cycle to prevent mold',
      body: () =>
        `The warm, humid interior of a dishwasher is an ideal environment for mold and bacteria if left closed after a cycle ends. Once the programme finishes, open the door fully for at least 30 minutes to allow steam and residual moisture to escape. Many dishwashers have an auto-open or airing function — enable it if available.

Detergent residue on dishes is rare with modern formulations and correct dosing, but using excessive detergent or a programme that is too short for the load can leave chemical traces. Use the amount recommended by the manufacturer and avoid overfilling, which prevents water from reaching all surfaces during the wash.`,
    },
  },

  dryer: {
    energy: {
      title: 'Schedule during off-peak hours and clean the filter before every use',
      body: (tariff) => {
        const kwhPerCycle = 2.5
        const cyclesPerMonth = 10
        const saving = tariff
          ? (parseFloat(tariff.tariff_peak) - parseFloat(tariff.tariff_offpeak)) * kwhPerCycle * cyclesPerMonth
          : null
        return `Dryers are among the highest-consuming household appliances, using 2–4 kWh per cycle. A clogged lint filter increases drying time and energy use by 20–30% — clean it before every cycle. If available, use a sensor-dry programme instead of timed drying to stop automatically when clothes are dry, avoiding over-running.

Shifting cycles to off-peak hours reduces cost per cycle. ${savingsOrPrompt(saving, tariff?.currency ?? 'RON', tariff)}`
      },
    },
    health: {
      title: 'Clean the lint filter before every cycle — clogged filters are a fire hazard',
      body: () =>
        `Lint accumulation in the filter and exhaust duct is the leading cause of dryer fires in residential properties. A full filter not only increases fire risk but also forces the heating element to cycle longer at higher temperatures, accelerating wear. Clean the filter before every cycle without exception, and inspect and clean the exhaust duct at least once a year.

Vented dryers expel hot, humid air — ensure the vent exits outside the building and is not blocked, partially crushed, or venting into a wall cavity or attic space. Blocked or indoor venting raises indoor humidity significantly and creates conditions for mold in the surrounding structure.`,
    },
  },

  fridge: {
    energy: {
      title: 'Placement and maintenance reduce consumption by up to 30%',
      body: () =>
        `A refrigerator placed next to an oven, dishwasher, or in direct sunlight must work significantly harder to maintain temperature — increasing consumption by 10–20%. Leave at least 10 cm of clearance on the sides and back for heat dissipation.

Dust on the condenser coils (usually at the back or bottom) forces the compressor to run longer — cleaning them once a year can reduce energy use by up to 30%. Check door seals regularly: a damaged seal lets cold air escape continuously, adding 5–15% to consumption. A full fridge retains cold better than an empty one.`,
    },
    health: {
      title: 'Correct fridge temperature prevents foodborne illness',
      body: () =>
        `The refrigerator compartment should be kept between 1°C and 4°C. Above 4°C, bacteria such as Listeria, Salmonella, and E. coli multiply rapidly — doubling in population every 20 minutes in some cases. Many households set the thermostat too high (5–8°C), often without realising it, as fridge dials are typically labelled 1–5 rather than in degrees.

The freezer should be at or below -18°C. Warmer temperatures do not kill bacteria but slow their growth — a brief temperature rise from a door left open longer than necessary is enough to restart multiplication on thawed or semi-thawed food. If your fridge has a temperature sensor entity, use it to monitor the compartment temperature and set an alert automation for any reading above 5°C.`,
    },
  },

  boiler: {
    energy: {
      title: 'Heat water during off-peak hours and optimise the setpoint',
      body: (tariff) => {
        const kwhPerDay = 3
        const saving = tariff
          ? (parseFloat(tariff.tariff_peak) - parseFloat(tariff.tariff_offpeak)) * kwhPerDay * 30
          : null
        return `Scheduling the boiler to heat water during off-peak hours (typically after ${tariff?.peak_end?.slice(0,5) ?? '23:00'}) ensures hot water is available in the morning at the lowest possible cost. Every 10°C reduction in setpoint temperature saves approximately 6% in energy — but do not set it below 60°C (see the health note). Insulating the boiler tank and hot water pipes reduces heat loss and reheating frequency. ${savingsOrPrompt(saving, tariff?.currency ?? 'RON', tariff)}`
      },
    },
    health: {
      title: 'Maintain a minimum of 60°C to prevent Legionella',
      body: () =>
        `Legionella bacteria thrive between 20°C and 45°C and are killed only above 60°C. If the boiler setpoint is reduced for energy savings, bacterial colonies can establish in the tank and pipework. Legionnaires' disease — a serious form of pneumonia caused by inhaling water droplets containing Legionella — can be life-threatening, particularly for older adults and immunocompromised individuals.

If you lower the temperature, ensure the system reaches at least 60°C at least once a week. Many boilers include an anti-Legionella cycle in their settings — enable it if available. This is especially important if the boiler has not been used for several days.`,
    },
  },

  ac: {
    energy: {
      title: 'Each degree of additional cooling increases consumption by approximately 8%',
      body: () =>
        `Setting the thermostat to 26°C instead of 23°C reduces energy consumption by approximately 24% under the same outdoor conditions. Clean or replace filters monthly during heavy use — a dirty filter reduces airflow and forces the unit to work harder, increasing consumption by 15–25%. Close windows and doors while the AC is running to avoid cooling outdoor air. Use curtains or blinds on sun-facing windows to reduce heat gain.

Inverter-type units are significantly more efficient than fixed-speed models and are worth considering at replacement time.`,
    },
    health: {
      title: 'Large temperature differentials and direct airflow carry health risks',
      body: () =>
        `A difference greater than 6–8°C between indoor and outdoor temperature causes thermal shock when moving between spaces, stressing the cardiovascular system — particularly for elderly people and young children. Direct cold airflow on the body over extended periods causes muscle tension, joint pain, and increased susceptibility to respiratory infections.

Point the airflow upward so cold air descends gradually and mixes with room air. Target a comfortable temperature of 24–26°C rather than the lowest setting. Regular cleaning of filters prevents the AC from recirculating accumulated dust, mold spores, and bacteria into the room air.`,
    },
  },

  heater: {
    energy: {
      title: 'Use a thermostat and reduce temperature at night',
      body: () =>
        `Every 1°C reduction in room temperature saves approximately 6% in heating energy. A night setback of 4–5°C (for example, from 21°C to 16–17°C during sleep hours) significantly reduces overnight consumption without meaningfully affecting comfort. Automating this with a temperature sensor or a scheduled automation in Home Assistant eliminates the need for manual adjustment. Ensure the room is well-insulated — gaps around doors and windows are the most common source of heat loss.`,
    },
    health: {
      title: 'Electric heating dries out the air — monitor humidity to avoid respiratory irritation',
      body: () =>
        `Electric heaters warm the air without adding any moisture, so relative humidity drops as temperature rises — a room heated from 15°C to 22°C will see humidity fall by 20–30 percentage points if no moisture is added. At relative humidity below 30%, the mucous membranes lining the nose and throat dry out, reducing their ability to trap airborne pathogens and irritants. Dry air also worsens eczema and psoriasis and increases static electricity.

If you have a humidity sensor, track the relative humidity in heated rooms during winter. If levels consistently fall below 35%, a humidifier with sensor-based automation can maintain the healthy range of 40–55%. Keeping a bowl of water near the heater is a low-tech alternative that provides some passive humidification.`,
    },
  },

  ev_charger: {
    energy: {
      title: 'Always charge during off-peak hours',
      body: (tariff) => {
        const kwhPerSession = 50
        const sessionsPerMonth = 4
        const saving = tariff
          ? (parseFloat(tariff.tariff_peak) - parseFloat(tariff.tariff_offpeak)) * kwhPerSession * sessionsPerMonth
          : null
        return `EV charging typically requires 20–60 kWh per session depending on battery capacity and charge level. Shifting charging to off-peak hours (after ${tariff?.peak_end?.slice(0,5) ?? '23:00'}) takes advantage of the lower tariff and also reduces strain on the electricity grid during peak demand periods. Most EV chargers and cars support scheduled charging via their companion app or directly through Home Assistant.

${savingsOrPrompt(saving, tariff?.currency ?? 'RON', tariff)}`
      },
    },
    health: {
      title: 'Charge in a well-ventilated space and avoid fully depleting the battery',
      body: () =>
        `Lithium-ion batteries used in EVs generate modest heat during charging — particularly during fast charging. While home AC charging at 7–11 kW is generally safe, charging in an enclosed garage without ventilation can allow heat to accumulate over several hours. Ensure the charging area has adequate airflow.

Regularly depleting the battery below 10–15% and charging to 100% accelerates long-term battery degradation. Most manufacturers recommend keeping the battery between 20% and 80% for daily use, reserving a full charge for long trips. Many EVs and chargers allow you to set a charge limit — 80% is the commonly recommended daily target for battery longevity.`,
    },
  },

  lights: {
    energy: {
      title: 'LED replacement offers the fastest payback of any home upgrade',
      body: (tariff) => {
        const savingKwhPerYear = 90
        const annualSaving = tariff
          ? parseFloat(tariff.tariff_flat ?? tariff.tariff_peak) * savingKwhPerYear
          : null
        const monthlySaving = annualSaving ? annualSaving / 12 : null
        return `A standard LED bulb uses 75–85% less energy than an incandescent equivalent and lasts 15–25 times longer. A 10W LED replaces a 60W incandescent, saving 50W per bulb per hour of use. For a room used 5 hours per day with 5 bulbs, replacing them saves approximately 90 kWh per year. ${savingsOrPrompt(monthlySaving, tariff?.currency ?? 'RON', tariff)}

The cost of replacement LED bulbs is typically recovered within 6–12 months through energy savings alone.`
      },
    },
    health: {
      title: 'Light colour temperature affects sleep and melatonin production',
      body: () =>
        `Blue-white light (colour temperatures above 5000K) suppresses melatonin production — the hormone that regulates sleep onset. Exposure in the 2–3 hours before sleep delays sleep onset and reduces sleep quality. Warm white light (2700–3000K) does not have this effect and is recommended for living areas and bedrooms in the evening.

If your lights are smart or dimmable, reducing brightness and shifting to warmer tones after 20:00 supports natural sleep cycles. This is particularly important for children, whose melatonin suppression from blue light is more pronounced than in adults.`,
    },
  },

  air_purifier: {
    energy: {
      title: 'Automate based on air quality to reduce unnecessary runtime',
      body: () =>
        `Running an air purifier continuously consumes 20–60W depending on the unit and fan speed, adding 15–45 kWh per month if left on 24/7. Automating it with a PM2.5 sensor — so it activates only when particle levels exceed a threshold — typically reduces runtime by 40–70% in most households without sacrificing air quality.

If you do not yet have an air quality sensor, scheduling the purifier during known high-pollution periods (morning traffic hours, cooking times) is a useful intermediate step.`,
    },
    health: {
      title: 'Fine particles are the leading indoor air health risk',
      body: () =>
        `Indoor air can be 2–5 times more polluted than outdoor air, according to the US EPA. Fine particles (PM2.5) — generated by cooking, candles, cleaning products, furniture off-gassing, and outdoor pollution entering through gaps — are the primary cause of respiratory irritation, reduced lung function, and long-term cardiovascular risk with chronic exposure.

The WHO daily average guideline for PM2.5 is 15 µg/m³. People with asthma, COPD, or allergies are significantly more sensitive. An air purifier with a HEPA filter, running when PM2.5 exceeds safe levels, is one of the most effective interventions for indoor health — particularly in urban environments or homes without mechanical ventilation.`,
    },
  },

  humidifier: {
    energy: {
      title: 'Use a humidity sensor to prevent over-running',
      body: () =>
        `Without a sensor, humidifiers often continue running after the target humidity is reached, wasting energy and risking excess moisture in the room. A humidity sensor linked via automation stops the humidifier once the target level (ideally 45–55% relative humidity) is achieved. Typical humidifiers use 25–50W — unnecessary runtime adds 5–15 kWh per month. If you already have a humidity sensor in your setup, connecting them via an automation is straightforward.`,
    },
    health: {
      title: 'Humidity levels directly affect respiratory health and allergen exposure',
      body: () =>
        `Relative humidity below 35% dries out the mucous membranes lining the nose, throat, and lungs — the first line of defence against airborne pathogens. Dry air makes it easier for viruses and bacteria to travel through the air and harder for the body to expel them. It also worsens eczema, psoriasis, and asthma symptoms.

Humidity above 65% creates ideal conditions for mold growth and dust mite proliferation — both strong triggers for asthma and allergic rhinitis. The optimal range for both health and comfort is 40–60% relative humidity. A humidifier with a sensor-based automation maintains this range automatically, without requiring manual monitoring.`,
    },
  },

  ventilation: {
    energy: {
      title: 'Demand-controlled ventilation reduces unnecessary runtime',
      body: () =>
        `Continuous mechanical ventilation consumes 30–150W depending on unit size and fan speed. Running it only when CO2 levels exceed 1000ppm — detected via a CO2 sensor — can reduce operating hours by 30–60%, depending on occupancy patterns. If you have a CO2 sensor entity in Home Assistant, linking it to your ventilation unit through an automation achieves this with no additional hardware.`,
    },
    health: {
      title: 'CO2 levels directly affect cognitive performance and sleep quality',
      body: () =>
        `Outdoor air contains approximately 420ppm CO2. At 800ppm, most people begin to feel slightly drowsy. Above 1000ppm, cognitive performance measurably declines — peer-reviewed studies have shown a 15–50% reduction in decision-making ability and complex task performance at moderate CO2 elevations.

Above 1500ppm, headaches and difficulty concentrating are common. A closed bedroom can reach 1500–2000ppm within 2–3 hours of sleep, meaningfully affecting sleep quality and morning alertness. Since CO2 has no smell or visible sign, a sensor is the only reliable way to know when ventilation is needed. Automated ventilation triggered by CO2 levels is the most effective solution for consistently good indoor air quality.`,
    },
  },

  tv: {
    energy: {
      title: 'Eliminate standby consumption and reduce screen brightness',
      body: () =>
        `Modern TVs in standby mode consume 0.5–2W continuously — a seemingly small amount that adds up to 4–17 kWh per year per device. Using a smart plug or the TV's power switch (rather than the remote standby) eliminates this entirely. Reducing screen brightness by 25–30% typically saves 15–20% of active consumption with minimal perceived visual impact, particularly in normal room lighting conditions.`,
    },
    health: {
      title: 'Screen light in the evening disrupts sleep — reduce brightness after 20:00',
      body: () =>
        `Screens emit blue-spectrum light at intensities that suppress melatonin production — the hormone that signals the body to prepare for sleep. Watching TV in a dark room in the 2–3 hours before bed delays sleep onset and reduces slow-wave (deep) sleep quality. Children and adolescents are significantly more sensitive to this effect than adults.

Reduce TV brightness to the lowest comfortable setting in the evening. If your TV supports it, enable the warm colour mode or "eye comfort" setting after 20:00. Increasing ambient room lighting while watching — rather than viewing in a dark room — also reduces the contrast effect that amplifies blue-light impact on the eyes. Consider setting an automated smart plug schedule to switch the TV off by a set time to help enforce healthy screen-time boundaries.`,
    },
  },

  oven: {
    energy: {
      title: 'Avoid unnecessary preheating and use residual heat',
      body: () =>
        `Most modern ovens reach cooking temperature within 10–15 minutes — preheating for longer periods wastes energy with no benefit. For dishes with cooking times above 30 minutes, you can turn the oven off 10 minutes early and let residual heat finish cooking without opening the door. Fan-assisted (convection) mode circulates heat more evenly and reduces cooking time by 20–30% compared to conventional static heating. Batch cooking multiple dishes in a single session is the most impactful efficiency measure.`,
    },
    health: {
      title: 'Cooking generates significant indoor air pollution — ventilate during and after use',
      body: () =>
        `Cooking is one of the largest sources of indoor air pollution in most homes. Gas ovens emit nitrogen dioxide (NO₂) and carbon monoxide (CO) as combustion byproducts. Electric ovens and hobs produce fine particles (PM2.5) from food burning and steam, and volatile organic compounds (VOCs) from non-stick coatings and heated fats. Concentrations during cooking can exceed outdoor pollution levels by 5–10 times.

Always use an extractor hood at the highest effective setting while cooking, or open a window. Run the extractor for at least 15 minutes after cooking ends — PM2.5 levels remain elevated long after the heat source is off. If you have a CO2, PM2.5, or VOC sensor nearby, check whether values return to baseline within 20–30 minutes; if not, ventilation is insufficient. People with asthma or chronic respiratory conditions should be particularly attentive to kitchen air quality during cooking.`,
    },
  },

  sensor_temp: {
    energy: {
      title: 'Use temperature data to automate heating and cooling',
      body: () =>
        `This sensor's own consumption is negligible — typically 0.5–2W. Its value lies in enabling automations: linking a temperature sensor to a thermostat or heater allows heating to run only when the room is actually cold, rather than on a fixed schedule. This typically reduces heating consumption by 15–30% compared to timed-only control.`,
    },
    health: {
      title: 'Temperature monitoring enables comfortable and healthy living conditions',
      body: () =>
        `The WHO recommends a minimum indoor temperature of 18°C for healthy adults and 20°C for households with young children or elderly occupants. Prolonged exposure to temperatures below 16°C increases respiratory infection risk and cardiovascular strain. Temperatures above 24°C during sleep reduce sleep quality. Continuous temperature monitoring allows you to maintain conditions within the healthy comfort range and catch issues early — such as heating failure in winter.`,
    },
  },

  sensor_humidity: {
    energy: {
      title: 'Link humidity data to automate your humidifier or ventilation',
      body: () =>
        `A humidity sensor's own consumption is negligible. Its primary value is enabling other appliances to run only when needed: a humidifier controlled by humidity data avoids over-running past the target level, and ventilation triggered by humidity spikes (from cooking or showering) removes excess moisture before it condenses on surfaces. This approach reduces unnecessary runtime and energy use.`,
    },
    health: {
      title: 'Objective humidity data prevents both over-dry and over-humid conditions',
      body: () =>
        `Human perception of humidity is unreliable — most people cannot distinguish 35% from 55% relative humidity by feel alone, especially in cooler rooms. A sensor provides objective data and allows automatic correction before conditions become uncomfortable or harmful. The optimal range of 40–60% relative humidity prevents respiratory irritation from dry air and mold growth from excess moisture.`,
    },
  },

  sensor_co2: {
    energy: {
      title: 'CO2 data enables demand-controlled ventilation',
      body: () =>
        `A CO2 sensor's own consumption is negligible. Its value is enabling ventilation to run only when needed: a ventilation unit triggered by CO2 levels above 1000ppm typically operates 30–60% fewer hours than one running continuously, while maintaining equivalent or better air quality. This is one of the highest-impact automations available for both energy and health simultaneously.`,
    },
    health: {
      title: 'CO2 is the most important indicator of indoor air quality',
      body: () =>
        `CO2 has no smell and is invisible — the only way to know indoor levels is to measure them. Concentrations above 1000ppm consistently impair cognitive performance, and above 1500ppm cause physical symptoms. A CO2 sensor combined with a ventilation automation is the most effective single intervention for maintaining healthy indoor air quality. Consider placing the sensor in the bedroom and main living area, where occupancy is highest.`,
    },
  },

  sensor_pressure: {
    energy: null,
    health: {
      title: 'Barometric pressure as a weather and comfort indicator',
      body: () =>
        `Atmospheric pressure readings from an indoor sensor reflect outdoor weather conditions. Rapid drops in pressure often precede storms and are associated with increased migraine and joint pain episodes in sensitive individuals. While there is no direct intervention available through home automation, pressure data can be used to anticipate weather changes and prepare accordingly. Pressure data combined with temperature is also useful for detecting airtightness issues in well-insulated homes.`,
    },
  },

  sensor_generic: {
    energy: {
      title: 'Sensor data enables smarter automation and reduced energy waste',
      body: () =>
        `This sensor's own energy consumption is negligible — typically under 2W. The energy-saving potential lies entirely in using its data to automate other appliances, so they run only when conditions actually require it. Identify which appliances in your home could benefit from being linked to this sensor and set up automations in Home Assistant accordingly.`,
    },
    health: {
      title: 'Monitoring data you cannot perceive directly',
      body: () =>
        `Human senses reliably detect temperature extremes and obvious humidity changes, but are poor at detecting CO2 buildup, fine particle levels, or gradual environmental changes. Sensor data provides an objective baseline and alerts you to conditions that would otherwise go unnoticed until they cause discomfort or health effects. The more sensor data your home generates, the more precisely it can be automated to maintain healthy and comfortable conditions.`,
    },
  },
  other: {
    energy: {
      title: 'No specific recommendations available for this device type',
      body: () =>
        `No targeted energy recommendations are available for the selected device type. If this device has a power sensor attached, visit the Statistics page to analyse its consumption pattern and identify potential optimisation opportunities.`,
    },
    health: null,
  },
}

export function getRecommendations(applianceType, tariff) {
  const rec = RECOMMENDATIONS[applianceType]
  if (!rec) return null
  return {
    energy: rec.energy ? { title: rec.energy.title, body: rec.energy.body(tariff) } : null,
    health: rec.health ? { title: rec.health.title, body: rec.health.body(tariff) } : null,
  }
}

// Appliance types that carry an EU energy efficiency label
export const ENERGY_CLASS_TYPES = new Set([
  'fridge', 'washing_machine', 'dishwasher', 'dryer',
  'ac', 'boiler', 'heater', 'lights', 'tv',
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
export function getAllTips(devices, tariff) {
  const tips = []
  for (const device of devices) {
    if (!device.appliance_type) continue
    const rec = RECOMMENDATIONS[device.appliance_type]
    if (!rec) continue
    if (rec.energy) tips.push({
      deviceName: device.name,
      category: 'Energy savings',
      title: rec.energy.title,
      body: rec.energy.body(tariff),
    })
    if (rec.health) tips.push({
      deviceName: device.name,
      category: 'Health & comfort',
      title: rec.health.title,
      body: rec.health.body(tariff),
    })
  }
  return tips
}
