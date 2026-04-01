import React, { useMemo } from "react";
import { Button, ButtonGroup } from "react-bootstrap";
import { FormattedMessage } from "react-intl";
import cx from "classnames";

import { LabelIDSelect, Label } from "src/components/Labels/LabelSelect";
import { ScrapedLabel } from "../context";
import { ExternalLink } from "src/components/Shared/ExternalLink";

interface ILabelResultProps {
  label: ScrapedLabel;
  selectedID: string | undefined;
  setSelectedID: (id: string | undefined) => void;
  onCreate: () => void;
  canCreate?: boolean;
  studioID?: string;
  studioName?: string;
}

const LabelResult: React.FC<ILabelResultProps> = ({
  label,
  selectedID,
  setSelectedID,
  onCreate,
  canCreate = true,
  studioID,
  studioName,
}) => {
  const handleSelect = (labels: Label[]) => {
    if (labels.length) {
      setSelectedID(labels[0].id);
    } else {
      setSelectedID(undefined);
    }
  };

  const handleSkip = () => {
    setSelectedID(undefined);
  };

  const selectedSource = !selectedID ? "skip" : "existing";

  return (
    <div className="row no-gutters align-items-center mt-2">
      <div className="entity-name">
        <FormattedMessage id="label" />:
        <b className="ml-2">
          <ExternalLink href={label.image ?? undefined}>{label.name}</ExternalLink>
        </b>
      </div>
      <ButtonGroup>
        <Button
          variant="secondary"
          onClick={onCreate}
          disabled={!canCreate}
        >
          <FormattedMessage id="actions.create" />
        </Button>
        <Button
          variant={selectedSource === "skip" ? "primary" : "secondary"}
          onClick={() => handleSkip()}
        >
          <FormattedMessage id="actions.skip" />
        </Button>
        <LabelIDSelect
          ids={selectedID ? [selectedID] : []}
          onSelect={handleSelect}
          className={cx("label-select", {
            "label-select-active": selectedSource === "existing",
          })}
          isClearable={false}
          studioId={studioID}
          studioName={studioName}
        />
      </ButtonGroup>
    </div>
  );
};

export default LabelResult;
