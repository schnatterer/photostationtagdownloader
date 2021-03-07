const nock = require('nock');
jest.mock('fs', () => require('memfs').fs);
const PhotoDownloader = require('../src/photoDownloader');
const vol = require('memfs').vol;
const path = require('path');


const baseUrl = 'http://diskstation';
const expectedCookie = 'myCookie';
const expectedSynoToken = 'mySyno';
const expectedErrorCode = 42

let downloader;
const password = 'dontCare';
const program = {
    url: baseUrl,
    user: 'ignored'
};

beforeEach(() => {
    downloader = new PhotoDownloader(program);
});

describe("Authentication", () => {

    test('unsuccessful auth', () => {
        mockAuthResponse(200, {success: false, error: { code: expectedErrorCode}});

        expect.assertions(1);

        return expect(downloader.downloadAllFiles(password))
            .rejects.toEqual(`Authentication failed. Returned success=false. error code ${expectedErrorCode}`);
    });

    test('auth returns non-2xx code', () => {
        const returnCode = 500;
        mockAuthResponse(returnCode, {dont: 'care'});

        expect.assertions(1);

        return expect(downloader.downloadAllFiles(password))
            .rejects.toEqual('response not OK, when fetching auth. Status: ' + returnCode);
    });

    // Successful auth tested with photos and tags

});

