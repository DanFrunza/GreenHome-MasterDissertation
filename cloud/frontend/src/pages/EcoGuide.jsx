import { useState, useEffect } from 'react'
import { usePageTitle } from '../hooks/usePageTitle'
import { useHome } from '../context/HomeContext'
import { apiFetch } from '../utils/api'
import { API_URL } from '../config'
import { inferDeviceName } from '../utils/deviceUtils'
import InfoTooltip from '../components/InfoTooltip'
import '../styles/EcoGuide.css'

// Quick Wins data 
const QUICK_WINS = [
  {
    title: 'Lower heating by 1°C',
    desc: 'Reducing your thermostat by just one degree can cut heating bills noticeably with no comfort loss.',
    saving: '~€70/year',
    cost: 'Free',
    effort: 'Instant',
  },
  {
    title: 'Seal drafts around doors & windows',
    desc: 'Draught-proofing is one of the most cost-effective ways to keep heat in during winter.',
    saving: '~€80/year',
    cost: '~€10',
    effort: 'One-time',
  },
  {
    title: 'Unplug standby devices',
    desc: 'TVs, chargers, and consoles left on standby can account for up to 10% of your electricity bill.',
    saving: '~€50/year',
    cost: 'Free',
    effort: '5 min',
  },
  {
    title: 'Switch to LED bulbs',
    desc: 'LED bulbs use up to 80% less energy than incandescent and last 10× longer.',
    saving: '~€40/year',
    cost: '~€15',
    effort: 'One-time',
  },
  {
    title: 'Run full loads only',
    desc: 'Washing machines and dishwashers use almost the same energy whether full or half-empty.',
    saving: '~€35/year',
    cost: 'Free',
    effort: 'Habit',
  },
  {
    title: 'Use appliances at off-peak hours',
    desc: 'Running heavy appliances at night or early morning takes advantage of lower electricity tariffs.',
    saving: '~€30/year',
    cost: 'Free',
    effort: 'Habit',
  },
  {
    title: 'Lower water heater to 60°C',
    desc: 'Most boilers are set too high by default. 60°C is safe and significantly reduces energy use.',
    saving: '~€30/year',
    cost: 'Free',
    effort: '2 min',
  },
  {
    title: 'Use cold wash cycle (30°C)',
    desc: 'Around 90% of a washing machine\'s energy goes to heating water. Cold washes clean just as well for most loads.',
    saving: '~€25/year',
    cost: 'Free',
    effort: 'Habit',
  },
  {
    title: 'Close curtains at night',
    desc: 'Heavy curtains act as insulation, reducing heat loss through windows by up to 15% in winter.',
    saving: '~€25/year',
    cost: 'Free',
    effort: 'Habit',
  },
  {
    title: 'Enable power-saving mode',
    desc: 'Enabling sleep and power-saving settings on computers, TVs, and monitors cuts idle consumption.',
    saving: '~€20/year',
    cost: 'Free',
    effort: '5 min',
  },
  {
    title: 'Clean fridge coils yearly',
    desc: 'Dusty condenser coils make your fridge work harder. A quick clean keeps it running efficiently.',
    saving: '~€20/year',
    cost: 'Free',
    effort: '15 min',
  },
  {
    title: 'Use lids when cooking',
    desc: 'Covering pots brings water to the boil 4× faster and keeps heat in, using much less energy.',
    saving: '~€15/year',
    cost: 'Free',
    effort: 'Habit',
  },
]

const ITEMS_PER_PAGE = 4
const TOTAL_PAGES    = Math.ceil(QUICK_WINS.length / ITEMS_PER_PAGE)

//  Energy Tips data 
const TIP_CATEGORIES = ['All', 'Heating & Cooling', 'Lighting', 'Refrigeration', 'Laundry', 'Electronics', 'Water & Cooking', 'Windows & Insulation', 'Solar & Renewables']

