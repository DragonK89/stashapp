import React, { Dispatch, useState } from "react";
import { Badge, Button, Card, Collapse, Form } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";
import { useConfigurationContext } from "src/hooks/Config";

import { ITaggerConfig, PerformerFieldOperation } from "../constants";
import PerformerFieldSelector from "../PerformerFieldSelector";

interface IConfigProps {
  show: boolean;
  config: ITaggerConfig;
  setConfig: Dispatch<ITaggerConfig>;
}

const Config: React.FC<IConfigProps> = ({ show, config, setConfig }) => {
  const intl = useIntl();
  const { configuration: stashConfig } = useConfigurationContext();
  const [showExclusionModal, setShowExclusionModal] = useState(false);

  const excludedFields = config.excludedPerformerFields ?? [];
  const aliasIncluded = !excludedFields.includes("aliases");
  const urlsIncluded = !excludedFields.includes("urls");

  const handleInstanceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedEndpoint = e.currentTarget.value;
    setConfig({
      ...config,
      selectedEndpoint,
    });
  };

  const stashBoxes = stashConfig?.general.stashBoxes ?? [];

  const handleFieldSelect = (fields: string[]) => {
    setConfig({ ...config, excludedPerformerFields: fields });
    setShowExclusionModal(false);
  };

  const toggleField = (field: string, enabled: boolean) => {
    const excluded = new Set(config.excludedPerformerFields ?? []);
    if (enabled) {
      excluded.delete(field);
    } else {
      excluded.add(field);
    }

    setConfig({
      ...config,
      excludedPerformerFields: Array.from(excluded),
    });
  };

  const setPerformerFieldOperation = (
    field: "aliases" | "urls",
    operation: PerformerFieldOperation
  ) => {
    if (field === "aliases") {
      setConfig({
        ...config,
        performerAliasOperation: operation,
      });
      return;
    }

    setConfig({
      ...config,
      performerURLsOperation: operation,
    });
  };

  return (
    <>
      <Collapse in={show}>
        <Card>
          <div className="row">
            <h4 className="col-12">
              <FormattedMessage id="configuration" />
            </h4>
            <hr className="w-100" />
            <div className="col-md-6">
              <Form.Group controlId="excluded-performer-fields">
                <h6>
                  <FormattedMessage id="performer_tagger.config.excluded_fields" />
                </h6>
                <span>
                  {excludedFields.length > 0 ? (
                    excludedFields.map((f) => (
                      <Badge variant="secondary" className="tag-item" key={f}>
                        <FormattedMessage id={f} />
                      </Badge>
                    ))
                  ) : (
                    <FormattedMessage id="performer_tagger.config.no_fields_are_excluded" />
                  )}
                </span>
                <Form.Text>
                  <FormattedMessage id="performer_tagger.config.these_fields_will_not_be_changed_when_updating_performers" />
                </Form.Text>
                <Button
                  onClick={() => setShowExclusionModal(true)}
                  className="mt-2"
                >
                  <FormattedMessage id="performer_tagger.config.edit_excluded_fields" />
                </Button>
              </Form.Group>
              <Form.Group
                controlId="stash-box-endpoint"
                className="align-items-center row no-gutters mt-4"
              >
                <Form.Label className="mr-4">
                  <FormattedMessage id="performer_tagger.config.active_stash-box_instance" />
                </Form.Label>
                <Form.Control
                  as="select"
                  value={config.selectedEndpoint}
                  className="col-md-4 col-6 input-control"
                  disabled={!stashBoxes.length}
                  onChange={handleInstanceSelect}
                >
                  {!stashBoxes.length && (
                    <option>
                      <FormattedMessage id="performer_tagger.config.no_instances_found" />
                    </option>
                  )}
                  {stashConfig?.general.stashBoxes.map((i) => (
                    <option value={i.endpoint} key={i.endpoint}>
                      {i.endpoint}
                    </option>
                  ))}
                </Form.Control>
              </Form.Group>

              <Form.Group className="align-items-center mt-4">
                <h6>Update behavior</h6>
                <div className="d-flex align-items-center mb-2">
                  <Form.Check
                    id="performer-alias-operation-enabled"
                    className="mr-3"
                    label={intl.formatMessage({ id: "aliases" })}
                    checked={aliasIncluded}
                    onChange={(e) => toggleField("aliases", e.currentTarget.checked)}
                  />
                  <Form.Control
                    as="select"
                    className="col-md-3 col-4 input-control"
                    value={config.performerAliasOperation ?? "overwrite"}
                    disabled={!aliasIncluded}
                    onChange={(e) =>
                      setPerformerFieldOperation(
                        "aliases",
                        e.currentTarget.value as PerformerFieldOperation
                      )
                    }
                  >
                    <option value="merge">
                      {intl.formatMessage({ id: "actions.merge" })}
                    </option>
                    <option value="overwrite">
                      {intl.formatMessage({ id: "actions.overwrite" })}
                    </option>
                  </Form.Control>
                </div>
                <div className="d-flex align-items-center">
                  <Form.Check
                    id="performer-urls-operation-enabled"
                    className="mr-3"
                    label={intl.formatMessage({ id: "urls" })}
                    checked={urlsIncluded}
                    onChange={(e) => toggleField("urls", e.currentTarget.checked)}
                  />
                  <Form.Control
                    as="select"
                    className="col-md-3 col-4 input-control"
                    value={config.performerURLsOperation ?? "overwrite"}
                    disabled={!urlsIncluded}
                    onChange={(e) =>
                      setPerformerFieldOperation(
                        "urls",
                        e.currentTarget.value as PerformerFieldOperation
                      )
                    }
                  >
                    <option value="merge">
                      {intl.formatMessage({ id: "actions.merge" })}
                    </option>
                    <option value="overwrite">
                      {intl.formatMessage({ id: "actions.overwrite" })}
                    </option>
                  </Form.Control>
                </div>
              </Form.Group>
            </div>
          </div>
        </Card>
      </Collapse>
      <PerformerFieldSelector
        show={showExclusionModal}
        onSelect={handleFieldSelect}
        excludedFields={excludedFields}
      />
    </>
  );
};

export default Config;
