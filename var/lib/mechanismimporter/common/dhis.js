/**
 * Node.js based script for accessing common DHIS 2 object types.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */

var rest = require('./rest.js');
var common = require('./common.js');
var log = require('./log.js');
var util = require('util');

var objectCache = {};
var pendingShares = {};
var pendingShareReplaceFlags = {};
var pendingAddToCollection = {};
var MAX_NAME_LENGTH = 229;
var MAX_SHORT_NAME_LENGTH = 50;

common.defineConstant(exports, "MAX_NAME_LENGTH", MAX_NAME_LENGTH);
common.defineConstant(exports, "MAX_SHORT_NAME_LENGTH", MAX_SHORT_NAME_LENGTH);

String.prototype.plural = function() { // Derive the DHIS 2 plural object name.
    return this.substr(this.length - 1) == "y" ? this.substr(0, this.length - 1) + "ies" : this + "s";
}

var clearHibernateCache = exports.clearHibernateCache = function() {
    rest.put( "/api/maintenance/cache", null );
}

var categoryOptionComboUpdate = exports.categoryOptionComboUpdate = function() {
    rest.put( "/api/maintenance/categoryOptionComboUpdate", null );
}

var resourceTablesUpdate = exports.resourceTablesUpdate = function() {
    rest.put( "/api/resourceTables", null );
}

// Encode if server is using ASCII-8 URL encoding (not UTF-8).
var encodeAscii = exports.encodeAscii = function(text) {
    var a = []; // Behaves like StringBuilder.
    for (i = 0; i<text.length; i++) {
        if (text.charCodeAt(i) < 128) {
            a[i] = encodeURIComponent(text.substring(i,i+1));
        } else {
            a[i] = "%" + text.charCodeAt(i).toString(16).toUpperCase()
        }
    }
    return a.join("");
}

// Encode if server is using UTF-8.
var encode = exports.encode = function(text) {
    return encodeURIComponent(text);
}

exports.clearDhisCache = function() {
    objectCache = {};
}

var getKeyCache = exports.getKeyCache = function(type, keyField) {
    var typeCache = objectCache [ type ];
    if ( !typeCache ) {
        typeCache = {};
        objectCache [ type ] = typeCache;
    }
    var keyCache = typeCache [ keyField ];
    if ( !keyCache ) {
        keyCache = {};
        typeCache [ keyField ] = keyCache;
    }
    return keyCache;
}

var putCache = exports.putCache = function(type, keyField, object) {
    if ( object && object[ keyField ] ) {
        getKeyCache(type, keyField) [object[keyField]] = object;
        log.trace("dhis.putCache( " + type + ", " + keyField + ", " + object[keyField] + ")");
    }
}

var getCache = exports.getCache = function(type, keyField, key) {
    return getKeyCache(type, keyField) [ key ];
}

var removeKeyFromCache = function(type, keyField, object) {
    if (object && object [ keyField ]) {
        var keyCache = getKeyCache(type, keyField);
        if (keyCache [key]) {
            delete keyCache[key];
        }
    }
}

var updateCache = function(type, object) {
    putCache(type, "id", object);
    putCache(type, "code", object);
    putCache(type, "name", object);
    putCache(type, "uuid", object);
}

var removeFromCache = exports.removeFromCache = function(type, object) {
    removeKeyFromCache(type, "id", object);
    removeKeyFromCache(type, "code", object);
    removeKeyFromCache(type, "name", object);
    removeKeyFromCache(type, "uuid", object);
}

var getById = exports.getById = function(type, id) {
    log.trace("dhis.getById( " + type + ", " + id + ")" );
    var object = getCache(type, "id", id);
//    log.trace("dhis.getById - object from cache = " + util.inspect( object ));
    if (!object) {
        object = rest.getQuietly("/api/" + type.plural() + "/" + id + ".json?fields=:all", true);
        if (object) {
            updateCache(type, object);
        }
    }
    return object;
};