const ENERGY_TIPS = [
  // Heating & Cooling
  {
    category: 'Heating & Cooling',
    impact: 'High',
    saving: '~€90/year',
    title: 'Set heating schedules, not just temperatures',
    body: 'Most thermostats let you program different temperatures for different times of day. A simple schedule — lower at night and when you\'re out, warmer in the morning — can reduce heating energy by 10–15% without any sacrifice in comfort. Even a basic programmable thermostat pays for itself within a few months. The key is consistency: manual adjustments throughout the day tend to overcorrect and waste more than they save.',
    automation: 'In Home Assistant, create a Time-based automation with two triggers: one at 22:00 to call climate.set_temperature with a lower target (e.g. 18°C), and one at 06:30 to restore it to your comfort temperature. Use the Generic Thermostat integration if your boiler is controlled via a relay, or connect directly to a Zigbee/Z-Wave thermostat. Adding a Persons condition ensures the schedule stays inactive when everyone is away.',
  },
  {
    category: 'Heating & Cooling',
    impact: 'High',
    saving: '~€80/year',
    title: 'Lower your boiler\'s flow temperature',
    body: 'Most boilers are set to a flow temperature of 75–80°C by default. Lowering this to 55–60°C forces the system to run longer but at lower intensity — which is far more efficient, especially for heat pumps. This single adjustment can improve a heat pump\'s efficiency (COP) by 20–30%. It works best with underfloor heating or oversized radiators, but even standard radiators benefit noticeably at moderate outdoor temperatures.',
    automation: null,
  },
  {
    category: 'Heating & Cooling',
    impact: 'Medium',
    saving: '~€50/year',
    title: 'Zone your heating to rooms you actually use',
    body: 'Heating unoccupied rooms wastes significant energy. Closing doors and fitting thermostatic radiator valves (TRVs) on individual radiators lets you maintain comfortable temperatures only where needed. Studies show that zoning can reduce heating bills by up to 20%. Bedrooms, for example, are typically comfortable at 16–18°C during the day — there\'s no need to heat them to the same level as living areas.',
    automation: 'In Home Assistant, pair Zigbee TRVs (e.g. TRÅDFRI or Sonoff TRVZB) with PIR motion sensors using a state-based automation. Trigger on motion sensor going to "clear" for 30 minutes, then call climate.set_temperature targeting the TRV in that room with a setback temperature (e.g. 16°C). A separate trigger restores the target when motion resumes. Group multiple rooms using HA Areas so a single automation blueprint can cover the whole house.',
  },
  {
    category: 'Heating & Cooling',
    impact: 'High',
    saving: '~€150/year',
    title: 'Loft and roof insulation: the highest-return upgrade',
    body: 'Up to 25% of a home\'s heat escapes through an uninsulated roof. Loft insulation is one of the cheapest and highest-return improvements available — typically costing €300–600 to install and paying back in 2–3 years through heating savings alone. The recommended depth is 270mm of mineral wool for a cold loft. If your loft is already partially insulated to the old 100mm standard, topping it up to 270mm is fast, inexpensive, and noticeably effective. Insulated lofts also make the home more comfortable in summer by reducing heat gain.',
    automation: null,
  },
  {
    category: 'Heating & Cooling',
    impact: 'High',
    saving: '~€300/year',
    title: 'Heat pumps: how they work and why they matter',
    body: 'A heat pump moves heat from outside air (or the ground) into your home rather than generating it by burning fuel, making it 3–4× more efficient than a gas boiler — for every 1 kWh of electricity consumed, it delivers 3–4 kWh of heat. This is measured as the Coefficient of Performance (COP). Air-source heat pumps work down to -20°C and are suitable for retrofits in most homes, especially those with good insulation. The combination of a heat pump and a well-insulated home with solar panels can reduce heating costs to near zero in many European climates.',
    automation: 'In Home Assistant, integrate your heat pump via the Modbus or local API integration (many Mitsubishi, Daikin, and Vaillant units are supported). Create automations that adjust the setpoint based on outdoor temperature forecasts from the Met.no or Open-Meteo integration — pre-heating when electricity is cheap (using an energy tariff sensor) and reducing output when the forecast shows mild weather ahead.',
  },
  {
    category: 'Heating & Cooling',
    impact: 'Low',
    saving: '~€20/year',
    title: 'Radiator reflector panels: a €10 fix with real returns',
    body: 'Radiators mounted on external walls lose a significant portion of their heat through conduction into the cold wall behind them rather than into the room. Reflective foil panels fitted behind the radiator redirect this heat back into the living space. These panels cost just €5–15 per radiator and can be installed in minutes without tools. The effect is most pronounced on poorly insulated external walls and in rooms that feel cold despite the radiator being warm to the touch. An easy win before investing in bigger upgrades.',
    automation: null,
  },
  // Lighting
  {
    category: 'Lighting',
    impact: 'High',
    saving: '~€40/year',
    title: 'Why LED matters beyond the bulb itself',
    body: 'Incandescent bulbs convert only 5% of their energy into light — the rest becomes heat. LED bulbs achieve 80–90% efficiency and maintain consistent brightness over 15,000+ hours of use. Beyond the direct energy savings, less waste heat in summer also slightly reduces your air conditioning load. When replacing bulbs, pay attention to the colour temperature: 2700K gives a warm, incandescent-like feel suitable for living areas, while 4000K is better suited for kitchens and workspaces.',
    automation: null,
  },
  {
    category: 'Lighting',
    impact: 'Medium',
    saving: '~€25/year',
    title: 'Match your lighting control to the space',
    body: 'Motion sensors work well in hallways, bathrooms, and garages where lights are often left on accidentally. For living areas, time-based schedules that adapt to local sunrise and sunset times are more comfortable — lights come on gradually as it gets dark rather than snapping on at a fixed time. Dimming is also underused: running lights at 70% brightness reduces energy by 30% and extends bulb life significantly. Combining dimming with automation gives the most consistent results.',
    automation: 'In Home Assistant, use a motion-based automation with two actions: one triggered when motion clears (wait 10 minutes, then call light.turn_off) and one triggered at sunset to call light.turn_on with brightness set to 40% and a warm colour temperature. The Sun integration provides dynamic sunset times automatically. For hallways and bathrooms, the Light Turn Off with Delay blueprint from the HA community is a well-tested starting point.',
  },
  {
    category: 'Lighting',
    impact: 'Low',
    saving: '~€15/year',
    title: 'Use daylight strategically',
    body: 'Natural light is free, healthier for wellbeing, and has a colour quality that artificial lighting cannot fully replicate. Repositioning furniture near windows, using lighter wall colours, and keeping windows clean can dramatically reduce daytime lighting needs. In winter, south-facing rooms receive significantly more passive solar heat, which also reduces your heating demand at the same time. Skylights and light tubes are more expensive to install but can transform previously dark areas without any ongoing energy cost.',
    automation: null,
  },
  // Refrigeration
  {
    category: 'Refrigeration',
    impact: 'Medium',
    saving: '~€20/year',
    title: 'The right temperature for your fridge and freezer',
    body: 'The EU recommends 4°C for refrigerators and -18°C for freezers — any colder than this wastes energy without meaningfully extending food freshness. Many households run their fridge at 2°C without realising it. Each degree below the optimal setting costs roughly 5% more energy. Check your settings; most people find they can raise the temperature without noticing any difference in food quality. A fridge thermometer costing a few euros is the most reliable way to verify the actual internal temperature.',
    automation: null,
  },
  {
    category: 'Refrigeration',
    impact: 'Medium',
    saving: '~€25/year',
    title: 'Location and airflow around your fridge matter',
    body: 'A fridge placed next to an oven, dishwasher, or in direct sunlight has to work significantly harder to maintain its internal temperature. The condenser coils at the back or underneath need at least 5cm of clearance to dissipate heat efficiently — blocking them forces the compressor to run longer. Accumulated dust on these coils is one of the most common causes of poor fridge efficiency: a 1.5mm layer can increase energy consumption by up to 15%. An annual clean with a vacuum or brush makes a real difference.',
    automation: null,
  },
  {
    category: 'Refrigeration',
    impact: 'Low',
    saving: '~€15/year',
    title: 'Let food cool before refrigerating',
    body: 'Placing hot food directly in the fridge forces the compressor to work harder and temporarily raises the internal temperature, which can affect other stored items. Letting dishes cool to near room temperature first (within 2 hours for food safety) is both safer and more energy-efficient. Similarly, keeping the fridge well-stocked — but not overpacked — helps maintain temperature more consistently: the thermal mass of stored food acts as a buffer against temperature swings when the door is opened.',
    automation: null,
  },
  // Laundry
  {
    category: 'Laundry',
    impact: 'Low',
    saving: '~€15/year',
    title: 'Iron smarter: batch and use residual heat',
    body: 'Irons are high-wattage appliances (1800–2400W) but short-use — the energy cost is modest unless left on unnecessarily. Batching ironing into one session instead of multiple short sessions avoids repeated heat-up cycles. Modern steam irons reach temperature in under a minute, so there is no benefit to preheating early. Turning the iron off 5 minutes before finishing lets the residual heat handle the last few items. For everyday clothes, a clothes steamer or a damp-towel press uses far less energy and is gentler on fabrics.',
    automation: null,
  },
  {
    category: 'Laundry',
    impact: 'High',
    saving: '~€45/year',
    title: 'Cold water washing: the science behind it',
    body: 'Around 90% of a washing machine\'s energy goes into heating water — the drum motor itself uses very little. Modern detergents are specifically formulated to clean effectively at 30°C, and independent tests show that cold washes remove the vast majority of everyday stains just as well as warm washes. Switching from 60°C to 30°C cuts the energy used per cycle by up to 60%. For hygiene-critical items like bedding, towels, or underwear, an occasional 60°C wash remains recommended — but the majority of laundry simply doesn\'t require it.',
    automation: null,
  },
  {
    category: 'Laundry',
    impact: 'High',
    saving: '~€60/year',
    title: 'Drying: the most energy-intensive laundry step',
    body: 'Tumble dryers are among the highest-consuming appliances in a home. Air drying whenever possible eliminates this cost entirely. If using a dryer, heat pump dryer models use 50–60% less energy than conventional condenser dryers by recycling hot air rather than exhausting it. Sensor-drying models that stop automatically when clothes are dry also save significantly compared to timed cycles. Spinning clothes at a higher speed before drying — even for a few extra minutes — removes more water mechanically, which is far cheaper than evaporating it with heat.',
    automation: null,
  },
  // Electronics
  {
    category: 'Electronics',
    impact: 'Medium',
    saving: '~€35/year',
    title: 'Understanding standby power consumption',
    body: 'Standby mode is not the same as off. A modern TV on standby uses 0.5–2W continuously; a games console can draw 10–15W in rest mode. Individually these seem small, but collectively all standby devices in a typical home account for 5–10% of the annual electricity bill. Smart power strips that cut power to peripheral devices when a main device switches off can eliminate phantom loads automatically. For devices that genuinely need to stay on — routers, alarm systems — standby is unavoidable, but entertainment systems rarely need to be.',
    automation: 'In Home Assistant, connect a smart plug (e.g. Shelly Plug S or TP-Link Kasa) to your TV. Create an automation triggered when the TV media player entity state changes to "off" or "standby" — wait 5 minutes, then call switch.turn_off on the plug powering the full entertainment rack. A second automation turns the plug back on when the TV remote is pressed (via a Zigbee button sensor), so everything powers up together.',
  },
  {
    category: 'Electronics',
    impact: 'Medium',
    saving: '~€30/year',
    title: 'Computers and home office energy use',
    body: 'A desktop computer with a large monitor can use 150–300W during active use — comparable to a washing machine cycle running continuously throughout the working day. Enabling sleep mode after 10 minutes of inactivity, reducing screen brightness by 30%, and switching from a desktop to a laptop (which typically uses 5–10× less power) are all significant changes. Monitors left on during calls or meetings where the screen isn\'t needed are a common overlooked source of waste in home offices.',
    automation: 'In Home Assistant, use a Time automation triggered at your usual end-of-day time (e.g. 18:30) to call switch.turn_off on a smart plug connected to your monitor and peripherals. For the PC itself, the Home Assistant companion app for Windows/Linux exposes a shutdown service that can be called from an automation. Add a condition checking that no meeting is active (via a calendar entity or a simple input_boolean you toggle manually) to avoid interrupting late sessions.',
  },
  {
    category: 'Electronics',
    impact: 'Medium',
    saving: '~€25/year',
    title: 'Gaming consoles: rest mode is not off',
    body: 'Modern gaming consoles (PlayStation 5, Xbox Series X) can draw 1–2W in full standby but 50–100W in "rest mode" or "instant-on" mode, where they download updates and maintain a network connection. Switching to full power-off mode when not in use eliminates this drain entirely. Downloads can be scheduled manually or set to run during a short window at night. On PlayStation, disabling "Stay Connected to the Internet" in standby settings alone reduces idle consumption by over 80% compared to full rest mode.',
    automation: 'In Home Assistant, use a smart plug with power monitoring (e.g. Shelly Plus Plug S) on your console. Create an automation that triggers when the plug reports power below 5W for more than 10 minutes (indicating rest mode, not active use) and turns the plug off. A Zigbee button on the shelf turns it back on before gaming. This eliminates rest-mode consumption entirely without requiring manual intervention.',
  },
  {
    category: 'Electronics',
    impact: 'Medium',
    saving: '~€30/year',
    title: 'A smart plug with power monitoring changes how you think about energy',
    body: 'Most people have no idea how much individual appliances actually consume — and the numbers are frequently surprising. A plug-in energy monitor or a smart plug with built-in power measurement (e.g. Shelly Plus Plug S, TP-Link Kasa EP25) gives you real-time watt readings for any device. Running it on a tumble dryer, electric heater, or older fridge for a week gives you accurate annual cost figures. This data often motivates more change than any guide can — seeing that an old fridge costs €90/year while a new A+++ model would cost €25 makes the replacement decision straightforward.',
    automation: 'In Home Assistant, smart plugs with power monitoring expose a sensor entity (e.g. sensor.plug_power). Create a notification automation that alerts you when a specific appliance exceeds a power threshold for longer than expected — useful for detecting if you left an oven on or if a device has entered an unexpected high-draw state.',
  },
  // Water & Cooking
  {
    category: 'Water & Cooking',
    impact: 'Medium',
    saving: '~€30/year',
    title: 'Limescale: the hidden energy thief',
    body: 'Hard water limescale build-up on heating elements is one of the most underestimated sources of energy waste. A 1.5mm layer of limescale on an electric water heater element increases energy consumption by up to 12%. The same applies to kettles, irons, washing machines, and dishwashers. Descaling these appliances annually — using citric acid or a proprietary descaler — keeps them running at their designed efficiency and extends their working life. In hard water areas, a whole-house water softener can pay for itself within a few years.',
    automation: null,
  },
  {
    category: 'Water & Cooking',
    impact: 'Medium',
    saving: '~€25/year',
    title: 'Induction hobs: the most efficient way to cook',
    body: 'Induction hobs transfer 85–90% of their energy directly to the pan through electromagnetic induction, compared to 40–55% for gas and 65% for ceramic hobs. The hob surface itself doesn\'t heat up, which also reduces the amount of waste heat released into the kitchen — lowering the cooling load in summer. Pressure cookers reduce cooking times by up to 70% for stews, grains, and pulses. Combining induction with a pressure cooker represents the most energy-efficient cooking method available for home kitchens.',
    automation: null,
  },
  {
    category: 'Water & Cooking',
    impact: 'Medium',
    saving: '~€35/year',
    title: 'Dishwasher vs hand washing: the numbers',
    body: 'A modern A-rated dishwasher uses approximately 9–11 litres of water and 0.8–1.0 kWh per full cycle. Hand-washing the same load under a running hot tap uses 40–80 litres of water and significantly more energy to heat it. Contrary to intuition, a full dishwasher is more efficient than hand-washing for loads of 6 or more place settings. The key conditions: run only full loads, use the eco programme (which heats water more slowly but uses less energy overall), and skip the heated dry cycle by opening the door at the end.',
    automation: null,
  },
  {
    category: 'Water & Cooking',
    impact: 'Low',
    saving: '~€10/year',
    title: 'The kettle habit: only boil what you need',
    body: 'Electric kettles are one of the most frequently used high-wattage appliances in a home (2000–3000W). Overfilling is the default — most people boil a full kettle for a single cup. Filling only to the level needed can reduce kettle energy use by 50% or more. Keeping a filled water bottle next to the kettle as a reference makes it easier to pour the right amount quickly. For households that boil water repeatedly throughout the day, a hot water dispenser (which keeps water at temperature rather than reheating from cold) can be more efficient overall.',
    automation: null,
  },
  {
    category: 'Water & Cooking',
    impact: 'Low',
    saving: '~€20/year',
    title: 'Hot water habits that add up',
    body: 'The average household spends around 15–20% of its energy bill on hot water. Small behavioural changes compound over time: taking showers instead of baths (a shower typically uses a third of the water), fixing dripping hot taps (which can waste thousands of litres annually), and insulating hot water pipes that run through unheated spaces. Setting the water heater to 60°C rather than 70°C reduces heat loss from the tank and the risk of scalding, while still being hot enough to prevent Legionella bacteria growth.',
    automation: null,
  },
  // Windows & Insulation
  {
    category: 'Windows & Insulation',
    impact: 'High',
    saving: '~€160/year',
    title: 'Cavity wall insulation: one of the best returns in home energy',
    body: 'Around 35% of a home\'s heat loss occurs through uninsulated walls. Cavity wall insulation — where mineral wool or foam is injected into the gap between the inner and outer wall layers — is one of the most cost-effective retrofits available, typically costing €500–1500 and paying back in 3–5 years. Most homes built between 1930 and 1990 have unfilled cavities. A surveyor can confirm suitability in minutes using a borescope. Homes with solid walls require external or internal wall insulation, which is more disruptive but delivers even greater savings.',
    automation: null,
  },
  {
    category: 'Windows & Insulation',
    impact: 'High',
    saving: '~€120/year',
    title: 'Double and triple glazing: what the numbers actually mean',
    body: 'Single-glazed windows have a U-value of around 5.8 W/m²K — meaning they lose heat almost as fast as an open hole in the wall. Double glazing reduces this to 1.2–2.8 W/m²K, and triple glazing to 0.5–0.8 W/m²K. For a typical house with 15m² of window area, upgrading from single to double glazing can save €100–150/year in heating costs. The gap between the panes matters: 16mm argon-filled cavities are the current standard. Low-emissivity (low-e) coatings on the inner pane further reduce radiant heat loss without affecting visible light transmission.',
    automation: null,
  },
  {
    category: 'Windows & Insulation',
    impact: 'Low',
    saving: '~€35/year',
    title: 'Thermal curtains and external blinds',
    body: 'Heavy lined curtains or purpose-made thermal curtains create an insulating air pocket between the room and the cold glass, reducing window heat loss by 15–17%. They are most effective when they reach the floor and have a good seal against the wall at the sides. External roller shutters — common in Southern and Central Europe — are even more effective, as they prevent the glass from cooling in the first place. In summer, external blinds also block solar gain before it enters the glass, reducing the need for cooling significantly more than internal blinds.',
    automation: 'In Home Assistant, automate roller shutters or smart blinds (e.g. Zigbee-based SOMFY or VELUX units) to close at sunset using the Sun integration. Add a summer mode that closes south-facing blinds when outdoor temperature exceeds 25°C and the sun elevation is above 30°, preventing solar overheating before it occurs.',
  },
  // Solar & Renewables
  {
    category: 'Solar & Renewables',
    impact: 'High',
    saving: '~€400/year',
    title: 'Solar PV: realistic expectations and how to maximise returns',
    body: 'A typical 4 kWp rooftop solar installation in Central Europe generates 3500–4500 kWh/year, offsetting €875–1125 at €0.25/kWh. The payback period for a well-sited system is currently 6–9 years, with panels warrantied for 25 years — meaning 15+ years of near-free electricity. Self-consumption is the key metric: electricity you use directly from the panels is worth €0.25/kWh, whereas grid export is typically paid at €0.05–0.10/kWh. Maximising self-consumption — by shifting heavy loads like dishwashers, washing machines, and EV charging to solar peak hours (10:00–15:00) — dramatically improves the economics.',
    automation: 'In Home Assistant, use the Forecast.Solar integration to get hourly solar production predictions. Build automations that trigger high-consumption appliances (via smart plugs or smart appliances) when forecast production exceeds your base load for the next 2 hours. This effectively shifts your load to free solar energy without any manual coordination.',
  },
  {
    category: 'Solar & Renewables',
    impact: 'High',
    saving: '~€200/year',
    title: 'Battery storage: when it makes sense',
    body: 'A home battery (e.g. Tesla Powerwall, SolarEdge, Pylontech) stores surplus solar production for use after dark, increasing self-consumption from a typical 30–40% to 70–80% of total generation. At current prices (€600–900/kWh of usable capacity), batteries have a 10–15 year payback at average EU electricity prices. The economics improve significantly on time-of-use tariffs, where electricity is expensive in the evening peak and cheap overnight — a battery can be charged from cheap overnight grid power and discharged during peak hours even without solar. The key question is whether your tariff has a spread large enough to justify the investment.',
    automation: 'In Home Assistant, combine a battery inverter integration (e.g. GoodWe, Fronius, or Huawei via Modbus) with energy price sensor data from your supplier. Create an automation that forces grid charging during cheap-rate hours (e.g. 00:00–06:00) and switches to battery discharge when the grid price exceeds a threshold. The Energy Dashboard in HA tracks the financial impact over time.',
  },
  {
    category: 'Solar & Renewables',
    impact: 'Medium',
    saving: '~€150/year',
    title: 'Solar thermal: direct hot water from sunlight',
    body: 'Solar thermal collectors heat water directly using sunlight — far more efficiently than solar PV converting sunlight to electricity and then using that electricity to heat water. A 4m² flat-plate collector system can provide 50–70% of a household\'s annual hot water needs in Central and Northern Europe, rising to 80–90% in Southern Europe. Systems typically cost €2000–4000 installed and pay back in 8–12 years. They work well alongside a conventional boiler, which tops up the temperature when solar input is insufficient. Unlike solar PV, there is no export option, so all energy produced must be used — sizing correctly to your actual hot water demand is critical.',
    automation: null,
  },
]

