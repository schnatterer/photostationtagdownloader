const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const promisePipe = require('promisepipe');

class Downloader {

    constructor(params) {

        this.baseUrl = `${params.url}/webapi`;
        this.output = params.output;
        this.folderStructure = params.folderStructure;
        this.listsToDownload = params.listsToDownload;
        this.user = params.user;

        this.listType = params.listType;
        this.authUrl = params.authUrl || 'auth.cgi';

        this.fetchListsUrl = params.fetchListsUrl;

        this.fetchListUrl = params.fetchListUrl;

        this.fetchFileUrl = params.fetchFileUrl;

        this.stats = {
            filesTotal : 0,
            filesDownloaded : 0,
            filesSkipped : 0,
            listsTotal : 0,
            listsFailed : 0,
            filesFailed : 0,
            listsDownloaded : []
        };

        this.cookie = undefined;
        this.synotoken = undefined;
        this.sid = undefined;
    }

    downloadAllFiles(password) {

        return this.auth(this.user, password)
            .then(() => this.fetchAndProcessLists())
            .then(() => this.stats)
    }

    auth(username, password) {
        const url = `${this.baseUrl}/${this.authUrl}`;
        console.log("Trying to fetch " + url);

        return this.postToNas(url, this.createAuthBody(username, password))
            .then(res => {
                this.cookie = res.headers.get('set-cookie');
                return this.validatedToJson(res, "auth");
            }).then(responseJson => {
                if (!responseJson.success) {
                    throw `Authentication failed. Returned success=false. error code ${responseJson.error.code}`
                }
                this.synotoken = responseJson.data.synotoken
                this.sid = responseJson.data.sid
                //There's also a 'did' field if we should ever need it
            })
    }

    fetchAndProcessLists() {
        return this.fetchLists()
            .then(res => this.validatedToJson(res, `all ${this.listType}s`))
            .then(json => this.processListsResponse(json));
    }

    validatedToJson(res, target) {
        if (res.ok) {
            return res.json()
        } else {
            throw `response not OK, when fetching ${target}. Status: ${res.status}`;
        }
    }

    processListsResponse(responseJson) {
        if (responseJson.success) {
            return this.processLists(this.findListInListsResponse(responseJson));
        } else {
            throw `Fetching all ${this.listType}s returned success=false. error code ${responseJson.error.code}`
        }
    }

    processLists(lists) {
        let promises = [];

        this.createFolderIfNotExists(this.output);

        lists.forEach(list => {
            this.stats.listsTotal++;
            if (this.allListsSelected() || this.listsToDownload.includes(list.name)) {
                let promise = this.fetchList(list)
                    .then(res => this.validatedToJson(res, `${this.listType} "${list.name}" (id ${list.id})`))
                    .catch(e => {
                        this.stats.listsFailed++;
                        throw e
                    })
                    .then(json => this.processListResponse(json, list))
                    .then(() => this.stats.listsDownloaded.push(list.name))
                    .catch(e => {
                        // Process error right away, because otherwise Promise.all() chain breaks, not waiting for
                        // successful promises to resolve
                        // Stats have been updated in the functions above
                        console.log(`Error processing list ${list.name}: ${e}`)
                    });
                promises.push(promise)
            }
        });
        return Promise.all(promises).then(() =>
            this.listsToDownload.forEach(list => {
                if (!this.stats.listsDownloaded.includes(list)) {
                    console.log(`WARNING: Selected ${this.listType} "${list}" not found on disk station or errored`)
                }
            }));
    }

    allListsSelected() {
        // Not passing any lists is interpreted as all lists
        return this.listsToDownload.length === 0;
    }

    processListResponse(responseJson, list) {
        if (responseJson.success) {
            return this.processFiles(this.findFilesInListResponse(responseJson), list);
        } else {
            this.stats.listsFailed++;
            throw `Fetching ${this.listType} "${list.name}" returned success=false. Response: ${JSON.stringify(responseJson)}.`
        }
    }

    async processFiles(files, list) {
        for (const file of files) {
            this.stats.filesTotal++;

            const destinationFilePath = this.createDestinationPathDependingOnFolderStructure(file, list);
            this.createFolderIfNotExists(Downloader.extractPath(destinationFilePath));

            if (fs.existsSync(destinationFilePath)) {
                console.log(`Skipping file, because it already exists: ${destinationFilePath}`);
                this.stats.filesSkipped++;
            } else {
                // Don't open too many connections in parallel
                await this.fetchFile(file)
                    .then(res => this.writeToFileIfResponseOk(res, file, destinationFilePath))
                    .then(promisePipe => {
                        console.log(`Finished writing file ${promisePipe[1].path}`);
                        this.stats.filesDownloaded++
                    }).catch(e => {
                        this.stats.filesFailed++;
                        return e;
                    });
            }
        }
    }

