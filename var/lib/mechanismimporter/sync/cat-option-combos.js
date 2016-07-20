var common = require('../common/common.js');
var log = require('../common/log.js');
var rest = require('../common/rest.js');
var dhis = require('../common/dhis.js');
var util = require('util');

//
// Make sure that all categoryOptionCombo names are correct.
// If the system supports categoryOptionCombo codes (DHIS 2 v2.22 and onwards),
// then make sure the code equals the categoryOption code.
function localFix() {
    var mechanismCategory = dhis.getByName("category", "Funding Mechanism");
    dhis.clearDhisCache();
    dhis.getAllInPath( "categoryOption", "categories/" + mechanismCategory.id + ".json?fields=categoryOptions[name,code,categoryOptionCombos[name,code,id]]&paging=none" );
    var options = dhis.getKeyCache("categoryOption", "name");
    var optionCount = 0;
    var optionComboCount = 0;
    for (var i in options) {
        if (options.hasOwnProperty(i)) {
            optionCount++;
            var option = options[i];
            var combo = option.categoryOptionCombos[0];
            if (combo) {
                optionComboCount++;
                if ( combo.name != option.name || combo.code != option.code ) {
                    log.action("Updating catOptionCombo code: " + combo.code + " -> " + option.code + ", name: " + combo.name + " -> " + option.name);
                    var object = {};
                    if (combo.name != option.name ) {
                        object.name = option.name;
                    }
                    if (combo.code != option.code ) {
                        object.code = option.code;
                    }
                    rest.patch( "/api/categoryOptionCombos/" + combo.id + "?preheatCache=false", object);
                }
            }
        }
    }
    log.action("Checked " + optionCount + " options with " + optionComboCount + " option combos.");
    return optionCount - optionComboCount;
}

//
// The optionCombos for an option don't seem to be returned correctly under the following circumstances:
//
// - The option was just created.
// - The optionCombos where just rebuilt.
//
// When this happens, rebuilding the option combos again, and trying again, seems to solve the problem.
//
exports.fix = function() {
    for (i = 0; i < 20 && localFix() != 0; i++) {
        log.action("Retrying to check CategoryOptionCombos.");
        dhis.categoryOptionComboUpdate();
        dhis.clearHibernateCache();
    }
}