const impactColor = (impact) => {
  if (impact === 'High')   return 'eco-badge-red'
  if (impact === 'Medium') return 'eco-badge-yellow'
  return 'eco-badge-blue'
}

const categoryColor = (cat) => {
  const map = {
    'Heating & Cooling':    'eco-cat-heating',
    'Lighting':             'eco-cat-lighting',
    'Refrigeration':        'eco-cat-refrig',
    'Laundry':              'eco-cat-laundry',
    'Electronics':          'eco-cat-elec',
    'Water & Cooking':      'eco-cat-water',
    'Windows & Insulation': 'eco-cat-cyan',
    'Solar & Renewables':   'eco-cat-solar',
  }
  return map[cat] || 'eco-cat-default'
}

const effortColor = (effort) => {
  if (effort === 'Instant' || effort === '2 min' || effort === '5 min') return 'eco-badge-green'
  if (effort === 'Habit')    return 'eco-badge-blue'
  if (effort === 'One-time') return 'eco-badge-purple'
  return 'eco-badge-muted'
}

const TIPS_PER_PAGE  = 4
const IMPACT_ORDER   = { High: 0, Medium: 1, Low: 2 }

//  Green Score 
const BENCHMARK_KWH = {
  fridge:             14,
  washing_machine:    15,
  dishwasher:         20,
  dryer:              30,
  oven:               15,
  boiler:             150,
  coffee_machine:     6,
  kettle:             10,
  ac:                 55,
  heater:             70,
  heat_pump:          250,
  ventilation_fan:    3,
  ventilation_system: 15,
  heat_recovery:      20,
  lights:             12,
  tv:                 9,
  robot_vacuum:       5,
  ev_charger:         80,
}