describe("Photos & Tags", () => {

    const expectedOutputFolder = '/output/dir';

    let photos = [];

    let tags = [];

    beforeEach(() => {
        photos = [
            photo(1, 'one.jpg', 'fake-binary-data-1'),
            photo(2, 'two.png', 'fake-binary-data-too')
        ];
        tags = [
            tag(1, 'our-tag', [photos[0]]),
            tag(2, 'the other tag', [photos[1]])
        ];

        nock.cleanAll();
        mockAuthResponse(200, {success: true});

        downloader = new PhotoDownloader({
            ...program,
            tags: [],
            output: expectedOutputFolder
        });

        vol.reset();
        vol.mkdirpSync(path.resolve(__dirname, "", expectedOutputFolder));
    });

    describe("Download photos", () => {

        test('tag folder', async () => {
            tags[0].photos.push(photos[1]);
            downloader.listsToDownload = [tags[0].name];
            vol.reset();
            mockSuccessfulPhotoDownload(photos);
            mockSuccessfulTagResponse(tags);
            mockFetchedTags(tags, 200, true);

            const stats = await downloader.downloadAllFiles(password);

            photos.forEach((photo) =>
                expect(vol.readFileSync(`/output/dir/${tags[0].name}/${photo.info.name}`, {encoding: 'ascii'})).toEqual(photo.data));
            expect(stats.filesTotal).toBe(photos.length);
            expect(stats.filesDownloaded).toBe(photos.length);
            expect(stats.filesSkipped).toBe(0);
        });

        test('flat folder', async () => {
            mockFetchedTags(tags, 200, true);
            mockSuccessfulTagResponse(tags);

            mockSuccessfulPhotoDownload(photos);
            downloader.folderStructure = 'flat';

            const stats = await downloader.downloadAllFiles(password);

            photos.forEach((photo) =>
                expect(vol.readFileSync(`/output/dir/${photo.info.name}`, {encoding: 'ascii'})).toEqual(photo.data));
            expect(stats.filesTotal).toBe(photos.length);
            expect(stats.filesDownloaded).toBe(photos.length);
            expect(stats.filesSkipped).toBe(0);
        });

        test('server folder', async () => {
            mockFetchedTags(tags, 200, true);
            mockSuccessfulTagResponse(tags);

            mockSuccessfulPhotoDownload(photos);
            downloader.folderStructure = 'server';

            const stats = await downloader.downloadAllFiles(password);

            // Note: For now we photos do not support server folder, because it's difficult if not impossible to query
            photos.forEach((photo) =>
                expect(vol.readFileSync(`/output/dir/${photo.info.name}`, {encoding: 'ascii'})).toEqual(photo.data));
            expect(stats.filesTotal).toBe(photos.length);
            expect(stats.filesDownloaded).toBe(photos.length);
            expect(stats.filesSkipped).toBe(0);
        });

        test('skip existing', async () => {
            mockFetchedTags(tags, 200, true);
            mockSuccessfulTagResponse(tags);

            mockSuccessfulPhotoDownload(photos);

            vol.mkdirSync(`/output/dir/${tags[0].name}`);
            vol.writeFileSync(`/output/dir/${tags[0].name}/${photos[0].info.name}`, 'some other data', {encoding: 'ascii'});

            const stats = await downloader.downloadAllFiles(password);

            expect(vol.readFileSync(`/output/dir/${tags[0].name}/${photos[0].info.name}`, {encoding: 'ascii'})).toEqual('some other data');
            expect(stats.filesTotal).toBe(2);
            expect(stats.filesDownloaded).toBe(1);
            expect(stats.filesSkipped).toBe(1);
        });

        test('returns non-2xx code', async () => {
            mockFetchedTags(tags, 200, true);
            mockSuccessfulTagResponse(tags);

            mockPhotoDownload(photos[0].id, 500, '');
            mockSuccessfulPhotoDownload([photos[1]]);

            const stats = await downloader.downloadAllFiles(password);

            [photos[1]].forEach((photo) =>
                expect(vol.readFileSync(`/output/dir/${tags[1].name}/${photo.info.name}`, {encoding: 'ascii'})).toEqual(photo.data));
            expect(stats.filesTotal).toBe(2);
            expect(stats.filesDownloaded).toBe(1);
            expect(stats.filesSkipped).toBe(0);
            expect(stats.filesFailed).toBe(1);
        });

    });

    describe("Select Tags", () => {

        test('no specific tag selected, i.e. all tags',  async () => {
            mockFetchedTags(tags, 200, true);
            mockSuccessfulPhotoDownload(photos);
            mockSuccessfulTagResponse(tags);

            const stats = await downloader.downloadAllFiles(password);

            tags.forEach((tag) =>
                tag.photos.forEach((photo) =>
                    expect(vol.readFileSync(`/output/dir/${tag.name}/${photo.info.name}`, {encoding: 'ascii'})).toEqual(photo.data)));

            expect(stats.listsTotal).toBe(tags.length);
            expect(stats.filesTotal).toBe(2);
            expect(stats.filesDownloaded).toBe(2);
            expect(stats.filesSkipped).toBe(0);

        });

        test('specific tag selected',  async () => {
            mockFetchedTags(tags, 200, true);

            mockSuccessfulPhotoDownload(photos);
            mockSuccessfulTagResponse(tags);

            const expectedTag = tags[0];

            downloader.listsToDownload = [expectedTag.name];

            const stats = await downloader.downloadAllFiles(password);

            expectedTag.photos.forEach((photo) =>
                    expect(vol.readFileSync(`/output/dir/${expectedTag.name}/${photo.info.name}`, {encoding: 'ascii'})).toEqual(photo.data));

            expect(stats.listsTotal).toBe(tags.length);
            expect(stats.filesTotal).toBe(1);
            expect(stats.filesDownloaded).toBe(1);
            expect(stats.filesSkipped).toBe(0);
        });

        test('tag selected that does not exist',  async () => {
            mockFetchedTags(tags, 200, true);

            mockSuccessfulPhotoDownload(photos);
            mockSuccessfulTagResponse(tags);

            downloader.listsToDownload = ['not existing'];

            const stats = await downloader.downloadAllFiles(password);

            expect(stats.listsTotal).toBe(tags.length);
            expect(stats.filesTotal).toBe(0);
            expect(stats.filesDownloaded).toBe(0);
            expect(stats.filesSkipped).toBe(0);
        });

        test('unsuccessful tag request', async () => {
            vol.reset()
            mockFetchedTags(tags, 200, true);
            mockSuccessfulPhotoDownload(photos);

            mockTagResponse(tags[0], 200, true);
            mockTagResponse(tags[1], 200, false);

            const stats = await downloader.downloadAllFiles(password);

            tags[0].photos.forEach((photo) =>
                expect(vol.readFileSync(`/output/dir/${tags[0].name}/${photo.info.name}`, {encoding: 'ascii'})).toEqual(photo.data));
            expect(stats.filesTotal).toBe(1);
            expect(stats.filesDownloaded).toBe(1);
            expect(stats.filesSkipped).toBe(0);
            expect(stats.filesFailed).toBe(0);
            expect(stats.listsTotal).toBe(2);
            expect(stats.listsFailed).toBe(1);
            expect(stats.listsDownloaded.length).toBe(1);
        });

        test('returns non-2xx code', async () => {
            vol.reset()
            mockFetchedTags(tags, 200, true);
            mockSuccessfulPhotoDownload(photos);

            mockTagResponse(tags[0], 200, true);
            mockTagResponse(tags[1], 500, true);

            const stats = await downloader.downloadAllFiles(password);

            tags[0].photos.forEach((photo) =>
                expect(vol.readFileSync(`/output/dir/${tags[0].name}/${photo.info.name}`, {encoding: 'ascii'})).toEqual(photo.data));
            expect(stats.filesTotal).toBe(1);
            expect(stats.filesDownloaded).toBe(1);
            expect(stats.filesSkipped).toBe(0);
            expect(stats.filesFailed).toBe(0);
            expect(stats.listsTotal).toBe(2);
            expect(stats.listsFailed).toBe(1);
            expect(stats.listsDownloaded.length).toBe(1);
        });
    });

    describe("Fetch Tags", () => {

        test('Successful request', async () => {
            vol.reset();
            mockSuccessfulPhotoDownload(photos);
            mockSuccessfulTagResponse(tags);
            mockFetchedTags(tags, 200, true);

            const stats = await downloader.downloadAllFiles(password);

            expect(stats.listsTotal).toBe(tags.length);
            expect(stats.filesTotal).toBe(2);
            // TODO why are some files downloaded twice? Only when running all tests :/
            expect(stats.filesSkipped).toBe(0);
            expect(stats.filesDownloaded).toBe(2);
        });

        test('unsuccessful request', () => {
            mockFetchedTags([], 200, false, expectedErrorCode);

            expect.assertions(1);

            return downloader.downloadAllFiles(password)
                .catch(e => expect(e).toEqual(`Fetching all tags returned success=false. error code ${expectedErrorCode}`));
        });

        test('returns non-2xx code', () => {
            mockFetchedTags([], 500, true);

            expect.assertions(1);

            return downloader.downloadAllFiles(password)
                .catch(e => expect(e).toEqual("response not OK, when fetching all tags. Status: 500"));
        });
    });
});

