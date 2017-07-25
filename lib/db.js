'use strict'
const co = require('co')
const r = require('rethinkdb')
const Promise = require('bluebird')
const uuid = require('uuid-base62')
const utils = require('./utils')

const defaults = {
  host: 'localhost',
  port: 28015,
  db: 'platzigramdb'
}

class Db {
  constructor (options) {
    options = options || {}
    this.host = options.host || defaults.host
    this.port = options.port || defaults.port
    this.db = options.db || defaults.db
    this.setup = options.setup || false
  }

///  Connect //////////////////////////////////////////

  connect (callback) {
    this.connection = r.connect({
      host: this.host,
      port: this.port
    })

    this.connected = true
    let db = this.db
    let connection = this.connection

    if (!this.setup) {
      return Promise.resolve(connection).asCallback(callback)
    }
//  co to handle promises without nesting as using async await ( not async await cause not using babel on this backend module)
//  Setup storages the connection as promised returned (by co.wrap) after creating if needed BD and tables
    let setup = co.wrap(function * () { //  generator function returns a promise --> by using co.wrap
      let conn = yield connection // yiii ield --> await de la promesa(como async) usando co

      let dbList = yield r.dbList().run(conn) //  r.dbList also returns promise
      if (dbList.indexOf(db) === -1) { //  if DB doesn´t exist --> creates it
        yield r.dbCreate(db).run(conn)
      }

      let dbTables = yield r.db(db).tableList().run(conn)
      if (dbTables.indexOf('images') === -1) {
        yield r.db(db).tableCreate('images').run(conn)
        yield r.db(db).table('images').indexCreate('createdAt').run(conn)
        yield r.db(db).table('images').indexCreate('userId', { multi: true }).run(conn)
      }

      if (dbTables.indexOf('users') === -1) {
        yield r.db(db).tableCreate('users').run(conn)
        yield r.db(db).table('users').indexCreate('username').run(conn)
      }

      return conn
    })
          //  in case method connect isn´t called along with callback
          //  it resolves as a promise otherwise the callback is executed
          //  That´s why we use bluebird -> Also improves performance
    return Promise.resolve(setup()).asCallback(callback)
  }
///  Disconnet  ////////////////////////////////////
  disconnect (callback) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(callback)
    }

    this.connected = false
    return Promise.resolve(this.connection)
      .then(conn => conn.close())
  }

///  saveImage  ////////////////////////////////////

  saveImage (image, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let tasks = co.wrap(function * () {
      let conn = yield connection
      image.createdAt = new Date()
      image.tags = utils.extractTags(image.description)

      let result = yield r.db(db).table('images').insert(image).run(conn)

      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      image.id = result.generated_keys[0]

      yield r.db(db).table('images').get(image.id).update({
        publicId: uuid.encode(image.id)
      }).run(conn)

      let created = yield r.db(db).table('images').get(image.id).run(conn)

      return Promise.resolve(created)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  ///  likeImage  ////////////////////////////////////

  likeImage (id, callback) {
    if (!this.connection) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let getImage = this.getImage.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let image = yield getImage(id)
      yield r.db(db).table('images').get(image.id).update({
        liked: true,
        likes: image.likes + 1
      }).run(conn)

      let created = yield getImage(id)
      return Promise.resolve(created)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  ///  getImage  ////////////////////////////////////

  getImage (id, callback) {
    if (!this.connection) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let imageId = uuid.decode(id)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let image = yield r.db(db).table('images').get(imageId).run(conn)

      if (!image) {   // not found for throws method in tests
        return Promise.reject(new Error(`image ${imageId} not found`))
      }
      return Promise.resolve(image)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  ///  getImages  ////////////////////////////////////

  getImages (callback) {
    if (!this.connection) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let images = yield r.db(db).table('images').orderBy({
        index: r.desc('createdAt')
      }).run(conn)
      //  after querying  , Images is a cursor, using method: Toarray-> is turned into an array
      let result = yield images.toArray()
      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  ///  saveUser  ////////////////////////////////////

  saveUser (user, callback) {
    if (!this.connection) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection
      user.password = utils.encrypt(user.password)
      user.createdAt = new Date()

      let result = yield r.db(db).table('users').insert(user).run(conn)
      if (result.error > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      user.id = result.generated_keys[0]

      let created = yield r.db(db).table('users').get(user.id).run(conn)
      return Promise.resolve(created)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  ///  getUser  ////////////////////////////////////

  getUser (username, callback) {
    if (!this.connection) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection
      //  Espera a que los índices sean creados para ejecutar
      //  la query de búsqueda x nombre
      yield r.db(db).table('users').indexWait().run(conn)
      let users = yield r.db(db).table('users').getAll(username, {
        index: 'username'
      }).run(conn)

      let result = null
      try {
        result = yield users.next()
      } catch (e) {
        return Promise.reject(new Error(`user ${username} not found`))
      }
      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  ///  authenticate  ////////////////////////////////////

  authenticate (username, password, callback) {
    if (!this.connection) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function * () {
      let user = null

      try {
        user = yield getUser(username)
      } catch (e) {
        return Promise.resolve(false)
      }

      if (user.password === utils.encrypt(password)) {
        return Promise.resolve(true)
      }

      return Promise.resolve(false)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  ///  getImagesByUser  ////////////////////////////////////

  getImagesByUser (userId, callback) {
    if (!this.connection) {
      return Promise.reject(new Error('not connected')).asCallback()
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection

      yield r.db(db).table('images').indexWait().run(conn)
      let images = yield r.db(db).table('images').getAll(userId, {
        index: 'userId'
      }).orderBy(r.desc('createdAt')).run(conn)

      //  Images cursor converted into Array
      let result = yield images.toArray()

      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  ///  getImagesByTag  ////////////////////////////////////

  getImagesByTag (tag, callback) {
    if (!this.connection) {
      return Promise.reject(new Error('not connected')).asCallback()
    }

    let connection = this.connection
    let db = this.db
    tag = utils.normalize(tag)
    let tasks = co.wrap(function * () {
      let conn = yield connection

      yield r.db(db).table('images').indexWait().run(conn)
      let images = yield r.db(db).table('images').filter((img) => {
        return img('tags').contains(tag)
      }).orderBy(r.desc('createdAt')).run(conn)

      //  Images cursor converted into Array
      let result = yield images.toArray()

      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }
}

module.exports = Db
