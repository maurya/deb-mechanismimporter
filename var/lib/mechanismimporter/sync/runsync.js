/**
 * Node.js based script to run the FACTS Info nightly meta data import.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */
var sync = require('synchronize');
var factsinfo = require('./factsinfo.js');

sync.fiber(function() {
    factsinfo.sync();
});
