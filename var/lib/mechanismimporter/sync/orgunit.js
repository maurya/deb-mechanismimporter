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

// Run once for each country to initialize the user groups for sharing.
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
    dhis.shareCached("userGroup", users, '--------', users);

    //
    // Share the deduplication mechanism, COGs, and COGS with country all mechanisms user group.
    //
    dhis.shareCachedQuietly("categoryOption", "xEzelmtHWPn", '--------', allMech ); // 00000 De-duplication adjustment
    dhis.shareCachedQuietly("categoryOptionGroup", "nzQrpc6Dl58", '--------', allMech ); // Deduplication adjustments
    dhis.shareCachedQuietly("categoryOptionGroup", "UwIZeT7Ciz3", '--------', allMech ); // All mechanisms without deduplication
    dhis.shareCachedQuietly("categoryOptionGroupSet", "sdoDQv2EDjp", '--------', allMech ); // De-duplication

    //
    // Share data access user groups with country user administrators.
    //
    dhis.shareCachedQuietly("userGroup", ["Data EA access", "Data SI access", "Data SIMS access"], '--------', admins);

    //
    // Assign management of country agency user group.
    //
    dhis.addManagedGroupIfNeededCached("Global User Administrators", users);
    dhis.addManagedGroupIfNeededCached(admins, users);
}

// Get a mechanism's country object. Configure sharing for the country
// if we should.
//
exports.getCountry = function(configureSharing, countryName) {
    if (countries[countryName]) {
        return countries[countryName]; // Cached.
    }
    var country = dhis.getCache("organisationUnit", "name", countryName);
    if (country) {
        countries[countryName] = country;
        if (configureSharing) {
            newCountry(countryName);
        }
    }
    return country;
}
