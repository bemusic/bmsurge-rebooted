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
      return process(args.url, args.output)
    }
  )
  .parse()

/**
 * @param {string} url
 * @param {string} outputMp3Path
 */
async function process(url, outputMp3Path) {
  const log = logger('process')
  const workDir = `/tmp/bmsurge-renderer/${ObjectID.default.generate()}`
  const outputDiagnostics = {}
  try {
    log.info('Using working directory: %s', workDir)
    outputDiagnostics.workingDirectory = workDir

    log.info('Downloading archive from: %s', url)
    const downloadDir = `${workDir}/downloads`
    mkdirp.sync(downloadDir)
    const downloadedFilePath = `${workDir}/downloads/archive.zip`
    await execLog('wget', [`-O${downloadedFilePath}`, url], {
      timeout: 120000
    })

    const extractedDir = `${workDir}/extracted`
    log.info('Extracting archive to: %s', extractedDir)
    mkdirp.sync(extractedDir)
    await execLog('7z', ['x', downloadedFilePath], {
      timeout: 60000,
      cwd: extractedDir
    })

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

    log.info('Converting sound files to 44khz')
    const convertedDir = `${workDir}/render/song`
    await prepareSounds(extractedDir, convertedDir)

    log.info('Moving chart files')
    const chartFiles = glob.sync('*.{bm[sel],pms,bmson}', {
      nocase: true,
      cwd: extractedDir
    })
    for (const file of chartFiles) {
      const extname = path.extname(file)
      const target = `${convertedDir}/${path.basename(
        file,
        extname
      )}.sjis${extname}`
      fs.renameSync(`${extractedDir}/${file}`, target)
      log.debug('Moved to %s', target)
    }

    log.info('Indexing BMS files...')
    await execLog(
      fs.realpathSync('./node_modules/.bin/bemuse-tools'),
      ['index'],
      {
        timeout: 30000,
        cwd: `${workDir}/render`
      }
    )

    const data = JSON.parse(
      fs.readFileSync(`${workDir}/render/index.json`, 'utf8')
    )
    const song = data.songs.find(s => s.id === 'song')
    if (!song) {
      throw new Error('No song found')
    }
    const charts = song.charts
    log.info('Found %s charts', charts.length)
    if (!charts.length) {
      throw new Error('No usable chart found')
    }
    charts.sort((a, b) => a.noteCount - b.noteCount)
    const selectedChart = charts[Math.floor((charts.length - 1) / 2)]
    log.info({ selectedChart }, 'Selected chart: %s', selectedChart.file)

    const sourceBmsPath = `${workDir}/render/song/${selectedChart.file}`
    const temporaryWavPath = `${workDir}/render.wav`
    log.info('Rendering "%s" to "%s"...', sourceBmsPath, temporaryWavPath)
    const songWavPath = `${workDir}/song.wav`
    const songMp3Path = `${workDir}/song.mp3`
    await execLog('bms-renderer', [sourceBmsPath, temporaryWavPath], {
      timeout: 300000,
      cwd: workDir
    })

    log.info('Normalizing...')
    await execLog('wavegain', ['-y', temporaryWavPath], {
      timeout: 15000,
      cwd: workDir
    })

    log.info('Trimming...')
    await execLog(
      'sox',
      [
        temporaryWavPath,
        ...['-b', '16', songWavPath],
        ...['silence', '1', '0', '0.1%'],
        'reverse',
        ...['silence', '1', '0', '0.1%'],
        'reverse'
      ],
      { cwd: workDir, timeout: 30000 }
    )
    fs.unlinkSync(temporaryWavPath)

    log.info('Converting to MP3...')
    await execLog('lame', ['-b320', songWavPath, songMp3Path], {
      timeout: 60000
    })
    fs.unlinkSync(songWavPath)

    if (outputMp3Path) {
      await execLog('mv', [songMp3Path, outputMp3Path], {})
    }
  } catch (error) {
    log.error({ err: error })
  }
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

async function prepareSounds(src, dest) {
  const log = logger('prepareSounds')
  log.info({ src, dest }, 'Preparing sounds')
  mkdirp.sync(dest)

  // bmsampler requires all sounds to be stereo 44.1khz
  const sounds = glob.sync('*.{wav,mp3,ogg}', {
    nocase: true,
    cwd: src
  })
  log.info('Found %d sound file(s)', sounds.length)

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
        log.warn(
          "[CONVERSION WARNING] prepare phase: Cannot convert sound file '%s': %s",
          sourceFile,
          e
        )
        resultLogText = 'error'
        if (e.stderr) stderr = e.stderr
      } finally {
        log.info(
          stderr ? { stderr } : {},
          'Converted audio (%d/%d) "%s" [%s]',
          ++soundsConverted,
          sounds.length,
          sound,
          resultLogText
        )
        fs.unlinkSync(sourceFile)
      }
    },
    { concurrency: require('os').cpus().length }
  )
}
