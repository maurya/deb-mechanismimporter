/**
 * Node.js based script to run the CSD mechanism meta data import.
 *
 * Requires node.js and npm:
 *
 * sudo apt-get install nodejs
 * sudo apt-get install npm
 */
var sync = require('synchronize');
var https = require('https');
var http = require('http');
var util = require('util');
var xml2js = require('xml2js');

var mechanisms = require('./mechanisms.js');
var config = require('../common/config.js');
var rest = require('../common/rest.js');
var log = require('../common/log.js');

var mechanismList = [];

var agencies = {};
var partners = {};

var ilrProtocol = 'http';
var ilrHostname = null;
var ilrPort = 8984;
var ilrMechanismPath = '/CSD/getDirectory/DATIM-FactsInfo';
var ilrOuSearchPath = '/CSD/csr/DATIM-Global/careServicesRequest/urn:ihe:iti:csd:2014:stored-function:organization-search';
var ilrUserName = 'user';
var ilrPassword = 'password';

var configureSharing;

function csdConfig() {
    var propertiesFile = exports.propertiesFile = '/etc/mechanismImporter/mechanismImporter.properties';
    
    console.log("propertiesFile:" + propertiesFile);
    var dhisProtocolProperty = 'node.dhis.protocol';
    var dhisHostnameProperty = 'node.dhis.domain';
    var dhisPortProperty = 'node.dhis.port';
    var dhisPathProperty = 'node.dhis.path';
    var dhisUsernameProperty = 'node.dhis.username';
    var dhisPasswordProperty = 'node.dhis.password';

    var ilrProtocolProprerty = 'node.ilr.protocol';
    var ilrHostnameProperty = 'node.ilr.domain';
    var ilrPortProperty = 'node.ilr.port';
    var ilrMechanismPathProperty = 'node.ilr.mechanismPath';
    var ilrOuSearchPathProperty = 'node.ilr.ouSearchPath';
    var ilrUsernameProperty = 'node.ilr.username';
    var ilrPasswordProperty = 'node.ilr.password';

    var featureConfigureSharingProperty = 'feature.configureSharing';

    var logDirectoryProperty = 'log.directory';
    var logMinimumLevelProperty = 'log.minimumLevel';

    var logDirectory = '../log/';
    var logMinimumLevel = '1';

    config.loadProperties(propertiesFile);
    
    var dhisProtocol = config.get(dhisProtocolProperty);
    var dhisHostname = config.get(dhisHostnameProperty);
    var dhisPort = config.get(dhisPortProperty);
    var dhisPath = config.get(dhisPathProperty);
    var dhisUsername = config.get(dhisUsernameProperty);
    var dhisPassword = config.get(dhisPasswordProperty);
    var getIlrUserName  = config.get(ilrUsernameProperty);
    var getIlrPassword  = config.get(ilrPasswordProperty);

    if (!dhisProtocol) {
        dhisProtocol = 'http';
    }

    ilrHostname = config.get(ilrHostnameProperty); // Must be in properites file.

    var getIlrProtocol = config.get(ilrProtocolProprerty);
    var getIlrPort = config.get(ilrPortProperty);
    var getIlrMechanismPath = config.get(ilrMechanismPathProperty);
    var getIlrOuSearchPath = config.get(ilrOuSearchPathProperty);

    configureSharing = config.get(featureConfigureSharingProperty) ? true : false;

    var getLogDirectory = config.get(logDirectoryProperty);
    var getLogMinimumLevel = config.get(logMinimumLevelProperty);
    
    if (getIlrProtocol) {
        ilrProtocol = getIlrProtocol;
    }

    if (getIlrPort) {
        ilrPort = getIlrPort;
    }

    if (getIlrMechanismPath) {
        ilrMechanismPath = getIlrMechanismPath;
    }

    if (getIlrOuSearchPath) {
        ilrOuSearchPath = getIlrOuSearchPath;
    }

    if (getIlrUserName && getIlrPassword) {
        ilrUserName = getIlrUserName;
        ilrPassword = getIlrPassword;
    }

    if (getLogDirectory) {
        logDirectory = getLogDirectory;
    }

    if (getLogMinimumLevel) {
        logMinimumLevel = getLogMinimumLevel;
    }

    log.openAll(logDirectory, logMinimumLevel);

    if (!dhisHostname) {
        log.fatal("Error - Can't find property '" + dhisHostnameProperty + "' in " + propertiesFile );
    }
    if (!dhisUsername) {
        log.fatal("Error - Can't find property '" + dhisUsernameProperty + "' in " + propertiesFile );
    }
    if (!dhisPassword) {
        log.fatal("Error - Can't find property '" + dhisPasswordProperty + "' in " + propertiesFile );
    }
    if (!ilrHostname) {
        log.fatal("Error - Can't find property '" + ilrHostnameProperty + "' in " + propertiesFile );
    }
    if (!dhisHostname || !dhisUsername || !dhisPassword || !ilrHostname) {
        log.closeAll();
        process.exit(1); // Exit nodejs with failure.
    }

    rest.setCredentials(dhisProtocol, dhisHostname, dhisPort, dhisPath, dhisUsername, dhisPassword);
}

