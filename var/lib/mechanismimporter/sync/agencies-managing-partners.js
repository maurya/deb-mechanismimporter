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

var util = require('util');

var groupManagers = {};

// Each userGroup in the cache each has an array of the groups they manage
// (if any). For efficiency in this module, we need the opposite: For each
// managed group, we need an (associative) array of the groups it is managed
// by (its "managers"). This function builds this opposite association.
//
function buildGroupManagers() {
    var userGroupsByName = dhis.getKeyCache("userGroup", "name");
    for (var managerName in userGroupsByName) {
        if (userGroupsByName.hasOwnProperty(managerName)) {
            var manager = userGroupsByName[managerName];
            var managedGroups = manager.managedGroups;
            if (managedGroups) {
                for (var m in managedGroups) {
                    var managed = managedGroups[m];
                    var savedManaged = groupManagers[managed.id];
                    if (!savedManaged) {
                        savedManaged = {};
                        groupManagers[managed.id] = savedManaged;
                    }
                    savedManaged[manager.id] = manager;
                }
            }
        }
    }
}

// Make sure that no agency (optionally, except given ones) can manage the
// parter's users within that country.
//
function removeParterFromAgencyManagement(countryName, partnerCode, partnerName, partnerManagedGroupNames, allowedManagerNames) {
    log.info("Removing " + countryName + " agency management for partner " + partnerCode + " " + partnerName
        + ( allowedManagerNames ? " - except '" + allowedManagerNames  + "'" : "" ) );
    for (var i in partnerManagedGroupNames) {
        var groupName = partnerManagedGroupNames[i];
        var group = dhis.getCache("userGroup", "name", groupName);
        if (group) {
            var managers = groupManagers[group.id];
            if (managers) {
                for (m in managers) {
                    if (managers.hasOwnProperty(m)) {
                        var managerName = managers[m].name;
                        if (( managerName.search(/^Global Agency .* user administrators$/) == 0
                            || managerName.search(/^OU .* Agency .* user administrators$/) == 0 )
                            && ( !allowedManagerNames || allowedManagerNames.indexOf(managerName) < 0)) {
                            log.action("Removing partner group '" + groupName + "' from management by '" + managerName + "'");
                            dhis.removeFromCollection("userGroup", managers[m], "managedGroup/userGroup", group);
                            dhis.unshareIfExists("userGroup", group, managers[m]);
                        }
                    }
                }
            }
        }
    }
}

// If a partner has mechanisms with only one agency in a country, make sure that
// this agency (and no others) can manage the parter's users within that country.
//
function assignAgencyToManagePartner(countryName, partnerCode, partnerName, partnerManagedGroupNames, agencyName, partnerGroupName, managers) {
    var agencyGroupName = "OU " + countryName + " Agency " + agencyName + " user administrators";
    var globalAgencyGroupName = "Global Agency " + agencyName + " user administrators";
    log.info(countryName + " agency " + agencyName + " should manage partner '" + partnerCode + " - " + partnerName + "'");
    var agencyGroup = dhis.getCache("userGroup", "name", agencyGroupName);
    if (!agencyGroup || !agencyGroup.id) {
        log.error("assignAgencyToManagePartner can't find agency " + (agencyGroup ? "id for " : "") + "'" + agencyGroupName + "'");
        return;
    }
    var globalAgencyGroup = dhis.getCache("userGroup", "name", globalAgencyGroupName);
    if (!globalAgencyGroup || !globalAgencyGroup.id) {
        log.error("assignAgencyToManagePartner can't find global agency " + (globalAgencyGroup ? "id for " : "") + "'" + globalAgencyGroupName + "'");
        return;
    }
    for (var i in partnerManagedGroupNames) {
        var groupName = partnerManagedGroupNames[i];
        var group = dhis.getCache("userGroup", "name", groupName);
        if (group) {
            var managers = groupManagers[group.id];
            if (!managers || !managers[group.id]) {
                dhis.addManagedGroupIfNeededCached(agencyGroup, groupName);
                dhis.addManagedGroupIfNeededCached(globalAgencyGroup, groupName);
                dhis.shareCached("userGroup", groupName, null, [agencyGroupName, globalAgencyGroupName]);
            }
        }
    }
    removeParterFromAgencyManagement(countryName, partnerCode, partnerName, partnerManagedGroupNames, [agencyGroupName, globalAgencyGroupName])
}

// Fix the user group managing relationships between agences and partners.
// An agency may manage a partner's users within a country if, and only if,
// all of that partner's mechanisms are associated with that agency.
//
// If a partner has mechanisms with multiple agencies within a country, then
// that partner's users are not managed by any agency in that country.
//
exports.fix = function(countryPartnerAgencies, partnerNames) {
    buildGroupManagers();
    for (var countryName in countryPartnerAgencies) {
        if (countryPartnerAgencies.hasOwnProperty(countryName)) {
            var partnerCodes = countryPartnerAgencies[countryName];
            for (var partnerCode in partnerCodes) {
                if (partnerCodes.hasOwnProperty(partnerCode)) {
                    var partnerName = partnerNames[partnerCode];
                    var partnerGroupName = ("OU " + countryName + " Partner " + partnerCode + " users - " + partnerName).substring(0,dhis.MAX_NAME_LENGTH);
                    var partnerGroup = dhis.getCache("userGroup", "name", partnerGroupName);
                    if (!partnerGroup || !partnerGroup.id) {
                        log.error("agencies-managing-partners.fix: can't find group " + (partnerGroup ? "id " : "") + "for '" + partnerGroupName + "'");
                    } else {
                        var partnerManagedGroupNames = [
                            ("OU " + countryName + " Partner " + partnerCode + " users - " + partnerName).substring(0,dhis.MAX_NAME_LENGTH),
                            ("OU " + countryName + " Partner " + partnerCode + " user administrators - " + partnerName).substring(0,dhis.MAX_NAME_LENGTH),
                            ("OU " + countryName + " Partner " + partnerCode + " all mechanisms - " + partnerName).substring(0,dhis.MAX_NAME_LENGTH)
                        ];
                        var managers = groupManagers[partnerGroup.id];
                        var agencies = common.propertyArray(partnerCodes[partnerCode]);
                        if (agencies.length == 1) {
                            assignAgencyToManagePartner(countryName, partnerCode, partnerName, partnerManagedGroupNames, agencies[0], managers);
                        } else {
                            removeParterFromAgencyManagement(countryName, partnerCode, partnerName, partnerManagedGroupNames);
                        }
                    }
                }
            }
        }
    }
}