function mockSuccessfulPhotoDownload(photos) {
    photos.forEach((photo) => mockPhotoDownload(photo.id, 200, photo.data));
}
function mockSuccessfulTagResponse(tags) {
    tags.forEach((tag) => mockTagResponse(tag, 200, true));
}

function photo(id, name, data) {
    // Note: Data is not a part of the productive object, just makes testing simpler
    return {id: id, info: {name: name}, data: data}
}

function tag(id, name, photos) {
    return {id: id, name: name, photos: photos};
}

function mockAuthResponse(returnCode, response) {
    response.data = response.data || {};
    response.data.synotoken = expectedSynoToken
    nock(baseUrl)
        .post('/webapi/auth.php')
        .reply(returnCode, response, {
            'set-cookie': expectedCookie
        });
}

function mockPhotoDownload(photoId, returnCode, response) {
    nock(baseUrl)
        .post(`/webapi/download.php`)
        .reply(returnCode, response);
}

function mockTagResponse(tag, returnCode, responseSuccessful) {
    nock(baseUrl)
        .post(`/webapi/photo.php`)
        .reply(returnCode, {success: responseSuccessful, data: {items: tag.photos}});
}

function mockFetchedTags(tags, returnCode, responseSuccessful, errorCode = '') {
    const body = {success: responseSuccessful, data: {tags: tags}};
    if (errorCode) {
        body.error = {}
        body.error.code = errorCode
    }
    nock(baseUrl)
        .post(`/webapi/tag.php`)
        .reply(returnCode, body);
}