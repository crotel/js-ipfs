'use strict'

const CID = require('cids')
const configure = require('../lib/configure')
const toUrlSearchParams = require('../lib/to-url-search-params')

/**
 * @typedef {import('../types').HTTPClientExtraOptions} HTTPClientExtraOptions
 * @typedef {import('ipfs-core-types/src/dag').API<HTTPClientExtraOptions>} DAGAPI
 */

module.exports = configure(api => {
  /**
   * @type {DAGAPI["export"]}
   */
  async function * dagExport (root, options = {}) {
    const arg = new CID(root).toString()
    const res = await api.post('dag/export', {
      timeout: options.timeout,
      signal: options.signal,
      searchParams: toUrlSearchParams({ arg }),
      headers: options.headers
    })

    yield * res.iterator()
  }

  return dagExport
})
