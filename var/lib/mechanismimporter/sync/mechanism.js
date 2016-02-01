/**
 * Node.js based script for DATIM (DHIS 2 for PEPFAR) mechanism management.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */

var log = require('../common/log.js');
var dhis = require('../common/dhis.js');
var orgunit = require('./orgunit.js');
var util = require('util');

function getMechanismCountry(mechanismCo) {
    return mechanismCo.organisationUnits.length == 0 ? null : mechanismCo.organisationUnits[0];
}

function getMechanismCountryName(mechanismCo) {
    return getMechanismCountry(mechanismCo) ? getMechanismCountry(mechanismCo).name : "";
}

function getMechanismUserGroupName(mechanismCo) {
    return ("OU " + getMechanismCountryName(mechanismCo) + " Mechanism " + mechanismCo.name).substring(0,dhis.MAX_NAME_LENGTH);
}

function removeMechanismCog(mechanismCo, cog) {
    dhis.removeFromCollection("categoryOptionGroup", cog, "categoryOption", mechanismCo);
}

function changeMechanismName(shares, mechanismCo, mechanismCoName) {
    log.action("Renaming mechanism " + mechanismCo.code + " from '" + mechanismCo.name + "' to '" + mechanismCoName + "'");
    dhis.removeNameFromCache("categoryOption", mechanismCo.name);
    if ( shares ) {
        var mechanismGroup = dhis.getByName("userGroup", getMechanismUserGroupName(mechanismCo));
        mechanismCo.name = mechanismCoName;
        mechanismCo.shortName = mechanismCoName.substring(0, dhis.MAX_SHORT_NAME_LENGTH);
        dhis.update("categoryOption", mechanismCo);
        if (mechanismGroup) {
            dhis.removeNameFromCache("userGroup", mechanismGroup.name);
            mechanismGroup.name = getMechanismUserGroupName(mechanismCo);
            dhis.update("userGroup", mechanismGroup);
        }
    }
}

function removeMechanismAgency(shares, mechanismCo, cog) {
    log.action("Removing Agency " + cog.name + " from mechanism '" + mechanismCo.name + "'");
    removeMechanismCog(mechanismCo, cog.id);
    if ( shares ) {
        dhis.unshareIfExists("userGroup", getMechanismUserGroupName(mechanismCo), [
            "Global Agency " + cog.name + " all mechanisms",
            "OU " + getMechanismCountryName(mechanismCo) + " Agency " + cog.name + " all mechanisms"]);
    }
}

function removeMechanismPartner(shares, mechanismCo, cog) {
    log.action("Removing Partner " + cog.code + " from mechanism '" + mechanismCo.name + "'");
    removeMechanismCog(mechanismCo, cog.id);
    if ( shares ) {
        dhis.unshareIfExists("categoryOptionGroup", cog.code, getMechanismUserGroupName(mechanismCo));
        var partnerCode = cog.code ? cog.code.split("_")[1] : "";
        dhis.unshareIfExists("userGroup", getMechanismUserGroupName(mechanismCo), [
            "Global Partner " + partnerCode + " all mechanisms - " + cog.name,
            "OU " + getMechanismCountryName(mechanismCo) + " Partner " + partnerCode + " all mechanisms - " + cog.name]);
    }
}

function removeNonAssignedCogs(shares, mechanismCo, partnerCode, agencyCode) {
    for (var i in mechanismCo.categoryOptionGroups) {
        var cogProperty = mechanismCo.categoryOptionGroups[i];
        if (!cogProperty.code || (cogProperty.code != partnerCode && cogProperty.code != agencyCode && cogProperty.code != "ALL_MECH_WO_DEDUP")) {
            log.trace("removeNonAssignedCogs not " + partnerCode + " or " + agencyCode + " = " + util.inspect(cogProperty));
            var cog = dhis.getById("categoryOptionGroup", cogProperty.id);
            if (cog.categoryOptionGroupSet && cog.categoryOptionGroupSet.name == "Funding Agency") {
                removeMechanismAgency(shares, mechanismCo, cog);
            } else if (cog.categoryOptionGroupSet && cog.categoryOptionGroupSet.name == "Implementing Partner") {
                removeMechanismPartner(shares, mechanismCo, cog);
            }
        }
    }
}

function changeMechanismCountry(shares, mechanismCo, countryName, partnerCode) {
    // If mechanism is changing country, just delete the mechanism user group
    // so all users are dropped as well (since the current user members may
    // include in-country users.)
    //
    // The group will be recreated in the new country.
    log.action("Changing Country from " + getMechanismCountryName(mechanismCo) + " to " + countryName + " for mechanism '" + mechanismCo.name + "'");
    if ( shares ) {
        var group = dhis.getByName("userGroup", getMechanismUserGroupName(mechanismCo));
        if (group) {
            dhis.removeAllManagedByGroups(group);
            dhis.removeAllSharing("userGroup", group);
            dhis.unshareIfExists("categoryOption", mechanismCo, group);
            dhis.unshareIfExists("categoryOptionGroup", "Partner_" + partnerCode, group);
            dhis.delete("userGroup", group);
        }
    }

    var country = orgunit.getCountry(shares, countryName);
    mechanismCo.organisationUnits = [ { name: country.name, id: country.id } ];
    dhis.update("categoryOption", mechanismCo);
}

function changeMechanismDates(mechanismCo, start, end) {
    log.action("Changing start/end dates from " + mechanismCo.startDate + "/" + mechanismCo.endDate + " to " + start + "/" + end + " for mechanism '" + mechanismCo.name + "'");
    mechanismCo.startDate = start;
    mechanismCo.endDate = end;
    dhis.update("categoryOption", mechanismCo);
}

