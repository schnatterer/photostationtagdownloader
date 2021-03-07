const read = require('read');
const startDate = new Date();

const AudioDownloader = require('../audioDownloader.js');
const PhotoDownloader = require('../photoDownloader.js');
const FotoDownloader = require('../fotoDownloader.js');

function cli(program) {

    if (!program) {
        program = require('commander');
    }

    let downloader;

    program
        .version('3.0.2-SNAPSHOT', '-v, --version');

    setCommonParams(program
        .command('photo')
        .description('Download from photo station'))
        .option('-t, --tags [value]', 'Comma separated list of specific tags to download. If not set, instead loads all tags', commaSeparatedMultiple, [])
        .action(function (env, options) {
            validateRequiredParams(options);
            downloader = new PhotoDownloader(options);
        });

    setCommonParams(program
        .command('foto')
        .description('Download from Synology Photos (DSM7)'))
        .option('-t, --tags [value]', 'Comma separated list of specific tags to download. If not set, instead loads all tags', commaSeparatedMultiple, [])
        .action(function (env, options) {
            validateRequiredParams(options);
            downloader = new FotoDownloader(options);
        });

    setCommonParams(program
        .command('audio')
        .description('Download from audio station'))
        .option('-p, --playlists [value]', 'Comma separated list of specific playlists to download. If not set, instead loads all playlists', commaSeparatedMultiple, [])
        .option('-m, --m3u [value]', 'Create m3u playlist files for each downloaded playlist', false)
        .action(function (env, options) {
            validateRequiredParams(options);
            downloader = new AudioDownloader(options);
        });

    program.parse(process.argv);

    if (!downloader) {
        program.help()
    }

    read({prompt: 'Password: ', silent: true, terminal: true}, function (er, password) {

        downloader.downloadAllFiles(password)
            .then(stats => {
                console.log(`Processed ${stats.listsTotal} ${downloader.listType}s  (of which ${stats.listsFailed} failed),` +
                            `containing ${stats.filesTotal} files ` +
                            `(downloaded ${stats.filesDownloaded}, skipped ${stats.filesSkipped}, failed ${stats.filesFailed})` +
                            `in ${(new Date() - startDate) / 1000}s`);
                process.exit()
            })
            .catch(err => {
                console.error(err);
                process.exit(1)
            });
    });
}

function setCommonParams(program) {
    const cliIntendion = '                                    ';
    return program
        .option('-u, --user <required>', 'Server user')
        .option('-o, --output <required>', 'Write to this folder')
        .option('-f, --folder-structure [folderStructure]',
            `\'flat\' - writes all files to a single folders.\n${cliIntendion}` +
            `\'list\' - creates subdirs for each list.\n${cliIntendion}` +
            '\'server\' - creates same folder structure as on server',
            'list')
        .arguments('<url>').action(function (url) {
            program.url = url
        })
}

function validateRequiredParams(options) {
    if (!options.user || !options.output || !options.url || !/^(flat|list|server)$/g.test(options.folderStructure)) {
        options.help()
    }
}

function commaSeparatedMultiple(newValuesString, existingValues) {
    const newValuesArray = newValuesString.split(',');
    for (const newValue of newValuesArray) {
        if (!existingValues.includes(newValue)) {
            existingValues = existingValues.concat(newValue)
        }
    }
    return existingValues;
}

module.exports = cli;