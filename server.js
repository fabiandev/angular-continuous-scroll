var express = require( 'express' );
var app = express();
var fs = require( 'fs' );
var bodyParser = require( 'body-parser' );
var errorHandler = require( 'errorhandler' );
var methodOverride = require( 'method-override' );
var colors = require( 'colors' );
var url = require( 'url' );

var hostname = process.env.HOSTNAME || 'localhost',
    port = parseInt( process.env.PORT, 10 ) || 4567,
    basePath = __dirname,
    baseDir = '/',
    publicDir = basePath + baseDir;

app.use( function ( req, res, next ) {
  fs.stat( publicDir + req.url, function ( err, stats ) {
    req.isFile = stats && stats.isFile();
    next();
  } );
} );

app.get( '*', function ( req, res, next ) {
  if ( req.isFile ) {
    next();
  } else {
    res.sendFile( publicDir + '/example/index.html' );
  }
} );

app.use( methodOverride() );

app.use( bodyParser.json() );

app.use( bodyParser.urlencoded( {
  extended: true
} ) );

app.use( express.static( publicDir ) );

app.use( errorHandler( {
  dumpExceptions: true,
  showStack: true
} ) );


/*
 * Listen on specified port and directory
 */
console.log( 'server listening on %s at http://%s:%s'.cyan, baseDir, hostname, port );
app.listen( port, hostname );
