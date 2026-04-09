import React, { useState } from "react";
import { Button, Card, Form, InputGroup } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";
import { Link } from "react-router-dom";
import { HashLink } from "react-router-hash-link";

import * as GQL from "src/core/generated-graphql";
import { Icon } from "src/components/Shared/Icon";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { stashBoxStudioQuery, useLabelUpdate } from "src/core/StashService";
import { useConfigurationContext } from "src/hooks/Config";
import { mergeStashIDs } from "src/utils/stashbox";

import StashSearchResult from "./StashSearchResult";
import StudioConfig from "./Config";
import { ITaggerConfig } from "../constants";
import StudioModal from "../scenes/StudioModal";
import { faCog, faTags } from "@fortawesome/free-solid-svg-icons";
import { ExternalLink } from "src/components/Shared/ExternalLink";
import { useTaggerConfig } from "../config";
import {
  mergeOrOverwriteAliases,
  mergeOrOverwriteURLs,
} from "../studios/updateStrategy";

const CLASSNAME = "StudioTagger";

interface ILabelTaggerListProps {
  labels: GQL.LabelDataFragment[];
  selectedEndpoint: { endpoint: string; index: number };
  config: ITaggerConfig;
}

const LabelTaggerList: React.FC<ILabelTaggerListProps> = ({
  labels,
  selectedEndpoint,
  config,
}) => {
  const intl = useIntl();

  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Record<string, GQL.ScrapedStudioDataFragment[]>
  >({});
  const [searchErrors, setSearchErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [taggedStudios, setTaggedStudios] = useState<
    Record<string, Partial<GQL.SlimLabelDataFragment>>
  >({});
  const [queries, setQueries] = useState<Record<string, string>>({});
  const labelAliasOperation = config.labelAliasOperation ?? "overwrite";
  const labelURLsOperation = config.labelURLsOperation ?? "overwrite";

  const [error, setError] = useState<
    Record<string, { message?: string; details?: string } | undefined>
  >({});
  const [loadingUpdate, setLoadingUpdate] = useState<string | undefined>();
  const [modalStudio, setModalStudio] = useState<
    GQL.ScrapedStudioDataFragment | undefined
  >();

  const doBoxSearch = (studioID: string, searchVal: string) => {
    stashBoxStudioQuery(searchVal, selectedEndpoint.endpoint)
      .then((queryData) => {
        const s = queryData.data?.scrapeSingleStudio ?? [];
        setSearchResults({
          ...searchResults,
          [studioID]: s,
        });
        setSearchErrors({
          ...searchErrors,
          [studioID]: undefined,
        });
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        // Destructure to remove existing result
        const { [studioID]: unassign, ...results } = searchResults;
        setSearchResults(results);
        setSearchErrors({
          ...searchErrors,
          [studioID]: intl.formatMessage({
            id: "studio_tagger.network_error",
          }),
        });
      });

    setLoading(true);
  };

  const doBoxUpdate = (studioID: string, stashID: string, endpoint: string) => {
    setLoadingUpdate(stashID);
    setError({
      ...error,
      [studioID]: undefined,
    });
    stashBoxStudioQuery(stashID, endpoint)
      .then((queryData) => {
        const data = queryData.data?.scrapeSingleStudio ?? [];
        if (data.length > 0) {
          setModalStudio({
            ...data[0],
            stored_id: studioID,
          });
        }
      })
      .finally(() => setLoadingUpdate(undefined));
  };

  const handleTaggedStudio = (
    studio: Pick<GQL.SlimLabelDataFragment, "id"> &
      Partial<Omit<GQL.SlimLabelDataFragment, "id">>
  ) => {
    setTaggedStudios({
      ...taggedStudios,
      [studio.id]: studio,
    });
  };

  const [updateLabel] = useLabelUpdate();

  function handleSaveError(
    labelID: string,
    labelName: string,
    message: string
  ) {
    setError({
      ...error,
      [labelID]: {
        message: `Failed to save label "${labelName}"`,
        details:
          message === "UNIQUE constraint failed: labels.name"
            ? "Name already exists"
            : message,
      },
    });
  }

  const handleLabelUpdate = async (input: GQL.StudioCreateInput) => {
    setModalStudio(undefined);
    const labelID = modalStudio?.stored_id;
    if (labelID) {
      const existingLabel = labels.find((l) => l.id === labelID);
      const finalName = (
        input.name ??
        existingLabel?.name ??
        modalStudio?.name ??
        ""
      ).trim();
      const updateData: GQL.LabelUpdateInput = {
        id: labelID,
        name: input.name,
        details: input.details,
        image: input.image,
        tag_ids: input.tag_ids,
      };

      if (input.stash_ids?.length) {
        updateData.stash_ids = mergeStashIDs(
          existingLabel?.stash_ids ?? [],
          input.stash_ids
        );
      }

      if (input.aliases) {
        updateData.aliases = mergeOrOverwriteAliases({
          existingAliases: existingLabel?.aliases,
          incomingAliases: input.aliases,
          finalName,
          operation: labelAliasOperation,
        });
      }

      if (input.urls) {
        updateData.urls = mergeOrOverwriteURLs({
          existingURLs: existingLabel?.urls,
          incomingURLs: input.urls,
          operation: labelURLsOperation,
        });
      }

      const res = await updateLabel({
        variables: {
          input: updateData,
        },
      });
      if (!res.data?.labelUpdate)
        handleSaveError(
          labelID,
          existingLabel?.name ?? modalStudio?.name ?? "",
          res?.errors?.[0]?.message ?? ""
        );
    }
  };

  const renderLabels = () =>
    labels.map((label) => {
      const isTagged = taggedStudios[label.id];

      const stashID = label.stash_ids.find((s) => {
        return s.endpoint === selectedEndpoint.endpoint;
      });

      let mainContent;
      if (!isTagged && stashID !== undefined) {
        mainContent = (
          <div className="text-left">
            <h5 className="text-bold">Label already tagged</h5>
          </div>
        );
      } else if (!isTagged && !stashID) {
        mainContent = (
          <InputGroup>
            <Form.Control
              className="text-input"
              defaultValue={label.name ?? ""}
              onChange={(e) =>
                setQueries({
                  ...queries,
                  [label.id]: e.currentTarget.value,
                })
              }
              onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) =>
                e.key === "Enter" &&
                doBoxSearch(label.id, queries[label.id] ?? label.name ?? "")
              }
            />
            <InputGroup.Append>
              <Button
                disabled={loading}
                onClick={() =>
                  doBoxSearch(label.id, queries[label.id] ?? label.name ?? "")
                }
              >
                <FormattedMessage id="actions.search" />
              </Button>
            </InputGroup.Append>
          </InputGroup>
        );
      } else if (isTagged) {
        mainContent = (
          <div className="d-flex flex-column text-left">
            <h5>Label successfully tagged</h5>
          </div>
        );
      }

      let subContent;
      if (stashID !== undefined) {
        const base = stashID.endpoint.match(/https?:\/\/.*?\//)?.[0];
        const link = base ? (
          <ExternalLink
            className="small d-block"
            href={`${base}labels/${stashID.stash_id}`}
          >
            {stashID.stash_id}
          </ExternalLink>
        ) : (
          <div className="small">{stashID.stash_id}</div>
        );

        subContent = (
          <div key={label.id}>
            <InputGroup className="StudioTagger-box-link">
              <InputGroup.Text>{link}</InputGroup.Text>
              <InputGroup.Append>
                <Button
                  onClick={() =>
                    doBoxUpdate(label.id, stashID.stash_id, stashID.endpoint)
                  }
                  disabled={!!loadingUpdate}
                >
                  {loadingUpdate === stashID.stash_id ? (
                    <LoadingIndicator inline small message="" />
                  ) : (
                    <FormattedMessage id="actions.refresh" />
                  )}
                </Button>
              </InputGroup.Append>
            </InputGroup>
            {error[label.id] && (
              <div className="text-danger mt-1">
                <strong>
                  <span className="mr-2">Error:</span>
                  {error[label.id]?.message}
                </strong>
                <div>{error[label.id]?.details}</div>
              </div>
            )}
          </div>
        );
      } else if (searchErrors[label.id]) {
        subContent = (
          <div className="text-danger font-weight-bold">
            {searchErrors[label.id]}
          </div>
        );
      } else if (searchResults[label.id]?.length === 0) {
        subContent = (
          <div className="text-danger font-weight-bold">No results found.</div>
        );
      }

      let searchResult;
      if (searchResults[label.id]?.length > 0 && !isTagged) {
        searchResult = (
          <StashSearchResult
            key={label.id}
            stashboxLabels={searchResults[label.id]}
            label={label}
            endpoint={selectedEndpoint.endpoint}
            onLabelTagged={handleTaggedStudio}
            excludedLabelFields={config.excludedStudioFields ?? []}
            labelAliasOperation={labelAliasOperation}
            labelURLsOperation={labelURLsOperation}
          />
        );
      }

      return (
        <div key={label.id} className={`${CLASSNAME}-studio`}>
          {modalStudio && (
            <StudioModal
              closeModal={() => setModalStudio(undefined)}
              modalVisible={modalStudio.stored_id === label.id}
              studio={modalStudio}
              handleStudioCreate={handleLabelUpdate}
              excludedStudioFields={config.excludedStudioFields}
              icon={faTags}
              header="Update Label"
              endpoint={selectedEndpoint.endpoint}
              showParentStudio={false}
            />
          )}
          <div className={`${CLASSNAME}-details`}>
            <div></div>
            <div>
              <Card className="studio-card">
                <img loading="lazy" src={label.image_path ?? ""} alt="" />
              </Card>
            </div>
            <div className={`${CLASSNAME}-details-text`}>
              <Link
                to={`/labels/${label.id}`}
                className={`${CLASSNAME}-header`}
              >
                <h2>{label.name}</h2>
              </Link>
              {mainContent}
              <div className="sub-content text-left">{subContent}</div>
              {searchResult}
            </div>
          </div>
        </div>
      );
    });

  return (
    <Card>
      <div className={CLASSNAME}>{renderLabels()}</div>
    </Card>
  );
};

