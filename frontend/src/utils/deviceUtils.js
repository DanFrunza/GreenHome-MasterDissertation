export function inferDeviceName(entities) {
  if (!entities?.length) return 'Unknown Device'
  if (entities.length === 1) return entities[0].friendly_name || 'Unknown Device'
  const words = entities.map(e => (e.friendly_name || '').split(' '))
  let prefix = words[0]
  for (let i = 1; i < words.length; i++) {
    let j = 0
    while (j < prefix.length && j < words[i].length && prefix[j] === words[i][j]) j++
    prefix = prefix.slice(0, j)
  }
  return prefix.join(' ') || entities[0].friendly_name || 'Unknown Device'
}

export function shortLabel(friendlyName, deviceName) {
  const stripped = friendlyName?.startsWith(deviceName)
    ? friendlyName.slice(deviceName.length).trim()
    : friendlyName
  return stripped || friendlyName
}
