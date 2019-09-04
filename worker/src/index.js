// @ts-check
const { cli, logger } = require('tkt')
const execa = require('execa')
const ObjectID = require('bson-objectid')
const readline = require('readline')
const fs = require('fs')
const mkdirp = require('mkdirp')
const glob = require('glob')
const path = require('path')
const Bluebird = require('bluebird')
const rimraf = require('rimraf')
const isUtf8 = require('isutf8')

cli()
  .command(
    'render <url>',
    'Render BMS from the BMS URL',
    {
      url: {
        desc: 'URL of the package to extract',
        type: 'string'
      },
      output: {
        desc: 'Output MP3 file',
        type: 'string',
        alias: ['o']
      }
    },
    async args => {
      /** @type {OutputDiagnostics} */
      const result = { events: [], warnings: [] }
      const log = logger('render:cli')
      await render(args.url, args.output, result)
      log.info({ result }, 'Finished')
    }
  )
  .command('server', 'Starts a rendering server', {}, async args => {
    const port = +process.env.PORT || 8080
    const app = require('express')()
    const log = logger('server')
    const { Storage } = require('@google-cloud/storage')
    const storage = new Storage()
    app.use(require('body-parser').json())
    app.put('/renders/:operationId', async (req, res, next) => {
      try {
        const url = req.body.url
        if (!/^http/.test(url)) return res.status(400).send('URL must be valid')

        res.set('Content-Type', 'application/x-ndjson')
        res.flushHeaders()

        const operationId = req.params.operationId
        const opLog = log.child(operationId)
        opLog.info({ url }, 'Handling request')

        /** @type {OutputDiagnostics} */
        const result = { operationId, events: [], warnings: [] }

        const writeStatus = () => {
          res.write(JSON.stringify({ time: Date.now(), ...result }) + '\n')
          // @ts-ignore
          res.flush()
        }
        writeStatus()
        const interval = setInterval(writeStatus, 5000)

        await render(req.body.url, null, result)
        opLog.info({ result }, 'Render result')
        const bucketName = process.env.BMSURGE_RENDER_OUTPUT_BUCKET
        if (result.outFile) {
          opLog.info('Uploading file')
          await storage.bucket(bucketName).upload(result.outFile, {
            destination: `${operationId}.mp3`,
            resumable: false
          })
          opLog.info('Uploading finish')
          eventLog(result, 'uploaded')
          result.uploadedAt = Date.now()
        }
        if (result.workingDirectory) {
          rimraf.sync(result.workingDirectory)
        }
        writeStatus()
        clearInterval(interval)
        res.end()
      } catch (err) {
        next(err)
      }
    })
    app.listen(port, function() {
      log.info('App is listening on port', port)
    })
  })
  .parse()

/**
 * @typedef {import('./types').OutputDiagnostics} OutputDiagnostics
 */

/**
 * @param {string} url
 * @param {string|null} outputMp3Path
 * @param {OutputDiagnostics} outputDiagnostics
 */
