import dayjs from 'dayjs';
import { checkType, downloadResource, getUrlFromInfoApi, openInNewTab } from './utils/fn';
import { getMediaName } from './utils/filename';
import { getCurrentStepFromDotsList } from './utils/dom';
import { DOWNLOAD_FAILED_MESSAGE, MediaType } from "../constants";

async function fetchVideoURL(containerNode: HTMLElement, videoElem: HTMLVideoElement) {
    const poster = videoElem.getAttribute('poster');
    const timeNodes = containerNode.querySelectorAll('time');
    const posterUrl = (timeNodes[timeNodes.length - 1].parentNode!.parentNode as any).href;
    const posterPattern = /\/([^/?]*)\?/;
    const posterMatch = poster?.match(posterPattern);
    const postFileName = posterMatch?.[1];
    const resp = await fetch(posterUrl);
    const content = await resp.text();
    const pattern = new RegExp(`${postFileName}.*?video_versions.*?url":("[^"]*")`, 's');
    const match = content.match(pattern);
    let videoUrl = JSON.parse(match?.[1] ?? '');
    videoUrl = videoUrl.replace(/^(?:https?:\/\/)?(?:[^@/\n]+@)?(?:www\.)?([^:/?\n]+)/g, 'https://scontent.cdninstagram.com');
    videoElem.setAttribute('videoURL', videoUrl);
    return videoUrl;
}

const getVideoSrc = async (containerNode: HTMLElement, videoElem: HTMLVideoElement) => {
    let url = videoElem.getAttribute('src');
    if (videoElem.hasAttribute('videoURL')) {
        url = videoElem.getAttribute('videoURL');
    } else if (url === null || url.includes('blob')) {
        url = await fetchVideoURL(containerNode, videoElem);
    }
    return url;
};

async function getUrl(containerNode: HTMLElement) {
    const pathnameList = window.location.pathname.split('/').filter((e) => e);
    const isPostDetailWithNameInUrl = pathnameList.length === 3 && pathnameList[1] === 'p';

    const mediaList = containerNode.querySelectorAll('li[style][class]');

    let url, res;
    let mediaIndex = -1;

    if (mediaList.length === 0) {
        // single img or video
        res = await getUrlFromInfoApi(containerNode);
        url = res?.url;
        if (!url) {
            const videoElem: HTMLVideoElement | null = containerNode.querySelector('article  div > video');
            const imgElem = containerNode.querySelector('article  div[role] div > img');
            if (videoElem) {
                // media type is video
                if (videoElem) {
                    url = await getVideoSrc(containerNode, videoElem);
                }
            } else if (imgElem) {
                // media type is image
                url = imgElem.getAttribute('src');
            } else {
                console.log('Err: not find media at handle post single');
            }
        }
    } else {
        // multiple media
        // Same ordering as post.ts: the rendered indicators describe the post on
        // screen, whereas ?img_index survives client-side navigation between
        // posts and can therefore name a slide from a different one.
        let dotsList;
        if (checkType() === 'pc') {
            dotsList = isPostDetailWithNameInUrl
                ? containerNode.querySelectorAll('article>div>div:nth-child(1)>div>div:nth-child(2)>div')
                : containerNode.querySelectorAll('div[role=button]>div>div>div>div>div>div:nth-child(2)>div');
        } else {
            dotsList = containerNode.querySelectorAll(`article>div>div:nth-child(2)>div>div:nth-child(2)>div`);
        }

        // Was an inline findIndex on classList.length === 2, a hardcoded magic
        // number. The shared helper checks ariaCurrent first and derives the
        // class-count baseline dynamically.
        const dotsIndex = dotsList && dotsList.length > 0 ? getCurrentStepFromDotsList(dotsList) : -1;
        const idxFromUrl = new URLSearchParams(window.location.search).get('img_index');

        if (dotsIndex >= 0) {
            mediaIndex = dotsIndex;
        } else if (idxFromUrl) {
            console.warn('Could not read the slide indicators; falling back to ?img_index, which may be stale.');
            mediaIndex = +idxFromUrl - 1;
        } else {
            console.warn('No media index found; defaulting to the first slide.');
            mediaIndex = 0;
        }
        res = await getUrlFromInfoApi(containerNode, mediaIndex);
        url = res?.url;
        if (!url) {
            const listElements = [
                ...containerNode.querySelectorAll<HTMLLIElement>(
                    `:scope > div > div:nth-child(1) > div > div:nth-child(1) ul li[style*="translateX"]`
                ),
            ];
            const listElementWidth = Math.max(...listElements.map((element) => element.clientWidth));
            const positionsMap = listElements.reduce<Record<string, HTMLLIElement>>((result, element) => {
                const position = Math.round(Number(element.style.transform.match(/-?(\d+)/)?.[1]) / listElementWidth);
                return { ...result, [position]: element };
            }, {});

            const node = positionsMap[mediaIndex];
            const videoElem = node.querySelector('video');
            const imgElem = node.querySelector('img');
            if (videoElem) {
                // media type is video
                url = await getVideoSrc(containerNode, videoElem);
            } else if (imgElem) {
                // media type is image
                url = imgElem.getAttribute('src');
            }
        }
    }
    return { url, res, mediaIndex };
}

export async function postDetailOnClicked(target: HTMLAnchorElement) {
    const containerNode = document.querySelector<HTMLElement>('section main');
    if (!containerNode) return;

    try {
        if (target.className.includes('zip-btn')) {
            const { handleZipDownload } = await import("./utils/zip")
            return handleZipDownload(containerNode)
        }

        const data = await getUrl(containerNode);
        if (!data?.url) throw new Error('post detail cannot get url');

        const { url, res, mediaIndex } = data;
        console.log('url', url);
        if (target.className.includes('download-btn')) {
            let postTime, posterName;
            if (res) {
                posterName = res.owner;
                postTime = dayjs.unix(res.taken_at);
            } else {
                postTime = document.querySelector('time')?.getAttribute('datetime');
                const name = document.querySelector<HTMLDivElement>(
                    'section main>div>div>div>div:nth-child(2)>div>div>div>div:nth-child(2)>div>div>div'
                );
                if (name) {
                    posterName = name.innerText || posterName;
                }
            }
            downloadResource({
                url: url,
                username: posterName,
                datetime: dayjs(postTime),
                id: res?.origin_data?.id || getMediaName(url),
                // Always indexed: every item in a carousel shares the post's
                // timestamp, so the ordinal is what keeps their names distinct.
                index: mediaIndex !== undefined && mediaIndex >= 0 ? mediaIndex + 1 : undefined,
                type: MediaType.Post,
            });
        } else {
            openInNewTab(url);
        }
    } catch (e: any) {
        alert(DOWNLOAD_FAILED_MESSAGE);
        console.log(`Uncaught in postDetailOnClicked(): ${e}\n${e.stack}`);
    }
}