var getByCode = exports.getByCode = function(type, code) {
    var object = getCache(type, "code", code);
    if (!object) {
        var result = rest.get("/api/" + type.plural() + ".json?filter=code:eq:" + encode(code) + "&fields=:all");
        object = result[type.plural()].length == 0 ? null : result[type.plural()][0];
//        log.trace("dhis.getByCode - object = " + util.inspect( object ));
        if (object) {
            updateCache(type, object);
        }
    }
    return object;
};

var getByOperatorOnName = function(operator, type, name, fields) {
    log.trace("dhis.getByOperatorOnName (" + operator + ", " + type + ", " + name + (fields ? (", '" + fields + "'") : "") + ")");
    var object = fields ? undefined : getCache(type, "name", name);
    if (!object) {
        result = rest.get("/api/" + type.plural() + ".json?filter=name:" + operator + ":" + encode(name) + "&fields=" + (fields ? fields : ":all") );
        log.trace("dhis.getByOperatorOnName Result: " + util.inspect(result, { depth: 8 } ) );
        object = result[type.plural()].length == 0 ? null : result[type.plural()][0];
    }
    if (object) {
        updateCache(type, object);
    }
    return object;
};

var getByName = exports.getByName = function(type, name, fields) {
    log.trace("dhis.getByName (" + type + ", " + name + (fields ? (", '" + fields + "'") : "") + ")");
    var object = getByOperatorOnName("eq", type, name, fields); // Doesn't match some names with special characters in them, like maybe ':'.
    if (!object) {
        object = getByOperatorOnName("like", type, name, fields); // Works better on names with some special characters.
    }
    return object;
};

var getByNameLike = exports.getByNameLike = function(type, name, fields) {
    log.trace("dhis.getByNameLike (" + type + ", " + name + (fields ? (", '" + fields + "'") : "") + ")");
    return getByOperatorOnName("like", type, name, fields);
};

var getByNameOrCodeOrId = exports.getByNameOrCodeOrId = function(type, obj) {
    var object = getCache(type, "name", obj);
    if ( !object ) {
        object = getCache(type, "code", obj);
        if (!object) {
            object = getCache(type, "id", obj);
            if (!object) {
                object = getByName(type, obj.name ? obj.name : obj, undefined);
                if (!object) {
                    object = getByCode(type, obj.code ? obj.code : obj);
                    if (!object && ( obj.id || ( (typeof obj == 'string' || obj instanceof String) && /^[a-zA-Z]{1}[a-zA-Z0-9]{10}$/.test(obj) ) )) {
                        object = getById(type, obj.id ? obj.id : obj);
                    }
                }
            }
        }
    }
    //log.trace("dhis.getByNameOrCodeOrId returning " + type + " " + util.inspect(object));
    return object;
}

/**
 * Get an object given a reference. The reference can be the object already,
 * or it can be the name, or code, or ID of the object. Very flexible.
 *
 * @param type DHIS 2 object type
 * @param reference the name, code, ID or object itself
 * @returns {*} the object
 */
var getObject = function(type, reference, quietly) {
    if (reference == "undefined") {
        if (!quietly) {
            log.error("dhis.getObject: " + type + " undefined.");
        }
        return reference;
    }
    //log.trace("dhis.getObject " + type + " " + (typeof reference) + " " + ((typeof reference) == "string" ? reference : util.inspect(reference, { depth: 2 })) );
    if ((typeof reference) == "string" || reference instanceof String ) { // If reference is a string, look up by name, code or id.
        var object = getByNameOrCodeOrId(type, reference);
        if (!object && !quietly) {
            log.error("dhis.getObject: Can't find " + type + " " + util.inspect(reference));
        }
        return object;
    }
    return reference; // Not a string, so assume it is the object already.
}

