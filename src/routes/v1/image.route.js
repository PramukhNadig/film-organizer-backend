const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const decompress = require('decompress');
const path = require('path');
const S3 = require('../../config/s3');

const router = express.Router();

// we need to connect to s3 and get the image urls

const fs = require('fs');
const AdmZip = require('adm-zip');

const getFilmRolls = async () => {
	const params = {
		Bucket: 'film-files',
		Delimiter: '/',
	};

	return new Promise((resolve, reject) => {
		S3.listObjectsV2(params, (err, data) => {
			if (err) {
				console.log(err, err.stack);
				reject(err);
			} else {
				const folders = data.CommonPrefixes.map((prefix) => {
					const folder = prefix.Prefix.split('/')[0];
					return folder;
				});
				resolve(folders);
			}
		});
	});
};
router.get('/', async (req, res) => {
	const filmRolls = await getFilmRolls();
	res.send(filmRolls);
});

router.get('/:filmroll', async (req, res) => {
	const filmRoll = req.params.filmroll;
	const params = {
		Bucket: 'film-files',
		Prefix: filmRoll,
	};

	if (!filmRoll) {
		res.status(400).send('Film roll is required');
	}

	S3.listObjectsV2(params, (err, data) => {
		if (err) {
			console.log(err, err.stack);
			res.status(500).send('Error listing objects');
		} else {
			const urls = data.Contents.map((item) => {
				const url = `https://${params.Bucket}.s3.amazonaws.com/${item.Key}`;
				return url;
			});
			res.send(urls);
		}
	});
});

router.post('/:filmroll', async (req, res) => {
	const filmRoll = req.params.filmroll;
	const bucket = 'film-files';
	const destinationPath = filmRoll;

	// copy the files to a folder
	if (!filmRoll) {
		throw new Error('Film roll is required');
	}

	const filmRolls = await getFilmRolls();
	console.log(filmRolls);
	if (filmRolls && filmRolls.includes(filmRoll)) {
		res.status(400).send('Film roll already exists');
		return;
	}

	if (!req.files) {
		res.status(400).send('No files uploaded');
		return;
	}

	if (!req.files.file) {
		res.status(400).send('No files uploaded');
		return;
	}

	if (req.files.file.mimetype !== 'application/zip') {
		res.status(400).send('File must be a zip');
		return;
	}
	const job = {
		data: {
			file: req.files,
			filmRoll,
			bucket,
			destinationPath,
		},
	};

	worker(job);
	res.send('Files uploaded');
});

router.delete('/:filmroll', async (req, res) => {
	const filmRoll = req.params.filmroll;
	const params = {
		Bucket: 'film-files',
		Prefix: filmRoll,
	};

	if (!filmRoll) {
		res.status(400).send('Film roll is required');
	}

	S3.listObjectsV2(params, (err, data) => {
		if (err) {
			console.log(err, err.stack);
			res.status(500).send('Error listing objects');
		} else {
			const urls = data.Contents.map((item) => {
				const url = `https://${params.Bucket}.s3.amazonaws.com/${item.Key}`;
				return url;
			});

			const deleteParams = {
				Bucket: 'film-files',
				Delete: {
					Objects: data.Contents.map((item) => {
						return { Key: item.Key };
					}),
					Quiet: false,
				},
			};

			S3.deleteObjects(deleteParams, (err, data) => {
				if (err) {
					console.log(err, err.stack);
					res.status(500).send('Error deleting objects');
				} else {
					res.send('Film roll deleted');
				}
			});
		}
	});
});

router.put('/:filmroll/:filename/favorite', async (req, res) => {
	const filmRoll = req.params.filmroll;
	const { filename } = req.params;
	const params = {
		Bucket: 'film-files',
		Key: `${filmRoll}/${filename}`,
	};

	if (!filmRoll || !filename) {
		res.status(400).send('Film roll and filename are required');
	}

	S3.getObject(params, (err, data) => {
		if (err) {
			console.log(err, err.stack);
			res.status(500).send('Error getting object');
		} else {
			const userId = req.user.id; // Assuming you have the user's ID available
			const fileData = data.Body.toString(); // Assuming the file data is stored as a string

			// Save the file to the user's favorites in MongoDB
			const collection = db.collection('users');
			collection.updateOne({ _id: userId }, { $push: { favorites: fileData } }, (err, result) => {
				if (err) {
					console.log(err);
					res.status(500).send('Error adding file to favorites');
				} else {
					res.send('File favorited');
				}
			});
		}
	});
});

const worker = async (job) => {
	const { file, filmRoll, bucket, destinationPath } = job.data;
	console.log('worker');
	await uploadFilesToS3(file, filmRoll, bucket, destinationPath);
};

const uploadFilesToS3 = async (files, filmRoll, bucket) => {
	// copy zip file to uploads folder
	const { file } = files;
	const uploadPath = path.join('uploads', file.name);

	if (!fs.existsSync('uploads')) {
		fs.mkdirSync('uploads');
	}
	if (!fs.existsSync('tmp')) {
		fs.mkdirSync('tmp');
	}
	await new Promise((resolve, reject) => {
		file.mv(uploadPath, (err) => {
			if (err) {
				reject(new Error('Error uploading files'));
			} else {
				resolve();
			}
		});
	});

	const urls = [];

	// unzip the files
	const zip = new AdmZip(uploadPath);
	zip.extractAllTo('tmp', true);
	const filesInTmp = fs.readdir('tmp');

	for (const chunk of filesInTmp) {
		// ! WILL OVERFLOW actually ???
		await Promise.all(
			chunk.map(async (file) => {
				const filePath = path.join('tmp', file);
				const params = {
					Bucket: bucket,
					Key: `${filmRoll}/${file}`,
					Body: fs.createReadStream(filePath),
				};

				try {
					await S3.createMultipartUpload(params).promise();
					urls.push(params.Key);
					console.log('File uploaded');
				} catch (err) {
					throw new Error(`Error uploading to S3: ${err.message}`);
				}
			})
		);
	}
	fs.rmdirSync('uploads', { recursive: true, force: true });
	fs.rmdirSync('tmp', { recursive: true, force: true });

	return urls;
};

module.exports = router;
