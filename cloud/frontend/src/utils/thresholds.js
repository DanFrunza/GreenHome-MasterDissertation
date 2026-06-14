export function getThresholds(deviceClass, thresholdsData) {
  if (!thresholdsData) return null
  return thresholdsData[deviceClass] ?? null
}
