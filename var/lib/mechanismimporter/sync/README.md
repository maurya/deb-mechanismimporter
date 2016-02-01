This directory contains the code to synchronize PEPFAR mechanisms with a DHIS 2 ("DATIM") instance. It is used in two different environments:
- As the mechanismImporter within DATIM Node, to import mechanisms into DHIS 2 from the InterLinked Registry in CSD format.
- For DATIM Global to import mechanisms into DHIS 2 from a FACTS Info CSV file.

<h3>mechanismImporter in DATIM Node</h3>
The deployment will need the contents of this directory plus the contents of the ../common directory relative to here. It is suggested to put both of these directories under a mechanismImporter directory.

External dependencies are:
```
sudo apt-get install nodejs
sudo apt-get install npm
npm install synchronize
npm install xml2js
npm install fast-csv
npm install properties-reader
```
To run the mechanismImporter:
```
node csd
```
The mechanismImporter will look for a confgiuration properties file at
```
/etc/mechanismImporter/mechanismImporter.properties
```
The properties that can be set are:

- node.dhis.protocol (optional, default http) The protocol, http or https, to access the Node DHIS 2 system.
- node.dhis.domain (required) The host name of the Node DHIS 2 server.
- node.dhis.port (optional, default 80) The port number of the Node DHIS 2 server.
- node.dhis.path (optional, default '') The path of the Node DHIS 2 server, e.g. '/dhis' for hostname/dhis/...
- node.dhis.username (required) The user name for importing mechanisms into the DHIS 2 server.
- node.dhis.password (required) The password for importing mechanisms into the DHIS 2 server.
- node.ilr.protocol (optional, default http) The protocol, http or https, to access the Node ILR system.
- node.ilr.domain (required) The host name of the Node ILR server.
- node.ilr.port (optional, default 8984) The port of the Node ILR server.
- node.ilr.mechanismPath (optional, default /CSD/getDirectory/DATIM-FactsInfo) The ILR path for mechanisms and partners
- node.ilr.ouSearchPath (optional, default /CSD/csr/DATIM-Global/careServicesRequest/urn:ihe:iti:csd:2014:stored-function:organization-search) The ILR path to search for organisations.
- log.directory (optional, default ../log/) The directory in which log files are written.
- log.minimumLevel (optional, default 1) The minimum logging level to record into the log files.

The logging levels are:
```
7 - FATAL
6 - ERROR
5 - WARN
4 - ACTION
3 - INFO
2 - DEBUG
1 - TRACE
```
Logging notes:
- If log.minimumLevel is set to 4 or below, log files will be written in the log directory, one log file for each level. (The "action" log will contain only actions and higher, the "info" log will contain info and higher, etc.)
- Any ACTION or higher level messages will also be printed to standard output in addition to being recorded in log files, if any.
- It is not recommened to set log.minimumLevel above 5, or else errors will not be reported.

<h3>DATIM Global sync</h3>
The contents of this directory are needed plus the contents of the ../common directory relative to here.

To run the sync job:
```
node runsync dhis2Server username password
```