var getAllInPath = exports.getAllInPath = function(type, path) {
    var result = rest.get("/api/" + path);
    //var all = result[type.plural()]
    if (!result[type.plural()]) {
        log.error("dhis.getAllInPath can't find array of " + type + " from '" + path + "' in result: " + util.inspect(result, {depth: 8}));
        return undefined;
    }
    var objectArray = result[type.plural()].length == 0 ? null : result[type.plural()];
//    log.info( "dhis.getAllInPath "; ( objectArray == null ? "didn't find " : "found " + result[type.plural()].length + " " ) + type + " " + path );
    if (objectArray) {
        for (var i = 0; i < objectArray.length; i++) {
            updateCache(type, objectArray[i]);
        }
    }
    return objectArray;
};

var getAll = exports.getAll = function( type, options ) {
    return getAllInPath(type, type.plural() + ".json?paging=none" + (options ? options : ""));
}

var getAllEqual = exports.getAllEqual = function( type, nameEquals, options ) {
    return getAllInPath(type, type.plural() + ".json?paging=none&filter=name:eq:" + encode(nameEquals) + (options ? options : ""));
}

var getAllLike = exports.getAllLike = function( type, nameLike, options ) {
    return getAllInPath(type, type.plural() + ".json?paging=none&filter=name:like:" + encode(nameLike) + (options ? options : ""));
}

var preloadCache = exports.preloadCache = function(type, fields, filter1, filter2) {
    var options = "&fields=" + encode(fields)
        + ( filter1 ? ( "&filter=" + encode(filter1) ) : "" )
        + ( filter2 ? ( "&filter=" + encode(filter2) ) : "" );
    log.info("dhis.preloadCache: " + type + " " + options);
    var objects = getAll(type, options);
    log.trace("dhis.preloadCache cached: " + util.inspect(objects, {depth: 8}));
}

var update = exports.update = function(type, object) {
    updateCache(type, object);
    delete object.href; // Delete href in case it is there -- update doesn't seem to work with it present(!)
    return rest.put( "/api/" + type.plural() + "/" + object.id + "?preheatCache=false", object);
}

var rename = exports.rename = function(type, reference, newName, newShortName) {
    var object = getObject(type, reference);
    if (!object) {
        getObject("dhis.rename can't find " + type + " " + util.inspect(objectReference));
        return;
    }
    log.debug("dhis.rename " + type + " '" + object.name + "' to '" + newName + "'");
    removeKeyFromCache(type, "name", object.name);
    object.name = newName.substring(0, MAX_NAME_LENGTH);
    if (newShortName) {
        object.shortName = newShortName.substring(0, MAX_SHORT_NAME_LENGTH);
    }
    update(type, object);
}

var fixShortName = exports.fixShortName = function(type, reference) {
    var object = getObject(type, reference);
    if (!object) {
        log.error("dhis.fixShortName can't find " + type + " " + util.inspect(objectReference));
        return;
    }
    var newShortName = object.name.substring(0,MAX_SHORT_NAME_LENGTH);
    log.debug("dhis.fixShortName of " + type + " '" + object.name + " from '" + object.shortName + "' to '" + newShortName + "'");
    object.shortName = newShortName;
    update(type, object);
}

var add = exports.add = function(type, object) {
    log.debug("dhis.add " + type + " " + ( object.name ? object.name : util.inspect(object) ) );
    var status = rest.post( "/api/" + type.plural(), object);
    var newObject = getByName(type, object.name, undefined); // (Assume what we added has a name!)
//    if (!status.lastImported) {
//        log.error("dhis.add Couldn't add " + type + " " + ( object.name ? object.name : util.inspect(object) ));
//        return status;
//    }
    if (object.publicAccess == "--------" || ( object.userGroupAccesses && object.userGroupAccesses.length) ) {
        //log.trace("dhis.add updating sharing because of publicAccess = " + object.publicAccess + " " + (object.publicAccess == "--------")
        //            + " or userGroupAccesses = " + object.userGroupAccesses + " " + (object.userGroupAccesses != undefined));
        var sharing = rest.get( "/api/sharing?type=" + type + "&id=" + newObject.id);
//            log.trace("dhis.add share result = " + util.inspect(sharing, { depth: 4 }) );
        if (object.publicAccess && object.publicAccess == "--------") {
            sharing.meta.allowPublicAccess = false;
            sharing.object.publicAccess = "--------";
        }
        if (object.userGroupAccesses) {
            var acl = sharing.object.userGroupAccesses;
            if (acl == undefined) // No access list yet, create one
            {
                sharing.object.userGroupAccesses = [];
                acl = sharing.object.userGroupAccesses;
            }
            for (var i in object.userGroupAccesses) {
                var ac = object.userGroupAccesses[i];
                acl.push({id: ac.userGroup.id, name: ac.userGroup.name, access: ac.access}); // Add share from->to.
            }
        }
//            log.trace("dhis.add - updating sharing with " + util.inspect(sharing, { depth: 4 }));
        rest.post("/api/sharing?type=" + type + "&id=" + newObject.id, sharing);
    }
    return newObject;
};

