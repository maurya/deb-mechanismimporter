var https = require('https');
var http = require('http');
var url = require('url');
var util = require('util');
var sync = require('synchronize');
var common = require('./common.js');
var log = require('./log.js');

/**
 * Node.js based script for making a REST call to DHIS 2.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */

var sessionCookie;

var hostname = process.argv[2]; // Host name - First arg after javascript file name (unless overridden)
var username = process.argv[3]; // Username - Second arg after javascript file name (unless overridden)
var password = process.argv[4]; // Password - Third arg after javascript file name (unless overridden)
var protocol = "https";
var serverPort = "443";
var serverPath = "";

exports.setCredentials = function(setProtocol, setHostname, setPort, setPath, setUsername, setPassword) {
    if (setProtocol) {
        protocol = setProtocol;
    }
    if (setPort) {
        serverPort = setPort;
    }
    if (setPath) {
        serverPath = setPath;
    }
    hostname = setHostname;
    username = setUsername;
    password = setPassword;
}

function commonRest(method, path, requestObj, quietly, callback) {

    var servers = {
        local: {
            protocol: http,
            options: {
                host: 'localhost',
                port: 8084,
                path: "/dhis4" + path
            }
        },
        debug: {
            protocol: http,
            options: {
                host: 'localhost',
                port: 8080,
                path: path
            }
        }
    };

    var server = servers[hostname]; // Choose which preconfigured server.

    if (server == null) { // If not preconfigured, then look for hostname or hostname.datim.org:
        server = {
            protocol: protocol == "https" ? https : http,
            options: {
                host: hostname.indexOf(".") >= 0 || hostname == 'localhost' ? hostname : hostname + ".datim.org",
                port: serverPort,
                path: serverPath + path
            }
        };
    }

    server.options.method = method;

    internalRest(server, method, path, requestObj, quietly, callback);
}

