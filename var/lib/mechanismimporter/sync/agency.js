/**
 * Node.js based script for DATIM (DHIS 2 for PEPFAR) agency management.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */

var dhis = require('../common/dhis.js');
var log = require('../common/log.js');
var common = require('../common/common.js');

var agenciesGlobal = {};
var agenciesInCountry = {};

var newAgencyGlobal = function(shares, agencyName) {

    //
    // Check if we have already processed this agency at the global level.
    //
    var agencyCog = agenciesGlobal[agencyName];

    if (agencyCog) {
        return agencyCog;
    }

    log.info("Agency: " + agencyName );

    //
    // Add agency cog if not already there.
    //
    var agencyCog = dhis.getByCode("categoryOptionGroup", "Agency_" + agencyName);
    if (agencyCog == null) {
        agencyCog = dhis.getByName("categoryOptionGroup", agencyName);
        if (agencyCog) {
            if (agencyCog.code) {
                agencyCog = null;
            } else {
                log.action("Adding agency code to " + agencyName );
                agencyCog.code = "Agency_" + agencyName;
                dhis.update("categoryOptionGroup", agencyCog);
            }
        }
    }
    if (agencyCog != null) {
        if (agencyCog.shortName != agencyName.substring(0, dhis.MAX_SHORT_NAME_LENGTH)) {
            dhis.fixShortName("categoryOptionGroup", agencyCog);
        }
    } else {
        log.action("Adding agency " + agencyName );
        agencyCog = dhis.addOrUpdatePrivateWithShortName("categoryOptionGroup", { code: "Agency_" + agencyName, name: agencyName });
    }
    dhis.addToCollectionIfNeededCached("categoryOptionGroupSet", "Funding Agency", "categoryOptionGroup", agencyCog);

    //
    // Remember that we have processed this agency at the global level.
    //
    agenciesGlobal[agencyName] = agencyCog;

    //
    // Unless we are doing sharing, we're done.
    //
    if ( !shares ) {
        return agencyCog;
    }

    //
    // Add agency global user groups if not already there.
    //
    var users = dhis.addOrUpdatePrivate("userGroup", { name: "Global Agency " + agencyName + " users" });
    var admins = dhis.addOrUpdatePrivate("userGroup", { name: "Global Agency " + agencyName + " user administrators" });
    var allMech = dhis.addOrUpdatePrivate("userGroup", { name: "Global Agency " + agencyName + " all mechanisms" });

    //
    // Share the agency category option group with global user groups.
    //
    dhis.shareCached("categoryOptionGroup", agencyCog, '--------', [
        {group: "Global Metadata Administrators", groupAccess: "rw------"},
        "Global User Administrators",
        "Global all mechanisms",
        users ] );

    //
    // Share the agency global user groups with global user groups.
    //
    dhis.shareCached("userGroup", [users, allMech], '--------', [
        {group: "Global Metadata Administrators", groupAccess: "rw------"},
        "Global User Administrators",
        allMech ] );

    dhis.shareCached("userGroup", admins, '--------', [
        {group: "Global Metadata Administrators", groupAccess: "rw------"},
        allMech ] );

    //
    // Share data access user groups with global agency user administrators.
    //
    dhis.shareCached("userGroup", ["Data EA access", "Data SI access", "Data SIMS access"], '--------', admins);

    //
    // Assign management of global agency user group.
    //
    dhis.addManagedGroupIfNeededCached("Global User Administrators", users);
    dhis.addManagedGroupIfNeededCached(admins, users);

    return agencyCog;
}

