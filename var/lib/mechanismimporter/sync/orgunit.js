/**
 * Node.js based script for DATIM (DHIS 2 for PEPFAR) organisation unit management.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */

var util = require('util');
var dhis = require('../common/dhis.js');
var log = require('../common/log.js');

var countries = {};

var getParent = exports.getParent = function(orgUnit) {
    var parent = null;
    if (orgUnit.parent) {
        parent = dhis.getById("organisationUnit", orgUnit.parent.id);
    }
    return parent;
}

// Run once for each country to make sure it's set up.
function newCountry(countryName) {
    log.action("Country: " + countryName);

    //
    // Add country user groups if not already there.
    //
    var users = dhis.addOrUpdatePrivate("userGroup", { name: "OU " + countryName + " Country team" });
    var admins = dhis.addOrUpdatePrivate("userGroup", { name: "OU " + countryName + " User administrators" });
    var allMech = dhis.addOrUpdatePrivate("userGroup", { name: "OU " + countryName + " All mechanisms" });

    //
    // Share the country user groups with administrator groups.
    //
    dhis.shareCached("userGroup", [users, admins, allMech], '--------', [
        {group: "Global Metadata Administrators", groupAccess: "rw------"},
        "Global User Administrators",
        admins ] );

    //
    // Share the country user group (read-only) with itself.
    //
    dhis.shareCached("userGroup", users, 'r-------', users);

    //
    // Share the deduplication mechanism, COGs, and COGS with country all mechanisms user group.
    //
    dhis.shareCached("categoryOption", "xEzelmtHWPn", '--------', allMech ); // 00000 De-duplication adjustment
    dhis.shareCached("categoryOptionGroup", "nzQrpc6Dl58", '--------', allMech ); // Deduplication adjustments
    dhis.shareCached("categoryOptionGroup", "UwIZeT7Ciz3", '--------', allMech ); // All mechanisms without deduplication
    dhis.shareCached("categoryOptionGroupSet", "sdoDQv2EDjp", '--------', allMech ); // De-duplication

    //
    // Share data access user groups with country user administrators.
    //
    dhis.shareCached("userGroup", ["Data EA access", "Data SI access", "Data SIMS access"], '--------', admins);

    //
    // Assign management of country agency user group.
    //
    dhis.addManagedGroupIfNeededCached("Global User Administrators", users);
    dhis.addManagedGroupIfNeededCached(admins, users);
}

// Get a level 3 organisation unit ("country", more precisely known as a
// PEPFAR Operational Unit). We have to be careful because at least one
// country name is also the name of a facility in another country. So we
// make sure we are returning a level 3 orgUnit under "Global".
//
exports.getCountry = function(shares, countryName) {
    if (countries[countryName]) {
        return countries[countryName]; // Cached.
    }
    countryList = dhis.getAllEqual("organisationUnit", countryName, "&fields=id,name,parent");
    //console.log("getCountry countryList = " + util.inspect(countryList) );
    for (var i in countryList) {
        var parent = getParent(countryList[i]);
        if (parent) {
            var grandparent = getParent(parent);
            if (grandparent && grandparent.name == "Global" && grandparent.parent == null) {
                countries[countryName] = countryList[i];
                if (shares) {
                    newCountry(countryName);
                }
                return countryList[i];
            }
        }
    }
    return null;
}
