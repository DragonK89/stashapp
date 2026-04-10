import React, { useContext, useState } from "react";
import { Badge, Button, Card, Collapse, Form } from "react-bootstrap";
import { FormattedMessage } from "react-intl";

import { TaggerStateContext } from "../galleryContext";
import GalleryFieldSelector from "../GalleryFieldSelector";

interface IConfigProps {
  show: boolean;
}

const Config: React.FC<IConfigProps> = ({ show }) => {
  const { config, setConfig } = useContext(TaggerStateContext);

  const [showExclusionModal, setShowExclusionModal] = useState(false);

  const excludedFields = config.excludedGalleryFields ?? [];

  const handleFieldSelect = (fields: string[]) => {
    setConfig({ ...config, excludedGalleryFields: fields });
    setShowExclusionModal(false);
  };

  return (
    <>
      <Collapse in={show}>
        <Card className="">
          <div className="row">
            <h4 className="col-12">
              <FormattedMessage id="configuration" />
            </h4>
            <hr className="w-100" />
            <Form className="col-md-6">
              <Form.Group
                controlId="set-cover-from-scene"
                className="align-items-center"
              >
                <h6>
                  <FormattedMessage id="cover_type" />
                </h6>
                <Form.Check
                  label="Set Cover From Scene"
                  checked={config.setGalleryCoverFromScene}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      setGalleryCoverFromScene: e.currentTarget.checked,
                    })
                  }
                />
                <Form.Text>
                  If true, when saving a gallery, the logic of &quot;Set Cover
                  From Scene&quot; will be applied.
                </Form.Text>
              </Form.Group>
            </Form>
            <div className="col-md-6">
              <Form.Group controlId="excluded-gallery-fields">
                <h6>
                  <FormattedMessage id="component_tagger.config.excluded_fields" />
                </h6>
                <span>
                  {excludedFields.length > 0 ? (
                    excludedFields.map((f) => (
                      <Badge variant="secondary" className="tag-item" key={f}>
                        <FormattedMessage
                          id={f === "code" ? "gallery_code" : f}
                        />
                      </Badge>
                    ))
                  ) : (
                    <FormattedMessage id="component_tagger.config.no_fields_are_excluded" />
                  )}
                </span>
                <Form.Text>
                  <FormattedMessage id="component_tagger.config.these_fields_will_not_be_changed_when_updating_galleries" />
                </Form.Text>
                <Button
                  onClick={() => setShowExclusionModal(true)}
                  className="mt-2"
                >
                  <FormattedMessage id="component_tagger.config.edit_excluded_fields" />
                </Button>
              </Form.Group>
            </div>
          </div>
        </Card>
      </Collapse>
      <GalleryFieldSelector
        show={showExclusionModal}
        onSelect={handleFieldSelect}
        excludedFields={excludedFields}
      />
    </>
  );
};

export default Config;