exports.delete = function(type, reference) {
    var object = getObject(type, reference);
    if (object) {
        removeFromCache(type, object);
        return rest.delete("/api/" + type.plural() + "/" + object.id, object);
    } else {
        log.error("dhis.delete can't find " + type + " '" + reference + "'");
    }
}

var addIfNotExists = exports.addIfNotExists = function(type, obj, fields) {
    var existing = getByName(type, obj.name, fields);
    if (existing) {
        return existing;
    }
    return add(type, obj);
}

var addOrUpdate = exports.addOrUpdate = function(type, obj) {
    obj.name = obj.name.substring(0,229); // Truncate names that are too long.
    var existing = getByName(type, obj.name, undefined);
//    log.trace("dhis.addOrUpdate " + type + " '" + obj.name + "' - " + util.inspect( existing ));
    if (existing) {
//        log.trace("dhis.addOrUpdate " + type + " '" + obj.name + "' already exists: " + util.inspect(existing) );
        var updateNeeded = false;
        for (var property in obj) {
            if ( property != "id" && property != "publicAccess" && obj[ property ] != existing[ property ] ) {
                //log.trace("dhis.addOrUpdate property " + property + " " + obj[ property ] + " != existing " + property + " " + existing[ property ] );
                updateNeeded = true;
                if (property == "name") {
                    removeKeyFromCache(type, "name", existing);
                    break;
                }
            }
        }
//        log.trace("dhis.addOrUpdate updateNeeded " + updateNeeded );
        if ( updateNeeded ) {
            log.debug("dhis.addOrUpdate updating " + type + " " + obj.name);
            obj.id = existing.id;
            update(type, obj);
            existing = obj;
        }
        log.trace("dhis.addOrUpdate returning existing " + type + " '" + existing.name + "' - " + util.inspect( existing ));
        return existing;
    } else {
        log.trace("dhis.addOrUpdate - adding new " + type + " '" + obj.name + "'");
        newObject = add(type, obj);
        if (newObject == undefined) {
            log.error("dhis.addOrUpdate failed to add " + type + " " + util.inspect(obj));
        }
        return newObject;
    }
}

var addOrUpdatePrivate = exports.addOrUpdatePrivate = function(type, object) {
    object["publicAccess"] = "--------";
    var storedObject = addOrUpdate(type, object);
    if ( storedObject ) {
//        log.trace("dhis.addOrUpdatePrivate object = " + util.inspect(storedObject, { depth: 4 }) );
        var sharingObject = rest.get("/api/sharing?type=" + type + "&id=" + storedObject.id);
//        log.trace("dhis.addOrUpdatePrivate result = " + util.inspect(sharingObject, { depth: 4 }) );
        if (sharingObject.object.publicAccess != "--------") {
            sharingObject.object.publicAccess = "--------";
            rest.post("/api/sharing?type=" + type + "&id=" + storedObject.id, sharingObject); // Made private
        }
    } else {
        log.error("dhis.addOrUpdatePrivate( " + type + " " + object.name + " ) failed.");
    }
    return storedObject;
}

var addOrUpdatePrivateWithShortName = exports.addOrUpdatePrivateWithShortName = function(type, object) {
    object["shortName"] = object.name.substring(0,49);
    return addOrUpdatePrivate(type, object);
}

