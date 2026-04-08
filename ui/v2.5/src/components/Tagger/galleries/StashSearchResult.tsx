import React, { useState, useEffect, useCallback, useMemo } from "react";
import cx from "classnames";
import { Badge, Button, Col, Form, Row } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";
import uniq from "lodash-es/uniq";

import { faLink, faPlus, faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";

import * as GQL from "src/core/generated-graphql";
import { Icon } from "src/components/Shared/Icon";
import { TagSelect } from "src/components/Shared/Select";
import { TruncatedText } from "src/components/Shared/TruncatedText";
import { OperationButton } from "src/components/Shared/OperationButton";
import { genderList, stringToGender } from "src/utils/gender";
import { IScrapedGallery as IScrapedScene, TaggerStateContext } from "../galleryContext";
import { OptionalField } from "../IncludeButton";
import { GalleryTaggerModalsState as SceneTaggerModalsState } from "./galleryTaggerModals";
import PerformerResult from "./PerformerResult";
import StudioResult from "./StudioResult";
import { useInitialState } from "src/hooks/state";
import { getStashboxBase } from "src/utils/stashbox";
import { ExternalLink } from "src/components/Shared/ExternalLink";
import * as FormUtils from "src/utils/form";
import { isLikelyImageURL, extractImageURLs, extractNonImageURLs } from "./utils";




interface IStashSearchResultProps {
  scene: IScrapedScene;
  stashScene: GQL.SlimGalleryDataFragment;
  index: number;
  isActive: boolean;
}

const StashSearchResult: React.FC<IStashSearchResultProps> = ({
  scene,
  stashScene,
  index,
  isActive,
}) => {
  const intl = useIntl();
  const {
    config,
    createNewTag,
    createNewPerformer,
    createNewStudio,
    updateTag,
    resolveGallery: resolveScene,
    currentSource,
    saveGallery: saveScene,
    addGalleryImagesByUrl: scrapeImages,
  } = React.useContext(TaggerStateContext);

  const performerGenders = config.performerGenders?.length ? config.performerGenders : genderList;

  const performers = useMemo(
    () =>
      scene.performers?.filter((p: GQL.ScrapedPerformer) => {
        const gender = p.gender ? stringToGender(p.gender, true) : undefined;
        return !gender || performerGenders.includes(gender);
      }) ?? [],
    [scene, performerGenders]
  );

  const { createPerformerModal, createStudioModal, createTagModal } =
    React.useContext(SceneTaggerModalsState);

  const getInitialTags = useCallback(() => {
    return stashScene.tags.map((t) => t.id);
  }, [stashScene]);

  const getInitialPerformers = useCallback(() => {
    return performers.map((p: GQL.ScrapedPerformer) => p.stored_id ?? undefined);
  }, [performers]);

  const getInitialStudio = useCallback(() => {
    return scene.studio?.stored_id ?? stashScene.studio?.id;
  }, [stashScene, scene]);

  const [loading, setLoading] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [excludedFields, setExcludedFields] = useState<Record<string, boolean>>(
    (config.excludedGalleryFields ?? []).reduce(
      (dict, field) => ({ ...dict, [field]: true }),
      {} as Record<string, boolean>
    )
  );

  const [tagIDs, setTagIDs, setInitialTagIDs] = useInitialState<string[]>(getInitialTags());
  const [performerIDs, setPerformerIDs, setInitialPerformerIDs] =
    useInitialState<(string | undefined)[]>(getInitialPerformers());
  const [studioID, setStudioID, setInitialStudioID] = useInitialState<string | undefined>(getInitialStudio());

  useEffect(() => {
    setInitialTagIDs(getInitialTags());
  }, [getInitialTags, setInitialTagIDs]);

  useEffect(() => {
    setInitialPerformerIDs(getInitialPerformers());
  }, [getInitialPerformers, setInitialPerformerIDs]);

  useEffect(() => {
    setInitialStudioID(getInitialStudio());
  }, [getInitialStudio, setInitialStudioID]);

  useEffect(() => {
    async function doResolveScene() {
      try {
        setLoading(true);
        await resolveScene(stashScene.id, index, scene);
      } finally {
        setLoading(false);
      }
    }

    if (isActive && !loading && !scene.resolved) {
      doResolveScene();
    }
  }, [isActive, loading, stashScene, index, resolveScene, scene]);

  const stashBoxBaseURL = currentSource?.sourceInput.stash_box_endpoint
    ? getStashboxBase(currentSource.sourceInput.stash_box_endpoint)
    : undefined;

  const stashBoxURL = useMemo(() => {
    if (stashBoxBaseURL && (scene as { remote_site_id?: string }).remote_site_id) {
      return `${stashBoxBaseURL}galleries/${(scene as { remote_site_id?: string }).remote_site_id}`;
    }
  }, [scene, stashBoxBaseURL]);

  const setExcludedField = (name: string, value: boolean) =>
    setExcludedFields({
      ...excludedFields,
      [name]: value,
    });

  async function handleSave() {
    const excludedFieldList = Object.keys(excludedFields).filter((f) => excludedFields[f]);

    function resolveField<T>(field: string, stashField: T, remoteField: T) {
      if (excludedFieldList.includes(field) || remoteField === null || remoteField === undefined) {
        return stashField;
      }
      return remoteField;
    }

    const filteredPerformerIDs = performerIDs.filter((id) => id !== undefined) as string[];

    const galleryUpdateInput: GQL.GalleryUpdateInput = {
      id: stashScene.id,
      title: resolveField("title", stashScene.title, scene.title),
      details: resolveField("details", stashScene.details, scene.details),
      date: resolveField("date", stashScene.date, scene.date),
      performer_ids: uniq(stashScene.performers.map((p) => p.id).concat(filteredPerformerIDs)),
      studio_id: studioID,
      tag_ids: config.setTags ? tagIDs : stashScene.tags.map((t) => t.id),
      // gallery-specific fields
      code: (scene as { code?: string }).code ? resolveField("code", (stashScene as { code?: string }).code, (scene as { code?: string }).code) : (stashScene as { code?: string }).code,
      photographer: (scene as { photographer?: string }).photographer ? resolveField("photographer", (stashScene as { photographer?: string }).photographer, (scene as { photographer?: string }).photographer) : (stashScene as { photographer?: string }).photographer,
    };

    if (!excludedFieldList.includes("url") && scene.urls) {
      const nonImageURLs = extractNonImageURLs(scene.urls);
      galleryUpdateInput.urls = uniq(stashScene.urls.concat(nonImageURLs));
    }

    await saveScene(galleryUpdateInput);

    if (!excludedFieldList.includes("url") && scene.urls) {
      const imageURLs = extractImageURLs(scene.urls);
      if (imageURLs.length > 0) {
        await scrapeImages(stashScene.id, imageURLs);
      }
    }
  }

  const fields = {
    cover_image: "cover_image",
    title: "title",
    date: "date",
    url: "url",
    details: "details",
    studio: "studio",
    // galleries doesn't have label but we keep placeholder context
    label: "label",
    stash_ids: "stash_ids",
    code: "code",
    photographer: "photographer",
    director: "director",
  };

  const maybeRenderCoverImage = () => {
    if (scene.image) {
      return (
        <div className="scene-image-container">
          <OptionalField
            disabled={!config.setCoverImage}
            exclude={
              excludedFields[fields.cover_image] || !config.setCoverImage
            }
            setExclude={(v) => setExcludedField(fields.cover_image, v)}
          >
            <img
              src={scene.image}
              alt=""
              className="align-self-center scene-image"
            />
          </OptionalField>
        </div>
      );
    }
  };

  const renderTitle = () => {
    if (!scene.title) {
      return (
        <h4 className="text-muted">
          <FormattedMessage id="component_tagger.results.unnamed" />
        </h4>
      );
    }

    const url = scene.urls?.length ? scene.urls[0] : null;

    const sceneTitleEl = url ? (
      <ExternalLink className="scene-link" href={url}>
        <TruncatedText text={scene.title} />
      </ExternalLink>
    ) : (
      <TruncatedText text={scene.title} />
    );

    return (
      <OptionalField
        exclude={excludedFields[fields.title]}
        setExclude={(v) => setExcludedField(fields.title, v)}
      >
        <h4 className={cx({ "text-muted": excludedFields[fields.title] })}>
          {sceneTitleEl}
        </h4>
      </OptionalField>
    );
  };

  const renderStudioDate = () => {
    const studio = scene.studio?.name;
    const { date } = scene;

    let text = studio || "";

    if (date) {
      text = text ? `${text} • ${date}` : date;
    }

    if (text) {
      return <h5>{text}</h5>;
    }
  };

  const renderPerformerList = () => {
    if (scene.performers?.length) {
      return (
        <div>
          <FormattedMessage id="performers" />
          : {scene?.performers?.map((p: GQL.ScrapedPerformer) => p.name).join(", ")}
        </div>
      );
    }
  };

  const maybeRenderStudioCode = () => {
    if (!scene.code) return;

    if (isActive) {
      return (
        <h4>
          <OptionalField
            exclude={excludedFields[fields.code]}
            setExclude={(v) => setExcludedField(fields.code, v)}
          >
            {scene.code}
          </OptionalField>
        </h4>
      );
    }

    return <h4 className="scene-code">{scene.code}</h4>;
  };

  const maybeRenderDateField = () => {
    if (isActive && scene.date) {
      return (
        <h5>
          <OptionalField
            exclude={excludedFields[fields.date]}
            setExclude={(v) => setExcludedField(fields.date, v)}
          >
            {scene.date}
          </OptionalField>
        </h5>
      );
    }
  };

  const maybeRenderPhotographer = () => {
    const { photographer } = scene as { photographer?: string };
    if (photographer) {
      return (
        <h5>
          <OptionalField
            exclude={excludedFields[fields.photographer]}
            setExclude={(v) => setExcludedField(fields.photographer, v)}
          >
            <FormattedMessage id="photographer" />: {photographer}
          </OptionalField>
        </h5>
      );
    }
  };

  const maybeRenderDirector = () => {
    const { director } = scene as { director?: string };
    if (director) {
      return (
        <h5>
          <OptionalField
            exclude={excludedFields[fields.director]}
            setExclude={(v) => setExcludedField(fields.director, v)}
          >
            <FormattedMessage id="director" />: {director}
          </OptionalField>
        </h5>
      );
    }
  };

  const maybeRenderImageCarousel = () => {
    const { urls } = scene;
    if (!urls || urls.length === 0) return;

    // Filter to only image URLs (jpg, jpeg, png, gif, webp)
    const imageUrls = urls.filter(isLikelyImageURL);

    if (imageUrls.length === 0) {
      // Fall back to text link list if no image URLs
      return (
        <div className="scene-details">
          <OptionalField
            exclude={excludedFields[fields.url]}
            setExclude={(v) => setExcludedField(fields.url, v)}
          >
            {urls.map((url: string) => (
              <div key={url}>
                <ExternalLink href={url}>{url}</ExternalLink>
              </div>
            ))}
          </OptionalField>
        </div>
      );
    }

    const clampedIndex = Math.min(imageIndex, imageUrls.length - 1);
    const currentImage = imageUrls[clampedIndex];

    return (
      <div className="scene-details">
        <OptionalField
          exclude={excludedFields[fields.url]}
          setExclude={(v) => setExcludedField(fields.url, v)}
        >
          <div className="tagger-image-carousel">
            <Button
              className="tagger-carousel-btn"
              disabled={clampedIndex === 0}
              onClick={() => setImageIndex(clampedIndex - 1)}
            >
              <Icon icon={faChevronLeft} />
            </Button>
            <div
              className={cx("tagger-carousel-center", {
                "text-muted": excludedFields[fields.url],
              })}
            >
              <div className="tagger-carousel-counter">
                {clampedIndex + 1} of {imageUrls.length}
              </div>
              <img
                src={currentImage}
                alt={`Gallery image ${clampedIndex + 1}`}
                className="tagger-carousel-image"
              />
            </div>
            <Button
              className="tagger-carousel-btn"
              disabled={clampedIndex >= imageUrls.length - 1}
              onClick={() => setImageIndex(clampedIndex + 1)}
            >
              <Icon icon={faChevronRight} />
            </Button>
          </div>
        </OptionalField>
      </div>
    );
  };

  const maybeRenderDetails = () => {
    if (scene.details) {
      return (
        <div className="scene-details">
          <OptionalField
            exclude={excludedFields[fields.details]}
            setExclude={(v) => setExcludedField(fields.details, v)}
          >
            <TruncatedText text={scene.details ?? ""} lineCount={3} />
          </OptionalField>
        </div>
      );
    }
  };

  const maybeRenderStashBoxID = () => {
    if ((scene as { remote_site_id?: string }).remote_site_id && stashBoxURL) {
      return (
        <div className="scene-details">
          <OptionalField
            exclude={excludedFields[fields.stash_ids]}
            setExclude={(v) => setExcludedField(fields.stash_ids, v)}
          >
            <ExternalLink href={stashBoxURL}>
              {(scene as { remote_site_id?: string }).remote_site_id}
            </ExternalLink>
          </OptionalField>
        </div>
      );
    }
  };

  const maybeRenderStudioField = () => {
    if (scene.studio) {
      return (
        <StudioResult
          studio={scene.studio}
          selectedID={studioID}
          setSelectedID={(id) => setStudioID(id)}
          onCreate={() =>
            createStudioModal(scene.studio!, (c) => {
              if (c) createNewStudio(scene.studio!, c);
            })
          }
          endpoint={
            currentSource?.sourceInput.stash_box_endpoint ?? undefined
          }
        />
      );
    }
  };

  const renderPerformerField = () => (
    <div className="mt-2">
      <div>
        <Form.Group controlId="performers">
          {performers.map((performer: GQL.ScrapedPerformer, performerIndex: number) => (
            <PerformerResult
              performer={performer}
              selectedID={performerIDs[performerIndex]}
              setSelectedID={(id: string | undefined) => {
                const newIDs = [...performerIDs];
                newIDs[performerIndex] = id;
                setPerformerIDs(newIDs);
              }}
              onCreate={() =>
                createPerformerModal(performer, (c) => {
                  if (c) createNewPerformer(performer, c);
                })
              }
              endpoint={
                currentSource?.sourceInput.stash_box_endpoint ?? undefined
              }
              key={`${performer.name ?? performer.remote_site_id ?? ""}`}
              ageFromDate={
                !scene.date || excludedFields.date ? stashScene.date : scene.date
              }
            />
          ))}
        </Form.Group>
      </div>
    </div>
  );

  async function onCreateTag(
    t: GQL.ScrapedTag,
    createInput?: GQL.TagCreateInput
  ) {
    const toCreate: GQL.TagCreateInput = createInput ?? { name: t.name };

    // If the tag has a remote_site_id and we have an endpoint, include the stash_id
    const endpoint = currentSource?.sourceInput.stash_box_endpoint;
    if (!createInput && t.remote_site_id && endpoint) {
      toCreate.stash_ids = [
        {
          endpoint: endpoint,
          stash_id: t.remote_site_id,
        },
      ];
    }

    const newTagID = await createNewTag(t, toCreate);
    if (newTagID !== undefined) {
      setTagIDs([...tagIDs, newTagID]);
    }
  }

  async function onUpdateTag(
    t: GQL.ScrapedTag,
    updateInput: GQL.TagUpdateInput
  ) {
    await updateTag(t, updateInput);
    setTagIDs(uniq([...tagIDs, updateInput.id]));
  }

  function showTagModal(t: GQL.ScrapedTag) {
    createTagModal(t, (result) => {
      if (result.create) {
        onCreateTag(t, result.create);
      } else if (result.update) {
        onUpdateTag(t, result.update);
      }
    });
  }

  function maybeRenderTagsField() {
    if (!config.setTags) return;

    const scrapedTags = (scene.tags ?? []).filter(
      (t: GQL.ScrapedTag) => !tagIDs.includes(t.stored_id ?? "")
    );

    return (
      <div className="mt-2">
        <div>
          <Form.Group controlId="tags" as={Row}>
            {FormUtils.renderLabel({
              title: `${intl.formatMessage({ id: "tags" })}:`,
            })}
            <Col sm={9} xl={12}>
              <TagSelect
                isMulti
                onSelect={(items) => {
                  setTagIDs(items.map((i) => i.id));
                }}
                ids={tagIDs}
              />
            </Col>
          </Form.Group>
        </div>
        {scrapedTags.map((t: GQL.ScrapedTag) => (
          <Badge
            className="tag-item"
            variant="secondary"
            key={t.name}
            onClick={() => {
              if (t.stored_id) {
                setTagIDs(uniq([...tagIDs, t.stored_id]));
              } else {
                onCreateTag(t);
              }
            }}
          >
            {t.name}
            <Button
              className="minimal ml-2"
              title={intl.formatMessage({
                id: t.stored_id ? "actions.add" : "actions.create",
              })}
            >
              <Icon className="fa-fw" icon={faPlus} />
            </Button>
            {!t.stored_id && (
              <Button
                className="minimal"
                onClick={(e) => {
                  showTagModal(t);
                  e.stopPropagation();
                }}
                title={intl.formatMessage({
                  id: "component_tagger.verb_link_existing",
                })}
              >
                <Icon className="fa-fw" icon={faLink} />
              </Button>
            )}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className={isActive ? "col-lg-6" : ""}>
        <div className="row mx-0">
          {maybeRenderCoverImage()}
          <div className="d-flex flex-column justify-content-center scene-metadata">
            {maybeRenderStudioCode()}
            {renderTitle()}

            {!isActive && (
              <>
                {renderStudioDate()}
                {renderPerformerList()}
              </>
            )}

            {maybeRenderDateField()}
          </div>
        </div>
        {isActive && (
          <div className="d-flex flex-column scene-metadata">
            {maybeRenderStashBoxID()}
            {maybeRenderDirector()}
            {maybeRenderPhotographer()}
            {maybeRenderImageCarousel()}
            {maybeRenderDetails()}
          </div>
        )}
      </div>
      {isActive && (
        <div className="col-lg-6">
          {maybeRenderStudioField()}
          {renderPerformerField()}
          {maybeRenderTagsField()}

          <div className="row no-gutters mt-2 align-items-center justify-content-end">
            <OperationButton operation={handleSave}>
              <FormattedMessage id="actions.save" />
            </OperationButton>
          </div>
        </div>
      )}
    </>
  );
};

export const GallerySearchResults: React.FC<{
  galleries: IScrapedScene[];
  target: GQL.SlimGalleryDataFragment;
}> = ({ galleries, target }) => {
  const [selectedResult, setSelectedResult] = useState<number | undefined>();

  useEffect(() => {
    // If the selected result is no longer in the list, reset it
    if (selectedResult === undefined || galleries?.length <= selectedResult) {
      if (!galleries || galleries.length === 0) {
        setSelectedResult(undefined);
      } else if (galleries.length === 1 || galleries[0].resolved) {
        setSelectedResult(0);
      }
    }
  }, [galleries, selectedResult]);

  function getClassName(i: number) {
    return cx("row mx-0 mt-2 search-result", {
      "selected-result active": i === selectedResult,
    });
  }

  return (
    <ul className="pl-0 mt-3 mb-0">
      {galleries.map((g, i) => (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions, react/no-array-index-key
        <li
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          onClick={() => setSelectedResult(i)}
          className={getClassName(i)}
        >
          <StashSearchResult
            scene={g}
            stashScene={target}
            index={i}
            isActive={i === selectedResult}
          />
        </li>
      ))}
    </ul>
  );
};
