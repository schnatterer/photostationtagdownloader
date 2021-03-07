const Downloader = require('./downloader.js');
const URLSearchParams = require('url').URLSearchParams;

class FotoDownloader extends Downloader {

    constructor(params) {

        super({
            ...params,
            listsToDownload: params.tags,
            listType: 'tag',
            fetchListsUrl: 'entry.cgi',
            fetchListUrl: 'entry.cgi',
            fetchFileUrl: 'entry.cgi'
        });

        if (params.folderStructure === 'server') {
            // TODO we can get a folder_id in findRelativePath() -> could be used to resolve
            // id=3&additional=%5B%22access_permission%22%5D&api=%22SYNO.Foto.Browse.Folder%22&method=%22get%22&version=1
            // -> .name = '/folder'
            throw "folderStructure 'server' not supported for photos. "
        }
    }

    findListInListsResponse(responseJson) {
        return responseJson.data.list;
    }

    findFilesInListResponse(responseJson) {
        return responseJson.data.list;
    }

    findRelativePath(photo) {
        return photo.filename;
    }

    createFetchListsBody() {
        let form = new URLSearchParams();

        form.append('offset', '0');
        form.append('limit', '100');
        form.append('api', '"SYNO.Foto.Browse.GeneralTag"');
        form.append('method', '"list"');
        form.append('version', '1');

        return form;
    }

    createFetchListBody(tag) {
        let form = new URLSearchParams();

        form.append('general_tag_id', tag.id);
        form.append('api', '"SYNO.Foto.Browse.Item"');
        form.append('method', 'list');
        form.append('sort_by', 'filename');
        form.append('version', '1');
        form.append('sort_direction', 'asc');
        form.append('offset', '0');
        // TODO for large tags we might need to implement paging here
        form.append('limit', '5000');

        return form;
    }

    createFetchFileBody(photo) {

        // force_download=true&item_id=[3]&api=SYNO.Foto.Download&method=download&version=1
        let form = new URLSearchParams();
        form.append('item_id', `[${photo.id}]`);
        form.append('method', 'download');
        form.append('api', 'SYNO.Foto.Download');
        form.append('version', '1');
        form.append('force_download', 'true');

        return form;
    }
}

module.exports = FotoDownloader;