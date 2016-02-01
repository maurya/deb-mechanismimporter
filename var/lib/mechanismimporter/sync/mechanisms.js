/**
 * Node.js based script to import a list of mechanisms into DATIM DHIS 2.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */
var common = require('../common/common.js');
var log = require('../common/log.js');
var rest = require('../common/rest.js');
var dhis = require('../common/dhis.js');
var agency = require('./agency.js');
var partner = require('./partner.js');
var mechanism = require('./mechanism.js');
var orgunit = require('./orgunit.js');
var util = require('util');

var mechanisms = {};
var preexistingMechanisms = {};
var preexistingCountries = {};
var sortedMechanisms = [];
var agencies = {};
var partners = {};
var partnerNames = {};
var countryAgencies = {};
var countryPartnerAgencies = {};

var lineCount = 0;
var mechanismCount = 0;
var countryCount = 0;
var agencyCount = 0;
var partnerCount = 0;

function addBasicObjects() {
    dhis.addIfNotExists("category", {name: "Funding Mechanism", dataDimensionType: "ATTRIBUTE", dimensionType: "CATEGORY", id: "SH885jaRe0o"});
    dhis.addIfNotExists("categoryOptionGroupSet", {name: "Funding Agency", dataDimensionType: "ATTRIBUTE", dimensionType: "CATEGORYOPTION_GROUPSET", id: "bw8KHXzxd9i"});
    dhis.addIfNotExists("categoryOptionGroupSet", {name: "Implementing Partner", dataDimensionType: "ATTRIBUTE", dimensionType: "CATEGORYOPTION_GROUPSET", id: "BOyWrF33hiR"});
}

function findPreexistingMechanisms() {
    var mechanismCategory = dhis.getByName("category", "Funding Mechanism");
    var result = rest.get("/api/categories/" + mechanismCategory.id + "/categoryOptions.json?fields=code,startDate,endDate,name&paging=none");
    var existingMechanisms = result.categoryOptions;
    for ( i in existingMechanisms) {
        preexistingMechanisms[ existingMechanisms[i].code ] = existingMechanisms[i];
    }
}

// Check the first three orgUnit levels for countries. For DATIM Global, countries
function findPreexistingCountries() {
    var result = rest.get("/api/organisationUnits.json?filter=level:le:3&fields=name&paging=none");
    var orgUnits = result.organisationUnits;
    for ( i in orgUnits) {
        preexistingCountries[orgUnits[i].name] = true;
    }
}

function rememberAgencies(agencyName) {
    if (agencies[agencyName]) {
        agencies[agencyName]++;
    } else {
        agencies[agencyName] = 1;
        agencyCount++;
    }
}

function rememberPartners(partnerCode) {
    if (partners[partnerCode]) {
        partners[partnerCode]++;
    } else {
        partners[partnerCode] = 1;
        partnerCount++;
    }
}

function rememberPartnerNames(partnerCode, partnerName) {
    partnerNames[partnerCode] = partnerName;
}

function rememberCountryAgencies(countryName, agencyName) {
    if (!countryAgencies[countryName]) {
        countryAgencies[countryName] = {};
        countryCount++;
    }
    if (!countryAgencies[countryName][agencyName]) {
        countryAgencies[countryName][agencyName] = 0;
    }
    countryAgencies[countryName][agencyName]++;
}

function rememberCountryPartnerAgencies(countryName, partnerCode, agencyName) {
    if (!countryPartnerAgencies[countryName]) {
        countryPartnerAgencies[countryName] = {};
    }
    if (!countryPartnerAgencies[countryName][partnerCode]) {
        countryPartnerAgencies[countryName][partnerCode] = {};
    }
    if (!countryPartnerAgencies[countryName][partnerCode][agencyName]) {
        countryPartnerAgencies[countryName][partnerCode][agencyName] = 0;
    }
    countryPartnerAgencies[countryName][partnerCode][agencyName]++;
}