interface ITaggerProps {
  labels: GQL.LabelDataFragment[];
}

export const LabelTagger: React.FC<ITaggerProps> = ({ labels }) => {
  const { configuration: stashConfig } = useConfigurationContext();
  const { config, setConfig } = useTaggerConfig();
  const [showConfig, setShowConfig] = useState(false);

  if (!config) return <LoadingIndicator />;

  const savedEndpointIndex =
    stashConfig?.general.stashBoxes.findIndex(
      (s) => s.endpoint === config.selectedEndpoint
    ) ?? -1;
  const selectedEndpointIndex =
    savedEndpointIndex === -1 && stashConfig?.general.stashBoxes.length
      ? 0
      : savedEndpointIndex;
  const selectedEndpoint =
    stashConfig?.general.stashBoxes[selectedEndpointIndex];

  const stashBoxes = stashConfig?.general.stashBoxes ?? [];

  function formatEndpointLabel(endpoint: string) {
    return endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  function handleSourceSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedEndpointValue = e.currentTarget.value;
    setConfig({
      ...config,
      selectedEndpoint: selectedEndpointValue,
    });
  }

  function renderSourceSelector() {
    return (
      <Form.Group
        controlId="scraper"
        className="d-flex align-items-center mb-0"
      >
        <Form.Label className="mr-2 mb-0 text-nowrap">
          <FormattedMessage id="component_tagger.config.source" />
        </Form.Label>
        <Form.Control
          as="select"
          value={selectedEndpoint?.endpoint}
          className="input-control tagger-source-select"
          disabled={!stashBoxes.length}
          onChange={handleSourceSelect}
        >
          {!stashBoxes.length && <option>No instances found</option>}
          {stashBoxes.map((i) => (
            <option value={i.endpoint} key={i.endpoint}>
              {formatEndpointLabel(i.endpoint)}
            </option>
          ))}
        </Form.Control>
      </Form.Group>
    );
  }

  return (
    <>
      <div className="tagger-container mx-md-auto">
        {selectedEndpointIndex !== -1 && selectedEndpoint ? (
          <>
            <div className="row mb-2 no-gutters align-items-center">
              <div className="col-auto">{renderSourceSelector()}</div>
              <div className="ml-auto d-flex">
                <Button onClick={() => setShowConfig(!showConfig)}>
                  <Icon className="fa-fw" icon={faCog} />
                </Button>
              </div>
            </div>

            <StudioConfig
              config={config}
              setConfig={setConfig}
              show={showConfig}
            />
            <LabelTaggerList
              labels={labels}
              selectedEndpoint={{
                endpoint: selectedEndpoint.endpoint,
                index: selectedEndpointIndex,
              }}
              config={config}
            />
          </>
        ) : (
          <div className="my-4">
            <h3 className="text-center mt-4">
              To use the label tagger a stash-box instance needs to be
              configured.
            </h3>
            <h5 className="text-center">
              Please see{" "}
              <HashLink
                to="/settings?tab=metadata-providers#stash-boxes"
                scroll={(el) =>
                  el.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              >
                Settings.
              </HashLink>
            </h5>
          </div>
        )}
      </div>
    </>
  );
};
