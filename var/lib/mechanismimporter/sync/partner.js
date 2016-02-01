/**
 * Node.js based script for DATIM (DHIS 2 for PEPFAR) partner management.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */

var dhis = require('../common/dhis.js');
var log = require('../common/log.js');
var util = require('util');

var partnersGlobal = {};
var partnersInCountry = {};

function renamePartner(partnerCog, partnerCode, newPartnerName) {
    log.action("Renaming partner " + partnerCode + " from '" + partnerCog.name + "' to '" + newPartnerName + "'");
    var groups = dhis.getAllLike("userGroup", " Partner " + partnerCode + " ");
    for (var i in groups) {
        var group = groups[i];
        var partnerIndex = group.name.indexOf(" Partner " + partnerCode);
        var dashIndex = group.name.indexOf(" - ", partnerIndex);
        var newName = (group.name.substring(0, dashIndex + 3) + newPartnerName).substring(0, dhis.MAX_NAME_LENGTH);
        log.action("Renaming user group from '" + group.name + "' to '" + newName + "'");
        dhis.rename("userGroup", group, newName, newName);
    }
    dhis.rename("categoryOptionGroup", partnerCog, newPartnerName, newPartnerName);
}

var newPartnerGlobal = function(shares, partnerCode, partnerName) {
    //
    // Check if we have already processed this partner at the global level.
    //
    var partnerCog = partnersGlobal[partnerCode];

    if (partnerCog) {
        return partnerCog;
    }

    log.info("Partner: " + partnerCode + " - " + partnerName);

    //
    // If partner exists, check for changed name.
    // If partner does not exist, add it.
    //
    var partnerCog = dhis.getByCode("categoryOptionGroup", "Partner_" + partnerCode);
    if (partnerCog == null) {
        partnerCog = dhis.getByName("categoryOptionGroup", partnerName.substring(0,dhis.MAX_NAME_LENGTH));
        if (partnerCog) {
            if (partnerCog.code) {
                partnerCog = null;
            } else {
                log.action("Adding partner code to " + partnerCode + " - " + partnerName );
                partnerCog.code = "Partner_" + partnerCode;
                dhis.update("categoryOptionGroup", partnerCog);
            }
        }
    }
    if (partnerCog != null) {
        if (partnerCog.name != partnerName) {
            renamePartner(partnerCog, partnerCode, partnerName);
        } else if (partnerCog.shortName != partnerName.substring(0, dhis.MAX_SHORT_NAME_LENGTH)) {
            dhis.fixShortName("categoryOptionGroup", partnerCog);
        }
    } else {
        log.action("Adding partner " + partnerCode + " - " + partnerName );
        partnerCog = dhis.addOrUpdatePrivateWithShortName("categoryOptionGroup", { code: "Partner_" + partnerCode, name: partnerName });
    }
    dhis.addToCollectionIfNeededCached("categoryOptionGroupSet", "Implementing Partner", "categoryOptionGroup", partnerCog);

    //
    // Unless we are doing sharing, we're done.
    //
    if ( !shares ) {
        return partnerCog;
    }

    //
    // Add partner global user groups if not already there.
    //
// NOT IMPLEMENTED YET:
//     var users = dhis.addOrUpdatePrivate("userGroup", { name: "Global Partner " + partnerCode + " users - " + partnerName });
//     var admins = dhis.addOrUpdatePrivate("userGroup", { name: "Global Partner " + partnerCode + " user administrators - " + partnerName });
//     var allMech = dhis.addOrUpdatePrivate("userGroup", { name: "Global Partner " + partnerCode + " all mechanisms - " + partnerName });

    //
    // Share the partner category option group with global user groups.
    //
    dhis.shareCached("categoryOptionGroup", partnerCog, '--------', [
        {group: "Global Metadata Administrators", groupAccess: "rw------"},
//         users,
        "Global all mechanisms" ] );

    //
    // Share the partner global user groups with global administrator groups.
    //
//    dhis.shareCached("userGroup", [users, admins, allMech], '--------', [
//        {group: "Global Metadata Administrators", groupAccess: "rw------"},
//         admins,
//        "Global User Administrators" ] );

    //
    // Share data access user groups with global partner user administrators.
    //
//     dhis.shareCached("userGroup", ["Data EA access", "Data SI access", "Data SIMS access"], '--------', admins);

    //
    // Assign management of global partner user group.
    //
//     dhis.addManagedGroupIfNeededCached("Global User Administrators", users);
//     dhis.addManagedGroupIfNeededCached(admins, users);

    //
    // Remember that we have processed this partner at the global level.
    //
    partnersGlobal[partnerCode] = partnerCog;

    return partnerCog;
}

exports.newPartnerInCountry = function(shares, partnerCode, partnerName, countryName) {

    //
    // Check if we have already processed this partner for this country.
    //
    if (partnersInCountry[countryName + "-partner-" + partnerCode]) {
        return;
    }

    //
    // Process this partner at the global level if needed.
    //
    var partnerCog = newPartnerGlobal(shares, partnerCode, partnerName);

    log.info("Partner in " + countryName + ": " + partnerCode + " - " + partnerName );

    //
    // Unless we are doing sharing, we're done.
    //
    if ( !shares ) {
        return;
    }

    //
    // Add partner country user groups if not already there.
    //
    var users = dhis.addOrUpdatePrivate("userGroup", { name: "OU " + countryName + " Partner " + partnerCode + " users - " + partnerName });
    var admins = dhis.addOrUpdatePrivate("userGroup", { name: "OU " + countryName + " Partner " + partnerCode + " user administrators - " + partnerName });
    var allMech = dhis.addOrUpdatePrivate("userGroup", { name: "OU " + countryName + " Partner " + partnerCode + " all mechanisms - " + partnerName });

    //
    // Share the partner category option group with country user groups.
    //
    dhis.shareCached("categoryOptionGroup", partnerCog, '--------', [
        "OU " + countryName + " All mechanisms",
        "OU " + countryName + " Partner " + partnerCode + " users - " + partnerName ] );

    //
    // Share the partner country user groups with administrator groups.
    //
    dhis.shareCached("userGroup", [users, admins, allMech], '--------', [
        {group: "Global Metadata Administrators", groupAccess: "rw------"},
        "Global User Administrators",
//         "Global Partner " + partnerCode + " user administrators - " + partnerName,
        "OU " + countryName + " User administrators",
        admins ] );

    //
    // Share the partner country user group (read-only) with itself.
    //
    dhis.shareCached("userGroup", users, 'r-------', users);

    //
    // Share data access user groups with country partner user administrators.
    //
    dhis.shareCached("userGroup", ["Data EA access", "Data SI access", "Data SIMS access"], '--------', admins);

    //
    // Assign management of country partner user group.
    //
    dhis.addManagedGroupIfNeededCached("Global User Administrators", users);
//     dhis.addManagedGroupIfNeededCached("Global Partner " + partnerCode + " user administrators - " + partnerName, users);
    dhis.addManagedGroupIfNeededCached("OU " + countryName + " User administrators", users);
    dhis.addManagedGroupIfNeededCached(admins, users);

    //
    // Remember that we have processed this partner at the country level.
    //
    partnersInCountry[countryName + "-partner-" + partnerCode] = true;
}

exports.getPartner = function(partnerCode) {
    return partnersGlobal[partnerCode];
}
