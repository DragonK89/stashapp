import React, { useContext, useMemo, useState } from "react";
import * as GQL from "src/core/generated-graphql";
import { Button, Form } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";

import { Icon } from "src/components/Shared/Icon";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { OperationButton } from "src/components/Shared/OperationButton";
import { IGalleryQueryResult, TaggerStateContext } from "../galleryContext";
import { TaggerGallery } from "./TaggerGallery";
import { GalleryTaggerModals } from "./galleryTaggerModals";
import { GallerySearchResults } from "./StashSearchResult";
import { useConfigurationContext } from "src/hooks/Config";
import { objectPath } from "src/core/files";
import { useLightbox } from "src/hooks/Lightbox/hooks";
import { parsePath } from "../utils";
import { prepareQueryString } from "./utils";

const GalleryItem: React.FC<{
  gallery: GQL.SlimGalleryDataFragment;
  searchResult?: IGalleryQueryResult;
  index: number;
  showLightboxImage: (imagePath: string) => void;
}> = ({ gallery, searchResult, index, showLightboxImage }) => {
  const intl = useIntl();
  const { currentSource, doGalleryQuery, loading } =
    useContext(TaggerStateContext);
  const { configuration } = useConfigurationContext();

  const galleryLink = `/galleries/${gallery.id}`;

  const errorMessage = useMemo(() => {
    if (searchResult?.error) {
      if (searchResult.error.toLowerCase().includes("not implemented")) {
        return intl.formatMessage({
          id: "component_tagger.results.match_failed_no_result",
        });
      }
      return searchResult.error;
    } else if (searchResult && searchResult.results?.length === 0) {
      return intl.formatMessage({
        id: "component_tagger.results.match_failed_no_result",
      });
    }
  }, [intl, searchResult]);

  return (
    <TaggerGallery
      loading={loading}
      gallery={gallery}
      url={galleryLink}
      errorMessage={errorMessage}
      doGalleryQuery={
        currentSource?.supportGalleryQuery
          ? async (v) => {
              await doGalleryQuery(gallery.id, v);
            }
          : undefined
      }
      showLightboxImage={showLightboxImage}
      index={index}
    >
      {searchResult && searchResult.results?.length ? (
        <GallerySearchResults galleries={searchResult.results} target={gallery} />
      ) : undefined}
    </TaggerGallery>
  );
};

interface ITaggerProps {
  galleries: GQL.SlimGalleryDataFragment[];
}

export const Tagger: React.FC<ITaggerProps> = ({ galleries }) => {
  const {
    sources,
    setCurrentSource,
    currentSource,
    searchAllQueue,
    setSearchAllQueue,
    stopMultiScrape,
    config,
    searchResults,
    loading,
    loadingMulti: loadingMultiContext,
    multiError: multiErrorContext,
  } = useContext(TaggerStateContext);
  const loadingMulti = loadingMultiContext || searchAllQueue.length > 0;
  const multiError = multiErrorContext ?? "";
  const [hideUnmatched, setHideUnmatched] = useState(false);

  const intl = useIntl();

  function handleSourceSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    setCurrentSource(sources!.find((s) => s.id === e.currentTarget.value));
  }

  function renderSourceSelector() {
    return (
      <Form.Group controlId="scraper" className="d-flex align-items-center mb-0">
        <Form.Label className="mr-2 mb-0 text-nowrap">
          <FormattedMessage id="component_tagger.config.source" />
        </Form.Label>
        <Form.Control
          as="select"
          value={currentSource?.id}
          className="input-control w-auto"
          disabled={loading || !sources.length}
          onChange={handleSourceSelect}
        >
          {!sources.length && <option>No scraper sources</option>}
          {sources.map((i) => (
            <option value={i.id} key={i.id}>
              {i.displayName}
            </option>
          ))}
        </Form.Control>
      </Form.Group>
    );
  }


  const [spriteImage, setSpriteImage] = useState<string | null>(null);
  const lightboxImage = useMemo(
    () => [{ paths: { thumbnail: spriteImage, image: spriteImage } }],
    [spriteImage]
  );
  const showLightbox = useLightbox({
    images: lightboxImage,
  });
  function showLightboxImage(imagePath: string) {
    setSpriteImage(imagePath);
    showLightbox({ images: lightboxImage });
  }

  const filteredGalleries = useMemo(
    () =>
      !hideUnmatched
        ? galleries
        : galleries.filter((s) => searchResults[s.id]?.results?.length),
    [galleries, searchResults, hideUnmatched]
  );

  const toggleHideUnmatchedGalleries = () => {
    setHideUnmatched(!hideUnmatched);
  };

  function maybeRenderShowHideUnmatchedButton() {
    if (Object.keys(searchResults).length) {
      return (
        <Button onClick={toggleHideUnmatchedGalleries}>
          <FormattedMessage
            id="component_tagger.verb_toggle_unmatched"
            values={{
              toggle: (
                <FormattedMessage
                  id={`actions.${!hideUnmatched ? "hide" : "show"}`}
                />
              ),
            }}
          />
        </Button>
      );
    }
  }

  function renderSearchAllButton() {
    if (!currentSource?.supportGalleryQuery) {
      return;
    }

    if (galleries.length === 0) {
      return;
    }

    if (loadingMulti) {
      return (
        <Button
          className="ml-1"
          variant="danger"
          onClick={() => {
            stopMultiScrape();
          }}
        >
          <LoadingIndicator message="" inline small />
          <span className="ml-2">
            {intl.formatMessage({ id: "actions.stop" })}
          </span>
        </Button>
      );
    }

    return (
      <div className="ml-1">
        <OperationButton
          disabled={loading || loadingMulti}
          operation={async () => {
            const ids = galleries.map((s) => s.id);
            setSearchAllQueue(ids);
          }}
        >
          {intl.formatMessage({ id: "component_tagger.verb_search_all" })}
        </OperationButton>
      </div>
    );
  }

  return (
    <GalleryTaggerModals>
      <div className="tagger-container mx-md-auto">
        <div className="tagger-container-header">
          <div className="d-flex justify-content-between align-items-center flex-wrap">
            <div className="w-auto">{renderSourceSelector()}</div>
            <div className="d-flex">
              {maybeRenderShowHideUnmatchedButton()}
              {renderSearchAllButton()}
            </div>
          </div>
        </div>
        <div>
          {filteredGalleries.map((s, i) => (
            <GalleryItem
              key={s.id}
              gallery={s}
              searchResult={searchResults[s.id]}
              index={i}
              showLightboxImage={showLightboxImage}
            />
          ))}
        </div>
      </div>
    </GalleryTaggerModals>
  );
};