const FROM_30D = () => new Date(Date.now() - 30 * 86400 * 1000).toISOString()

const toGrade = s =>
  s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : s >= 25 ? 'E' : s >= 10 ? 'F' : 'G'

const GRADE_COLOR = { A: '#22c55e', B: '#84cc16', C: '#eab308', D: '#f97316', E: '#ef4444', F: '#dc2626', G: '#b91c1c' }

const GRADE_LABEL = {
  A: 'Exceptional',
  B: 'Very efficient',
  C: 'Good',
  D: 'Average — around EU baseline',
  E: 'Below average',
  F: 'Poor',
  G: 'Very poor',
}

const scoreBarColor = score =>
  score >= 70 ? 'var(--status-online)' : score >= 40 ? '#eab308' : 'var(--status-offline)'

// Automation Ideas data 
const AUTO_CATEGORIES     = ['All', 'For You', 'Heating & Cooling', 'Lighting', 'Laundry & Appliances', 'Energy', 'Air Quality', 'Security']
const AUTO_ITEMS_PER_PAGE = 4

const AUTOMATION_IDEAS = [
  // Heating & Cooling
  {
    id: 'heat_window',
    category: 'Heating & Cooling',
    title: 'Turn off heating when a window opens',
    desc: 'Stops heating air that escapes immediately through an open window — one of the most common energy waste patterns.',
    when: 'A window or door sensor reports "open"',
    condition: 'The heater or thermostat is currently active',
    action: 'Set the heater to a setback temperature (e.g. 16°C) for 30 minutes, then restore',
    saving: '~€30/year',
    difficulty: 'Easy',
    requiredTypes: ['heater', 'heat_pump', 'boiler'],
  },
  {
    id: 'heat_away',
    category: 'Heating & Cooling',
    title: 'Reduce heating when everyone leaves home',
    desc: 'Automatically switches to away mode so you\'re not heating an empty house throughout the day.',
    when: 'The last tracked phone leaves the home zone (person state → "not_home")',
    condition: 'Heating is currently active',
    action: 'Set thermostat to away temperature (e.g. 15°C)',
    saving: '~€60/year',
    difficulty: 'Easy',
    requiredTypes: ['heater', 'heat_pump', 'boiler'],
  },
  {
    id: 'heat_prewarm',
    category: 'Heating & Cooling',
    title: 'Pre-heat the home before your alarm',
    desc: 'Your home reaches a comfortable temperature just as you wake up, without heating all night.',
    when: '30 minutes before your set wake-up time (e.g. triggers at 06:00 for a 06:30 alarm)',
    condition: 'It is a weekday',
    action: 'Set thermostat to comfort temperature (e.g. 20°C)',
    saving: '~€25/year',
    difficulty: 'Easy',
    requiredTypes: ['heater', 'heat_pump', 'boiler'],
  },
  {
    id: 'ac_away',
    category: 'Heating & Cooling',
    title: 'Switch AC off when nobody is home',
    desc: 'Air conditioning an empty house is one of the easiest savings to automate.',
    when: 'The last tracked phone leaves the home zone',
    condition: 'AC is currently running',
    action: 'Turn off the air conditioner',
    saving: '~€50/year',
    difficulty: 'Easy',
    requiredTypes: ['ac'],
  },
  {
    id: 'ac_bedtime',
    category: 'Heating & Cooling',
    title: 'Cool the bedroom before sleep',
    desc: 'Pre-cools the room to a comfortable sleeping temperature, then turns off automatically.',
    when: 'Every day at 21:00',
    condition: 'Outdoor temperature is above 22°C',
    action: 'Set bedroom AC to 22°C for 90 minutes, then turn off',
    saving: '~€20/year',
    difficulty: 'Medium',
    requiredTypes: ['ac'],
  },
  {
    id: 'heat_overnight',
    category: 'Heating & Cooling',
    title: 'Alert if heating runs through the night',
    desc: 'Catches the common scenario of forgetting to lower the thermostat before bed.',
    when: 'Every day at 01:00',
    condition: 'Heater power is above 50W',
    action: 'Send a notification: "Heating is still running — is this intentional?"',
    saving: '~€20/year',
    difficulty: 'Easy',
    requiredTypes: ['heater', 'heat_pump'],
  },
  // Lighting
  {
    id: 'light_motion',
    category: 'Lighting',
    title: 'Turn off lights when a room is empty',
    desc: 'Eliminates lights left on in unused rooms — one of the most common energy wastes in homes.',
    when: 'Motion sensor reports no motion for 10 minutes',
    condition: 'Lights are on in that area',
    action: 'Turn off the lights in that room',
    saving: '~€25/year',
    difficulty: 'Easy',
    requiredTypes: ['lights'],
  },
  {
    id: 'light_sunset',
    category: 'Lighting',
    title: 'Dim lights gradually at sunset',
    desc: 'Adapts your lighting to the natural rhythm of daylight, reducing energy use and eye strain.',
    when: 'Local sunset time (auto-calculated daily by Home Assistant)',
    condition: 'Someone is home',
    action: 'Set living area lights to 40% brightness and warm colour temperature (2700K)',
    saving: '~€15/year',
    difficulty: 'Easy',
    requiredTypes: ['lights'],
  },
  {
    id: 'light_away',
    category: 'Lighting',
    title: 'Turn off all lights when leaving home',
    desc: 'A reliable safety net for the lights you always forget about.',
    when: 'The last tracked phone leaves the home zone',
    condition: 'Any light is currently on',
    action: 'Turn off all lights in the home',
    saving: '~€20/year',
    difficulty: 'Easy',
    requiredTypes: ['lights'],
  },
  {
    id: 'light_night',
    category: 'Lighting',
    title: 'Night mode: dim everything after midnight',
    desc: 'Ensures you\'re not burning full-brightness lights while watching TV late or grabbing a glass of water.',
    when: 'Every night at 00:00',
    condition: 'Any light is still on',
    action: 'Dim all lights to 10–15% brightness',
    saving: '~€10/year',
    difficulty: 'Easy',
    requiredTypes: ['lights'],
  },
  // Laundry & Appliances
  {
    id: 'wash_done',
    category: 'Laundry & Appliances',
    title: 'Notify when the washing machine finishes',
    desc: 'Clothes left damp develop odours quickly. A timely alert gets you to them before the smell sets in.',
    when: 'Washing machine power drops below 5W after a cycle (was above 300W)',
    condition: null,
    action: 'Send a notification: "Washing done — time to hang the laundry!"',
    saving: 'convenience',
    difficulty: 'Easy',
    requiredTypes: ['washing_machine'],
  },
  {
    id: 'dryer_done',
    category: 'Laundry & Appliances',
    title: 'Notify when the dryer finishes',
    desc: 'Remove clothes promptly to avoid wrinkles and allow the drum to cool without locking in heat.',
    when: 'Dryer power drops below 5W after a cycle (was above 200W)',
    condition: null,
    action: 'Send a notification: "Dryer finished — remove clothes to avoid wrinkles"',
    saving: 'convenience',
    difficulty: 'Easy',
    requiredTypes: ['dryer'],
  },
  {
    id: 'dishwasher_offpeak',
    category: 'Laundry & Appliances',
    title: 'Remind to run the dishwasher at off-peak hours',
    desc: 'A simple nudge to shift cycles to cheaper night-time electricity tariffs without any manual tracking.',
    when: 'Dishwasher door closes between 08:00 and 21:00',
    condition: 'Current time is within peak electricity hours',
    action: 'Send a notification: "Consider running the dishwasher after 22:00 for cheaper rates"',
    saving: '~€20/year',
    difficulty: 'Medium',
    requiredTypes: ['dishwasher'],
  },
  {
    id: 'appliance_offpeak',
    category: 'Laundry & Appliances',
    title: 'Daily off-peak reminder for heavy appliances',
    desc: 'A consistent daily nudge to move high-consumption loads to cheaper night tariff windows.',
    when: 'Every day at 20:30',
    condition: 'Washing machine or dryer has not run since yesterday at 22:00',
    action: 'Send a notification: "Good time to schedule heavy appliances for after 22:00"',
    saving: '~€25/year',
    difficulty: 'Medium',
    requiredTypes: ['washing_machine', 'dryer', 'dishwasher'],
  },
  // Energy
  {
    id: 'energy_spike',
    category: 'Energy',
    title: 'Alert on unexpected overnight power draw',
    desc: 'Catches devices accidentally left on at night — ovens, space heaters, heat guns.',
    when: 'A monitored device reports power above its normal idle level for 30+ minutes',
    condition: 'Time is between 00:00 and 06:00',
    action: 'Send a notification: "Unusual power draw detected — something may be left on"',
    saving: '~€15/year',
    difficulty: 'Medium',
    requiredTypes: ['heater', 'boiler', 'oven', 'ac'],
  },
  {
    id: 'energy_summary',
    category: 'Energy',
    title: 'Daily energy summary notification',
    desc: 'Builds awareness of consumption patterns without requiring you to open the dashboard.',
    when: 'Every day at 20:00',
    condition: 'Smart meter has logged data today',
    action: 'Send a notification with today\'s kWh total and estimated cost',
    saving: 'awareness',
    difficulty: 'Easy',
    requiredTypes: ['smart_meter'],
  },
  {
    id: 'ev_done',
    category: 'Energy',
    title: 'Stop EV charging when battery is full',
    desc: 'Eliminates standby power draw after the vehicle finishes charging.',
    when: 'EV charger power drops near 0W (charge complete)',
    condition: null,
    action: 'Turn off the EV charger smart plug to eliminate standby consumption',
    saving: '~€10/year',
    difficulty: 'Easy',
    requiredTypes: ['ev_charger'],
  },
  {
    id: 'solar_surplus',
    category: 'Energy',
    title: 'Use solar surplus to run appliances',
    desc: 'Shifts heavy loads to when your panels produce more than you consume — maximising self-consumption.',
    when: 'Solar output exceeds home base load by 1kW for 15 consecutive minutes',
    condition: 'A heavy appliance (washer, dishwasher) has not run today',
    action: 'Send a notification: "Solar surplus available — good time to start an appliance"',
    saving: '~€80/year',
    difficulty: 'Medium',
    requiredTypes: ['solar_panel'],
  },
  // Air Quality
  {
    id: 'vent_co2',
    category: 'Air Quality',
    title: 'Boost ventilation when CO₂ rises',
    desc: 'High CO₂ causes fatigue and poor concentration. This automation responds before you notice the drop.',
    when: 'CO₂ sensor exceeds 1000 ppm',
    condition: 'Ventilation is on low speed or off',
    action: 'Set ventilation to boost speed for 20 minutes, then restore',
    saving: 'health',
    difficulty: 'Easy',
    requiredTypes: ['ventilation_fan', 'ventilation_system', 'heat_recovery'],
  },
  {
    id: 'purifier_aqi',
    category: 'Air Quality',
    title: 'Turn on air purifier when air quality drops',
    desc: 'Responds automatically to cooking fumes, dust spikes, or outdoor pollution events.',
    when: 'Air quality sensor exceeds a PM2.5 or CO₂ threshold',
    condition: 'Air purifier is off',
    action: 'Turn on the air purifier for 30 minutes',
    saving: 'health',
    difficulty: 'Easy',
    requiredTypes: ['air_purifier'],
  },
  {
    id: 'humidity_alert',
    category: 'Air Quality',
    title: 'Alert when indoor humidity is too high',
    desc: 'Sustained humidity above 65% promotes mould growth. Catching it early prevents damage.',
    when: 'Humidity sensor exceeds 65% for 30 consecutive minutes',
    condition: null,
    action: 'Send a notification: "Humidity is high — open a window or run ventilation"',
    saving: 'health',
    difficulty: 'Easy',
    requiredTypes: ['humidifier', 'ventilation_fan', 'sensor_humidity'],
  },
  // Security
  {
    id: 'lock_away',
    category: 'Security',
    title: 'Lock doors automatically when you leave',
    desc: 'Removes the "did I lock the door?" anxiety entirely.',
    when: 'The last tracked phone leaves the home zone',
    condition: 'Any smart lock is in the unlocked state',
    action: 'Lock all smart locks',
    saving: 'security',
    difficulty: 'Easy',
    requiredTypes: ['smart_lock'],
  },
  {
    id: 'garage_open',
    category: 'Security',
    title: 'Alert if garage door is left open',
    desc: 'A common oversight — especially after returning from shopping or parking quickly.',
    when: 'Garage door has been open for more than 30 minutes',
    condition: 'Time is after 22:00 or the last person has left home',
    action: 'Send a notification: "Garage door has been open for 30 min — close it?"',
    saving: 'security',
    difficulty: 'Easy',
    requiredTypes: ['garage_door'],
  },
  {
    id: 'garage_night',
    category: 'Security',
    title: 'Alert if garage opens during the night',
    desc: 'An unexpected garage opening at 2am is worth knowing about immediately.',
    when: 'Garage door sensor changes to "open"',
    condition: 'Time is between 23:00 and 06:00',
    action: 'Send a notification: "Garage door opened at night — please check"',
    saving: 'security',
    difficulty: 'Easy',
    requiredTypes: ['garage_door'],
  },
]

