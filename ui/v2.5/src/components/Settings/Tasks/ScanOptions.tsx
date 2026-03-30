import React from "react";
import * as GQL from "src/core/generated-graphql";
import { BooleanSetting } from "../Inputs";

interface IScanOptions {
  options: GQL.ScanMetadataInput;
  setOptions: (s: GQL.ScanMetadataInput) => void;
}

export const ScanOptions: React.FC<IScanOptions> = ({
  options,
  setOptions: setOptionsState,
}) => {
  const {
    scanTorrents,
    scanTorrentsNormalizeTitle,
    scanTorrentsScanImages,
    scanTorrentsRenameFile,
    scanGenerateCovers,
    scanGeneratePreviews,
    scanGenerateImagePreviews,
    scanGenerateSprites,
    scanGeneratePhashes,
    scanGenerateThumbnails,
    scanGenerateClipPreviews,
    rescan,
  } = options;

  function setOptions(input: Partial<GQL.ScanMetadataInput>) {
    setOptionsState({ ...options, ...input });
  }

  return (
    <>
      <BooleanSetting
        id="scan-torrents"
        headingID="config.tasks.scan_torrents"
        tooltipID="config.tasks.scan_torrents_tooltip"
        checked={scanTorrents ?? false}
        onChange={(v) =>
          setOptions({
            scanTorrents: v,
          })
        }
      />
      <BooleanSetting
        advanced
        id="scan-torrents-scan-images"
        className="sub-setting"
        headingID="config.tasks.scan_torrents_scan_images"
        tooltipID="config.tasks.scan_torrents_scan_images_tooltip"
        checked={scanTorrentsScanImages ?? false}
        disabled={!scanTorrents}
        onChange={(v) =>
          setOptions({
            scanTorrentsScanImages: v,
          })
        }
      />
      <BooleanSetting
        advanced
        id="scan-torrents-normalize-title"
        className="sub-setting"
        headingID="config.tasks.scan_torrents_normalize_title"
        tooltipID="config.tasks.scan_torrents_normalize_title_tooltip"
        checked={scanTorrentsNormalizeTitle ?? false}
        disabled={!scanTorrents}
        onChange={(v) =>
          setOptions({
            scanTorrentsNormalizeTitle: v,
            // can't rename unless we're normalizing
            scanTorrentsRenameFile: v ? scanTorrentsRenameFile : false,
          })
        }
      />
      <BooleanSetting
        advanced
        id="scan-torrents-rename-file"
        className="sub-setting"
        headingID="config.tasks.scan_torrents_rename_file"
        tooltipID="config.tasks.scan_torrents_rename_file_tooltip"
        checked={scanTorrentsRenameFile ?? false}
        disabled={!scanTorrents || !scanTorrentsNormalizeTitle}
        onChange={(v) =>
          setOptions({
            scanTorrentsRenameFile: v,
          })
        }
      />
      <BooleanSetting
        id="scan-generate-covers"
        headingID="config.tasks.generate_video_covers_during_scan"
        checked={scanGenerateCovers ?? true}
        onChange={(v) => setOptions({ scanGenerateCovers: v })}
      />
      <BooleanSetting
        id="scan-generate-previews"
        headingID="config.tasks.generate_video_previews_during_scan"
        tooltipID="config.tasks.generate_video_previews_during_scan_tooltip"
        checked={scanGeneratePreviews ?? false}
        onChange={(v) => setOptions({ scanGeneratePreviews: v })}
      />
      <BooleanSetting
        advanced
        id="scan-generate-image-previews"
        className="sub-setting"
        headingID="config.tasks.generate_previews_during_scan"
        tooltipID="config.tasks.generate_previews_during_scan_tooltip"
        checked={scanGenerateImagePreviews ?? false}
        disabled={!scanGeneratePreviews}
        onChange={(v) => setOptions({ scanGenerateImagePreviews: v })}
      />

      <BooleanSetting
        id="scan-generate-sprites"
        headingID="config.tasks.generate_sprites_during_scan"
        tooltipID="config.tasks.generate_sprites_during_scan_tooltip"
        checked={scanGenerateSprites ?? false}
        onChange={(v) => setOptions({ scanGenerateSprites: v })}
      />
      <BooleanSetting
        id="scan-generate-phashes"
        checked={scanGeneratePhashes ?? false}
        headingID="config.tasks.generate_phashes_during_scan"
        tooltipID="config.tasks.generate_phashes_during_scan_tooltip"
        onChange={(v) => setOptions({ scanGeneratePhashes: v })}
      />
      <BooleanSetting
        id="scan-generate-thumbnails"
        checked={scanGenerateThumbnails ?? false}
        headingID="config.tasks.generate_thumbnails_during_scan"
        onChange={(v) => setOptions({ scanGenerateThumbnails: v })}
      />
      <BooleanSetting
        id="scan-generate-clip-previews"
        checked={scanGenerateClipPreviews ?? false}
        headingID="config.tasks.generate_clip_previews_during_scan"
        onChange={(v) => setOptions({ scanGenerateClipPreviews: v })}
      />
      <BooleanSetting
        id="force-rescan"
        headingID="config.tasks.rescan"
        tooltipID="config.tasks.rescan_tooltip"
        checked={rescan ?? false}
        onChange={(v) => setOptions({ rescan: v })}
      />
    </>
  );
};