function analyze() {
    for (var mId in mechanisms) {
        if (mechanisms.hasOwnProperty(mId)) {
            var m = mechanisms[mId];
            //console.log("Analyze: " + m.countryName + " " + m.agencyName + " " + m.partnerCode + "-" + m.partnerName + " " + m.mechanismCode + "-" + m.mechanismName);
            //console.log("Mechanism: " + util.inspect(m));
            mechanismCount++;
            rememberAgencies(m.agencyName);
            rememberPartners(m.partnerCode);
            rememberPartnerNames(m.partnerCode, m.partnerName);
            rememberCountryAgencies(m.countryName, m.agencyName);
            rememberCountryPartnerAgencies(m.countryName, m.partnerCode, m.agencyName);
        }
    }
    log.action("Processsing " + lineCount + " import lines, " + mechanismCount + " mechanisms in " + countryCount + " OUs, " + agencyCount + " agencies, and " + partnerCount + " partners.");

    log.action("Agencies:");
    var agencyList = common.sortedPropertyArray(agencies);
    for (var a in agencyList) {
        log.action("    " + agencyList[a] + " (" + agencies[agencyList[a]] + ")");
    }

    log.action("OUs:");
    var countryList = common.sortedPropertyArray(countryAgencies);
    for (var c in countryList) {
        var countryName = countryList[c];
        var countryLog = "";
        var countryTotal = 0;
        var aList = common.sortedPropertyArray(countryAgencies[countryName]);
        for (var a in aList) {
            var agencyName = aList[a];
            var aCount = countryAgencies[countryName][agencyName];
            if (countryLog) {
                countryLog += ", ";
            }
            countryLog += " " + agencyName + " (" + aCount + ")";
            countryTotal += aCount;
        }
        log.action("    " + countryName + " (" + countryTotal + "): " + countryLog);
    }

    //console.log("countryPartnerAgencies: " + util.inspect(countryPartnerAgencies));

    var countryList = common.sortedPropertyArray(countryPartnerAgencies);
    for (var c in countryList) {
        var countryName = countryList[c];
        log.action(countryName + " Partners:");
        var partnerCodes = common.sortedPropertyArray(countryPartnerAgencies[countryName]);
        for (var p in partnerCodes) {
            var partnerCode = partnerCodes[p];
            var partnerLog = partnerCode +  " " + partnerNames[partnerCode] + " [";
            var agencies = common.sortedPropertyArray(countryPartnerAgencies[countryName][partnerCode]);
            for (var a in agencies) {
                partnerLog += agencies[a] + ", ";
            }
            partnerLog = partnerLog.substring(0, partnerLog.length - 2) + "] {" + agencies.length + "}" ;
            log.action("    " + partnerLog);
        }
    }
}

function reportPreexistingMechanismsNotInImport() {
    log.action("Existing mechanisms not in import:");
    for (var i in preexistingMechanisms) {
        var m = preexistingMechanisms[i];
        if (!mechanisms[m.code]) {
            log.action("    " + m.code + ": " + m.name);
        }
    }
}

function sortMechanisms() {
    // Sort the mechanisms so they are processed in a predictable order.
    // This facilitates debugging, to see where something should be processed.
    var keys = [];
    for (var mId in mechanisms) {
        if (mechanisms.hasOwnProperty(mId)) {
            var m = mechanisms[mId];
            keys.push(m.countryName + "-" + m.agencyName + "-" + m.partnerCode + "~/\~" + m.mechanismCode)
        }
    }
    keys.sort();
    for (var i in keys) {
        sortedMechanisms.push(mechanisms[keys[i].split("~/\~")[1]]);
    }
    return;
}

// If an agency and a partner have the same name, then append " (partner)"
// to the end of the partner name. For example, "State/AF" is used as both
// an agency name and a partner name. This would cause trouble because we
// cannot have to different category option group objects with the same
// name, nor can we have a single category option group belonging to two
// different category option group sets (e.g. Implementing Partner and
// Funding Agency). So we rename the State/AF partner to "State/AF (partner)".
function fixPartnerWithSameNameAsAgency( m ) {
    if (agencies[m.partnerName]) {
        var newPartnerName = m.partnerName + " (partner)";
        log.action("Changing partner " + m.partnerCode + " name '" + m.partnerName + "' to '" + newPartnerName + "' for mechanism " + m.mechanismCode);
        m.partnerName = newPartnerName;
        partnerNames[m.partnerCode] = newPartnerName;
    }
}

function oMin ( a, b ) { // Object (such as String) minimum
    if ( a < b ) return a;
    return b;
}

function oMax ( a, b ) { // Object (such as String) maximum
    if ( a > b ) return a;
    return b;
}

