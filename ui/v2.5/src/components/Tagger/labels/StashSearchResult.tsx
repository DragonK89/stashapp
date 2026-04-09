import React, { useState } from "react";
import { Button } from "react-bootstrap";

import * as GQL from "src/core/generated-graphql";
import { useLabelUpdate } from "src/core/StashService";
import StudioModal from "../scenes/StudioModal";
import { faTags } from "@fortawesome/free-solid-svg-icons";
import { mergeStashIDs } from "src/utils/stashbox";
import { PerformerFieldOperation } from "../constants";
import {
  mergeOrOverwriteAliases,
  mergeOrOverwriteURLs,
} from "../studios/updateStrategy";

interface IStashSearchResultProps {
  label: GQL.LabelDataFragment;
  stashboxLabels: GQL.ScrapedStudioDataFragment[];
  endpoint: string;
  onLabelTagged: (
    label: Pick<GQL.SlimLabelDataFragment, "id"> &
      Partial<Omit<GQL.SlimLabelDataFragment, "id">>
  ) => void;
  excludedLabelFields: string[];
  labelAliasOperation: PerformerFieldOperation;
  labelURLsOperation: PerformerFieldOperation;
}

const StashSearchResult: React.FC<IStashSearchResultProps> = ({
  label,
  stashboxLabels,
  onLabelTagged,
  excludedLabelFields,
  endpoint,
  labelAliasOperation,
  labelURLsOperation,
}) => {
  const [modalStudio, setModalStudio] =
    useState<GQL.ScrapedStudioDataFragment>();
  const [saveState, setSaveState] = useState<string>("");
  const [error, setError] = useState<{ message?: string; details?: string }>(
    {}
  );

  const [updateLabel] = useLabelUpdate();

  function handleSaveError(name: string, message: string) {
    setError({
      message: `Failed to save label "${name}"`,
      details:
        message === "UNIQUE constraint failed: labels.name"
          ? "Name already exists"
          : message,
    });
  }

  const handleSave = async (input: GQL.StudioCreateInput) => {
    setError({});
    setModalStudio(undefined);

    setSaveState("Saving label");

    const finalName = (input.name ?? label.name ?? "").trim();
    const updateData: GQL.LabelUpdateInput = {
      id: label.id,
      name: input.name,
      details: input.details,
      image: input.image,
      tag_ids: input.tag_ids,
    };

    if (input.stash_ids?.length) {
      updateData.stash_ids = mergeStashIDs(label.stash_ids, input.stash_ids);
    }

    if (input.aliases) {
      updateData.aliases = mergeOrOverwriteAliases({
        existingAliases: label.aliases,
        incomingAliases: input.aliases,
        finalName,
        operation: labelAliasOperation,
      });
    }

    if (input.urls) {
      updateData.urls = mergeOrOverwriteURLs({
        existingURLs: label.urls,
        incomingURLs: input.urls,
        operation: labelURLsOperation,
      });
    }

    const res = await updateLabel({
      variables: {
        input: updateData,
      },
    });

    if (!res?.data?.labelUpdate)
      handleSaveError(label.name, res?.errors?.[0]?.message ?? "");
    else onLabelTagged(label);
    setSaveState("");
  };

  const labels = stashboxLabels.map((p) => (
    <Button
      className="StudioTagger-studio-search-item minimal col-6"
      variant="link"
      key={p.remote_site_id}
      onClick={() => setModalStudio(p)}
    >
      <img
        loading="lazy"
        src={(p.image ?? [])[0]}
        alt=""
        className="StudioTagger-thumb"
      />
      <span>{p.name}</span>
    </Button>
  ));

  return (
    <>
      {modalStudio && (
        <StudioModal
          closeModal={() => setModalStudio(undefined)}
          modalVisible={modalStudio !== undefined}
          studio={modalStudio}
          handleStudioCreate={handleSave}
          icon={faTags}
          header="Update Label"
          excludedStudioFields={excludedLabelFields}
          endpoint={endpoint}
          showParentStudio={false}
        />
      )}
      <div className="StudioTagger-studio-search">{labels}</div>
      <div className="row no-gutters mt-2 align-items-center justify-content-end">
        {error.message && (
          <div className="text-right text-danger mt-1">
            <strong>
              <span className="mr-2">Error:</span>
              {error.message}
            </strong>
            <div>{error.details}</div>
          </div>
        )}
        {saveState && (
          <strong className="col-4 mt-1 mr-2 text-right">{saveState}</strong>
        )}
      </div>
    </>
  );
};

export default StashSearchResult;
