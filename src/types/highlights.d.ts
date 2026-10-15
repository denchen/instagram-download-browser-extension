/**
 * A captured sample of one response, recorded in full. Fields the download
 * paths actually read are typed to agree with `MediaItem` in ./media; the rest
 * are as the sample had them, so a field that was null there reads `unknown`
 * until something needs it.
 */
export namespace Highlight {
  export interface Root {
    data: Data;
    extensions: Extensions;
    status: string;
  }

  export interface Data {
    xdt_api__v1__feed__reels_media__connection: XdtApiV1FeedReelsMediaConnection;
  }

  export interface XdtApiV1FeedReelsMediaConnection {
    edges: Edge[];
    page_info: PageInfo;
  }

  export interface Edge {
    node: Node;
    cursor: string;
  }

  export interface Node {
    id: string;
    items: Item[];
    user: User2;
    reel_type: string;
    cover_media: CoverMedia;
    title: string;
    seen: unknown;
    __typename: string;
  }

  export interface Item {
    pk: string;
    id: string;
    viewer_count: unknown;
    video_duration?: number;
    media_type: number;
    audience: unknown;
    taken_at: number;
    story_cta: unknown;
    user: User;
    has_liked: boolean;
    viewers: unknown;
    sharing_friction_info: SharingFrictionInfo;
    can_viewer_reshare: unknown;
    // null on a highlight: an archived story does not expire.
    expiring_at: number | null;
    ig_media_sharing_disabled: boolean;
    product_type: string;
    media_overlay_info: unknown;
    image_versions2: ImageVersions2;
    can_reply: boolean;
    can_reshare: boolean;
    has_audio?: boolean;
    story_music_stickers: unknown;
    carousel_media_count: unknown;
    carousel_media?: Item[];
    accessibility_caption?: string;
    original_width: number;
    original_height: number;
    organic_tracking_token: string;
    is_dash_eligible?: number;
    number_of_qualities?: number;
    video_dash_manifest?: string;
    video_versions?: VideoVersion[];
    visual_comment_reply_sticker_info: unknown;
    story_bloks_stickers?: StoryBloksSticker[];
    story_link_stickers: unknown;
    story_hashtags?: StoryHashtag[];
    story_locations: unknown;
    story_feed_media: unknown;
    text_post_share_to_ig_story_stickers: unknown;
    story_countdowns: unknown;
    story_questions: unknown;
    story_sliders: unknown;
    preview: unknown;
    is_paid_partnership: boolean;
    sponsor_tags: unknown;
    reshared_story_media_author: unknown;
    story_app_attribution: unknown;
    has_translation: boolean;
    boosted_status: unknown;
    can_see_insights_as_brand: boolean;
    boost_unavailable_identifier: unknown;
    boost_unavailable_reason: unknown;
    inventory_source: unknown;
    __typename: string;
  }

  export interface User {
    pk: string;
    id: unknown;
    is_private: boolean;
    profile_pic_url: unknown;
    username: string | null;
    interop_messaging_user_fbid: unknown;
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

  export interface StoryBloksSticker {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    bloks_sticker: BloksSticker;
    id: unknown;
  }

  export interface BloksSticker {
    sticker_data: StickerData;
    id: string;
  }

  export interface StickerData {
    ig_mention: IgMention;
  }

  export interface IgMention {
    full_name: string;
    username: string;
  }

  export interface StoryHashtag {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    hashtag: Hashtag;
    id: unknown;
  }

  export interface Hashtag {
    name: string;
    id: string;
  }

  export interface User2 {
    interop_messaging_user_fbid: string;
    id: unknown;
    pk: string;
    friendship_status: unknown;
    username: string;
    is_private: boolean;
    profile_pic_url: string;
    is_verified: boolean;
  }

  export interface CoverMedia {
    cropped_image_version: CroppedImageVersion;
    full_image_version: unknown;
  }

  export interface CroppedImageVersion {
    url: string;
  }

  export interface PageInfo {
    end_cursor: string;
    has_next_page: boolean;
    has_previous_page: boolean;
    start_cursor: string;
  }

  export interface Extensions {
    is_final: boolean;
  }
}