// Start with a list of mechanisms, where each mechanism may appear multiple
// times in the list for different years.
//
// From this create an index by year, where each mechanism appears only once.
// The start and end dates for the mechanism will come from the earliest
// start date for active years and the latest end date for active years.
function indexMechanisms( mechanismList ) {
    lineCount = mechanismList.length;
    for (var i in mechanismList) {
        m = mechanismList[i];
        log.trace( "line " + m.fiscalYear + " " + m.active + " " + m.mechanismCode + " - " + m.mechanismName );
        if (m.active == 0 || m.fiscalYear < 2014) {
            m.start = '2050-01-01'; // Very late start (can make it earlier).
            m.end = '1990-01-01'; // Very early end (can make it later).
        }
        else if (m.fiscalYear == 2014) { // September 2013 plus FY2014 (Oct13-Sept14)
            m.start = '2013-09-01';
            m.end = '2014-09-30';
        }
        else if (m.fiscalYear == 2015) { // FY2015 (Oct14-Sept15) & FY2016 (Oct15-Sept16)
            m.start = '2014-10-01';
            m.end = '2016-09-30';
        }
        else { // FY(yyyy) (Octyyyy-Sept(yyyy+1))
            m.start = m.fiscalYear + '-10-01';
            m.end = (m.fiscalYear + 1) + '-09-30';
        }

        var existing = mechanisms[m.mechanismCode];
        if (existing) {
            if (m.fiscalYear > existing.fiscalYear) {
                m.start = oMin(m.start, existing.start);
                m.end = oMax(m.end, existing.end);
                mechanisms[m.mechanismCode] = m; // Replace existing entry with latest year.
            }
            else {
                existing.start = oMin(m.start, existing.start);
                existing.end = oMax(m.end, existing.end);
            }
        } else {
            mechanisms[m.mechanismCode] = m; // New entry.
        }
    }

    for (var mId in mechanisms) {
        if (mechanisms.hasOwnProperty(mId)) {
            var m = mechanisms[mId];
            log.trace( "dates " + m.start + " " + m.end + " " + m.mechanismCode + " - " + m.mechanismName );
            if (m.end == '1990-01-01') {
                log.trace( "--> No valid FYs for Mechanism " + m.mechanismCode + " - " + m.mechanismName );
                m.start = '2014-09-30';
                m.end = '2014-09-30';
            }
        }
    }
}

// Don't import any pre-2015 mechanisms that do not already exist in DHIS 2.
function discardOldMechanismsNotPreexisting() {
    for (var mId in mechanisms) {
        if (mechanisms.hasOwnProperty(mId)) {
            var m = mechanisms[mId];
            if (m.end == '2014-09-30' && !preexistingMechanisms.hasOwnProperty( m.mechanismCode ) ) {
                log.trace( "--> No preexisting mechanism " + m.mechanismCode + " - " + m.mechanismName );
                delete mechanisms[mId];
            }
        }
    }
}

function discardMechanismsWhereCountriesDoNotPreexist() {
    findPreexistingCountries();
    for (var mId in mechanisms) {
        if (mechanisms.hasOwnProperty(mId)) {
            if (!preexistingCountries[mechanisms[mId].countryName]) {
                log.trace( "--> No country " + mechanisms[mId].countryName + " for Mechanism " + mechanisms[mId].mechanismCode + " - " + mechanisms[mId].mechanismName );
                delete mechanisms[mId];
            }
        }
    }
}

exports.sync = function(shares, mechanismList) {
    var startTime = new Date().getTime();
    log.action("Starting Mechanism import at " + common.currentDateAndTime());

    addBasicObjects();
    findPreexistingMechanisms();

    indexMechanisms( mechanismList );
    discardOldMechanismsNotPreexisting();
    discardMechanismsWhereCountriesDoNotPreexist();
    analyze();
    reportPreexistingMechanismsNotInImport();
    sortMechanisms();

    for (var i in sortedMechanisms) {
        var m = sortedMechanisms[i];
        var country = orgunit.getCountry(shares, m.countryName);
        if (!country) {
            log.error("Can't find OU '" + m.countryName + "' -- not adding mechanism " + mechanismCoName);
            continue;
        }
        fixPartnerWithSameNameAsAgency(m);
        agency.newAgencyInCountry(shares, m.agencyName, m.countryName);
        partner.newPartnerInCountry(shares, m.partnerCode, m.partnerName, m.countryName);
        mechanism.newMechanism(shares, m.mechanismCode, m.mechanismName, m.start, m.end, m.partnerCode, m.partnerName, m.agencyName, m.countryName, country);
    }

    log.action();
    log.action("==============================================================================================");
    log.action("==============================================================================================");
    log.action();

    if ( shares ) {
        log.action("Checking for agencies that manage partners.");

        agency.configureAgenciesManagingPartners(countryPartnerAgencies, partnerNames);

        log.action();
        log.action("==============================================================================================");
        log.action("==============================================================================================");
        log.action();
    }

    dhis.flushCaches();

    log.action("Rebuilding category option combinations.");
    dhis.categoryOptionComboUpdate();

    log.action("Rebuilding resource tables.");
    dhis.resourceTablesUpdate();

    log.action("Ending Mechanism import at " + common.currentDateAndTime());
    var e = (new Date().getTime() - startTime) / 1000 | 0; // Elapsed time in seconds.
    log.action("Mechanism import elapsed time (h:mm:ss): " + (e/3600 | 0) + ":" + common.d2((e/60)%60 | 0) + ":" + common.d2(e%60) );
}
