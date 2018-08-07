const FormData = require('form-data');
const DownloadService = require('./downloadService.js');

class PhotoDownloader {

    constructor(params) {

        this.listType = 'tag';

        this.downloadService = new DownloadService({
            url : params.url,
            user: params.user,
            output: params.output,
            flat: params.flat,

            listsToDownload: params.tags,

            listType: this.listType,

            authUrl: 'auth.php',
            createAuthBody: this.createAuthBody,

            fetchListsUrl: 'tag.php',
            createFetchListsBody: this.createFetchListsBody,
            findListInListsResponse: this.findListInListsResponse,

            fetchListUrl: 'photo.php',
            createFetchListBody: this.createFetchListBody,
            findFilesInListResponse: this.findFilesInListResponse,

            createFileName: this.createFileName,

            fetchFileUrl: 'download.php',
            createFetchFileBody: this.createFetchFileBody
        })
    }

    downloadAllFiles(password) {
        return this.downloadService.downloadAllFiles(password);
    };

    createAuthBody(username, password) {

        let form = new FormData();
        form.append('api', 'SYNO.PhotoStation.Auth');
        form.append('method', 'login');
        form.append('version', '1');
        form.append('username', username);
        form.append('password', password);

        return form;
    }

    findListInListsResponse(responseJson) {
        return responseJson.data.tags;
    }

    findFilesInListResponse(responseJson) {
        return responseJson.data.items;
    }

    createFileName(photo) {
        return photo.info.name;
    }

    createFetchListsBody() {
        let form = new FormData();
        form.append('type', 'desc');
        form.append('sort_by', 'title');
        form.append('sort_direction', 'asc');
        form.append('api', 'SYNO.PhotoStation.Tag');
        form.append('method', 'list');
        form.append('version', '1');
        form.append('offset', '0');
        form.append('thumbnail_status', 'true');
        form.append('limit', '999999999999');
        form.append('additional', 'info,thumb_size');

        return form;
    }

    createFetchListBody(tag) {
        let form = new FormData();
        form.append('filter_tag', tag.id);
        form.append('sort_by', 'filename');
        form.append('sort_direction', 'asc');
        form.append('api', 'SYNO.PhotoStation.Photo');
        form.append('method', 'list');
        form.append('version', '1');
        form.append('offset', '0');
        form.append('limit', '999999999999');
        form.append('type', 'photo,video');
        form.append('additional', 'photo_exif,video_codec,video_quality,thumb_size');

        return form;
    }

    createFetchFileBody(photo) {
        let form = new FormData();
        form.append('id', photo.id);
        form.append('method', 'getphoto');
        form.append('api', 'SYNO.PhotoStation.Download');
        form.append('version', '1');

        return form;
    }
}

module.exports = PhotoDownloader;