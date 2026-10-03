import { audioIsMutedSVGPath, audioIsPlayingSVGPath, unmutedSVGPath } from "../../constants";

const volumeChangeGuard = new WeakMap<HTMLVideoElement, boolean>();

export function handleStoriesVideoVolumeChange(e: Event) {
    const target = e.target;
    if (!(target instanceof HTMLVideoElement)) return
    if (volumeChangeGuard.get(target)) return;
    volumeChangeGuard.set(target, true);
    try {
        const sectionNode = target.closest("section")
        if (!sectionNode) return;
        const isMutingBtn = sectionNode.querySelector(audioIsMutedSVGPath);
        const isUnmutingBtn = sectionNode.querySelector(audioIsPlayingSVGPath)
        const newEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        if (!target.muted && isMutingBtn) {
            isMutingBtn.dispatchEvent(newEvent)
        }
        if (target.muted && isUnmutingBtn) {
            isUnmutingBtn.dispatchEvent(newEvent)
        }
    } finally {
        setTimeout(() => {
            volumeChangeGuard.set(target, false);
        }, 100);
    }
}

function handleVideVolumeChange(e: Event, groupDiv: HTMLDivElement) {
    const videoTarget = e.target;
    if (!(videoTarget instanceof HTMLVideoElement)) return
    if (volumeChangeGuard.get(videoTarget)) return;
    volumeChangeGuard.set(videoTarget, true);
    try {
        const isMutingBtn = groupDiv.querySelector(audioIsMutedSVGPath);
        const isUnmutingBtn = groupDiv.querySelector(audioIsPlayingSVGPath) || groupDiv.querySelector(unmutedSVGPath);
        const newEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        if (!videoTarget.muted && isMutingBtn) {
            isMutingBtn.dispatchEvent(newEvent)
        }
        if (videoTarget.muted && isUnmutingBtn) {
            isUnmutingBtn.dispatchEvent(newEvent)
        }
    } finally {
        setTimeout(() => {
            volumeChangeGuard.set(videoTarget, false);
        }, 100);
    }
}

export function handleVideoMaskClip(videoPlayerMaskDiv: HTMLDivElement, videoTarget: HTMLVideoElement, customOptions: {
    bottomDiv?: Node | null;
    onVolumeChange?: (e: Event) => void,
} = {}) {
    videoTarget.controls = true;
    if (videoTarget.dataset.customVolumeAttached !== 'true') {
        const handler = customOptions.onVolumeChange
            ? customOptions.onVolumeChange
            : (event: Event) => {
                handleVideVolumeChange(event, videoPlayerMaskDiv);
            };
        videoTarget.addEventListener('volumechange', handler);
        videoTarget.dataset.customVolumeAttached = 'true';
    }
    videoPlayerMaskDiv.style.clipPath = `inset(0 0 4rem 0)`;

    if (customOptions.bottomDiv instanceof HTMLDivElement) {
        customOptions.bottomDiv.style.bottom = '4rem';
    } else {
        for (const child of videoPlayerMaskDiv.children) {
            if (child instanceof HTMLDivElement && child.querySelector('svg')) {
                child.style.bottom = "4rem"
            }
        }
    }
}