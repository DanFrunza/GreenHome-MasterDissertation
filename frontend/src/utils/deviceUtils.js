export function inferDeviceName(entities) {
  if (!entities?.length) return 'Unknown Device'
  if (entities.length === 1) return entities[0].friendly_name || 'Unknown Device'

  // 1. Try common prefix across friendly_names (original behaviour, works for most devices)
  const named = entities.filter(e => e.friendly_name)
  if (named.length > 0) {
    const words = named.map(e => e.friendly_name.split(' '))
    let prefix = words[0]
    for (let i = 1; i < words.length; i++) {
      let j = 0
      while (j < prefix.length && j < words[i].length && prefix[j] === words[i][j]) j++
      prefix = prefix.slice(0, j)
    }
    const name = prefix.join(' ').trim()
    if (name) return name
  }

  // 2. Fallback: derive from common entity_id suffix prefix.
  //    e.g. "bathroom_washing_machine_overcurrent" → common prefix "bathroom_washing_machine"
  //    → "Bathroom Washing Machine"
  const ids = entities.map(e => (e.entity_id || '').split('.')[1] || '').filter(Boolean)
  if (ids.length) {
    let idPrefix = ids[0]
    for (const id of ids.slice(1)) {
      let i = 0
      while (i < idPrefix.length && i < id.length && idPrefix[i] === id[i]) i++
      idPrefix = idPrefix.slice(0, i)
    }
    idPrefix = idPrefix.replace(/_+$/, '')
    if (idPrefix) return idPrefix.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  return entities.find(e => e.friendly_name)?.friendly_name || 'Unknown Device'
}

export function shortLabel(friendlyName, deviceName) {
  const stripped = friendlyName?.startsWith(deviceName)
    ? friendlyName.slice(deviceName.length).trim()
    : friendlyName
  return stripped || friendlyName
}
