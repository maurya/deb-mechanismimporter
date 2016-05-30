var common = require('../common/common.js');
var log = require('../common/log.js');
var rest = require('../common/rest.js');
var dhis = require('../common/dhis.js');
var util = require('util');

//
// Make sure that all categoryOptionCombo names are correct.
// If the system supports categoryOptionCombo codes (DHIS 2 v2.22 and onwards),
// then make sure the code equals the categoryOption code.
exports.fix = function() {
    var mechanismCategory = dhis.getCache("category", "name", "Funding Mechanism");
    dhis.clearDhisCache();
    dhis.getAllInPath( "categoryOption", "categories/" + mechanismCategory.id + ".json?fields=categoryOptions[name,code,categoryOptionCombos[name,code,id]]&paging=none" );
    var options = dhis.getKeyCache("categoryOption", "name");
    for (var i in options) {
        if (options.hasOwnProperty(i)) {
            var option = options[i];
            var combo = option.categoryOptionCombos[0];
            if (combo.name != option.name ||
                ( combo.code && combo.code != option.code ) ) {
                log.action("Updating catOptionCombo code: " + combo.code + " -> " + option.code + ", name: " + combo.name + " -> " + option.name);
                var object = {};
                if (combo.name != option.name ) {
                    object.name = option.name;
                }
                if (combo.code && combo.code != option.code ) {
                    object.code = option.code;
                }
                rest.patch( "/api/categoryOptionCombos/" + combo.id + "?preheatCache=false", object);
            }
        }
    }
}
