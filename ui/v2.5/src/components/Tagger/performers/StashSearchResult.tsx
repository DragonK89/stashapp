import React, { useState } from "react";
import { Button } from "react-bootstrap";

import * as GQL from "src/core/generated-graphql";
import { useUpdatePerformer } from "../queries";
import PerformerModal from "../PerformerModal";
import { faTags } from "@fortawesome/free-solid-svg-icons";
import { mergeStashIDs } from "src/utils/stashbox";
import { PerformerFieldOperation } from "../constants";
import {
  mergeOrOverwriteAliases,
  mergeOrOverwriteURLs,
} from "./updateStrategy";

interface IStashSearchResultProps {
  performer: GQL.SlimPerformerDataFragment;
  stashboxPerformers: GQL.ScrapedPerformerDataFragment[];
  endpoint: string;
  onPerformerTagged: (
    performer: Pick<GQL.SlimPerformerDataFragment, "id"> &
      Partial<Omit<GQL.SlimPerformerDataFragment, "id">>
  ) => void;
  excludedPerformerFields: string[];
  performerAliasOperation: PerformerFieldOperation;
  performerURLsOperation: PerformerFieldOperation;
}

const StashSearchResult: React.FC<IStashSearchResultProps> = ({
  performer,
  stashboxPerformers,
  onPerformerTagged,
  excludedPerformerFields,
  endpoint,
  performerAliasOperation,
  performerURLsOperation,
}) => {
  const [modalPerformer, setModalPerformer] =
    useState<GQL.ScrapedPerformerDataFragment>();
  const [saveState, setSaveState] = useState<string>("");
  const [error, setError] = useState<{ message?: string; details?: string }>(
    {}
  );

  const updatePerformer = useUpdatePerformer();

  const handleSave = async (input: GQL.PerformerCreateInput) => {
    setError({});
    setSaveState("Saving performer");
    setModalPerformer(undefined);

    if (input.stash_ids?.length) {
      input.stash_ids = mergeStashIDs(performer.stash_ids, input.stash_ids);
    }

    const finalName = (input.name ?? performer.name ?? "").trim();
    if (input.alias_list) {
      input.alias_list = mergeOrOverwriteAliases({
        existingAliases: performer.alias_list,
        incomingAliases: input.alias_list,
        finalName,
        operation: performerAliasOperation,
      });
    }

    if (input.urls) {
      input.urls = mergeOrOverwriteURLs({
        existingURLs: performer.urls,
        incomingURLs: input.urls,
        operation: performerURLsOperation,
      });
    }

    const updateData: GQL.PerformerUpdateInput = {
      ...input,
      id: performer.id,
    };

    const res = await updatePerformer(updateData);

    if (!res?.data?.performerUpdate)
      setError({
        message: `Failed to save performer "${performer.name}"`,
        details:
          res?.errors?.[0].message ===
          "UNIQUE constraint failed: performers.name"
            ? "Name already exists"
            : res?.errors?.[0].message,
      });
    else onPerformerTagged(performer);
    setSaveState("");
  };

  const performers = stashboxPerformers.map((p) => (
    <Button
      className="PerformerTagger-performer-search-item minimal col-6"
      variant="link"
      key={p.remote_site_id}
      onClick={() => setModalPerformer(p)}
    >
      <img src={(p.images ?? [])[0]} alt="" className="PerformerTagger-thumb" />
      <span>
        {p.name}
        {p.disambiguation && ` (${p.disambiguation})`}
      </span>
    </Button>
  ));

  return (
    <>
      {modalPerformer && (
        <PerformerModal
          closeModal={() => setModalPerformer(undefined)}
          modalVisible={modalPerformer !== undefined}
          performer={modalPerformer}
          onSave={handleSave}
          icon={faTags}
          header="Update Performer"
          excludedPerformerFields={excludedPerformerFields}
          endpoint={endpoint}
        />
      )}
      <div className="PerformerTagger-performer-search">{performers}</div>
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
