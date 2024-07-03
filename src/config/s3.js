const AWS = require('aws-sdk');
const config = require('./config');

AWS.config.update({
	accessKeyId: config.AWS_ACCESS_KEY_ID,
	secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
	region: config.AWS_REGION,
});

const s3 = new AWS.S3({
	multipartUploadThreshold: 20971520,
	multipartUploadSize: 15728640,
});

module.exports = s3;