var addToCollection = exports.addToCollection = function(type, objectReference, collectionAndAddendType, addendReference) {
    var collection = collectionAndAddendType.split("/")[0];
    var addendType = collectionAndAddendType.split("/").length > 1 ? collectionAndAddendType.split("/")[1] : collection;
    var object = getObject(type, objectReference);
    var addend = getObject(addendType, addendReference);
//    log.trace("dhis.addToCollection " + collection + " '" + util.inspect(addend) + "' to " + type + " '" + util.inspect(object) + "'" );
//    log.trace("adding " + collection + " '" + addend.name + "' to " + type + " '" + object.name + "'" );
    var result = rest.post( "/api/" + type.plural() + "/" + object.id + "/" + collection.plural() + "/" + addend.id);
    log.action("Adding " + collection + (collection == addendType ? "" : " " + addendType ) + " '" + addend.name + "' to " + type + " '" + object.name + "'" );
}

var addToCollectionIfExistsIfNeeded = exports.addToCollectionIfExistsIfNeeded = function(type, objectReference, collectionAndAddendType, addendReferences) {
    var object = getObject(type, objectReference, true); // (get quietly)
    if (object) {
        addToCollectionIfNeeded(type, objectReference, collectionAndAddendType, addendReferences);
    }
}

var addToCollectionIfNeeded = exports.addToCollectionIfNeeded = function(type, objectReference, collectionAndAddendType, addendReferences) {
    var collection = collectionAndAddendType.split("/")[0];
    var addendType = collectionAndAddendType.split("/").length > 1 ? collectionAndAddendType.split("/")[1] : collection;
    //log.trace("dhis.addToCollectionIfNeeded " + collection + " '" + util.inspect(addendReference) + "' -----to----- " + type + " '" + util.inspect(objectReference) + "'" );
    var object = getObject(type, objectReference);
    if (!object) {
        log.error("dhis.addToCollectionIfNeeded can't find base " + type + " " + util.inspect(objectReference));
        return;
    }
    log.trace("dhis.addToCollectionIfNeeded object " + util.inspect(object));
    var members = object[collection.plural()];
    log.trace("dhis.addToCollectionIfNeeded object " + " " + collection + " " + util.inspect(members));
    var memberMap = {}; // Convert members array to a map by shared member id.
    for (var i in members) {
        memberMap[members[i].id] = true;
    }
    var addendArray = [].concat(addendReferences); // addendReferences could be a single item or an array.
    for (var i in addendArray) {
        var addend = getObject(addendType, addendArray[i]);
        if (!addend) {
            log.error("dhis.addToCollectionIfNeeded can't find addend " + addendType + " " + util.inspect(addendArray[i]));
            return;
        }
        if (!memberMap[addend.id]) {
            addToCollection(type, object, collectionAndAddendType, addend);
        }
    }
}

// This is a cached (delayed write) version of adding to a collection, for performance reasons.
//
function addToCollectionIfNeededCachedOne(type, objectReference, collectionAndAddendType, addendReference) {
    var collection = collectionAndAddendType.split("/")[0];
    var addendType = collectionAndAddendType.split("/").length > 1 ? collectionAndAddendType.split("/")[1] : collection;
    var object = getObject(type, objectReference);
    if (!object) {
        log.error("dhis.addToCollectionIfNeededCached can't find base " + type + " " + util.inspect(objectReference));
        return;
    }
    var addend = getObject(addendType, addendReference);
    if (!addend) {
        log.error("dhis.addToCollectionIfNeededCached can't find addend " + addendType + " " + util.inspect(addendArray[i]));
        return;
    }
    var key = type + "-" + object.id + "-" + collectionAndAddendType;
    var cache = pendingAddToCollection[key];
    if (!cache) {
        cache = {};
        pendingAddToCollection[key] = cache;
    }
    cache[addend.id] = true;
    log.trace("dhis.addToCollectionIfNeededCached " + key + " " + addend.id);
}

