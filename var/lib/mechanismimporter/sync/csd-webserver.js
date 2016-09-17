/**
 * Node.js based script to create a web server, and run the CSD mechanism
 * meta data import on request
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */
var http = require('http');

var sync = require('synchronize');

var config = require('../common/config.js');
var csd = require('./csd.js');

config.loadProperties(csd.propertiesFile);

var listenPortProperty = 'listen.port';

var port = config.get(listenPortProperty)

/**
 * Creates a web server; listens for invocations, and calls the CSD import.
 */
http.createServer(function (req, res) {
    sync.fiber(function() {
        csd.main();
    });

    res.writeHead(202);
    res.end();
}).listen(port, '0.0.0.0'); // Listen on any IP address
console.log('Server running at http://0.0.0.0:' + port + '/');