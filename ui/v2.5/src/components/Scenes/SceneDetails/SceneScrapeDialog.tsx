import React, { useMemo, useState } from "react";
import * as GQL from "src/core/generated-graphql";
import {
  ScrapedInputGroupRow,
  ScrapedTextAreaRow,
  ScrapedImageRow,
  ScrapedStringListRow,
} from "src/components/Shared/ScrapeDialog/ScrapeDialogRow";
import { ScrapeDialog } from "src/components/Shared/ScrapeDialog/ScrapeDialog";
import { useIntl } from "react-intl";
import { uniq } from "lodash-es";
import { Performer } from "src/components/Performers/PerformerSelect";
import { Gallery } from "src/components/Galleries/GallerySelect";
import { sortStoredIdObjects } from "src/utils/data";
import {
  ObjectScrapeResult,
  ScrapeResult,
  ObjectListScrapeResult,
} from "src/components/Shared/ScrapeDialog/scrapeResult";
import {
  ScrapedGalleriesRow,
  ScrapedGroupsRow,
  ScrapedLabelRow,
  ScrapedPerformersRow,
  ScrapedStudioRow,
} from "src/components/Shared/ScrapeDialog/ScrapedObjectsRow";
import {
  useCreateScrapedGallery,
  useCreateScrapedGroup,
  useCreateScrapedLabel,
  useCreateScrapedPerformer,
  useCreateScrapedStudio,
} from "src/components/Shared/ScrapeDialog/createObjects";
import { Tag } from "src/components/Tags/TagSelect";
import { Studio } from "src/components/Studios/StudioSelect";
import { Group } from "src/components/Groups/GroupSelect";
import { useScrapedTags } from "src/components/Shared/ScrapeDialog/scrapedTags";
import { useToast } from "src/hooks/Toast";
import { useBulkGalleryUpdate } from "src/core/StashService";