var addToCollectionIfNeededCached = exports.addToCollectionIfNeededCached = function(type, objectReference, collectionAndAddendType, addends) {
    var addendArray = [].concat(addends);
    for (var i in addendArray) {
        addToCollectionIfNeededCachedOne(type, objectReference, collectionAndAddendType, addendArray[i]);
    }
}

function flushAddToCollectionCache() {
    for (var cache in pendingAddToCollection) {
        if (pendingAddToCollection.hasOwnProperty(cache)) {
            clearHibernateCache();
            var cacheSplit = cache.split("-");
            var type = cacheSplit[0];
            var objectReference = cacheSplit[1];
            var collectionAndAddendType = cacheSplit[2];
            var addends = common.propertyArray(pendingAddToCollection[cache]);
            log.trace("dhis.flushAddToCollectionCache item " + cache + " [" + addends + "]" );
            addToCollectionIfNeeded(type, objectReference, collectionAndAddendType, addends);
        }
    }
    pendingAddToCollection = {};
}

exports.addManagedGroupIfNeededCached = function(objectReference, addends){
    log.trace("dhis.addManagedGroupIfNeeded " + objectReference + " -> " + addends );
    addToCollectionIfNeededCached("userGroup", objectReference, "managedGroup/userGroup", addends);
}

function removeFromCollectionOne(type, objectReference, collectionAndAddendType, addendReference) {
    var collection = collectionAndAddendType.split("/")[0];
    var addendType = collectionAndAddendType.split("/").length > 1 ? collectionAndAddendType.split("/")[1] : collection;
    var object = getObject(type, objectReference);
    var addend = getObject(addendType, addendReference);
//    log.trace("dhis.removeFromCollection " + collection + " '" + util.inspect(addend) + "' to " + type + " '" + util.inspect(object) + "'" );
//    log.trace("removing " + collection + " '" + addend.name + "' to " + type + " '" + object.name + "'" );
    log.debug("dhis.removeFromCollection " + collection + " " + addendType + " '" + addend.name + "' to " + type + " '" + object.name + "'" );
    var result = rest.delete( "/api/" + type.plural() + "/" + object.id + "/" + collection.plural() + "/" + addend.id);
}

var removeFromCollection = exports.removeFromCollection = function(type, objectReference, collectionAndAddendType, addends) {
    var addendArray = [].concat(addends);
    for (var i in addendArray) {
        removeFromCollectionOne(type, objectReference, collectionAndAddendType, addendArray[i]);
    }
}

var removeAllManagedByGroups = exports.removeAllManagedByGroups = function(groupReference) {
    var group = getObject("userGroup", groupReference);
    if (!group) {
        log.error("dhis.removeAllManagedByGroups can't find base group " + util.inspect(groupReference));
        return;
    }
    for (var i in group.managedByGroups) {
        managedByGroup = group.managedByGroups[i];
        log.debug("dhis.removeAllManagedByGroups removing '" + group.name + "' from '" + managedByGroup.name + "'");
        removeFromCollection("userGroup", managedByGroup, "managedGroups/userGroups", group);
    }
}

