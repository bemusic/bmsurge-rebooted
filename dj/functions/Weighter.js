const Bsearch = require('bsearch')
/**
 * @param {number[]} weights
 * @returns {(fraction: number) => number}
 */
exports.createWeightedIndexer = function createWeightedIndexer(weights) {
  /** @type {number[]} */
  const data = []
  let cumulative = 0
  let total = weights.reduce((a, w) => a + w, 0)
  weights.forEach(w => {
    data.push(cumulative / total)
    cumulative += w
  })
  return Bsearch(data)
}