function getCsd(method, path, headers, payload, callback) {    
    var options = {
            method: method,
            host: ilrHostname,
            port: ilrPort,
            path: path,
            headers: headers,            
            auth: ilrUserName + ":" + ilrPassword            
    };

    var protocol = ilrProtocol == "https" ? https: http;

    var req = protocol.request(options, function(result) {
        var chunks = [];
        result.on('data', function(chunk) {
            chunks[chunks.length] = chunk; // Behaves like StringBuilder.
        });
        result.on('end', function(err) {
            var responseBody = chunks.join("");
            //log.trace("getCsd - Response: " + responseBody);
            if (result.statusCode != 200 && result.statusCode != 204)
            {
                log.error("Unexpected status code " + result.statusCode + " while getting CSD\n"
                    + responseBody );
                return;
            }

            var parser = new xml2js.Parser();
            parser.parseString(responseBody, function (err, result) {
                callback(null, result);
            });
        });
    });

    if (payload != null)
    {
        req.write(payload);
    }

    req.on('error', function(e) {
        log.error('getCsd - problem with request: ' + e.message);
    });

    req.end();
}

function csdToMechanismList( csd ) {
    var organizations = csd.CSD.organizationDirectory[0]['csd:organization'];    

    for (i in organizations) {
        var org = organizations[i];
        log.trace("csdToMechanismList ORG: " + util.inspect(org, { depth: null }));
        var entityId = org['$']['entityID'];

        var type = org['csd:codedType'][0]['$']['code'];
        var name = org['csd:primaryName'][0];
        var code = org['csd:otherID'][0]['$']['code'];
        log.trace("csdToMechanismList Type '" + type + "'");
        switch (type) {
            case 'mechanism':
                var props = org['csd:extension'][0]['d:mechanismDescriptor'][0];
                //name = props['d:Name'][0];
                log.trace("CDD mechanism: " + name + " '" + name.replace(/ - [0-9]*$/, "") + "'");
                mechanismList.push({
                    mechanismName: org['csd:otherName'][0].trim(),
                    mechanismCode: props['d:HQMechanismID'][0].trim(),
                    fiscalYear: props['d:FiscalYear'][0].trim(),
                    planningReportingCycle: props['d:PlanningReportingCycle'][0].trim(),
                    agencyName: props['d:FundingAgency'][0].trim(),
                    partnerUuid: props['d:PrimePartner'][0]['$']['entityID'].trim(),
                    countryUuid: props['d:OperatingUnit'][0]['$']['entityID'].trim(),
                    start: props['d:StartDate'][0],
                    end: props['d:EndDate'][0],
                    active: org['csd:record'][0]['$']['status'] == 'Active' ? 1 : 0
                });
                break;

            case 'partner':
                log.trace("CSD partner: " + name);
                partners[entityId] = {
                    name: name.trim(),
                    code: code.trim()
                }
                break;
        }
    }
}

function resolveUuidReferences() {    
    for ( i in mechanismList ) {
        var m = mechanismList[i];       
        var partner = partners[m.partnerUuid];      
        if (!partner) {
            log.error("Can't find partner with UUID '" + m.partnerUuid + "'");
        }
        m.partnerName = partner.name;
        m.partnerCode = partner.code;
    }
}

function loadCsd( method, path, contentType, payload ) {
    log.action(method + " " + ilrProtocol + "://" + ilrHostname + ":" + ilrPort + path);    
    csd = sync.await(getCsd(method, path, contentType, payload, sync.defer()));

    log.debug("Processing " + ilrProtocol + "://" + ilrHostname + ":" + ilrPort + path);
    csdToMechanismList( csd );

    log.debug("loadCsd Finished " + ilrProtocol + "://" + ilrHostname + ":" + ilrPort + path);
}

var main = exports.main = function main() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Ignore errors from self signed certificates
    csdConfig();   
    loadCsd("get", ilrMechanismPath, {}, null );
    resolveUuidReferences();
    mechanisms.sync(configureSharing, mechanismList);
    log.closeAll();
}

sync.fiber(function() {
    main();
});
