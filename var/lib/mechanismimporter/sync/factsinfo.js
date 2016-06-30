/**
 * Node.js based script to synchronize FACTS Info meta data to DATIM.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */
var sync = require('synchronize');
var fastcsv = require('fast-csv');
var fs = require('fs');
var mechanisms = require('./mechanisms.js');
var log = require('../common/log.js');

var mechanismList = [];

function windows1252(s) { // Adjust Windows-1252 characters to 8-bit ASCII.
    for (var i = 0; i < s.length; i++) {
        var code = s.charCodeAt(i);
        if (code >= 0x80 && code <= 0x9f) {
            var c = "€_‚ƒ„…†‡ˆ‰Š‹Œ_Ž_‘’“”•–—˜™š›œ_žŸ".substr(code - 0x80 - 1, 1);
            s = s.substr(0,i) + c + s.substr(i+1);
        }
    }
    return s;
}

function readCsv(callback) {
    var csvHeaderLine = true;
    var stream = fs.createReadStream("../../input/FACTSInfoNightlyMechanism.csv", {encoding: "binary"}); // The FACTS Info .csv file has 8-bit ASCII. "binary" reads it.
    var csvStream = fastcsv()
        .on("data", function(data){
            if (csvHeaderLine) {
                csvHeaderLine = false; // Ignore the first line of the .csv file.
            } else if (data && data.length >10) {
                var m = {
                    countryName: windows1252(data[0].trim()),
                    fiscalYear: data[1].trim(),
                    planningReportingCycle: data[2].trim(),
                    mechanismCode: data[3].trim(),
                    legacyMechanismCode: data[4].trim(),
                    mechanismName: windows1252(data[5].trim()),
                    agencyName: windows1252(data[6].trim()),
                    partnerName: windows1252(data[7].trim()),
                    partnerCode: data[8].trim(),
                    start: data[9].trim(),
                    end: data[10].trim(),
                    active: data[11].trim()
                }
                mechanismList.push(m);
            }
        })
        .on("end", function() {
            callback(null);
        });
    stream.pipe(csvStream);
}

exports.sync = function() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0" // Avoids DEPTH_ZERO_SELF_SIGNED_CERT error for self-signed certs
    log.openAll("../../log/", 1);
    sync.await(readCsv(sync.defer()));
    mechanisms.sync(true, mechanismList);
    log.closeAll();
}
