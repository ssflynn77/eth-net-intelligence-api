var http = require("https");
var crypto = require('crypto');

function Oms(omsWorkspaceId, omsPrimaryKey) {
    this._omsWorkspaceId = omsWorkspaceId;
    this._omsPrimaryKey = omsPrimaryKey;
}

Oms.prototype.postJson = function (tableName, jsonToPost) {

    var dateHeaderString = new Date().toUTCString();

    var stringToHash = 'POST\n' + Buffer.byteLength(jsonToPost) + '\napplication/json\nx-ms-date:' + dateHeaderString + '\n/api/logs';
    var signature = crypto.createHmac('sha256', new Buffer(this._omsPrimaryKey, 'base64')).update(stringToHash, 'utf-8').digest('base64');

    var omsHostName = this._omsWorkspaceId + ".ods.opinsights.azure.com";
    var options = {
        hostname: omsHostName,
        port: 443,
        path: '/api/logs?api-version=2016-04-01',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Log-Type': tableName,
            'x-ms-date': dateHeaderString,
            'Authorization': "SharedKey " + this._omsWorkspaceId + ":" + signature,
            'time-generated-field': new Date().toISOString(),
        }
    };

    var req = http.request(options, function (res) {
        console.info('Status: ' + res.statusCode);
        console.info('Headers: ' + JSON.stringify(res.headers));
        res.on('data', function (body) {
            console.info('Body: ' + body);
        });
    });

    req.on('error', function (e) {
        console.info('problem with request: ' + e.message);
    });

    console.info('Sending to ' + omsHostName + ': ' + jsonToPost);

    // write data to request body
    req.write(jsonToPost);
    req.end();
};

module.exports = Oms;