function normalizeKey(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function galleryMatchesScraped(existing: Gallery, scraped: GQL.ScrapedGallery) {
  const existingTitle = normalizeKey(existing.title);
  const existingCode = normalizeKey(existing.code);
  const scrapedTitle = normalizeKey(scraped.title);
  const scrapedCode = normalizeKey(scraped.code);

  if (existingCode && scrapedCode && existingCode === scrapedCode) {
    return true;
  }

  if (existingTitle && scrapedTitle && existingTitle === scrapedTitle) {
    return true;
  }

  return false;
}

interface ISceneScrapeDialogProps {
  scene: Partial<GQL.SceneUpdateInput>;
  sceneGalleries: Gallery[];
  sceneStudio: Studio | null;
  scenePerformers: Performer[];
  sceneTags: Tag[];
  sceneGroups: Group[];
  scraped: GQL.ScrapedScene;
  endpoint?: string;

  onClose: (result?: {
    scrapedScene: GQL.ScrapedSceneDataFragment;
    galleries?: Gallery[];
  }) => void;
}

export const SceneScrapeDialog: React.FC<ISceneScrapeDialogProps> = ({
  scene,
  sceneGalleries,
  sceneStudio,
  scenePerformers,
  sceneTags,
  sceneGroups,
  scraped,
  onClose,
  endpoint,
}) => {
  const Toast = useToast();
  const intl = useIntl();
  const [title, setTitle] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(scene.title, scraped.title)
  );
  const [code, setCode] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(scene.code, scraped.code)
  );

  const [urls, setURLs] = useState<ScrapeResult<string[]>>(
    new ScrapeResult<string[]>(
      scene.urls,
      scraped.urls
        ? uniq((scene.urls ?? []).concat(scraped.urls ?? []))
        : undefined
    )
  );

  const [date, setDate] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(scene.date, scraped.date)
  );
  const [director, setDirector] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(scene.director, scraped.director)
  );
  const [studio, setStudio] = useState<ObjectScrapeResult<GQL.ScrapedStudio>>(
    new ObjectScrapeResult<GQL.ScrapedStudio>(
      sceneStudio
        ? {
            stored_id: sceneStudio.id,
            name: sceneStudio.name,
          }
        : undefined,
      scraped.studio?.stored_id ? scraped.studio : undefined
    )
  );
  const [newStudio, setNewStudio] = useState<GQL.ScrapedStudio | undefined>(
    scraped.studio && !scraped.studio.stored_id ? scraped.studio : undefined
  );
  const [label, setLabel] = useState<ScrapeResult<GQL.ScrapedLabel>>(
    new ScrapeResult<GQL.ScrapedLabel>(
      scene.label_id
        ? {
            stored_id: scene.label_id,
            name: "",
          }
        : undefined,
      scraped.label,
      undefined,
      (original, next) => {
        if (original?.stored_id || next?.stored_id) {
          return original?.stored_id === next?.stored_id;
        }

        return original?.name === next?.name;
      }
    )
  );
  const [newLabel, setNewLabel] = useState<GQL.ScrapedLabel | undefined>(
    scraped.label && !scraped.label.stored_id ? scraped.label : undefined
  );
  const matchedGalleryURLAdds = useMemo(() => {
    const ret: Record<string, string[]> = {};
    for (const scrapedGallery of scraped.galleries ?? []) {
      const matched = sceneGalleries.find((g) =>
        galleryMatchesScraped(g, scrapedGallery)
      );
      if (!matched?.id) {
        continue;
      }

      const scrapedURLs = uniq((scrapedGallery.urls ?? []).filter(Boolean));
      if (scrapedURLs.length === 0) {
        continue;
      }

      ret[matched.id] = uniq([...(ret[matched.id] ?? []), ...scrapedURLs]);
    }
    return ret;
  }, [sceneGalleries, scraped.galleries]);

  const unmatchedScrapedGalleries = useMemo(
    () =>
      (scraped.galleries ?? []).filter(
        (sg) => !sceneGalleries.find((g) => galleryMatchesScraped(g, sg))
      ),
    [sceneGalleries, scraped.galleries]
  );
  const hasMatchedGalleryURLAdds = useMemo(
    () =>
      Object.values(matchedGalleryURLAdds).some(
        (galleryURLs) => galleryURLs.length > 0
      ),
    [matchedGalleryURLAdds]
  );
  const galleriesWithMergeDisplay = useMemo(
    () =>
      sceneGalleries.map((gallery) => {
        const urlCount = matchedGalleryURLAdds[gallery.id]?.length ?? 0;
        if (!urlCount) {
          return gallery;
        }

        const galleryName =
          gallery.title ?? gallery.code ?? intl.formatMessage({ id: "gallery" });
        return {
          ...gallery,
          title: `${galleryName} (+${urlCount} URL${
            urlCount === 1 ? "" : "s"
          })`,
        };
      }),
    [sceneGalleries, matchedGalleryURLAdds, intl]
  );

  const [galleries, setGalleries] = useState<ScrapeResult<Gallery[]>>(
    new ScrapeResult<Gallery[]>(
      sceneGalleries,
      hasMatchedGalleryURLAdds ? galleriesWithMergeDisplay : undefined,
      hasMatchedGalleryURLAdds ? true : undefined
    )
  );
  const [newGalleries, setNewGalleries] = useState<GQL.ScrapedGallery[]>(
    unmatchedScrapedGalleries
  );

  const [stashID, setStashID] = useState(
    new ScrapeResult<string>(
      scene.stash_ids?.find((s) => s.endpoint === endpoint)?.stash_id,
      scraped.remote_site_id
    )
  );

  const [performers, setPerformers] = useState<
    ObjectListScrapeResult<GQL.ScrapedPerformer>
  >(
    new ObjectListScrapeResult<GQL.ScrapedPerformer>(
      sortStoredIdObjects(
        scenePerformers.map((p) => ({
          stored_id: p.id,
          name: p.name,
        }))
      ),
      sortStoredIdObjects(scraped.performers ?? undefined)
    )
  );
  const [newPerformers, setNewPerformers] = useState<GQL.ScrapedPerformer[]>(
    scraped.performers?.filter((t) => !t.stored_id) ?? []
  );

  const [groups, setGroups] = useState<
    ObjectListScrapeResult<GQL.ScrapedGroup>
  >(
    new ObjectListScrapeResult<GQL.ScrapedGroup>(
      sortStoredIdObjects(
        sceneGroups.map((p) => ({
          stored_id: p.id,
          name: p.name,
        }))
      ),
      sortStoredIdObjects(scraped.groups ?? undefined)
    )
  );
  const [newGroups, setNewGroups] = useState<GQL.ScrapedGroup[]>(
    scraped.groups?.filter((t) => !t.stored_id) ?? []
  );

  const { tags, newTags, scrapedTagsRow, linkDialog } = useScrapedTags(
    sceneTags,
    scraped.tags,
    endpoint
  );

  const [details, setDetails] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(scene.details, scraped.details)
  );

  const [image, setImage] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(scene.cover_image, scraped.image)
  );

  const labelStudioID = (
    studio.useNewValue ? studio.getNewValue()?.stored_id : sceneStudio?.id
  ) ?? sceneStudio?.id;
  const labelStudioName = (
    studio.useNewValue ? studio.getNewValue()?.name : sceneStudio?.name
  ) ?? sceneStudio?.name;

  const createNewStudio = useCreateScrapedStudio({
    scrapeResult: studio,
    setScrapeResult: setStudio,
    setNewObject: setNewStudio,
    endpoint,
  });

  const createNewPerformer = useCreateScrapedPerformer({
    scrapeResult: performers,
    setScrapeResult: setPerformers,
    newObjects: newPerformers,
    setNewObjects: setNewPerformers,
    endpoint,
  });

  const createNewGroup = useCreateScrapedGroup({
    scrapeResult: groups,
    setScrapeResult: setGroups,
    newObjects: newGroups,
    setNewObjects: setNewGroups,
    endpoint,
  });
  const createNewLabel = useCreateScrapedLabel({
    scrapeResult: label,
    setScrapeResult: setLabel,
    setNewObject: setNewLabel,
    studioID: labelStudioID,
  });
  const createNewGallery = useCreateScrapedGallery({
    scrapeResult: galleries,
    setScrapeResult: setGalleries,
    newObjects: newGalleries,
    setNewObjects: setNewGalleries,
  });
  const [bulkGalleryUpdate] = useBulkGalleryUpdate();

  // don't show the dialog if nothing was scraped
  if (
    [
      title,
      code,
      urls,
      date,
      director,
      galleries,
      studio,
      label,
      performers,
      groups,
      tags,
      details,
      image,
      stashID,
    ].every((r) => !r.scraped) &&
    newTags.length === 0 &&
    newGalleries.length === 0 &&
    newPerformers.length === 0 &&
    newGroups.length === 0 &&
    !newStudio
  ) {
    onClose();
    return <></>;
  }

  function makeNewScrapedItem(): GQL.ScrapedSceneDataFragment {
    const newStudioValue = studio.getNewValue();

    return {
      title: title.getNewValue(),
      code: code.getNewValue(),
      urls: urls.getNewValue(),
      date: date.getNewValue(),
      director: director.getNewValue(),
      studio: newStudioValue,
      label: label.getNewValue(),
      performers: performers.getNewValue(),
      groups: groups.getNewValue(),
      tags: tags.getNewValue(),
      details: details.getNewValue(),
      image: image.getNewValue(),
      remote_site_id: stashID.getNewValue(),
    };
  }

  function renderScrapeRows() {
    return (
      <>
        <ScrapedInputGroupRow
          field="title"
          title={intl.formatMessage({ id: "title" })}
          result={title}
          onChange={(value) => setTitle(value)}
        />
        <ScrapedInputGroupRow
          field="code"
          title={intl.formatMessage({ id: "scene_code" })}
          result={code}
          onChange={(value) => setCode(value)}
        />
        <ScrapedStringListRow
          field="urls"
          title={intl.formatMessage({ id: "urls" })}
          result={urls}
          onChange={(value) => setURLs(value)}
        />
        <ScrapedInputGroupRow
          field="date"
          title={intl.formatMessage({ id: "date" })}
          placeholder="YYYY-MM-DD"
          result={date}
          onChange={(value) => setDate(value)}
        />
        <ScrapedInputGroupRow
          field="director"
          title={intl.formatMessage({ id: "director" })}
          result={director}
          onChange={(value) => setDirector(value)}
        />
        <ScrapedGalleriesRow
          field="galleries"
          title={intl.formatMessage({ id: "galleries" })}
          result={galleries}
          onChange={(value) => setGalleries(value)}
          newObjects={newGalleries}
          onCreateNew={createNewGallery}
        />
        <ScrapedStudioRow
          field="studio"
          title={intl.formatMessage({ id: "studios" })}
          result={studio}
          onChange={(value) => setStudio(value)}
          newStudio={newStudio}
          onCreateNew={createNewStudio}
        />
        <ScrapedLabelRow
          field="label"
          title={intl.formatMessage({ id: "label" })}
          result={label}
          onChange={(value) => setLabel(value)}
          studioID={labelStudioID}
          studioName={labelStudioName}
          newLabel={newLabel}
          onCreateNew={labelStudioID ? createNewLabel : undefined}
        />
        <ScrapedPerformersRow
          field="performers"
          title={intl.formatMessage({ id: "performers" })}
          result={performers}
          onChange={(value) => setPerformers(value)}
          newObjects={newPerformers}
          onCreateNew={createNewPerformer}
          ageFromDate={date.useNewValue ? date.newValue : date.originalValue}
        />
        <ScrapedGroupsRow
          field="groups"
          title={intl.formatMessage({ id: "groups" })}
          result={groups}
          onChange={(value) => setGroups(value)}
          newObjects={newGroups}
          onCreateNew={createNewGroup}
        />
        {scrapedTagsRow}
        <ScrapedTextAreaRow
          field="details"
          title={intl.formatMessage({ id: "details" })}
          result={details}
          onChange={(value) => setDetails(value)}
        />
        <ScrapedInputGroupRow
          field="stash_ids"
          title={intl.formatMessage({ id: "stash_id" })}
          result={stashID}
          locked
          onChange={(value) => setStashID(value)}
        />
        <ScrapedImageRow
          field="cover_image"
          title={intl.formatMessage({ id: "cover_image" })}
          className="scene-cover"
          result={image}
          onChange={(value) => setImage(value)}
        />
      </>
    );
  }

  if (linkDialog) {
    return linkDialog;
  }

  async function appendURLsToMatchedGalleries() {
    for (const [galleryID, galleryURLs] of Object.entries(matchedGalleryURLAdds)) {
      if (!galleryURLs.length) {
        continue;
      }

      await bulkGalleryUpdate({
        variables: {
          input: {
            ids: [galleryID],
            urls: {
              mode: GQL.BulkUpdateIdMode.Add,
              values: galleryURLs,
            },
          },
        },
      });
    }
  }

  async function handleClose(apply?: boolean) {
    if (!apply) {
      onClose();
      return;
    }

    try {
      await appendURLsToMatchedGalleries();
    } catch (e) {
      Toast.error(e);
      return;
    }

    onClose({
      scrapedScene: makeNewScrapedItem(),
      galleries: galleries.getNewValue()?.map(
        (gallery) =>
          sceneGalleries.find((existingGallery) => existingGallery.id === gallery.id) ??
          gallery
      ),
    });
  }

  return (
    <ScrapeDialog
      title={intl.formatMessage(
        { id: "dialogs.scrape_entity_title" },
        { entity_type: intl.formatMessage({ id: "scene" }) }
      )}
      dialogClassName="scene-scrape-dialog"
      onClose={(apply) => {
        void handleClose(apply);
      }}
    >
      {renderScrapeRows()}
    </ScrapeDialog>
  );
};

export default SceneScrapeDialog;
