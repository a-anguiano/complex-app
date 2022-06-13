const express = require('express')
const session = require('express-session')
const MongoStore = require('connect-mongo')
const flash = require('connect-flash')
const markdown = require('marked')
const csrf = require('csurf')
const app = express()
const sanitizeHTML = require('sanitize-html')

app.use(express.urlencoded({extended: false}))
app.use(express.json())

app.use('/api', require('./router-api'))  //lightweight

let sessionOptions = session({
    secret: "JavaScript is cool",
    store: MongoStore.create({client: require('./db')}),
    resave: false,
    saveUninitialized: false,
    cookie: {maxAge: 1000 * 60 * 60 * 24, httpOnly: true}
})

app.use(sessionOptions)
//maxAge is set to a day
app.use(flash())

//now have access to user property in any ejs template
app.use(function(req, res, next) {
    //make our markdown frunction available from within ejs templates
    res.locals.filterUserHTML = function(content) {
        return sanitizeHTML(markdown.parse(content), {allowedTags: ['p', 'br', 'ul', 'ol', 'li', 'strong', 'bold', 'i', 'em', 'h1', 'h2'], allowedAttributes: {}})
    }

    //make all error and success flash message avaialble from all templates
    res.locals.errors = req.flash("errors")
    res.locals.success = req.flash("success")
    
    //make current user id available on the req object
    if (req.session.user) {req.visitorId = req.session.user._id} else {req.visitorId = 0}

    // make user session available from within view template
    res.locals.user = req.session.user
    next()
})

const router = require('./router')

app.use(express.static('public'))
app.set('views', 'views')
app.set('view engine', 'ejs')

app.use(csrf())

app.use(function(req, res, next) {
  res.locals.csrfToken = req.csrfToken()
  next()
})

app.use('/', router)

app.use(function (err, req, res, next) {
  if (err) {
    if (err.code == "EBADCSRFTOKEN") {
      req.flash("errors", "Cross site request forgery detected.")
      req.session.save(() => res.redirect("/"))
    } else {
      res.render("404")
    }
  }
})

const server = require('http').createServer(app)
const io = require('socket.io')(server)

//make express session data available from within context of socket
io.use(function (socket, next) {
    sessionOptions(socket.request, socket.request.res, next)
  })

io.on("connection", function (socket) {
    if (socket.request.session.user) {
      let user = socket.request.session.user
  
        socket.emit("welcome", { username: user.username, avatar: user.avatar })
  
        socket.on("chatMessageFromBrowser", function (data) {
        socket.broadcast.emit("chatMessageFromServer", { message: sanitizeHTML(data.message, { allowedTags: [], allowedAttributes: {} }), username: user.username, avatar: user.avatar })
      })
    }
  })

module.exports = server