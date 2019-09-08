const { getTimeToEnqueue } = require('./QoS')
const settings = { margin: 10, insertSpace: 16 }

it('queues at T+margin first time', () => {
  expect(getTimeToEnqueue(100, [], settings)).toBe(110)
})
it('appends to queue when queued requests are dense', () => {
  expect(getTimeToEnqueue(101, [108], settings)).toBe(118)
  expect(getTimeToEnqueue(102, [108, 118], settings)).toBe(128)
})
it('inserts to queue when queued requests are sparse', () => {
  expect(getTimeToEnqueue(103, [108, 118, 138], settings)).toBe(128)
})
