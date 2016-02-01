/**
 * Node.js based interface for logging.
 *
 * A very simple logger. Could be converted to be a wrapper for another
 * logger such as log4js-node.
 *
 * Note that multiple log files are produced according to the log levels.
 * This allows a high-level log to be read for the overall report of what
 * was done, while lower-level log(s) can be consulted for more details.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */

var common = require('./common.js');
var fs = require('fs');
var initialized = false;

var minimumLogLevel;

var LEVEL = {
    FATAL: {value: 7, tag: "FATAL"},
    ERROR: {value: 6, tag: "ERROR"},
    WARN: {value: 5, tag: "WARN"},
    ACTION: {value: 4, tag: "ACTION"},
    INFO: {value: 3, tag: "INFO"},
    DEBUG: {value: 2, tag: "DEBUG"},
    TRACE: {value: 1, tag: "TRACE"}
};

var files = [
    {name: ".1.action", level: LEVEL.ACTION},
    {name: ".2.info", level: LEVEL.INFO},
    {name: ".3.debug", level: LEVEL.DEBUG},
    {name: ".4.trace", level: LEVEL.TRACE}
];

function filename(name) {
    return common.currentDate() + name + ".txt";
}

exports.openAll = function(logDirectory, minLogLevel) {
    minimumLogLevel = minLogLevel;
    for (var f in files) {
        if (files[f].level.value >= minimumLogLevel) {
            files[f].stream = fs.createWriteStream(logDirectory + filename(files[f].name), 'a');
        }
    }
    initialized = true;
}

exports.closeAll = function() {
    for (var f in files) {
        if (files[f].level.value >= minimumLogLevel) {
            files[f].stream.end();
        }
    }
}

function log(level, text) {
    if (!initialized || level.value < minimumLogLevel) {
        return;
    }
    var textArray = [].concat(text ? text.split('\n') : text);
    if (level.value >= LEVEL.ERROR.value) {
        var e = new Error('dummy');
        var stack = e.stack.replace(/^[^\(]+?[\n$]/gm, '')
            .replace(/^\s+at\s+/gm, '')
            .replace(/^Object.<anonymous>\s*\(/gm, '{anonymous}()@')
            .split('\n');
        stack.splice(0,2); // Remove the two levels of call in this module.
        stack.splice(-1,1); // Remove top level of call in sync.js.
        textArray = textArray.concat(stack);
    }
    var logArray = [];
    var lineHeader = common.currentTime() + " " + level.tag;
    for (var i in textArray) {
        logArray = logArray.concat( [ lineHeader, " ", textArray[i], "\n"] );
        lineHeader = lineHeader.replace(/./g, " ");
    }
    var logText = logArray.join("");
    for (var f in files) {
        file = files[f];
        if (level.value >= file.level.value && file.level.value >= minimumLogLevel) {
            file.stream.write(logText);
        }
    }
    if (level.value >= LEVEL.ACTION.value) {
        console.log(logText.substring(0,logText.length-1)); // Chop off the final newline.
    }
}

exports.fatal = function(text) {
    log(LEVEL.FATAL, text);
}

exports.error = function(text) {
    log(LEVEL.ERROR, text);
}

exports.action = function(text) {
    log(LEVEL.ACTION, text);
}

exports.warn = function(text) {
    log(LEVEL.WARN, text);
}

exports.info = function(text) {
    log(LEVEL.INFO, text);
}

exports.debug = function(text) {
    log(LEVEL.DEBUG, text);
}

exports.trace = function(text) {
    log(LEVEL.TRACE, text);
}
