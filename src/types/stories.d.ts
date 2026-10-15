/**
 * A captured sample of one response, recorded in full. Fields the download
 * paths actually read are typed to agree with `MediaItem` in ./media; the rest
 * are as the sample had them, so a field that was null there reads `unknown`
 * until something needs it.
 */
export namespace Stories {
  export interface Root {
    data: Data;
    extensions: Extensions;
  }

  export interface Data {
    xdt_viewer: XdtViewer;
    xdt_api__v1__feed__reels_media: XdtApiV1FeedReelsMedia;
  }

  export interface XdtViewer {
    user: User;
  }

  export interface User {
    pk: string;
    id: string;
    can_see_organic_insights: boolean;
  }

  export interface XdtApiV1FeedReelsMedia {
    reels_media: ReelsMedum[];
  }

  export interface ReelsMedum {
    id: string;
    items: Item[];
    user: User3;
    seen: number;
    cover_media: unknown;
    title: unknown;
    reel_type: string;
  }

  export interface Item {
    pk: string;
    id: string;
    viewer_count: unknown;
    video_duration?: number;
    media_type: number;
    taken_at: number;
    story_cta: unknown;
    user: User2;
    has_liked: boolean;
    sharing_friction_info: SharingFrictionInfo;
    media_overlay_info: unknown;
    image_versions2: ImageVersions2;
    accessibility_caption?: string;
    organic_tracking_token: string;
    is_dash_eligible?: number;
    number_of_qualities?: number;
    video_dash_manifest?: string;
    video_versions?: VideoVersion[];
    boosted_status: unknown;
    original_width: number;
    original_height: number;
    story_countdowns: unknown;
    story_questions: unknown;
    story_sliders: unknown;
    preview: unknown;
    boost_unavailable_identifier: unknown;
    boost_unavailable_reason: unknown;
    product_type: string;
    audience: unknown;
    can_viewer_reshare: unknown;
    // null on a highlight, which the tray stores here too; see storyExpired.
    expiring_at: number | null;
    ig_media_sharing_disabled: boolean;
    story_music_stickers: unknown;
    carousel_media_count: unknown;
    carousel_media?: Item[];
    visual_comment_reply_sticker_info: unknown;
  }

  export interface User2 {
    pk: string;
    id: unknown;
    interop_messaging_user_fbid: unknown;
    is_private: boolean;
    profile_pic_url: unknown;
    username: string | null;
  }

  export interface SharingFrictionInfo {
    should_have_sharing_friction: boolean;
    bloks_app_url: unknown;
  }

  export interface ImageVersions2 {
    candidates: Candidate[];
  }

  export interface Candidate {
    height: number;
    url: string;
    width: number;
  }

  export interface VideoVersion {
    type: number;
    url: string;
  }

  export interface StoryLocation {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    location: Location;
    id: unknown;
  }

  export interface Location {
    pk: number;
  }

  export interface StoryFeedMedum {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    media_code: string;
    id: unknown;
    product_type: string;
  }

  export interface StoryAppAttribution {
    app_action_text: string;
    app_icon_url: string;
    name: string;
    content_url: string;
    link: unknown;
    id: string;
  }

  export interface User3 {
    username: string;
    id: unknown;
    pk: string;
    profile_pic_url: string;
    interop_messaging_user_fbid: string;
    is_private: boolean;
    is_verified: boolean;
    friendship_status: FriendshipStatus;
  }

  export interface FriendshipStatus {
    following: boolean;
  }

  export interface Extensions {
    is_final: boolean;
  }
}