const autoCategoryColor = (cat) => {
  const map = {
    'Heating & Cooling':    'eco-cat-heating',
    'Lighting':             'eco-cat-lighting',
    'Laundry & Appliances': 'eco-cat-laundry',
    'Energy':               'eco-cat-elec',
    'Air Quality':          'eco-cat-cyan',
    'Security':             'eco-cat-refrig',
  }
  return map[cat] || 'eco-cat-default'
}

const difficultyBadge = (d) =>
  d === 'Easy' ? 'eco-badge-green' : d === 'Medium' ? 'eco-badge-yellow' : 'eco-badge-red'

// Component
export default function EcoGuide() {
  usePageTitle('Eco Guide')
  const { selectedHome } = useHome()

  const [page,           setPage]           = useState(0)
  const [activeCategory, setActiveCategory] = useState('All')
  const [tipsPage,       setTipsPage]       = useState(0)
  const [scoreData,      setScoreData]      = useState([])
  const [scoreLoading,   setScoreLoading]   = useState(true)
  const [autoPage,       setAutoPage]       = useState(0)
  const [autoFilter,     setAutoFilter]     = useState('All')
  const [userAppliances, setUserAppliances] = useState(new Set())

  useEffect(() => {
    setAutoPage(0)
    if (!selectedHome) { setScoreLoading(false); setScoreData([]); setUserAppliances(new Set()); return }
    setScoreLoading(true)
    apiFetch(`${API_URL}/homes/${selectedHome.id}/devices`)
      .then(r => r.json())
      .then(async devs => {
        setUserAppliances(new Set(devs.map(d => d.appliance_type).filter(Boolean)))
        const candidates = devs
          .filter(d => d.appliance_type && BENCHMARK_KWH[d.appliance_type])
          .map(d => {
            const ents  = d.entities ?? []
            const kwhE  = ents.find(e => e.unit === 'kWh')
            const wE    = ents.find(e => e.unit === 'W')
            const best  = kwhE ?? wE ?? null
            return best ? { device: d, entity: best, type: kwhE ? 'kwh' : 'watt' } : null
          })
          .filter(Boolean)

        if (!candidates.length) { setScoreData([]); setScoreLoading(false); return }

        const results = await Promise.all(
          candidates.map(({ device, entity, type }) =>
            apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${entity.entity_id}/overview?from=${FROM_30D()}`)
              .then(r => r.json())
              .then(ov => {
                if (!ov || !ov.count) return null
                let actual_kwh
                if (type === 'kwh') {
                  const first = parseFloat(ov.first_value ?? ov.min_value)
                  const last  = parseFloat(ov.period_last_value ?? ov.max_value)
                  actual_kwh  = Math.max(0, last - first)
                } else {
                  actual_kwh = parseFloat(ov.avg_value) * 30 * 24 / 1000
                }
                if (actual_kwh <= 0) return null
                const benchmark = BENCHMARK_KWH[device.appliance_type]
                const score     = Math.max(0, Math.min(100, Math.round(50 * (2 - actual_kwh / benchmark))))
                return {
                  device_id:     device.device_id,
                  name:          inferDeviceName(device.entities),
                  actual_kwh,
                  benchmark_kwh: benchmark,
                  score,
                  grade:         toGrade(score),
                  accuracy:      type,
                }
              })
              .catch(() => null)
          )
        )
        setScoreData(results.filter(Boolean))
        setScoreLoading(false)
      })
      .catch(() => setScoreLoading(false))
  }, [selectedHome])

  const visible      = QUICK_WINS.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE)
  const filteredTips = activeCategory === 'All'
    ? [...ENERGY_TIPS].sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact])
    : ENERGY_TIPS.filter(t => t.category === activeCategory)
  const tipsTotalPages = Math.ceil(filteredTips.length / TIPS_PER_PAGE)
  const visibleTips    = filteredTips.slice(tipsPage * TIPS_PER_PAGE, (tipsPage + 1) * TIPS_PER_PAGE)

  const selectCategory = (cat) => {
    setActiveCategory(cat)
    setTipsPage(0)
  }

  const prev     = () => setPage(p => (p - 1 + TOTAL_PAGES) % TOTAL_PAGES)
  const next     = () => setPage(p => (p + 1) % TOTAL_PAGES)
  const tipsPrev = () => setTipsPage(p => (p - 1 + tipsTotalPages) % tipsTotalPages)
  const tipsNext = () => setTipsPage(p => (p + 1) % tipsTotalPages)

  const gsTotalWeight = scoreData.reduce((s, d) => s + d.benchmark_kwh, 0)
  const gsHomeScore   = gsTotalWeight > 0
    ? Math.round(scoreData.reduce((s, d) => s + d.score * d.benchmark_kwh, 0) / gsTotalWeight)
    : null
  const gsHomeGrade   = gsHomeScore != null ? toGrade(gsHomeScore) : null
  const gsTotalKwh    = scoreData.reduce((s, d) => s + d.actual_kwh, 0)
  const gsCarbonKg    = gsTotalKwh * 0.231

  const filteredIdeas  = autoFilter === 'For You'
    ? AUTOMATION_IDEAS.filter(a => a.requiredTypes.some(t => userAppliances.has(t)))
    : autoFilter === 'All'
      ? AUTOMATION_IDEAS
      : AUTOMATION_IDEAS.filter(a => a.category === autoFilter)
  const autoTotalPages = Math.max(1, Math.ceil(filteredIdeas.length / AUTO_ITEMS_PER_PAGE))
  const visibleIdeas   = filteredIdeas.slice(autoPage * AUTO_ITEMS_PER_PAGE, (autoPage + 1) * AUTO_ITEMS_PER_PAGE)

  const selectAutoFilter = (f) => { setAutoFilter(f); setAutoPage(0) }
  const autoPrev = () => setAutoPage(p => (p - 1 + autoTotalPages) % autoTotalPages)
  const autoNext = () => setAutoPage(p => (p + 1) % autoTotalPages)

  return (
    <div className="content-padding">
      <div className="eco-page">

        {/* Header */}
        <div className="eco-header">
          <h1 className="eco-title">Eco Guide</h1>
          <p className="eco-subtitle">Tips and strategies to reduce your home's energy footprint</p>
        </div>

        {/* Quick Wins */}
        <section className="eco-section">
          <div className="eco-section-header">
            <div>
              <h2 className="eco-section-title">Quick Wins</h2>
              <p className="eco-section-sub">Simple changes with immediate impact — no specialist knowledge required.</p>
              <p className="eco-section-note">Savings are approximate annual estimates based on EU average electricity prices (~€0.25/kWh) and typical household consumption.</p>
            </div>
            <div className="eco-qw-arrows">
              <button className="eco-arrow-btn" onClick={prev} aria-label="Previous">‹</button>
              <span className="eco-page-indicator">{page + 1} / {TOTAL_PAGES}</span>
              <button className="eco-arrow-btn" onClick={next} aria-label="Next">›</button>
            </div>
          </div>

          <div className="eco-qw-grid">
            {visible.map((w, i) => (
              <div key={page * ITEMS_PER_PAGE + i} className="eco-qw-card">
                <h3 className="eco-qw-title">{w.title}</h3>
                <p className="eco-qw-desc">{w.desc}</p>
                <div className="eco-qw-footer">
                  <span className="eco-qw-saving">{w.saving}</span>
                  <div className="eco-qw-badges">
                    <span className={`eco-badge ${w.cost === 'Free' ? 'eco-badge-green' : 'eco-badge-muted'}`}>
                      {w.cost}
                    </span>
                    <span className={`eco-badge ${effortColor(w.effort)}`}>
                      {w.effort}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="eco-qw-dots">
            {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
              <button
                key={i}
                className={`eco-dot ${i === page ? 'eco-dot-active' : ''}`}
                onClick={() => setPage(i)}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>
        </section>

        {/* Green Score */}
        <section className="eco-section">
          <div className="eco-section-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <h2 className="eco-section-title">Green Score</h2>
                <InfoTooltip>
                  Grades are intentionally strict — the goal of GreenNest is to encourage consumption well below the EU average, not just match it. A score of 50 means you're at the European baseline, which is a starting point, not a target. Aim for B or above to make a real impact.
                </InfoTooltip>
              </div>
              <p className="eco-section-sub">How your devices compare to EU average consumption over the last 30 days.</p>
            </div>
          </div>

          {scoreLoading && (
            <div className="gs-empty">Loading consumption data…</div>
          )}

          {!scoreLoading && scoreData.length === 0 && (
            <div className="gs-empty">
              No scorable devices found. Classify your devices in{' '}
              <a href="/devices" className="gs-empty-link">Devices</a>{' '}
              and make sure they have a power or energy entity.
            </div>
          )}

          {!scoreLoading && scoreData.length > 0 && (
            <>
              <div className="gs-summary">
                <div className="gs-circle" style={{ borderColor: GRADE_COLOR[gsHomeGrade] }}>
                  <span className="gs-score-num">{gsHomeScore}</span>
                  <span className="gs-grade-letter" style={{ color: GRADE_COLOR[gsHomeGrade] }}>{gsHomeGrade}</span>
                </div>
                <div className="gs-meta">
                  <div className="gs-grade-label" style={{ color: GRADE_COLOR[gsHomeGrade] }}>
                    {GRADE_LABEL[gsHomeGrade]}
                  </div>
                  <div className="gs-meta-row">
                    <span className="gs-meta-label">Carbon footprint</span>
                    <span className="gs-meta-value">{gsCarbonKg.toFixed(1)} kg CO₂ / month</span>
                  </div>
                  <div className="gs-meta-row">
                    <span className="gs-meta-label">Total consumption</span>
                    <span className="gs-meta-value">{gsTotalKwh.toFixed(1)} kWh / month</span>
                  </div>
                  <div className="gs-meta-row">
                    <span className="gs-meta-label">Devices scored</span>
                    <span className="gs-meta-value">{scoreData.length}</span>
                  </div>
                  <p className="gs-meta-note">Score 0–100 vs EU average. 50 = EU baseline. Weight per device proportional to benchmark consumption.</p>
                </div>
              </div>

              <div className="gs-device-list">
                {[...scoreData].sort((a, b) => a.score - b.score).map(d => (
                  <div key={d.device_id} className="gs-device-row">
                    <div className="gs-device-left">
                      <span className="gs-device-name">{d.name}</span>
                      {d.accuracy === 'watt' && <span className="gs-badge-est">estimated</span>}
                    </div>
                    <div className="gs-bar-wrap">
                      <div
                        className="gs-bar-fill"
                        style={{
                          width:      `${Math.min(100, (d.actual_kwh / d.benchmark_kwh) * 100)}%`,
                          background: scoreBarColor(d.score),
                        }}
                      />
                    </div>
                    <div className="gs-device-right">
                      <span className="gs-device-kwh">{d.actual_kwh.toFixed(1)} / {d.benchmark_kwh} kWh</span>
                      <span className="gs-device-score" style={{ color: GRADE_COLOR[d.grade] }}>{d.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Energy Tips */}
        <section className="eco-section">
          <div className="eco-section-header">
            <div>
              <h2 className="eco-section-title">Energy Tips</h2>
              <p className="eco-section-sub">In-depth guidance on reducing consumption across every area of your home.</p>
              <p className="eco-section-note">Savings are approximate annual estimates based on EU average electricity prices (~€0.25/kWh) and typical household consumption.</p>
            </div>
            {tipsTotalPages > 1 && (
              <div className="eco-qw-arrows">
                <button className="eco-arrow-btn" onClick={tipsPrev} aria-label="Previous">‹</button>
                <span className="eco-page-indicator">{tipsPage + 1} / {tipsTotalPages}</span>
                <button className="eco-arrow-btn" onClick={tipsNext} aria-label="Next">›</button>
              </div>
            )}
          </div>

          <div className="eco-tip-filters">
            {TIP_CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`eco-filter-btn ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => selectCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="eco-tips-grid">
            {visibleTips.map(tip => (
              <div key={tip.title} className="eco-tip-card">
                <div className="eco-tip-header">
                  <span className={`eco-cat-badge ${categoryColor(tip.category)}`}>
                    {tip.category}
                  </span>
                  <div className="eco-tip-meta">
                    <span className={`eco-badge ${impactColor(tip.impact)}`}>{tip.impact}</span>
                    <span className="eco-tip-saving">{tip.saving}</span>
                  </div>
                </div>
                <h3 className="eco-tip-title">{tip.title}</h3>
                <p className="eco-tip-body">{tip.body}</p>
                {tip.automation && (
                  <div className="eco-tip-automation">
                    <span className="eco-tip-automation-label">Home Assistant</span>
                    <p className="eco-tip-automation-text">{tip.automation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {tipsTotalPages > 1 && (
            <div className="eco-qw-dots">
              {Array.from({ length: tipsTotalPages }).map((_, i) => (
                <button
                  key={i}
                  className={`eco-dot ${i === tipsPage ? 'eco-dot-active' : ''}`}
                  onClick={() => setTipsPage(i)}
                  aria-label={`Page ${i + 1}`}
                />
              ))}
            </div>
          )}
        </section>

        {/* Automation Ideas */}
        <section className="eco-section">
          <div className="eco-section-header">
            <div>
              <h2 className="eco-section-title">Automation Ideas</h2>
              <p className="eco-section-sub">Ready-to-build templates for Home Assistant — use these as blueprints in your own setup.</p>
            </div>
            {autoTotalPages > 1 && (
              <div className="eco-qw-arrows">
                <button className="eco-arrow-btn" onClick={autoPrev} aria-label="Previous">‹</button>
                <span className="eco-page-indicator">{autoPage + 1} / {autoTotalPages}</span>
                <button className="eco-arrow-btn" onClick={autoNext} aria-label="Next">›</button>
              </div>
            )}
          </div>

          <div className="eco-tip-filters">
            {AUTO_CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`eco-filter-btn ${autoFilter === cat ? 'active' : ''} ${cat === 'For You' ? 'eco-filter-foryou' : ''}`}
                onClick={() => selectAutoFilter(cat)}
              >
                {cat === 'For You' ? '✦ For You' : cat}
              </button>
            ))}
          </div>

          {autoFilter === 'For You' && (
            <p className="ai-for-you-note">
              Based on the device types you have classified in Devices — we think these automations might suit your setup. This is a suggestion only and depends on what entities are available in your home.
            </p>
          )}

          {visibleIdeas.length === 0 ? (
            <div className="gs-empty">
              {autoFilter === 'For You' && scoreLoading
                ? 'Loading your personalized suggestions…'
                : autoFilter === 'For You'
                  ? <>No personalised ideas yet — classify your devices in <a href="/devices" className="gs-empty-link">Devices</a> to see suggestions.</>
                  : 'No ideas in this category.'}
            </div>
          ) : (
            <div className="ai-grid">
              {visibleIdeas.map(idea => (
                <div key={idea.id} className="ai-card">
                  <div className="ai-card-header">
                    <span className={`eco-cat-badge ${autoCategoryColor(idea.category)}`}>{idea.category}</span>
                    <span className={`eco-badge ${difficultyBadge(idea.difficulty)}`}>{idea.difficulty}</span>
                  </div>
                  <h3 className="ai-card-title">{idea.title}</h3>
                  <p className="ai-card-desc">{idea.desc}</p>
                  <div className="ai-card-flow">
                    <div className="ai-flow-row">
                      <span className="ai-flow-label ai-flow-when">⚡ When</span>
                      <span className="ai-flow-text">{idea.when}</span>
                    </div>
                    {idea.condition && (
                      <div className="ai-flow-row">
                        <span className="ai-flow-label ai-flow-if">✓ And if</span>
                        <span className="ai-flow-text">{idea.condition}</span>
                      </div>
                    )}
                    <div className="ai-flow-row">
                      <span className="ai-flow-label ai-flow-then">→ Then do</span>
                      <span className="ai-flow-text">{idea.action}</span>
                    </div>
                  </div>
                  <div className="ai-card-footer">
                    {idea.saving.startsWith('~€') ? (
                      <span className="ai-saving">{idea.saving}</span>
                    ) : (
                      <span className="ai-saving-alt">{idea.saving.charAt(0).toUpperCase() + idea.saving.slice(1)} benefit</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {autoTotalPages > 1 && (
            <div className="eco-qw-dots">
              {Array.from({ length: autoTotalPages }).map((_, i) => (
                <button
                  key={i}
                  className={`eco-dot ${i === autoPage ? 'eco-dot-active' : ''}`}
                  onClick={() => setAutoPage(i)}
                  aria-label={`Page ${i + 1}`}
                />
              ))}
            </div>
          )}
        </section>

        {/* How to Create an Automation */}
        <section className="eco-section">
          <div className="eco-section-header">
            <div>
              <h2 className="eco-section-title">How to Create an Automation</h2>
              <p className="eco-section-sub">A quick walkthrough of the Home Assistant automation builder.</p>
            </div>
          </div>

          <ol className="ha-steps">
            <li className="ha-step">
              <span className="ha-step-num">1</span>
              <div className="ha-step-content">
                <span className="ha-step-label">Open Home Assistant</span>
                <span className="ha-step-detail">Navigate to <code className="ha-code">http://localhost:8123</code> in your browser.</span>
              </div>
            </li>
            <li className="ha-step">
              <span className="ha-step-num">2</span>
              <div className="ha-step-content">
                <span className="ha-step-label">Go to Settings → Automations &amp; Scenes</span>
                <span className="ha-step-detail">Find it in the left sidebar under Settings.</span>
              </div>
            </li>
            <li className="ha-step">
              <span className="ha-step-num">3</span>
              <div className="ha-step-content">
                <span className="ha-step-label">Create Automation → Create new automation</span>
                <span className="ha-step-detail">Click the blue button in the bottom-right corner, then choose "Create new automation".</span>
              </div>
            </li>
            <li className="ha-step">
              <span className="ha-step-num">4</span>
              <div className="ha-step-content">
                <span className="ha-step-label">Fill in the three sections below, give it a name, and save</span>
                <span className="ha-step-detail">Every automation has a trigger, optional conditions, and one or more actions.</span>
              </div>
            </li>
          </ol>

          <div className="ha-examples-grid">
            <div className="ha-example-col">
              <div className="ha-example-heading">
                <span className="ai-flow-label ai-flow-when">⚡ Trigger</span>
                <span className="ha-example-sub">What starts the automation</span>
              </div>
              <ul className="ha-example-list">
                <li>Time — every day at 07:00</li>
                <li>State change — a light turns on</li>
                <li>Sun — at sunrise or sunset</li>
                <li>Device power — drops below 5W</li>
                <li>Person — arrives home or leaves</li>
                <li>Numeric state — temperature &gt; 25°C</li>
              </ul>
            </div>
            <div className="ha-example-col">
              <div className="ha-example-heading">
                <span className="ai-flow-label ai-flow-if">✓ Condition</span>
                <span className="ha-example-sub">Extra check before acting (optional)</span>
              </div>
              <ul className="ha-example-list">
                <li>Time — only between 08:00 and 22:00</li>
                <li>Person is home / away</li>
                <li>A device is currently on or off</li>
                <li>Sun is below the horizon</li>
                <li>Weather state is "sunny"</li>
                <li>Template — any custom expression</li>
              </ul>
            </div>
            <div className="ha-example-col">
              <div className="ha-example-heading">
                <span className="ai-flow-label ai-flow-then">→ Then do</span>
                <span className="ha-example-sub">What happens when triggered</span>
              </div>
              <ul className="ha-example-list">
                <li>Turn a device on or off</li>
                <li>Set thermostat to a temperature</li>
                <li>Send a mobile notification</li>
                <li>Wait, then do something else</li>
                <li>Run a script or a scene</li>
                <li>Repeat for each item in a list</li>
              </ul>
            </div>
          </div>

          <div className="ha-explore">
            <p className="ha-explore-label">Want to go further?</p>
            <p className="ha-explore-text">
              Home Assistant is endlessly customizable — the community publishes hundreds of blueprints and tutorials every week. The best automations are the ones you invent yourself. Be curious, experiment, and don't be afraid to break things in a test automation first.
            </p>
            <p className="ha-explore-tagline">
              Explore, learn, and be innovative about how you use energy. Small automations, smart habits, and a little curiosity can make a real difference — for your bill and for the planet.
            </p>
            <div className="ha-links">
              <a className="ha-link-btn" href="https://www.home-assistant.io/docs/automation/" target="_blank" rel="noopener noreferrer">Automation Docs</a>
              <a className="ha-link-btn" href="https://www.home-assistant.io/docs/automation/trigger/" target="_blank" rel="noopener noreferrer">Triggers Reference</a>
              <a className="ha-link-btn" href="https://www.home-assistant.io/docs/automation/condition/" target="_blank" rel="noopener noreferrer">Conditions Reference</a>
              <a className="ha-link-btn" href="https://community.home-assistant.io/" target="_blank" rel="noopener noreferrer">Community Forum</a>
              <a className="ha-link-btn" href="https://www.home-assistant.io/docs/blueprint/" target="_blank" rel="noopener noreferrer">Blueprints</a>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
