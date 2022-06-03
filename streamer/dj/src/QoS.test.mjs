import { getTimeToEnqueue } from './QoS.mjs'

const settings = { margin: 10, insertSpace: 16 }

it('queues at T+margin first time', () => {
  expect(getTimeToEnqueue(100, [], settings)).toBe(110)
})
it('takes the playhead from others’ requested times', () => {
  expect(
    getTimeToEnqueue(100, [], {
      ...settings,
      allRequestedTimes: [400, 411, 422, 432],
    })
  ).toBe(401)
  expect(
    getTimeToEnqueue(100, [], {
      ...settings,
      allRequestedTimes: [400, 409, 422, 432],
    })
  ).toBe(410)
  expect(
    getTimeToEnqueue(100, [], {
      ...settings,
      allRequestedTimes: [400, 402, 411, 422, 432],
    })
  ).toBe(403)
  expect(
    getTimeToEnqueue(100, [], {
      ...settings,
      allRequestedTimes: [400, 402, 403, 411, 422, 432],
    })
  ).toBe(404)
})
it('appends to queue when queued requests are dense', () => {
  expect(getTimeToEnqueue(101, [108], settings)).toBe(118)
  expect(getTimeToEnqueue(102, [108, 118], settings)).toBe(128)
})
it('inserts to queue when queued requests are sparse', () => {
  expect(getTimeToEnqueue(103, [108, 118, 138], settings)).toBe(128)
})