async function render(
  url,
  outputMp3Path,
  outputDiagnostics = { events: [], warnings: [] }
) {
  const log = logger('render')
  const workDir = `/tmp/bmsurge-renderer/${ObjectID.default.generate()}`
  eventLog(outputDiagnostics, 'render:start')
  try {
    log.info('Using working directory: %s', workDir)
    outputDiagnostics.workingDirectory = workDir

    log.info('Downloading archive from: %s', url)
    const downloadDir = `${workDir}/downloads`
    mkdirp.sync(downloadDir)
    const downloadedFilePath = `${workDir}/downloads/archive.zip`
    await execLog(
      'wget',
      [`-O${downloadedFilePath}`, '--progress=dot:mega', url],
      {
        timeout: 120000
      }
    )
    eventLog(outputDiagnostics, 'render:downloaded')
    outputDiagnostics.archiveSize = fs.statSync(downloadedFilePath).size

    const extractedDir = `${workDir}/extracted`
    log.info('Extracting archive to: %s', extractedDir)
    mkdirp.sync(extractedDir)
    await execLog('7z', ['x', downloadedFilePath], {
      timeout: 60000,
      cwd: extractedDir
    })
    eventLog(outputDiagnostics, 'render:extracted')
    rimraf.sync(downloadDir)

    log.info('Removing unrelated files to save space...')
    const allFiles = glob.sync('**/*', {
      cwd: extractedDir,
      nodir: true
    })
    for (const filePath of allFiles) {
      if (!/\.(?:bms|bme|bml|pms|bmson|ogg|wav|mp3)/i.test(filePath)) {
        log.debug('Removing %s', filePath)
        fs.unlinkSync(`${extractedDir}/${filePath}`)
      }
    }
    eventLog(outputDiagnostics, 'render:unrelatedFilesRemoved')

    log.info('Converting sound files to 44khz')
    const convertedDir = `${workDir}/render/song`
    await prepareSounds(extractedDir, convertedDir, outputDiagnostics)
    eventLog(outputDiagnostics, 'render:converted')

    log.info('Moving chart files')
    const chartFiles = glob.sync('*.{bm[sel],pms,bmson}', {
      nocase: true,
      cwd: extractedDir
    })
    const reverseFilenameMap = new Map()
    for (const sourceName of chartFiles) {
      const sourceFilepath = `${extractedDir}/${sourceName}`
      const extname = path.extname(sourceName)
      let targetName = path.basename(sourceName)
      if (!isUtf8(fs.readFileSync(sourceFilepath))) {
        targetName = `${path.basename(sourceName, extname)}.sjis${extname}`
      }
      reverseFilenameMap.set(targetName, sourceName)
      const targetFilepath = `${convertedDir}/${targetName}`
      fs.renameSync(sourceFilepath, targetFilepath)
      log.debug('Moved to %s', targetFilepath)
    }
    eventLog(outputDiagnostics, 'render:chartsMoved')
    rimraf.sync(extractedDir)

    log.info('Indexing BMS files...')
    await execLog(
      fs.realpathSync('./node_modules/.bin/bemuse-tools'),
      ['index'],
      {
        timeout: 30000,
        cwd: `${workDir}/render`
      }
    )
    eventLog(outputDiagnostics, 'render:indexed')

    const data = JSON.parse(
      fs.readFileSync(`${workDir}/render/index.json`, 'utf8')
    )
    const song = data.songs.find(s => s.id === 'song')
    if (!song) {
      throw new Error('No song found')
    }
    const serializeChart = chart => ({
      ...chart,
      file: reverseFilenameMap.get(chart.file) || chart.file,
      fileSize: fs.statSync(`${workDir}/render/song/${chart.file}`).size
    })
    const charts = song.charts
    log.info('Found %s charts', charts.length)
    outputDiagnostics.availableCharts = charts.map(serializeChart)
    if (!charts.length) {
      throw new Error('No usable chart found')
    }
    charts.sort((a, b) => a.noteCount - b.noteCount)
    const selectedChart = charts[Math.floor((charts.length - 1) / 2)]
    log.info({ selectedChart }, 'Selected chart: %s', selectedChart.file)
    eventLog(outputDiagnostics, 'render:chartSelected')
    outputDiagnostics.selectedChart = serializeChart(selectedChart)

    const sourceBmsPath = `${workDir}/render/song/${selectedChart.file}`
    const temporaryWavPath = `${workDir}/render.wav`
    log.info('Rendering "%s" to "%s"...', sourceBmsPath, temporaryWavPath)
    const songWavPath = `${workDir}/song.wav`
    const songMp3Path = `${workDir}/song.mp3`
    await execLog('bms-renderer', ['--full', sourceBmsPath, temporaryWavPath], {
      timeout: 300000,
      cwd: workDir
    })
    eventLog(outputDiagnostics, 'render:rendered')
    outputDiagnostics.wavSize = fs.statSync(temporaryWavPath).size
    rimraf.sync(`${workDir}/render`)

    log.info('Normalizing...')
    const normalizationResult = await execLog(
      'wavegain',
      ['-y', temporaryWavPath],
      {
        timeout: 15000,
        cwd: workDir
      }
    )
    eventLog(outputDiagnostics, 'render:normalized')
    const replayGainMatch = /Applying Gain of\s+(\S+)\s+dB/.exec(
      normalizationResult.stderr
    )
    if (replayGainMatch) {
      outputDiagnostics.replayGain = +replayGainMatch[1]
    }

    log.info('Coverting to 16bit...')
    const bitcrushedWavPath = `${workDir}/render16bit.wav`
    await execLog('sox', [temporaryWavPath, '-b', '16', bitcrushedWavPath], {
      cwd: workDir,
      timeout: 30000
    })
    outputDiagnostics.wavSizeBeforeTrim = fs.statSync(bitcrushedWavPath).size
    fs.unlinkSync(temporaryWavPath)

    log.info('Trimming start of audio...')
    const trimStartWavPath = `${workDir}/render-trimmed.wav`
    await execLog(
      'sox',
      [bitcrushedWavPath, trimStartWavPath, 'silence', '1', '0', '0.1%'],
      {
        cwd: workDir,
        timeout: 30000
      }
    )
    outputDiagnostics.wavSizeAfterTrimStart = fs.statSync(trimStartWavPath).size
    fs.unlinkSync(bitcrushedWavPath)

    log.info('Trimming end of audio...')
    await execLog(
      'sox',
      [
        trimStartWavPath,
        songWavPath,
        'reverse',
        ...['silence', '1', '0', '0.1%'],
        'reverse'
      ],
      { cwd: workDir, timeout: 30000 }
    )
    outputDiagnostics.wavSizeAfterTrimEnd = fs.statSync(songWavPath).size
    fs.unlinkSync(trimStartWavPath)
    eventLog(outputDiagnostics, 'render:trimmed')

    log.info('Converting to MP3...')
    await execLog('lame', ['-b320', songWavPath, songMp3Path], {
      timeout: 60000
    })
    fs.unlinkSync(songWavPath)
    eventLog(outputDiagnostics, 'render:encoded')
    outputDiagnostics.outSize = fs.statSync(songMp3Path).size
    outputDiagnostics.outFile = songMp3Path
    if (outputMp3Path) {
      await execLog('mv', [songMp3Path, outputMp3Path], {})
      outputDiagnostics.outFile = outputMp3Path
    }
  } catch (error) {
    log.error({ err: error })
    outputDiagnostics.error = String(error && error.stack)
  } finally {
    outputDiagnostics.finishedAt = Date.now()
  }
  return outputDiagnostics
}
/**
 *
 * @param {string} command
 * @param {string[]} args
 * @param {import('execa').Options} options
 */