function internalRest(server, method, path, requestObj, quietly, callback) {

    var requestJson = (requestObj == null ? null : JSON.stringify(requestObj));

    if (requestJson != null) {
        var contentLength = Buffer.byteLength(requestJson);
        server.options.headers = { 'Content-Type': 'application/json', 'Content-Length': contentLength };
    } else if (method == "post" || method == "put" || method == "patch") {
        server.options.headers = { 'Content-Length': 0 };
    } else {
        server.options.headers = {};
    }

    if ( sessionCookie ) {
        server.options.headers.Cookie = sessionCookie;
    } else {
        server.options.auth = username + ":" + password;
    }

    //
    // Construct a curl command that the user could execute for troubleshooting.
    // This doesn't always result in a workable curl command, especially if the
    // payload is large, but it often works, so it can be useful sometimes.
    //
    var curl = "curl -u " + username + ":" + password + " -X " + method.toUpperCase() +  " '"
        + ( server.protocol == http ? "http" : "https" ) + "://" + server.options.host + (server.options.port == undefined ? "" : ( ":" + server.options.port ) )  + server.options.path.replace(/'/g,"''") + "'"
        + ( requestJson == null ? "" : " -H 'Content-Type: application/json' -H 'Content-Length: " + requestJson.length + "' --data '" +  requestJson.replace(/'/g,"''") + "'" );

    log.info( curl.substring(0,10000) );

    var req = server.protocol.request(server.options, function(result) {
//        log.trace("Path: '" + path + "' code: " + result.statusCode);
//        log.trace("Result: " + result);
        var chunks = [];
        result.on('data', function(chunk) {
            chunks[chunks.length] = chunk; // Behaves like StringBuilder.
        });
        result.on('end', function(err) {
            var responseBody = chunks.join("");

            if ( !sessionCookie ) {
                var cookieArray = result.headers["set-cookie"];
                for (var i in cookieArray) {
                    var cookies = cookieArray[i].split(";");
                    for (var j in cookies) {
                        if (cookies[j].trim().indexOf("JSESSIONID=") == 0) {
                            sessionCookie = cookies[i].trim();
                        }
                    }
                }
            }
//            log.trace ("Path: '" + path + "' Body: " + responseBody);
            if (result.statusCode == 504) { // Gateway Time-out. Could be random. Retry for a while.
                log.warn("504 Gateway timeout on " + method + " " + path + (requestJson == null ? "" : " " + requestJson));
                if ( callback != null && callback != undefined ) {
                    callback(null, "Error");
                }
                return;
            }
            if (result.statusCode == 401) {
                var errorMessage = "Invalid login credentials for server " + hostname;
                log.fatal(errorMessage);
                console.log("Error - " + errorMessage);
                log.closeAll();
                process.exit(1);
            }
            if (result.statusCode == 302) {
                var newLocation = url.parse(result.headers["location"]);
                if (!newLocation) {
                    log.fatal("Status code 302 but no redirect location for " + method + " " + server.options.path
                        + (requestJson == null ? "" : " " + requestJson) + "\n"
                        + responseBody + "\n"
                        + curl + "\n"
                        + "Headers: " + util.inspect(result.headers));
                }
                server.protocol = newLocation.protocol == "https:" ? https : http;
                server.options.hostname = newLocation.hostname;
                server.options.port = newLocation.port ? newLocation.port : server.protocol == https ? 443 : 80;
                server.options.path = newLocation.path + (newLocation.hash ? newLocation.hash : "");
                log.info("302 redirect to " + newLocation.href);
                internalRest(server, method, path, requestObj, quietly, callback);
                return;
            }
            if (result.statusCode != 200 && result.statusCode != 204) {
                if (!quietly || result.statusCode != 404) {
                    log.error("Unexpected status code " + result.statusCode + " for " + method + " " + path + (requestJson == null ? "" : " " + requestJson) + "\n"
                        + responseBody + "\n"
                        + curl);
                }
                if ( callback != null && callback != undefined ) {
//                log.trace("commonRest calling back with " + util.inspect(obj));
                    callback(null, obj);
                }
                return;
            }
            var obj = null;
            if ( result.statusCode != 204 ) {
                try {
//                    log.trace("responsebody [" + responseBody + "]");
                    obj = JSON.parse(responseBody);
                } catch (err) {
                    if (responseBody != 'Access control set\n') {
                        log.error("Error '" + err.message + "' while parsing response body: " + util.inspect(responseBody) + "\n"
                        + curl );
                        if ( callback != null && callback != undefined ) {
                            callback(null, "FatalError");
                        }
                        return;
                    }
                }
            }
            if ( callback != null && callback != undefined ) {
//                log.trace("commonRest calling back with " + util.inspect(obj));
                callback(null, obj);
            }
        });
    });

    if (requestJson != null)
    {
        req.write(requestJson);
    }

    req.on('error', function(ex) {
        log.error("rest error handler:" + util.inspect(ex) + "\n"
        + ex.code + "\n"
        + ex + "\n"
        + curl );
        if (ex.code == "ENOTFOUND" && ex.syscall == "getaddrinfo") {
            log.error("Caused by: Host not found: '" + hostname + "'");
            return; // Die (no callback).
        }
        if ( callback != null && callback != undefined ) {
            callback(null, "Error");
        }
    });

    req.end();
}

commonRest = sync(commonRest);

function syncRest(method, path, requestObj, quietly) {
    var result;
    var retryCount = 10;
    do {
        result = sync.await(commonRest(method, path, requestObj, quietly, sync.defer()));
    } while ( result == "Error" && retryCount-- > 0 ); // Retry on connection error.
    if (result == "FatalError") {
        common.printStackTrace();
    }
    return result;
}

exports.get = function(path) {
    log.trace("+++GET: " + path);
    return syncRest( 'get', path, null, false )
}

exports.getQuietly = function(path, quietly) {
    log.trace("+++GET: " + path);
    return syncRest( 'get', path, null, quietly )
}

exports.put = function(path, requestObj) {
    log.trace("+++PUT: " + path /* + (requestObj ? " " + util.inspect(requestObj) : "") */ );
    return syncRest( 'put', path, requestObj, false )
}

exports.post = function(path, requestObj) {
    log.trace("+++POST: " + path /* + (requestObj ? " " + util.inspect(requestObj) : "") */ );
    return syncRest( 'post', path, requestObj, false )
}

exports.patch = function(path, requestObj) {
    log.trace("+++PATCH: " + path /* + (requestObj ? " " + util.inspect(requestObj) : "") */ );
    return syncRest( 'patch', path, requestObj, false )
}

exports.delete = function(path) {
    log.trace("+++DELETE: " + path);
    return syncRest( 'delete', path, null, false )
}
