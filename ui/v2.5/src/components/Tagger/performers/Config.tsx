import React, { Dispatch, useState } from "react";
import { Badge, Button, Card, Collapse, Form } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";

import { ITaggerConfig, PerformerFieldOperation } from "../constants";
import PerformerFieldSelector from "../PerformerFieldSelector";

interface IConfigProps {
  show: boolean;
  config: ITaggerConfig;
  setConfig: Dispatch<ITaggerConfig>;
}

const Config: React.FC<IConfigProps> = ({ show, config, setConfig }) => {
  const intl = useIntl();
  const [showExclusionModal, setShowExclusionModal] = useState(false);

  const excludedFields = config.excludedPerformerFields ?? [];
  const aliasIncluded = !excludedFields.includes("aliases");
  const urlsIncluded = !excludedFields.includes("urls");

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
            <div className="col-lg-8 col-md-10">
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
              <Form.Group controlId="performer-update-behavior">
                <h6 className="mb-3">Update behavior</h6>
                <div className="row no-gutters align-items-center mb-2">
                  <div className="col-auto pr-2">
                    <Form.Check
                      id="performer-alias-operation-enabled"
                      className="mb-0"
                      label={intl.formatMessage({ id: "aliases" })}
                      checked={aliasIncluded}
                      onChange={(e) =>
                        toggleField("aliases", e.currentTarget.checked)
                      }
                    />
                  </div>
                  <div className="col-auto">
                    <Form.Control
                      as="select"
                      className="input-control tagger-update-behavior-select"
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
                </div>
                <div className="row no-gutters align-items-center">
                  <div className="col-auto pr-2">
                    <Form.Check
                      id="performer-urls-operation-enabled"
                      className="mb-0"
                      label={intl.formatMessage({ id: "urls" })}
                      checked={urlsIncluded}
                      onChange={(e) =>
                        toggleField("urls", e.currentTarget.checked)
                      }
                    />
                  </div>
                  <div className="col-auto">
                    <Form.Control
                      as="select"
                      className="input-control tagger-update-behavior-select"
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