exports.newMechanism = function(shares, mechanismCode, mechanismName, start, end, partnerCode, partnerName, agencyName, countryName, country) {
    log.info("Mechanism: " + countryName + " " + agencyName + " " + partnerCode + " " + mechanismCode + "-" + mechanismName);

    dhis.clearHibernateCache(); // Try to avoid hibernate cache corruption issues.

    //
    // If mechanism exists, check for changed properties.
    // If mechanism does not exist, add it.
    //
    var mechanismCoName = (mechanismCode + " - " + mechanismName).substring(0,dhis.MAX_NAME_LENGTH);
    var mechanismCo = dhis.getByCode("categoryOption", mechanismCode);
    if (mechanismCo != null) {
        if (mechanismCo.name != mechanismCoName) {
            changeMechanismName(shares, mechanismCo, mechanismCoName);
        }
        removeNonAssignedCogs(shares, mechanismCo, "Partner_" + partnerCode, "Agency_" + agencyName);
        // (Must remove any non-assigned partners or agencies before changing country.)
        if (getMechanismCountry(mechanismCo) && getMechanismCountryName(mechanismCo) != countryName) {
            changeMechanismCountry(shares, mechanismCo, countryName, partnerCode);
        }
        if (mechanismCo.startDate != start || mechanismCo.endDate != end) {
            changeMechanismDates(mechanismCo, start, end);
        }
    } else {
        log.action("Adding mechanism " + mechanismCoName );
        mechanismCo = dhis.addOrUpdatePrivateWithShortName("categoryOption",
            { code: mechanismCode, name: mechanismCoName, startDate: start, endDate: end, organisationUnits: [ { name: country.name, id: country.id } ] });
    }

    //
    // Update category option combo name and code if needed.
    //
    //mechanismCo = dhis.getById("categoryOption", mechanismCo.id); // Gets more attributes than get by code.
    //var expectedComboName = "(" + mechanismCo.name + ")";
    //var combo = mechanismCo.categoryOptionCombos[0];
    //if (!combo) {
    //    combo = [];
    //    combo.name = expectedComboName;
    //    combo.code = mechanismCode;
    //    combo = dhis.add("categoryOptionCombo", combo);
    //    dhis.addToCollection("categoryOption", mechanismCo, "categoryOptionCombo", combo);
    //    log.action("New combo: " + util.inspect(combo));
    //    //dhis.categoryOptionComboUpdate();
    //    //dhis.removeFromCache("categoryOption", mechanismCo);
    //    //mechanismCo = dhis.getById("categoryOption", mechanismCo.id); // Gets more attributes than get by code.
    //    //combo = mechanismCo.categoryOptionCombos[0];
    //    //log.action("Updated combo: " + util.inspect(combo));
    //}
    //else if (!combo.code || combo.code != mechanismCode || !combo.name || combo.name != expectedComboName ) {
    //    combo.name = expectedComboName;
    //    combo.code = mechanismCode;
    //    delete combo.created;
    //    delete combo.lastUpdated;
    //    log.action("Updating combo to " + util.inspect(combo));
    //    dhis.update("categoryOptionCombo", combo);
    //}

    //
    // Add mechanism category option to (if not there already):
    //      category combination "Funding Mechanism"
    //      category option group for funding agency
    //      category option group for implementing partner
    //      category option group for "All mechanisms without deduplication"
    //
    dhis.addToCollectionIfNeededCached("category", "Funding Mechanism", "categoryOption", mechanismCo);
    dhis.addToCollectionIfNeededCached("categoryOptionGroup", agencyName, "categoryOption", mechanismCo);
    dhis.addToCollectionIfNeededCached("categoryOptionGroup", "Partner_" + partnerCode, "categoryOption", mechanismCo);
    dhis.addToCollectionIfExistsIfNeeded("categoryOptionGroup", "All mechanisms without deduplication", "categoryOption", mechanismCo);

    //
    // Unless we are doing sharing, we're done.
    //
    if ( !shares ) {
        return;
    }

    //
    // Add user group for mechanism if not already there:
    //
    var mechanismUg = dhis.addOrUpdatePrivate("userGroup", { name: getMechanismUserGroupName(mechanismCo) } );

    //
    // Share the partner category option group for this mechanism with
    // global and country agency all mechanisms.
    //
    dhis.shareCachedReplace("categoryOptionGroup", "Partner_" + partnerCode, '--------', [
        "Global Agency " + agencyName + " all mechanisms",
        "OU " + countryName + " Agency " + agencyName + " all mechanisms" ] );

    //
    // Share the mechanism category option.
    //
    dhis.shareCachedReplace("categoryOption", mechanismCo, '--------', [
        {group: "Global Metadata Administrators", groupAccess: "rw------"},
        "Global all mechanisms",
        "Global Agency " + agencyName + " all mechanisms",
//         "Global Partner " + partnerCode + " all mechanisms - " + partnerName,
        "OU " + countryName + " All mechanisms",
        "OU " + countryName + " Agency " + agencyName + " all mechanisms",
        "OU " + countryName + " Partner " + partnerCode + " all mechanisms - " + partnerName,
        mechanismUg ] );

    //
    // Share the mechanism user group.
    //
    dhis.shareCachedReplace("userGroup", mechanismUg, '--------', [
        {group: "Global Metadata Administrators", groupAccess: "rw------"},
        "Global User Administrators",
        "Global Agency " + agencyName + " user administrators",
//         "Global Partner " + partnerCode + " user administrators - " + partnerName,
        "OU " + countryName + " User administrators",
        "OU " + countryName + " Agency " + agencyName + " user administrators",
        "OU " + countryName + " Partner " + partnerCode + " user administrators - " + partnerName ] );
}
