'use strict';

var uuid = require('node-uuid');
var onFinished = require('on-finished');

/**
 * Wrap Express Router to get full route
 * @todo This should be tried pulled to Express.js
 */
var express = require('express');
var Router = express.Router;
var RouterProcessParams = Router.process_params;

Router.process_params = function (layer, called, req, res, done) {
  req.originalRoute = (req.originalRoute || '') + (req.route && req.route.path || layer.path || '');
  return RouterProcessParams.apply(this, arguments);
};

/**
 * Get request IP address.
 *
 * @private
 * @param {IncomingMessage} req
 * @return {string}
 */

function getIp (req) {
  return (
  	getClientIp(req) ||
  	req.ip ||
  	req._remoteAddress ||
  	(req.connection && req.connection.remoteAddress) ||
  	undefined
  );
}

/**
 * Get request IP address.
 *
 * @private
 * @param {IncomingMessage} req
 * @return {string}
 */

function getClientIp (req) {
  return req.ips && req.ips.length > 1 && req.ips.pop() || undefined;
}

/**
 * Get request route or URL.
 *
 * @private
 * @param {IncomingMessage} req
 * @return {string}
 */
function getRoute (req) {
  return req.originalRoute || req.route && req.route.path || [req.baseUrl || '', req._parsedUrl.pathname || ''].join('') || req.originalUrl;
}


function responseTime (req, res) {
  if (!res._header || !req._startAt) {
    return '';
  }
  var diff = process.hrtime(req._startAt);
  var ms = diff[0] * 1e3 + diff[1] * 1e-6;
  return ms.toFixed(3);
}

function reqSerializer (req) {
  return {
    reqId: uuid.v4(),
    ip: req._remoteAddress,
    route: getRoute(req)
  };
}

function resSerializer (res, req) {
	var obj = {
    status: res.statusCode,
    route: getRoute(req),
    responseTime: req && responseTime(req, res),
  };
  // Include user ID
  if (req.user && req.user._id) {
  	obj.user = req.user && req.user._id;
  }
  return obj;
}

var LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

module.exports = function (logger, opts) {
	if (typeof logger !== 'object' || !logger.constructor.levelFromName) {
		throw new Error('bunyan-express expect a Bunyan logger as first argument');
	}

  opts = typeof opts === 'object' ? opts : {};

  var level = LEVELS.indexOf(opts.level) > -1 && opts.level || 'info';

  return function loggerMiddleware (req, res, next) {
    if (req.log) {
      return next();
    }

    req._startAt = process.hrtime();
    req._startTime = new Date();
    req._remoteAddress = getIp(req);

    req.log = logger.child(reqSerializer(req));
    req.log.trace({
    	userAgent: req.headers['user-agent']
    }, 'request' );

    function logRequest () {
      req.log[level](resSerializer(res, req), [req.method, req.originalUrl].join(' '));
    }

    onFinished(res, logRequest);

    next();
  };
};
