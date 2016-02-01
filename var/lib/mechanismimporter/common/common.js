/**
 * Node.js based script for common node.js and javascript functions.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */

// Clone an object
var clone = exports.clone = function(object) {
    return JSON.parse(JSON.stringify(object));
}

// Handy function to define a constant in your Node.js module. For example:
//     defineConstant(exports, "PI", 3.14);
var defineConstant = exports.defineConstant = function(moduleExports, name, value) {
    Object.defineProperty(moduleExports, name, {
        value:      value,
        enumerable: true
    });
}

// Return object properties as an array
var propertyArray = exports.propertyArray = function(object) {
    var propertyArray = [];
    for (var property in object) {
        if (object.hasOwnProperty(property)) {
            propertyArray.push(property);
        }
    }
    return propertyArray;
}

// Return object properties as a sorted array
exports.sortedPropertyArray = function(object) {
    return propertyArray(object).sort();
}

// Print a stack trace -- useful for locating code that caused an error.
exports.printStackTrace = function() {
    var e = new Error('dummy');
    var stack = e.stack.replace(/^[^\(]+?[\n$]/gm, '')
        .replace(/^\s+at\s+/gm, '')
        .replace(/^Object.<anonymous>\s*\(/gm, '{anonymous}()@')
        .split('\n')
        .splice(0,1); // (Don't include this function; start with caller.)
    console.log(stack);
}

// Format a 1 or 2 digit number in 2 digits, useful for hh:mm:ss, etc.
var d2 = exports.d2 = function(n) {
    return (100+n).toString().substring(1);
}

// Format a 1, 2 or 3 digit number in 3 digits, useful for .mmm, etc.
var d3 = exports.d3 = function(n) {
    return (1000+n).toString().substring(1);
}

// Return a string with current date.
var currentDate = exports.currentDate = function() {
    var now = new Date();
    return now.getFullYear() + '-' + d2(now.getMonth()+1) + '-' + d2(now.getDate())
}

// Return a string with current time.
var currentTime = exports.currentTime = function() {
    var now = new Date();
    return d2(now.getHours()) + ':' + d2(now.getMinutes()) + ':' + d2(now.getSeconds()) + "." + d3(now.getMilliseconds());
}

// Return a string with current date and time.
var currentDateAndTime = exports.currentDateAndTime = function() {
    var now = new Date();
    return now.getFullYear() + '-' + d2(now.getMonth()+1) + '-' + d2(now.getDate())
        + ' ' + d2(now.getHours()) + ':' + d2(now.getMinutes()) + ':' + d2(now.getSeconds()) + "." + d3(now.getMilliseconds());
}

// Print current date and time, optionally after a text label.
// in the format yyyy-mm-dd hh:mm:ss
exports.printCurrentDateAndTime = function(text) {
    var now = new Date();
    console.log((text ? text : "") + now.getFullYear() + '-' + d2(now.getMonth()+1) + '-' + d2(now.getDate())
    + ' ' + d2(now.getHours()) + ':' + d2(now.getMinutes()) + ':' + d2(now.getSeconds()) + "." + d3(now.getMilliseconds()) );
}
