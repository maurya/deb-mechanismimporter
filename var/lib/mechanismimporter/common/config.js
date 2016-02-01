/**
 * Node.js based script to configure the mechanism importer.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */

var propertiesReader = require('properties-reader');

var properties = null;

exports.loadProperties = function(filename) {
    try {
        properties = propertiesReader(filename);
    }
    catch(err) {
    }
}

exports.get = function(property) {
    if (properties) {
        return properties.get(property);
    }
    else {
        return null;
    }
}
