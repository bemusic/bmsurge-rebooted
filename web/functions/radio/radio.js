const { logger, invariant } = require('tkt')
const { MongoClient } = require('mongodb')

// Docs on event and context https://www.netlify.com/docs/functions/#the-handler-method
exports.handler = async (event, context) => {
  const log = logger('handler')
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json;charset=utf-8'
    },
    body: JSON.stringify(event)
  }
  try {
    const body = JSON.parse(event.body)
    const apiKey = body.apiKey
    if (
      apiKey !==
      (process.env.API_KEY ||
        invariant(false, 'Missing API_KEY environment variable'))
    ) {
      throw new Error('Invalid apiKey provided')
    }
    const client = await connectToMongoDB()
    const songsCollection = client.db().collection('songs')
    const songs = await songsCollection
      .find({ 'renderResult.uploadedAt': { $exists: true } })
      .toArray()
    const random = Math.floor(Math.random() * songs.length)
    const song = songs[random]
    const chart = song.renderResult.selectedChart
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json;charset=utf-8'
      },
      body: JSON.stringify({
        url: `${process.env.MP3_URL_PATTERN.replace(
          '%s',
          song.renderResult.operationId
        )}`,
        streamTitle: `${chart.info.artist} - ${chart.info.title}`
      })
    }
  } catch (err) {
    log.error({ err }, 'Failed to get a stream...')
    return { statusCode: 500, body: err.toString() }
  }
}

async function connectToMongoDB() {
  const log = logger('mongodb')
  log.info('Connecting to MongoDB...')
  const client = new MongoClient(
    process.env.MONGO_URL ||
      invariant(false, 'Missing environment variable: MONGO_URL')
  )
  await client.connect()
  log.info('Connected to MongoDB!')
  return client
}
