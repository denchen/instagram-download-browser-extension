// Combines a DASH video stream and its audio stream into one MP4 by copying
// packets: nothing is decoded or re-encoded, so it is fast and lossless.
//
// Loaded only through import() from downloadResource, so esbuild splits it and
// Mediabunny (~216 KB minified) stays off pages that never download a video.
//
// The output is MP4 rather than WebM because WebM cannot carry AAC, which is
// Instagram's only audio codec. VP9 in MP4 plays in Chrome, Firefox and VLC,
// but not in QuickTime or Apple Photos, which is what the popup setting warns.
//
// Sync was checked 2026-10-10 on synthetic VP9 + AAC streams laid out like
// Instagram's: every beep landed on the same audio sample as in the input, and
// the AAC priming edit list carried over unchanged.

import {
  BufferSource,
  BufferTarget,
  EncodedAudioPacketSource,
  type EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  type InputAudioTrack,
  type InputVideoTrack,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

export async function muxDash(video: ArrayBuffer, audio: ArrayBuffer | null): Promise<ArrayBuffer> {
  const videoTrack = await new Input({
    source: new BufferSource(video),
    formats: [MP4],
  }).getPrimaryVideoTrack();
  if (!videoTrack) throw new Error("DASH video stream has no video track");

  const audioTrack = audio
    ? await new Input({ source: new BufferSource(audio), formats: [MP4] }).getPrimaryAudioTrack()
    : null;
  if (audio && !audioTrack) throw new Error("DASH audio stream has no audio track");

  // in-memory fastStart writes one moov ahead of one mdat: a plain,
  // non-fragmented MP4, the layout the most players accept.
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  const videoSource = new EncodedVideoPacketSource(videoTrack.codec!);
  output.addVideoTrack(videoSource, { rotation: videoTrack.rotation });
  const audioSource = audioTrack ? new EncodedAudioPacketSource(audioTrack.codec!) : null;
  if (audioSource) output.addAudioTrack(audioSource);

  await output.start();
  // Both pumps run at once so the muxer can interleave by timestamp.
  await Promise.all([
    copyPackets(videoTrack, await videoTrack.getDecoderConfig(), videoSource, (packet, meta) =>
      videoSource.add(packet, meta),
    ),
    audioTrack && audioSource
      ? copyPackets(audioTrack, await audioTrack.getDecoderConfig(), audioSource, (packet, meta) =>
          audioSource.add(packet, meta),
        )
      : null,
  ]);
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("Muxer finished without output");
  return buffer;
}

async function copyPackets<Config>(
  track: InputVideoTrack | InputAudioTrack,
  decoderConfig: Config | null,
  source: { close(): void },
  add: (packet: EncodedPacket, meta?: { decoderConfig: Config }) => Promise<void>,
) {
  if (!decoderConfig) throw new Error(`No decoder config for the ${track.type} track`);
  let first = true;
  for await (const packet of new EncodedPacketSink(track).packets()) {
    // The decoder config rides on the first packet only, as Mediabunny asks.
    await add(packet, first ? { decoderConfig } : undefined);
    first = false;
  }
  source.close();
}
