'use strict'

const AWS = require('aws-sdk')
const S3 = new AWS.S3({signatureVersion: 'v4'});
const Sharp = require('sharp');
const PathPattern = new RegExp("(.*/)?(.*)/(.*)");

// parameters
const { BUCKET, URL, CACHE_CONTROL } = process.env;


exports.handler = function(event, _context, callback) {
    const path = event.queryStringParameters.path;
    const parts = PathPattern.exec(path);
    const dir = parts[1] || '';
    const options = parts[2].split('_');
    const filename = parts[3];


    const sizes = options[0].split("x");
    const action = options.length > 1 ? options[1] : null;
    const allowActions = ['min', 'max', 'contain'];

    if (action && allowActions.indexOf(action) === -1) {
        callback(null, {
            statusCode: 400,
            body: `Unknown func parameter "${action}"\n` +
                  'For query ".../150x150_func", "_func" must be either empty, "_min", "_max" or "contain".',
            headers: {"Content-Type": "text/plain"}
        });
        return;
    }

    let contentType;
    S3.getObject({ Bucket: BUCKET, Key: dir + filename })
        .promise()
        .then(data => {
            contentType = data.ContentType;
            const width = sizes[0] === 'AUTO' ? null : parseInt(sizes[0]);
            const height = sizes[1] === 'AUTO' ? null : parseInt(sizes[1]);
            let fit;
            switch (action) {
                case 'max':
                    fit = 'inside';
                    break;
                case 'min':
                    fit = 'outside';
                    break;
                case 'contain':
                    fit = 'contain';
                    break;
                default:
                    fit = 'cover';
                    break;
            }
            const options = {
                withoutEnlargement: true,
                fit,
                background: 'white',
            };
            return Sharp(data.Body)
                .resize(width, height, options)
                .rotate()
                .toBuffer();
        })
        .then(result =>
            S3.putObject({
                Body: result,
                Bucket: BUCKET,
                ContentType: contentType,
                Key: path,
                CacheControl: CACHE_CONTROL,
            }).promise()
        )
        .then(() =>
            callback(null, {
                statusCode: 301,
                headers: { "Location": `${URL}/${path}` },
            })
        )
        .catch(e => 
            callback(null, {
                statusCode: e.statusCode || 400,
                body: 'Exception: ' + e.message,
                headers: { "Content-Type": "text/plain" },
            })
        );
}