// If replaceFlag is true, it means that sharing structure is completely replaced (if needed).
// If replaceFlag is false, it means that sharing is added to if needed (what's already there plus what's shared.
function shareOne(type, fromReference, publicAccess, to, replaceFlag) {
    var from = getObject(type, fromReference);
    if (!from || !from.id) {
        log.error("dhis.shareOne can't find " + type + " to share " + util.inspect(fromReference));
        return;
    }
    log.trace("dhis.shareOne type " + type + " from " + from.name + " publicAccess " + publicAccess + " to " + util.inspect(to) + " replaceFlag=" + replaceFlag);
    var sharing = rest.get("/api/sharing?type=" + type + "&id=" + from.id);
    var acl = sharing.object.userGroupAccesses;
    if (acl == undefined) // No access control list yet for this object, create one
    {
        acl = [];
        sharing.object.userGroupAccesses = acl;
    }
    var aclMap = {}; // Convert acl to a map by shared object id.
    for (var i in acl) {
        aclMap[acl[i].id] = acl[i].access;
    }
    var updateNeeded = false;
    var toArray = [].concat(to); // "to" could be either a single object or an array of objects.
    for (var i in toArray) {
        var id = getObject("userGroup", toArray[i].group ? toArray[i].group : toArray[i]).id;
        if (id == undefined) {
            log.error("dhis.shareOne can't find shareTo userGroup " + util.inspect(toArray[i]));
            return;
        }
        var access = toArray[i].groupAccess ? toArray[i].groupAccess : "r-------";
        if (aclMap[id] != access) {
            aclMap[id] = access;
            updateNeeded = true;
        }
    }
    if (replaceFlag) { // If replaceFlag, remove any ACL map entries that are not in the toArray:
        toMap = {}; // Convert toArray to a map by shared object id, so we can look up in it.
        for (var i in toArray) {
            var id = getObject("userGroup", toArray[i].group ? toArray[i].group : toArray[i]).id;
            toMap[id] = true; // Value doesn't matter -- just indicate if present.
        }
        for (var i in acl) {
            if (!toMap[acl[i].id]) {
                log.trace("dhis.shareOne removing " + acl[i].id)
                delete aclMap[acl[i].id];
                updateNeeded = true;
            }
        }
    }
    if (publicAccess && sharing.object.publicAccess != publicAccess) {
        updateNeeded = true;
        sharing.object.publicAccess = publicAccess;
    }
    if (updateNeeded) {
        acl = []; // Convert map back to acl.
        for (var property in aclMap) {
            if (aclMap.hasOwnProperty(property)) {
                acl.push({id: property, access: aclMap[property]});
            }
        }
        sharing.object.userGroupAccesses = acl;
        rest.post("/api/sharing?type=" + type + "&id=" + from.id, sharing);
    }
}

function unshareOneIfExists(type, fromReference, to) {
    var from = getObject(type, fromReference, "quietly");
    if (!from || !from.id) {
        return;
    }
    var sharing = rest.get("/api/sharing?type=" + type + "&id=" + from.id);
    var acl = sharing.object.userGroupAccesses;
    if (acl == undefined) // No access control list yet for this object
    {
        return; // Nothing to unshare!
    }
    var aclMap = {}; // Convert acl to a map by shared object id.
    for (var i in acl) {
        aclMap[acl[i].id] = acl[i].access;
    }
    var updateNeeded = false;
    var toArray = [].concat(to); // "to" could be either a single object or an array of objects.
    for (var i in toArray) {
        var obj = getObject("userGroup", toArray[i].group ? toArray[i].group : toArray[i], "quietly");
        var id = obj ? obj.id : null;
        if (!id) {
            return;
        }
        var access = toArray[i].groupAccess ? toArray[i].groupAccess : "r-------";
        if (aclMap[id]) {
            delete aclMap[id];
            updateNeeded = true;
        }
    }
    if (updateNeeded) {
        acl = []; // Convert map back to acl.
        for (var property in aclMap) {
            if (aclMap.hasOwnProperty(property)) {
                acl.push({id: property, access: aclMap[property]});
            }
        }
        sharing.object.userGroupAccesses = acl;
        rest.post("/api/sharing?type=" + type + "&id=" + from.id, sharing);
    }
}

var share = exports.share = function(type, from, publicAccess, to) {
    var fromArray = [].concat(from);
    for (var i in fromArray) {
        shareOne(type, fromArray[i], publicAccess, to);
    }
}

var unshareIfExists = exports.unshareIfExists = function(type, from, to) {
    var fromArray = [].concat(from);
    for (var i in fromArray) {
        unshareOneIfExists(type, fromArray[i], to);
    }
}