    createDestinationPathDependingOnFolderStructure(file, list) {
        let destinationFilePath;
        if (this.folderStructure === 'flat') {
            destinationFilePath = `${this.output}/${Downloader.extractFilename(this.findRelativePath(file))}`;
        } else if (this.folderStructure === 'server') {
            destinationFilePath = `${this.output}/${this.findRelativePath(file)}`;
        } else {
            if (this.folderStructure !== 'list') {
                console.log(`FolderStructure not set, assuming "list".`)
            }
            destinationFilePath = `${this.output}/${list.name}/${Downloader.extractFilename(this.findRelativePath(file))}`;
        }
        return destinationFilePath;
    }

    static extractPath(fileNameWithPath) {
        return fileNameWithPath.substring(0, fileNameWithPath.lastIndexOf("/"));
    }

    static extractFilename(fileNameWithPath) {
        return fileNameWithPath.substring(fileNameWithPath.lastIndexOf('/') + 1);
    }

    writeToFileIfResponseOk(res, file, path) {
        if (res.ok) {
            console.log('Writing ' + path);
            // Make sure that writing is finished before program exits
            return promisePipe(res.body, fs.createWriteStream(path))
        } else {
            throw `Can't write file, because response not OK. Status: ${res.status}. File: ${this.findRelativePath(file)} (id ${file.id})`;
        }
    }

    fetchLists() {
        const url = `${this.baseUrl}/${this.fetchListsUrl}`;
        console.log("Trying to fetch " + url);

        return this.postToNas(url, this.createFetchListsBody());
    }

    fetchList(list) {
        const url = `${this.baseUrl}/${this.fetchListUrl}`;

        console.log("Trying to fetch " + list.name + " (id " + list.id + ") from " + url);

        return this.postToNas(url, this.createFetchListBody(list));
    }

    fetchFile(file) {

        const url = `${this.baseUrl}/${this.fetchFileUrl}`;
        console.log(`Trying to fetch file ${this.findRelativePath(file)} from ${url}`);

        return this.postToNas(url, this.createFetchFileBody(file));
    }

    postToNas(url, form) {
        // Using cookies with fotos app of DSM7 seems to always result in error code 119, which is not documented :(
        // Sending both SID and cookie works for both. Good enough for now.
        form.append('_sid', this.sid)

        return fetch(url, {
            method: 'POST',
            body: form,
            headers: this.headers()
        });
    }

    headers() {
        return {
            // DS Photo works with cookie only
            cookie: this.cookie,
            'x-syno-token' :  this.synotoken
        };
    }

    // We need to create parent folders here as well, which is diffucult with node :-[
    // With node > 10 we can use fs.mkdir('dir', {recursive: true})
    // Taken from https://stackoverflow.com/a/40686853
    createFolderIfNotExists(targetDir, { isRelativeToScript = false } = {}) {
        //const sep = path.sep;
        const sep = '/';
        const initDir = path.isAbsolute(targetDir) ? sep : '';
        const baseDir = isRelativeToScript ? __dirname : '.';

        return targetDir.split(sep).reduce((parentDir, childDir) => {
            const curDir = path.resolve(baseDir, parentDir, childDir);
            try {
                fs.mkdirSync(curDir);
            } catch (err) {
                if (err.code === 'EEXIST') { // curDir already exists!
                    return curDir;
                }

                // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
                if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
                    throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
                }

                const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
                if (!caughtErr || caughtErr && curDir === path.resolve(targetDir)) {
                    throw err; // Throw if it's just the last created dir.
                }
            }

            return curDir;
        }, initDir);
    }

    createAuthBody(username, password) {

        // https://nodejs.org/api/url.html#url_class_urlsearchparams
        // Content-Type: application/x-www-form-urlencoded;charset=UTF-8
        let form = new URLSearchParams();
        //let form = new FormData();
        // Content-Type: multipart/form-data;
        form.append('api', 'SYNO.API.Auth');
        form.append('method', 'login');
        form.append('version', '3');
        form.append('account', username);
        form.append('passwd', password);
        form.append('enable_syno_token', 'yes')
        // Some docs say we SID must be enabled with format=sid
        // But the sid seems to be shipped anyways.
        // Docs also mention a session name "session" but it also works without...

        return form;
    }

    createFetchListsBody() {
        throw new TypeError("Abstract method called");
    }

    findListInListsResponse() {
        throw new TypeError("Abstract method called");
    }

    createFetchListBody() {
        throw new TypeError("Abstract method called");
    }

    findFilesInListResponse() {
        throw new TypeError("Abstract method called");
    }

    findRelativePath() {
        throw new TypeError("Abstract method called");
    }

    createFetchFileBody() {
        throw new TypeError("Abstract method called");
    }
}

module.exports = Downloader;