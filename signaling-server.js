const PORT = 8080

const fs = require("fs")
const express = require("express")

const https = require("https")

const main = express()

// Cargar las claves privadas y el certificado SSL para que sea seguro (HTTPS)
let privateKey, certificate
privateKey = fs.readFileSync("ssl/server-key.pem", "utf8")
certificate = fs.readFileSync("ssl/server-cert.pem", "utf8")
const credentials = { key: privateKey, cert: certificate }

// Crear el servidor HTTPS utilizando las claves y el certificado
const server = https.createServer(credentials, main)

// Configurar Socket.IO para trabajar con el servidor HTTPS
const io = require("socket.io").listen(server)

// Escuchar en el puerto especificado
server.listen(PORT, null, function () {
  console.log("Escuchando en el puerto " + PORT)
})

// Configurar ruta para la página principal
main.get("/", function (req, res) {
  res.sendFile(__dirname + "/client.html")
})

// Variables para almacenar los canales y los sockets conectados
var channels = {}
var sockets = {}

// Manejar eventos de conexión de los sockets
io.sockets.on("connection", function (socket) {
  socket.channels = {}
  sockets[socket.id] = socket

  console.log("[" + socket.id + "] conexión aceptada")

  // Manejar evento de desconexión de un socket
  socket.on("disconnect", function () {
    for (var channel in socket.channels) {
      part(channel)
    }
    console.log("[" + socket.id + "] desconectado")
    delete sockets[socket.id]
  })

  // Manejar evento de unión a un canal
  socket.on("join", function (config) {
    console.log("[" + socket.id + "] unirse a", config)
    var channel = config.channel
    var userdata = config.userdata

    if (channel in socket.channels) {
      console.log("[" + socket.id + "] ERROR: ya se ha unido a", channel)
      return
    }

    if (!(channel in channels)) {
      channels[channel] = {}
    }

    // Notificar a los sockets en el canal que se ha unido un nuevo socket
    for (id in channels[channel]) {
      channels[channel][id].emit("addPeer", { peer_id: socket.id, should_create_offer: false })
      socket.emit("addPeer", { peer_id: id, should_create_offer: true })
    }

    // Agregar el socket al canal
    channels[channel][socket.id] = socket
    socket.channels[channel] = channel
  })

  // Función para salir de un canal
  function part(channel) {
    console.log("[" + socket.id + "] salir de", channel)

    if (!(channel in socket.channels)) {
      console.log("[" + socket.id + "] ERROR: no está en", channel)
      return
    }

    // Eliminar el canal del socket y el socket del canal
    delete socket.channels[channel]
    delete channels[channel][socket.id]

    // Notificar a los sockets restantes en el canal que se ha desconectado un socket
    for (id in channels[channel]) {
      channels[channel][id].emit("removePeer", { peer_id: socket.id })
      socket.emit("removePeer", { peer_id: id })
    }
  }
  socket.on("part", part)

  // Manejar evento de relé de candidato ICE
  socket.on("relayICECandidate", function (config) {
    var peer_id = config.peer_id
    var ice_candidate = config.ice_candidate
    console.log("[" + socket.id + "] relaying ICE candidate to [" + peer_id + "] ", ice_candidate)

    // Reenviar el candidato ICE al socket destino
    if (peer_id in sockets) {
      sockets[peer_id].emit("iceCandidate", { peer_id: socket.id, ice_candidate: ice_candidate })
    }
  })

  // Manejar evento de relé de descripción de sesión
  socket.on("relaySessionDescription", function (config) {
    var peer_id = config.peer_id
    var session_description = config.session_description
    console.log("[" + socket.id + "] relaying session description to [" + peer_id + "] ", session_description)

    // Reenviar la descripción de sesión al socket destino
    if (peer_id in sockets) {
      sockets[peer_id].emit("sessionDescription", { peer_id: socket.id, session_description: session_description })
    }
  })
})
