const express = require('express')
const router  = express.Router()
const path    = require('path')

const DATA_DIR = path.join(__dirname, '../data')

function loadJson(filename) {
  try {
    return require(path.join(DATA_DIR, filename))
  } catch {
    return null
  }
}

const CONFIG_VERSION = '1.5.0'

// GET /config — static config data, version-checked by client
router.get('/', (_req, res) => {
  res.json({
    _version:        CONFIG_VERSION,
    deviceTypes:     loadJson('deviceTypes.json'),
    recommendations: loadJson('recommendations.json'),
    thresholds:      loadJson('thresholds.json'),
    healthRules:     loadJson('healthRules.json'),
    benchmarks:      loadJson('benchmarks.json'),
  })
})

module.exports = router
