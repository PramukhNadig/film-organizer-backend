const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const httpStatus = require('http-status');
const config = require('./config/config.js');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');
const fileupload = require("express-fileupload");
const cookieparser = require('cookie-parser');
const app = express();





// parse json request body
app.use(express.json());
app.use(fileupload());

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// sanitize request data
app.use(xss());
app.use(mongoSanitize());

// gzip compression
app.use(compression());

// enable cors
app.use(cors());
app.options('*', cors());
app.use(cookieparser());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (!'email' in req.cookies) {
    res.cookie('email', 'guest', { maxAge: 900000, httpOnly: true });
  }
  next();
});
// limit repeated failed requests to auth endpoints
if (config.env === 'production') {
  app.use('/v1/auth', authLimiter);
}


app.use((req, res, next) => {
  if (req.cookies.email === 'guest') {
    req.user = { email: 'guest' };
  }

  if (req.cookies && req.cookies.email) {
    req.user = { email: req.cookies.email };
  }

  if (!req.user) {
    req.user = { email: 'guest' };
  }
  if (req.method !== 'GET' && req.user.email === 'guest' && req.url !== '/v1/auth/login' && req.url !== '/v1/auth/register' && req.url !== '/v1/auth/logout' && req.url !== '/v1/auth/refresh') {
    return res.status(401).send('Unauthorized');
  }
  next();
});  
// v1 api routes
app.use('/v1', routes);

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});



// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

module.exports = app;
