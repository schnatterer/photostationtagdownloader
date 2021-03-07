const nock = require('nock');
jest.mock('fs', () => require('memfs').fs);
const AudioDownloader = require('../src/audioDownloader');
const vol = require('memfs').vol;
const path = require('path');

const baseUrl = 'http://diskstation';
const expectedCookie = 'myCookie';
const expectedSynoToken = 'mySyno';
const expectedSid = 'mySID'
const expectedErrorCode = 42

let downloader;
const password = 'dontCare';
const program = {
    url: baseUrl,
    user: 'ignored'
};

beforeEach(() => {
    downloader = new AudioDownloader(program);
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

    // Successful auth tested with Songs & Playlists

});

describe("Songs & Playlists", () => {

    const expectedOutputFolder = '/output/dir';

    let songs = [];

    let playlists = [];

    beforeEach(() => {

        songs = [
            song('1', 'first/path', 'one.mp3', 'fake-binary-data-1'),
            song('2', 'other/path', 'two.mp3', 'fake-binary-data-too')
        ];

        playlists = [
            playlist('1', 'our-playlist', [songs[0]]),
            playlist('2', 'the other playlist', [songs[1]])
        ];

        nock.cleanAll();
        mockAuthResponse(200, {success: true});

        downloader = new AudioDownloader({
            ...program,
            playlists: [],
            output: expectedOutputFolder
        });

        vol.reset();
        vol.mkdirpSync(path.resolve(__dirname, "", expectedOutputFolder));
    });

    describe("Download songs", () => {

        test('playlist folder', async () => {
            playlists[0].songs.push(songs[1]);
            downloader.listsToDownload = [playlists[0].name];
            vol.reset();
            mockSuccessfulSongDownload(songs);
            mockSuccessfulPlaylistResponse(playlists);
            mockFetchedPlaylists(playlists, 200, true);

            const stats = await downloader.downloadAllFiles(password);

            songs.forEach((song) =>
                expect(vol.readFileSync(`/output/dir/${playlists[0].name}/${song.name}`, {encoding: 'ascii'})).toEqual(song.data));
            expect(stats.filesTotal).toBe(songs.length);
            expect(stats.filesDownloaded).toBe(songs.length);
            expect(stats.filesSkipped).toBe(0);
        });

        test('flat folder', async () => {
            mockFetchedPlaylists(playlists, 200, true);
            mockSuccessfulPlaylistResponse(playlists);

            mockSuccessfulSongDownload(songs);
            downloader.folderStructure = 'flat';

            const stats = await downloader.downloadAllFiles(password);

            songs.forEach((song) =>
                expect(vol.readFileSync(`/output/dir/${song.name}`, {encoding: 'ascii'})).toEqual(song.data));
            expect(stats.filesTotal).toBe(songs.length);
            expect(stats.filesDownloaded).toBe(songs.length);
            expect(stats.filesSkipped).toBe(0);
        });

        test('server folder', async () => {
            mockFetchedPlaylists(playlists, 200, true);
            mockSuccessfulPlaylistResponse(playlists);

            mockSuccessfulSongDownload(songs);
            downloader.folderStructure = 'server';

            const stats = await downloader.downloadAllFiles(password);

            songs.forEach((song) =>
                expect(vol.readFileSync(`/output/dir/${song.path}`, {encoding: 'ascii'})).toEqual(song.data));
            expect(stats.filesTotal).toBe(songs.length);
            expect(stats.filesDownloaded).toBe(songs.length);
            expect(stats.filesSkipped).toBe(0);
        });

        test('skip existing', async () => {
            mockFetchedPlaylists(playlists, 200, true);
            mockSuccessfulPlaylistResponse(playlists);

            mockSuccessfulSongDownload(songs);

            vol.mkdirpSync(`/output/dir/${playlists[0].name}`);
            vol.writeFileSync(`/output/dir/${playlists[0].name}/${songs[0].name}`, 'some other data', {encoding: 'ascii'});

            const stats = await downloader.downloadAllFiles(password);

            expect(vol.readFileSync(`/output/dir/${playlists[0].name}/${songs[0].name}`, {encoding: 'ascii'})).toEqual('some other data');
            expect(stats.filesTotal).toBe(2);
            expect(stats.filesDownloaded).toBe(1);
            expect(stats.filesSkipped).toBe(1);
        });

        test('returns non-2xx code', async () => {
            mockFetchedPlaylists(playlists, 200, true);
            mockSuccessfulPlaylistResponse(playlists);

            mockSongDownload(songs[0].id, 500, '');
            mockSuccessfulSongDownload([songs[1]]);

            const stats = await downloader.downloadAllFiles(password);

            [songs[1]].forEach((song) =>
                expect(vol.readFileSync(`/output/dir/${playlists[1].name}/${song.name}`, {encoding: 'ascii'})).toEqual(song.data));
            expect(stats.filesTotal).toBe(2);
            expect(stats.filesDownloaded).toBe(1);
            expect(stats.filesSkipped).toBe(0);
            expect(stats.filesFailed).toBe(1);
        });
    });

    describe("Select Playlists", () => {

        test('no specific playlist selected, i.e. all playlists', async () => {
            mockFetchedPlaylists(playlists, 200, true);

            mockSuccessfulSongDownload(songs);
            mockSuccessfulPlaylistResponse(playlists);

            const stats = await downloader.downloadAllFiles(password);

            playlists.forEach((playlist) =>
                playlist.songs.forEach((song) =>
                    expect(vol.readFileSync(`/output/dir/${playlist.name}/${song.name}`, {encoding: 'ascii'})).toEqual(song.data)));

            expect(stats.listsTotal).toBe(playlists.length);
            expect(stats.filesTotal).toBe(2);
            expect(stats.filesDownloaded).toBe(2);
            expect(stats.filesSkipped).toBe(0);

        });

        test('specific playlist selected', async () => {
            mockFetchedPlaylists(playlists, 200, true);

            mockSuccessfulSongDownload(songs);
            mockSuccessfulPlaylistResponse(playlists);

            const expectedPlaylist = playlists[0];

            downloader.listsToDownload = [expectedPlaylist.name];

            const stats = await downloader.downloadAllFiles(password);

            expectedPlaylist.songs.forEach((song) =>
                expect(vol.readFileSync(`/output/dir/${expectedPlaylist.name}/${song.name}`, {encoding: 'ascii'})).toEqual(song.data));

            expect(stats.listsTotal).toBe(playlists.length);
            expect(stats.filesTotal).toBe(1);
            expect(stats.filesDownloaded).toBe(1);
            expect(stats.filesSkipped).toBe(0);
        });

        test('playlist selected that does not exist', async () => {
            mockFetchedPlaylists(playlists, 200, true);

            mockSuccessfulSongDownload(songs);
            mockSuccessfulPlaylistResponse(playlists);

            downloader.listsToDownload = ['not existing'];

            const stats = await downloader.downloadAllFiles(password);

            expect(stats.listsTotal).toBe(playlists.length);
            expect(stats.filesTotal).toBe(0);
            expect(stats.filesDownloaded).toBe(0);
            expect(stats.filesSkipped).toBe(0);
        });


        test('unsuccessful playlist request', async () => {
            mockFetchedPlaylists(playlists, 200, true);
            mockSuccessfulSongDownload(songs);

            mockPlaylistResponse(playlists[0], 200, true);
            mockPlaylistResponse(playlists[1], 200, false);


            const stats = await downloader.downloadAllFiles(password);

            playlists[0].songs.forEach((song) =>
                expect(vol.readFileSync(`/output/dir/${playlists[0].name}/${song.name}`, {encoding: 'ascii'})).toEqual(song.data));
            expect(stats.filesTotal).toBe(1);
            expect(stats.filesDownloaded).toBe(1);
            expect(stats.filesSkipped).toBe(0);
            expect(stats.filesFailed).toBe(0);
            expect(stats.listsTotal).toBe(2);
            expect(stats.listsFailed).toBe(1);
            expect(stats.listsDownloaded.length).toBe(1);
        });

        test('returns non-2xx code', async () => {
            mockFetchedPlaylists(playlists, 200, true);
            mockSuccessfulSongDownload(songs);

            mockPlaylistResponse(playlists[0], 200, true);
            mockPlaylistResponse(playlists[1], 500, true);

            const stats = await downloader.downloadAllFiles(password);

            playlists[0].songs.forEach((song) =>
                expect(vol.readFileSync(`/output/dir/${playlists[0].name}/${song.name}`, {encoding: 'ascii'})).toEqual(song.data));
            expect(stats.filesTotal).toBe(1);
            expect(stats.filesDownloaded).toBe(1);
            expect(stats.filesSkipped).toBe(0);
            expect(stats.filesFailed).toBe(0);
            expect(stats.listsTotal).toBe(2);
            expect(stats.listsFailed).toBe(1);
            expect(stats.listsDownloaded.length).toBe(1);
        });
    });

    describe("Fetch Playlists", () => {

        test('Successful request', async () => {
            downloader = new AudioDownloader({
                url: baseUrl,
                user: 'ignored'
            });
            downloader.output = expectedOutputFolder;
            downloader.listsToDownload = [];


            mockSuccessfulSongDownload(songs);
            mockSuccessfulPlaylistResponse(playlists);
            mockFetchedPlaylists(playlists, 200, true);

            const stats = await downloader.downloadAllFiles(password);

            expect(stats.listsTotal).toBe(playlists.length);
            expect(stats.filesTotal).toBe(2);
            expect(stats.filesSkipped).toBe(0);
            expect(stats.filesDownloaded).toBe(2);
        });

        test('unsuccessful request', () => {
            mockFetchedPlaylists([], 200, false, expectedErrorCode);

            expect.assertions(1);

            return downloader.downloadAllFiles(password)
                .catch(e => expect(e).toEqual(`Fetching all playlists returned success=false. error code ${expectedErrorCode}`));
        });

        test('returns non-2xx code', () => {
            mockFetchedPlaylists([], 500, true);

            expect.assertions(1);

            return downloader.downloadAllFiles(password)
                .catch(e => expect(e).toEqual("response not OK, when fetching all playlists. Status: 500"));
        });
    });

    describe("Create m3u", () => {

        test('none', async () => {
            mockFetchedPlaylists(playlists, 200, true);
            mockSuccessfulPlaylistResponse(playlists);

            mockSuccessfulSongDownload(songs);
            downloader.folderStructure = 'flat';

            await downloader.downloadAllFiles(password);

            expect(vol.existsSync(`/output/dir/${playlists[0].name}.m3u`)).toBeFalsy();
            expect(vol.existsSync(`/output/dir/${playlists[1].name}.m3u`)).toBeFalsy();
        });

        test('flat folder', async () => {
            mockFetchedPlaylists(playlists, 200, true);
            mockSuccessfulPlaylistResponse(playlists);

            mockSuccessfulSongDownload(songs);
            downloader.folderStructure = 'flat';
            downloader.m3u = true;

            await downloader.downloadAllFiles(password);


            playlists.forEach((playlist) => {

                expect(vol.existsSync(`/output/dir/${playlist.name}.m3u`)).toBeTruthy();
                const m3u = vol.readFileSync(`/output/dir/${playlist.name}.m3u`, {encoding: 'ascii'});

                playlist.songs.forEach( (song) => {
                    expect(m3u).toContain(song.name);
                })
            });
        });

        test('server folder', async () => {
            mockFetchedPlaylists(playlists, 200, true);
            mockSuccessfulPlaylistResponse(playlists);

            mockSuccessfulSongDownload(songs);
            downloader.folderStructure = 'server';
            downloader.m3u = true;

            await downloader.downloadAllFiles(password);


            playlists.forEach((playlist) => {

                expect(vol.existsSync(`/output/dir/${playlist.name}.m3u`)).toBeTruthy();
                const m3u = vol.readFileSync(`/output/dir/${playlist.name}.m3u`, {encoding: 'ascii'});

                playlist.songs.forEach( (song) => {
                    expect(m3u).toContain(song.path);
                })
            });
        });
    });
});

