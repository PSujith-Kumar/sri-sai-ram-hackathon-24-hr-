// Vite plugin: mounts the phone gateway on the dev server (for the app, loopback only) and starts the separate
// phone-facing listener. Dev and `vite preview` only. The app's own server stays bound to 127.0.0.1.

import path from 'node:path'
import { createGateway } from './phoneGateway.js'
import { PHONE_PORT, startPhoneServers } from './phoneServers.js'

export function phoneLinkPlugin({ port = PHONE_PORT } = {}) {
  const gateway = createGateway()
  const install = (server, config) => {
    // the app talks to the gateway through its own origin: /phone-link/c/*
    server.middlewares.use((req, res, next) => {
      gateway.handle(req, res).then((handled) => { if (!handled) next() }, next)
    })
    let phone = null
    const log = (message) => config.logger.info(`  \u001b[36m${message}\u001b[0m`)
    const start = () => {
      startPhoneServers({
        gateway, port, log,
        publicDir: path.resolve(config.root, 'public'),
        certDir: path.resolve(config.root, '.cache', 'phone-cert'),
      }).then((handle) => { phone = handle }, (error) => log(`Phone link could not start: ${error.message}`))
    }
    if (server.httpServer?.listening) start(); else server.httpServer?.once('listening', start)
    server.httpServer?.once('close', () => phone?.close())
  }
  return {
    name: 'carebridge-phone-link',
    configureServer(server) { install(server, server.config) },
    configurePreviewServer(server) { install(server, server.config) },
  }
}
