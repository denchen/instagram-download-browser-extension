import dayjs from "dayjs";
import { MESSAGE_ZIP_DOWNLOAD } from "../../constants";
import { getDataFromAPI, getImgOrVideoUrl } from "./fn";
import { getFilenameFromUrl, getZipFilename } from "./filename";

/**
 * Firefox assembles the zip in its background (it can structured-clone Blobs
 * over runtime.sendMessage, which Chrome cannot), so entries arrive there as
 * {filename, content} pairs and src/background/firefox.ts appends the extension.
 * Names come from the same shared helpers as the Chrome path, so both browsers
 * produce identical output.
 */
async function handleZipFirefox(articleNode: HTMLElement) {
    const data = await getDataFromAPI(articleNode);
    const blobList = [];
    if (data.caption) {
        blobList.push({
            filename: "caption.txt",
            content: data.caption.text,
        })
    }
    if ('carousel_media' in data) {
        const list = await Promise.all(
            data.carousel_media.map(async (resource: any, index: number) => {
                const url = getImgOrVideoUrl(resource);
                const filename = await getFilenameFromUrl({
                    url: url,
                    username: resource.owner?.username || data.owner.username,
                    datetime: dayjs.unix(resource.taken_at),
                    index: index + 1,
                });
                const response = await fetch(url, {
                    headers: new Headers({
                        Origin: location.origin,
                    }),
                    mode: 'cors',
                });
                if (!response.ok) {
                    console.error(`Failed to fetch ${url}`);
                    return null;
                }
                const content = await response.blob();
                return { filename, content };
            })
        );
        blobList.push(...list.filter((e) => e));
    } else {
        const url = getImgOrVideoUrl(data);
        const response = await fetch(url, {
            headers: new Headers({
                Origin: location.origin,
            }),
            mode: 'cors',
        });
        if (!response.ok) {
            console.error(`Failed to fetch ${url}`);
            return;
        }
        const filename = await getFilenameFromUrl({
            url: url,
            username: data.owner.username,
            datetime: dayjs.unix(data.taken_at),
            index: 1,
        });
        const content = await response.blob();
        blobList.push({ filename, content });
    }
    chrome.runtime.sendMessage({
        type: MESSAGE_ZIP_DOWNLOAD,
        data: {
            blobList,
            zipFileName: getZipFilename({
                username: data.owner.username,
                datetime: dayjs.unix(data.taken_at),
            }),
        },
    });
    return;
}

async function handleZipChrome(articleNode: HTMLElement) {
    const { BlobReader, BlobWriter, TextReader, ZipWriter } = await import("@zip.js/zip.js");
    const data = await getDataFromAPI(articleNode);
    const zipFileWriter = new BlobWriter();
    const zipWriter = new ZipWriter(zipFileWriter);
    if (data.caption) {
        await zipWriter.add("caption.txt", new TextReader(data.caption.text), { useWebWorkers: false });
    }
    if ('carousel_media' in data) {
        for (let i = 0; i < data.carousel_media.length; i++) {
            const resource = data.carousel_media[i];
            const url = getImgOrVideoUrl(resource);
            const response = await fetch(url, {
                headers: new Headers({
                    Origin: location.origin,
                }),
                mode: 'cors',
            });
            if (!response.ok) {
                console.error(`Failed to fetch ${url}`);
                continue;
            }
            const content = await response.blob();
            // The ordinal comes from `index` inside the base name (as ` 01`);
            // there is deliberately no separate prefix here anymore.
            const filename = await getFilenameFromUrl({
                url: url,
                username: resource.owner?.username || data.owner.username,
                datetime: dayjs.unix(resource.taken_at),
                index: i + 1,
            });
            let extension = content.type.split('/').pop() || 'jpg';
            if (extension === 'jpeg') extension = 'jpg';
            await zipWriter.add(`${filename}.${extension}`, new BlobReader(content), { useWebWorkers: false });
        }
    } else {
        const url = getImgOrVideoUrl(data);
        const response = await fetch(url, {
            headers: new Headers({
                Origin: location.origin,
            }),
            mode: 'cors',
        });
        if (!response.ok) {
            console.error(`Failed to fetch ${url}`);
            return;
        }
        // A lone entry still gets ` 01`, so single-image and carousel zips look
        // the same inside.
        const filename = await getFilenameFromUrl({
            url: url,
            username: data.owner.username,
            datetime: dayjs.unix(data.taken_at),
            index: 1,
        });
        const content = await response.blob();
        let extension = content.type.split('/').pop() || 'jpg';
        if (extension === 'jpeg') extension = 'jpg';
        await zipWriter.add(filename + '.' + extension, new BlobReader(content), {
            useWebWorkers: false,
        });
    }

    const zipContent = await zipWriter.close();
    const blobUrl = URL.createObjectURL(zipContent);
    const a = document.createElement('a');
    a.href = blobUrl;
    // `@username - <timestamp>.zip`, with no subfolder and no type prefix.
    a.download = getZipFilename({
        username: data.owner.username,
        datetime: dayjs.unix(data.taken_at),
    }) + '.zip';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(blobUrl);
    }, 100);

    return;
}

export function handleZipDownload(articleNode: HTMLElement) {
    const isFirefox = /Firefox/.test(window.navigator.userAgent);
    return isFirefox ? handleZipFirefox(articleNode) : handleZipChrome(articleNode);
}