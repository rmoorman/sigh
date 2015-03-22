import fs from 'fs'
import _ from 'lodash'
import Promise from 'bluebird'
import rewire from 'rewire'
import path from 'path'

import PipelineCompiler from './PipelineCompiler'
import merge from './plugin/merge'
import babel from './plugin/babel'
import concat from './plugin/concat'
import debounce from './plugin/debounce'
import env from './plugin/env'
import glob from './plugin/glob'
import pipeline from './plugin/pipeline'
import write from './plugin/write'

var plugins = { merge, babel, concat, debounce, env, glob, pipeline, write }

/**
 * Run Sigh.js
 * @return {Promise} Resolves to an object { pipelineName: baconStream }
 */
export function invoke(opts = {}) {
  try {
    return compile(opts)
    .then(streams => {
      _.forEach(streams, (stream, pipelineName) => {
        stream.onValue(value => {
          // TODO: if (verbose) show value also
          console.log('pipeline %s complete', pipelineName)
        })
        stream.onError(error => {
          console.warn('\x07error: pipeline %s', pipelineName)
          console.warn(error)
        })
      })
    })
  }
  catch (e) {
    if (typeof e === 'function' && e instanceof Error) {
      // TODO: add some red stuff before it
      console.warn(e.message)
      process.exit(1)
    }
    else {
      throw e
    }
  }
}

/**
 * Compile the Sigh.js file in the current directory with the given options.
 * @return {Promise} Resolves to an object { pipelineName: baconStream }
 */
export function compile(opts = {}) {
  try {
    var packageJson = JSON.parse(fs.readFileSync('package.json'))
  }
  catch (e) {}

  if (packageJson) {
    [ packageJson.devDependencies, packageJson.dependencies ].forEach(deps => {
      if (! deps)
        return

      _.forEach(deps, function(version, pkg) {
        if (/^sigh-/.test(pkg) && pkg !== 'sigh-cli')
          plugins[pkg.substr(5)] = require(path.join(process.cwd(), 'node_modules', pkg))
      })
    })
  }

  var sighModule = rewire(path.join(process.cwd(), 'Sigh'))
  _.forEach(plugins, (plugin, key) => injectPlugin(sighModule, key))

  var pipelines = {}
  sighModule(pipelines)

  if (opts.pipelines && opts.pipelines.length) {
    Object.keys(pipelines).forEach(name => {
      if (opts.pipelines.indexOf(name) === -1)
        delete pipelines[name]
    })
  }

  var compiler = new PipelineCompiler(opts)
  return Promise.props(
    _.mapValues(pipelines, (pipeline, name) => compiler.compile(pipeline, null, name))
  )
}

function injectPlugin(module, pluginName) {
  var plugin = plugins[pluginName]
  if (! plugin)
    throw new Error("Nonexistent plugin `" + pluginName + "'")

  try {
    // TODO: make camelCase instead
    var varName = pluginName.replace(/-/g, '_')
    module.__set__(varName, (...args) => ({ plugin, args }))
  }
  catch (e) {
    // plugin not used
  }
}
