import React, { useState, useEffect, useContext, PropsWithChildren, useMemo } from "react";
import * as GQL from "src/core/generated-graphql";
import { Link } from "react-router-dom";
import { Button, Collapse, Form, InputGroup } from "react-bootstrap";
import { FormattedMessage } from "react-intl";

import { sortPerformers } from "src/core/performers";
import { Icon } from "src/components/Shared/Icon";
import { OperationButton } from "src/components/Shared/OperationButton";
import { PerformerLink, TagLink } from "src/components/Shared/TagLink";
import { TruncatedText } from "src/components/Shared/TruncatedText";
import { parsePath } from "src/components/Tagger/utils";
import { GalleryPreview } from "src/components/Galleries/GalleryCard";
import { TaggerStateContext } from "../galleryContext";
import {
  faChevronDown,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import { objectPath, objectTitle } from "src/core/files";
import { useConfigurationContext } from "src/hooks/Config";
import { useIsMounted } from "src/hooks/state";
import { prepareQueryString } from "./utils";

interface ITaggerGalleryDetails {
  gallery: GQL.SlimGalleryDataFragment;
}

const TaggerGalleryDetails: React.FC<ITaggerGalleryDetails> = ({ gallery }) => {
  const [open, setOpen] = useState(false);
  const sorted = sortPerformers(gallery.performers);
  const { configuration } = useConfigurationContext();
  const hideTags = configuration.ui.hideTags ?? false;

  return (
    <div className="original-scene-details">
      <Collapse in={open}>
        <div className="row">
          <div className="col col-lg-6">
            <h4>{objectTitle(gallery)}</h4>
            <h5>
              {gallery.studio?.name}
              {gallery.studio?.name && gallery.date && ` • `}
              {gallery.date}
            </h5>
            <TruncatedText text={gallery.details ?? ""} lineCount={3} />
          </div>
          <div className="col col-lg-6">
            <div>
              {sorted.map((performer) => (
                <div className="performer-tag-container row" key={performer.id}>
                  <Link
                    to={`/performers/${performer.id}`}
                    className="performer-tag col m-auto zoom-2"
                  >
                    <img
                      loading="lazy"
                      className="image-thumbnail"
                      alt={performer.name ?? ""}
                      src={performer.image_path ?? ""}
                    />
                  </Link>
                  <PerformerLink
                    key={performer.id}
                    performer={performer}
                    className="d-block"
                  />
                </div>
              ))}
            </div>
            {!hideTags && (
              <div>
                {gallery.tags.map((tag) => (
                  <TagLink key={tag.id} tag={tag} linkType="gallery" />
                ))}
              </div>
            )}
          </div>
        </div>
      </Collapse>
      <Button
        onClick={() => setOpen(!open)}
        className="minimal collapse-button"
        size="lg"
      >
        <Icon icon={open ? faChevronUp : faChevronDown} />
      </Button>
    </div>
  );
};

interface ITaggerGallery {
  gallery: GQL.SlimGalleryDataFragment;
  url: string;
  errorMessage?: string;
  doGalleryQuery?: (queryString: string) => void;
  loading?: boolean;
  showLightboxImage: (imagePath: string) => void;
  index?: number;
}

export const TaggerGallery: React.FC<PropsWithChildren<ITaggerGallery>> = ({
  gallery,
  url,
  loading,
  doGalleryQuery,
  errorMessage,
  children,
  showLightboxImage,
  index,
}) => {
  const { config, currentSource, searchAllQueue, setSearchAllQueue } =
    useContext(TaggerStateContext);
  const [queryString, setQueryString] = useState<string>("");
  const [queryLoading, setQueryLoading] = useState(false);

  const { paths, file: basename } = parsePath(objectPath(gallery));
  const defaultQueryString = prepareQueryString(
    gallery,
    paths,
    basename,
    config.mode,
    config.blacklist,
    currentSource?.supportedURLs
  );

  const isMounted = useIsMounted();

  async function query() {
    if (!doGalleryQuery) return;

    try {
      setQueryLoading(true);
      await doGalleryQuery(queryString || defaultQueryString);
    } finally {
      if (isMounted.current) {
        setQueryLoading(false);
      }
    }
  }

  useEffect(() => {
    async function runSearch() {
      if (searchAllQueue.length > 0 && searchAllQueue[0] === gallery.id) {
        await query();
        setSearchAllQueue(searchAllQueue.slice(1));
      }
    }
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchAllQueue]);

  function renderQueryForm() {
    if (!doGalleryQuery) return;

    return (
      <InputGroup>
        <InputGroup.Prepend>
          <InputGroup.Text>
            <FormattedMessage id="component_tagger.noun_query" />
          </InputGroup.Text>
        </InputGroup.Prepend>
        <Form.Control
          className="text-input"
          value={queryString || defaultQueryString}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setQueryString(e.currentTarget.value);
          }}
          onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) =>
            e.key === "Enter" && query()
          }
        />
        <InputGroup.Append>
          <OperationButton
            disabled={loading}
            operation={query}
            loading={queryLoading}
            setLoading={setQueryLoading}
          >
            <FormattedMessage id="actions.search" />
          </OperationButton>
        </InputGroup.Append>
      </InputGroup>
    );
  }

  return (
    <div key={gallery.id} className="mt-3 search-item">
      <div className="row">
        <div className="col col-lg-6 overflow-hidden align-items-center d-flex flex-column flex-sm-row" style={{ marginBottom: "15px" }}>
          <div className="scene-card" style={{ width: "400px" }}>
            <Link to={url}>
              <GalleryPreview
                gallery={gallery}
                noScrubber
              />
            </Link>
          </div>
          {gallery.code && (
            <Link to={url} className="scene-link overflow-hidden ml-3">
              <h4 className="font-weight-bold">{gallery.code}</h4>
            </Link>
          )}

        </div>
        <div className="col-md-6 my-1">
          <div>
            {renderQueryForm()}
          </div>
          {errorMessage ? (
            <div className="text-danger font-weight-bold">{errorMessage}</div>
          ) : undefined}
          {/* StashIDs removed per request */}
        </div>
        <TaggerGalleryDetails gallery={gallery} />
      </div>
      {children}
    </div>
  );
};
