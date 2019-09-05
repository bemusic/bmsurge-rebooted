const { logger, invariant } = require('tkt')
const axios = require('axios')

let songCache

// Docs on event and context https://www.netlify.com/docs/functions/#the-handler-method
exports.handler = async (event, context) => {
  const log = logger('handler')
  try {
    const expectedApiKey =
      process.env.API_KEY ||
      invariant(false, 'Missing API_KEY environment variable')
    const expectedAuth = `Basic ${Buffer.from(`api:${expectedApiKey}`).toString(
      'base64'
    )}`
    if (event.headers['authorization'] !== expectedAuth) {
      return {
        statusCode: 401,
        body: 'Unauthorized'
      }
    }
    switch (event.path) {
      case '/.netlify/functions/radio/getSong':
        return await getSong(event)
      default:
        return {
          statusCode: 404,
          body: 'Unknown path'
        }
    }
  } catch (err) {
    log.error({ err }, 'Failed to get a stream...')
    return { statusCode: 500, body: err.toString() }
  }
}

async function getSong(_event) {
  const songs =
    songCache || (songCache = (await axios.get(process.env.SONGLIST_URL)).data)
  const random = Math.floor(Math.random() * songs.length)
  const song = songs[random]
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json;charset=utf-8'
    },
    body: JSON.stringify({
      url: `${process.env.MP3_URL_PATTERN.replace('%s', song.fileId)}`,
      streamTitle: `${song.artist} - ${song.title}`
    })
  }
}