function execLog(command, args, options) {
  const process = execa(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  })
  async function spawnReader(stream, log) {
    if (!stream) return
    try {
      const reader = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      })
      for await (const line of reader) {
        log.info(`> ${line}`)
      }
    } catch (e) {
      log.error('Error while reading: %s', e)
    }
  }
  const topLog = logger(path.basename(command))
  spawnReader(process.stdout, topLog.child('out'))
  spawnReader(process.stderr, topLog.child('err'))
  return process
}

/**
 * @param {string} src
 * @param {string} dest
 * @param {OutputDiagnostics} outputDiagnostics
 */
async function prepareSounds(src, dest, outputDiagnostics) {
  const log = logger('prepareSounds')
  log.info({ src, dest }, 'Preparing sounds')
  mkdirp.sync(dest)

  // bmsampler requires all sounds to be stereo 44.1khz
  const sounds = glob.sync('*.{wav,mp3,ogg}', {
    nocase: true,
    cwd: src
  })
  log.info('Found %d sound file(s)', sounds.length)
  log.info('Available CPUs', require('os').cpus().length)

  // Convert sounds
  let soundsConverted = 0
  await Bluebird.map(
    sounds,
    async sound => {
      const sourceFile = path.join(src, sound)
      let resultLogText = '???'
      let stderr = ''
      try {
        if (fs.statSync(sourceFile).size === 0) {
          warningLog(
            outputDiagnostics,
            `Found blank sound file at '${sourceFile}'`
          )
          resultLogText = 'skip; blank file'
          return
        }
        const result = await execa('sox', [
          sourceFile,
          '-r',
          '44.1k',
          '-c',
          '2',
          path.join(dest, path.basename(sound, path.extname(sound)) + '.wav')
        ])
        stderr = result.stderr
        resultLogText = 'ok'
      } catch (e) {
        warningLog(
          outputDiagnostics,
          `Cannot convert sound file '${sourceFile}': ${e}`
        )
        log.warn(
          "[CONVERSION WARNING] prepare phase: Cannot convert sound file '%s': %s",
          sourceFile,
          e
        )
        resultLogText = 'error'
        if (e.stderr) stderr = e.stderr
      } finally {
        const message = require('util').format(
          'Converted audio (%d/%d) "%s" [%s]',
          ++soundsConverted,
          sounds.length,
          sound,
          resultLogText
        )
        log.debug(stderr ? { stderr } : {}, message)
        outputDiagnostics.soundConversationStatus = message
        fs.unlinkSync(sourceFile)
      }
    },
    { concurrency: 1 }
  )
  outputDiagnostics.soundConversationStatus = 'All done'
}
/**
 * @param {OutputDiagnostics} outputDiagnostics
 * @param {string} event
 */
function eventLog(outputDiagnostics, event) {
  outputDiagnostics.events.push({ time: Date.now(), event })
}

/**
 * @param {OutputDiagnostics} outputDiagnostics
 * @param {string} message
 */
function warningLog(outputDiagnostics, message) {
  outputDiagnostics.warnings.push({ time: Date.now(), message })
}
