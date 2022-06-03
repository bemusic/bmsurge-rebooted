import { createWeightedIndexer } from './Weighter.mjs'

it('works for simple cases', () => {
  const getIndex = createWeightedIndexer([50, 50])
  expect(getIndex(0.2)).toBe(0)
  expect(getIndex(0.8)).toBe(1)
})

it('works for boundary values', () => {
  {
    const getIndex = createWeightedIndexer([50, 50])
    expect(getIndex(0)).toBe(0)
    expect(getIndex(0.499999)).toBe(0)
    expect(getIndex(0.5)).toBe(1)
    expect(getIndex(1)).toBe(1)
  }
  {
    const getIndex = createWeightedIndexer([1, 1, 1])
    expect(getIndex(0)).toBe(0)
    expect(getIndex(0.33333)).toBe(0)
    expect(getIndex(0.33334)).toBe(1)
    expect(getIndex(0.66666)).toBe(1)
    expect(getIndex(0.66667)).toBe(2)
    expect(getIndex(1)).toBe(2)
  }
})
