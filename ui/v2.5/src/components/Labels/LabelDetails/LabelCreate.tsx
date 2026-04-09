import React, { useMemo, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useIntl } from "react-intl";

import * as GQL from "src/core/generated-graphql";
import { useLabelCreate } from "src/core/StashService";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { useToast } from "src/hooks/Toast";
import { LabelEditPanel } from "./LabelEditPanel";

const LabelCreate: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const Toast = useToast();

  const query = useMemo(() => new URLSearchParams(location.search), [location]);
  const label = {
    name: query.get("q") ?? undefined,
  };

  const intl = useIntl();

  // Editing label state
  const [image, setImage] = useState<string | null>();
  const [encodingImage, setEncodingImage] = useState<boolean>(false);

  const [createLabel] = useLabelCreate();

  async function onSave(input: GQL.LabelCreateInput) {
    const result = await createLabel({
      variables: { input },
    });
    if (result.data?.labelCreate?.id) {
      history.replace(`/labels/${result.data.labelCreate.id}`);
      Toast.success(
        intl.formatMessage(
          { id: "toast.created_entity" },
          { entity: intl.formatMessage({ id: "label" }).toLocaleLowerCase() }
        )
      );
    }
  }

  function renderImage() {
    if (image) {
      return <img className="logo" alt="" src={image} />;
    }
  }

  return (
    <div className="row">
      <div className="label-details col-md-8">
        <h2>
          {intl.formatMessage(
            { id: "actions.add_entity" },
            { entityType: intl.formatMessage({ id: "label" }) }
          )}
        </h2>
        <div className="text-center">
          {encodingImage ? (
            <LoadingIndicator
              message={intl.formatMessage({ id: "actions.encoding_image" })}
            />
          ) : (
            renderImage()
          )}
        </div>
        <LabelEditPanel
          label={label}
          onSubmit={onSave}
          onCancel={() => history.push("/labels")}
          onDelete={() => {}}
          setImage={setImage}
          setEncodingImage={setEncodingImage}
        />
      </div>
    </div>
  );
};

export default LabelCreate;