function shareOneCached(type, fromReference, publicAccess, to, replaceFlag, quietly) {
    var from = getObject(type, fromReference, quietly);
    if (!from || !from.id) {
        if (!quietly) {
            log.error("dhis.shareOneCached can't find " + type + " to share " + util.inspect(fromReference));
        }
        return;
    }
    var key = type + "/" + from.id + "/" + publicAccess;
    var cache = pendingShares[key];
    if (!cache) {
        cache = {};
        pendingShares[key] = cache;
    }
    if (replaceFlag) {
        pendingShareReplaceFlags[key] = true;
    }
    var toArray = [].concat(to); // "to" could be either a single object or an array of objects.
    for (var i in toArray) {
        var toGroup = getObject("userGroup", toArray[i].group ? toArray[i].group : toArray[i]);
        if (toGroup == undefined || toGroup.id == undefined) {
            if (!quietly) {
                log.error("dhis.shareOneCached can't find shareTo userGroup " + util.inspect(toArray[i]));
                return;
            }
        } else {
            var access = toArray[i].groupAccess ? toArray[i].groupAccess : "r-------";
            cache[toGroup.id] = access;
            log.debug("dhis.shareOneCached " + type + " '" + from.name + "' shared with '" + toGroup.name + "' access '" + access + "'");
        }
    }
}

// This is a cached (delayed write) version of sharing, for performance reasons.
// It's here because some items, most notibly user groups for Data EA access,
// Data MER access, Data SIMS access, etc. are shared with a very large number
// of user groups. Rather than doing this sharing one at a time, we cache
// the list of user groups each should be share with, and then do it all at
// once. While this feature was designed with the most-shared user groups in
// mind, it can be used for all sharing (to use common code for everything, and
// in case there is also a smaller performance benefit for other objects.)
//
var shareCached = exports.shareCached = function(type, from, publicAccess, to) {
    var fromArray = [].concat(from);
    for (var i in fromArray) {
        shareOneCached(type, fromArray[i], publicAccess, to, false, false);
    }
}

var shareCachedQuietly = exports.shareCachedQuietly = function(type, from, publicAccess, to) {
    var fromArray = [].concat(from);
    for (var i in fromArray) {
        shareOneCached(type, fromArray[i], publicAccess, to, false, true);
    }
}

var shareCachedReplace = exports.shareCachedReplace = function(type, from, publicAccess, to) {
    var fromArray = [].concat(from);
    for (var i in fromArray) {
        shareOneCached(type, fromArray[i], publicAccess, to, true, false);
    }
}

function flushShareCache() {
    for (var cache in pendingShares) {
        if (pendingShares.hasOwnProperty(cache)) {
            clearHibernateCache();
            var cacheSplit = cache.split("/");
            var type = cacheSplit[0];
            var from = cacheSplit[1];
            var publicAccess = cacheSplit[2];
            var toArray = common.propertyArray(pendingShares[cache]);
            if ( toArray ) {
                log.trace("dhis.flushShareCache item " + cache + " [" + toArray + "]" );
                shareOne(type, from, publicAccess, toArray, pendingShareReplaceFlags[cache]);
            }
        }
    }
    pendingShares = {};
}

exports.removeAllSharing = function(type, objectReference) {
    var object = getObject(type, objectReference);
    if (!object) {
        log.error("dhis.removeAllSharing can't find " + type + " " + util.inspect(objectReference));
        return;
    }
    if (object.userGroupAccesses && object.userGroupAccesses.length > 0) {
        sharing = {};
        sharing.meta = {};
        sharing.meta.allowPublicAccess = true;
        sharing.meta.allowExternalAccess = false;
        sharing.object = {};
        sharing.object.id = object.id;
        sharing.object.name = object.name;
        sharing.object.publicAccess = object.publicAccess;
        sharing.object.externalAccess = object.externalAccess;
        sharing.object.userGroupAccesses = [];
        rest.post("/api/sharing?type=" + type + "&id=" + object.id, sharing);
    }
}

exports.flushCaches = function() {

    log.action("Flushing the add to collection cache.");
    flushAddToCollectionCache();

    log.action("Flushing the sharing pending cache.");
    flushShareCache();
}
