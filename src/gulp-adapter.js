import Vinyl from 'vinyl'
import { Bacon } from 'sigh-core'
import { Transform } from 'stream'

import Event from './Event'

export default gulpPlugin => adapter.bind(null, gulpPlugin)

function adapter(gulpPlugin, op, ...args) {
  var sink
  var gulpAdaptedStream = Bacon.fromBinder(_sink => { sink = _sink })

  var onGulpValue = vinyl => {
    var { __source: source } = vinyl
    if (! source)
      return new Bacon.Error('gulp plugin lost source, may not be compatible with sigh')

    source.data = vinyl.contents.toString()
    source.sourceMap = vinyl.sourceMap

    sink([ source ])
  }

  var gulpInStream = new Transform({ objectMode: true })
  var gulpOutStream = gulpInStream.pipe(gulpPlugin(...args))
  gulpOutStream.on('data', onGulpValue)

  var passThroughStream = op.stream.flatMap(events => {
    var passThroughEvents = []
    events = events.filter(event => {
      if (event.type === 'change' || event.type === 'add')
        return true
      passThroughEvents.push(event)
      return false
    })

    if (events.length !== 0) {
      events.forEach(event => {
        var vinyl = new Vinyl({
          contents: new Buffer(event.data),
          path: event.projectPath,
          base: event.basePath,
        })

        // the next cannot be attached via the constructor
        vinyl.sourceMap = event.sourceMap

        // something to help...
        vinyl.__source = event
        gulpInStream.push(vinyl)
      })
    }

    return passThroughEvents.length === 0 ? Bacon.never() : passThroughEvents
  })

  // If I use map instead of flatMap then the function never gets called...
  var terminateStream = op.stream.take(1).flatMap(() => {
    op.stream.onEnd(() => {
      gulpOutStream.removeListener('data', onGulpValue)
      sink(new Bacon.End())
    })
    return new Bacon.End()
  })

  return Bacon.mergeAll(gulpAdaptedStream, passThroughStream, terminateStream)
}