exports.newAgencyInCountry = function(shares, agencyName, countryName) {

    //
    // Check if we have already processed this agency for this country.
    //
    if (agenciesInCountry[countryName + "-agency-" + agencyName]) {
        return;
    }

    //
    // Process this agency at the global level if needed.
    //
    var agencyCog = newAgencyGlobal(shares, agencyName);

    log.info("Agency in " + countryName + ": " + agencyName);

    //
    // Unless we are doing sharing, we're done.
    //
    if ( !shares ) {
        return;
    }

    //
    // Add agency country user groups if not already there.
    //
    var users = dhis.addOrUpdatePrivate("userGroup", { name: "OU " + countryName + " Agency " + agencyName + " users" });
    var admins = dhis.addOrUpdatePrivate("userGroup", { name: "OU " + countryName + " Agency " + agencyName + " user administrators" });
    var allMech = dhis.addOrUpdatePrivate("userGroup", { name: "OU " + countryName + " Agency " + agencyName + " all mechanisms" });

    //
    // Share the agency category option group with country user groups.
    //
    dhis.shareCached("categoryOptionGroup", agencyCog, '--------', [
        "OU " + countryName + " All mechanisms",
        "OU " + countryName + " Agency " + agencyName + " users" ] );

    //
    // Share the agency country user groups with administrator groups.
    //
    dhis.shareCached("userGroup", [users, admins, allMech], '--------', [
        {group: "Global Metadata Administrators", groupAccess: "rw------"},
        "Global User Administrators",
        "Global Agency " + agencyName + " user administrators",
        "OU " + countryName + " User administrators",
        admins ] );

    //
    // Share the agency country user group (read-only) with itself.
    //
    dhis.shareCached("userGroup", users, 'r-------', users);

    //
    // Share data access user groups with country agency user administrators.
    //
    dhis.shareCached("userGroup", ["Data EA access", "Data SI access", "Data SIMS access"], '--------', admins);

    //
    // Assign management of country agency user group.
    //
    dhis.addManagedGroupIfNeededCached("Global User Administrators", users);
    dhis.addManagedGroupIfNeededCached("Global Agency " + agencyName + " user administrators", users);
    dhis.addManagedGroupIfNeededCached("OU " + countryName + " User administrators", users);
    dhis.addManagedGroupIfNeededCached(admins, users);

    //
    // Remember that we have processed this agency at the country level.
    //
    agenciesInCountry[countryName + "-agency-" + agencyName] = true;
}

function assignAgencyToManagePartner(countryName, partnerCode, partnerName, agencyName) {
    var agencyGroup = "OU " + countryName + " Agency " + agencyName + " user administrators";
    var partnerGroup = "OU " + countryName + " Partner " + partnerCode + " users - " + partnerName;
    log.action("Assigning agency group '" + agencyGroup + "' to manage partner group '" + partnerGroup + "'");
    dhis.addManagedGroupIfNeededCached(agencyGroup, partnerGroup);
    dhis.shareCached("userGroup",
        [
            "OU " + countryName + " Partner " + partnerCode + " users - " + partnerName,
            "OU " + countryName + " Partner " + partnerCode + " user administrators - " + partnerName,
            "OU " + countryName + " Partner " + partnerCode + " all mechanisms - " + partnerName
        ],
        null,
        "OU " + countryName + " Agency " + agencyName + " user administrators");
}

function removeParterFromAllCountryAgencyManagement(countryName, partnerCode, partnerName) {
    log.action("Removing all " + countryName + " agency management for partner " + " " + partnerCode + " " + partnerName);
    group = dhis.getByName("userGroup", "OU " + countryName + " Partner " + partnerCode + " users - " + partnerName );
    if (group) {
        for (var i in group.managedByGroups) {
            var managedByGroup = group.managedByGroups[i];
            if (managedByGroup.name.match(/^Global OU .* Agency .* user administrators$/)) {
                log.action("Removing partner group '" + group.name + "' from agency group management '" + managedByGroup.name + "'");
                removeFromCollection("userGroup", managedByGroup, "managedGroups/userGroups", group);
                dhis.unshareIfExists("userGroup",
                    [
                        "OU " + countryName + " Partner " + partnerCode + " users - " + partnerName,
                        "OU " + countryName + " Partner " + partnerCode + " user administrators - " + partnerName,
                        "OU " + countryName + " Partner " + partnerCode + " all mechanisms - " + partnerName
                    ],
                    "OU " + countryName + " Agency " + agencyName + " user administrators");
            }
        }
    }
}

exports.configureAgenciesManagingPartners = function(countryPartnerAgencies, partnerNames) {
    for (var countryName in countryPartnerAgencies) {
        if (countryPartnerAgencies.hasOwnProperty(countryName)) {
            var partnerCodes = countryPartnerAgencies[countryName];
            for (var partnerCode in partnerCodes) {
                if (partnerCodes.hasOwnProperty(partnerCode)) {
                    var agencies = common.propertyArray(partnerCodes[partnerCode]);
                    if (agencies.length == 1) {
                        assignAgencyToManagePartner(countryName, partnerCode, partnerNames[partnerCode], agencies[0]);
                    } else {
                        removeParterFromAllCountryAgencyManagement(countryName, partnerCode, partnerNames[partnerCode]);
                    }
                }
            }
        }
    }
}