function mockSuccessfulSongDownload(songs) {
    songs.forEach((song) => mockSongDownload(song.id, 200, song.data));
}

function mockSuccessfulPlaylistResponse(playlists) {
    playlists.forEach((playlist) => mockPlaylistResponse(playlist, 200, true));
}

function song(id, path, name, data) {
    // Note: Data is not a part of the productive object, just makes testing simpler
    return {id: id, path: `${path}/${name}`, data: data, name: name}
}

function playlist(id, name, songs) {
    return {id: id, name: name, songs: songs};
}

function mockAuthResponse(returnCode, response) {
    response.data = response.data || {};
    response.data.synotoken = expectedSynoToken
    response.data.sid = expectedSid
    nock(baseUrl)
        .post('/webapi/auth.cgi')
        .reply(returnCode, response, {
            'set-cookie': expectedCookie
        });
}

function mockSongDownload(songId, returnCode, response) {
    nock(baseUrl)
        .post('/webapi/AudioStation/download.cgi', body => body.songs === songId)
        //.reply(returnCode, response);
        .reply(function (uri, requestBody) {
            // use normal function in that case, as arrow functions are using enclosing scope for this binding.
            expect(requestBody).toContain(`_sid=${expectedSid}`);
            expect(this.req.headers.cookie).toContain(expectedCookie);
            expect(this.req.headers['x-syno-token']).toContain(expectedSynoToken);
            return [
                returnCode,
                response
                ]
        });
}

function mockPlaylistResponse(playlist, returnCode, responseSuccessful, errorCode = '') {
    const expectedBody = {success: responseSuccessful, data: {playlists: [{name: playlist.name, additional: {songs: playlist.songs}}]}};
    if (errorCode) {
        expectedBody.error = {}
        expectedBody.error.code = errorCode
    }
    nock(baseUrl)
        .post('/webapi/AudioStation/playlist.cgi',
                body => body.id === playlist.id)
        .reply(returnCode, expectedBody);
}

function mockFetchedPlaylists(playlists, returnCode, responseSuccessful, errorCode = '') {
    const expectedBody = {success: responseSuccessful, data: {playlists: playlists}};
    if (errorCode) {
        expectedBody.error = {}
        expectedBody.error.code = errorCode
    }
    nock(baseUrl)
        .post('/webapi/AudioStation/playlist.cgi', body => body.method === 'list')
        .reply(returnCode, expectedBody);
}
