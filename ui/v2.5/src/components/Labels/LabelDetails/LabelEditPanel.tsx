import React, { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import * as yup from "yup";
import Mousetrap from "mousetrap";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { DetailsEditNavbar } from "src/components/Shared/DetailsEditNavbar";
import { Button, Form } from "react-bootstrap";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import ImageUtils from "src/utils/image";
import { addUpdateStashID, getStashIDs } from "src/utils/stashIds";
import { useFormik } from "formik";
import { Prompt } from "react-router-dom";
import isEqual from "lodash-es/isEqual";
import { useToast } from "src/hooks/Toast";
import { useConfigurationContext } from "src/hooks/Config";
import { handleUnsavedChanges } from "src/utils/navigation";
import { formikUtils } from "src/utils/form";
import { yupFormikValidate, yupUniqueAliases } from "src/utils/yup";
import { Studio, StudioSelect } from "../../Studios/StudioSelect";
import { useTagsEdit } from "src/hooks/tagsEdit";
import { useIsMounted } from "src/hooks/state";
import { Icon } from "src/components/Shared/Icon";
import StashBoxIDSearchModal from "src/components/Shared/StashBoxIDSearchModal";

interface ILabelEditPanel {
  label: Partial<GQL.LabelDataFragment>;
  onSubmit: (label: GQL.LabelCreateInput) => Promise<void>;
  onCancel: () => void;
  onDelete: () => void;
  setImage: (image?: string | null) => void;
  setEncodingImage: (loading: boolean) => void;
}

export const LabelEditPanel: React.FC<ILabelEditPanel> = ({
  label,
  onSubmit,
  onCancel,
  onDelete,
  setImage,
  setEncodingImage,
}) => {
  const intl = useIntl();
  const Toast = useToast();
  const { configuration: stashConfig } = useConfigurationContext();

  const isNew = label.id === undefined;

  // Editing state
  const [isStashIDSearchOpen, setIsStashIDSearchOpen] = useState(false);

  // Network state
  const [isLoading, setIsLoading] = useState(false);
  const isMounted = useIsMounted();

  const [parentStudio, setParentStudio] = useState<Studio | null>(null);

  const schema = yup.object({
    name: yup.string().required(),
    urls: yup.array(yup.string().required()).defined(),
    details: yup.string().ensure(),
    studio_id: yup.string().required().defined(),
    aliases: yupUniqueAliases(intl, "name"),
    tag_ids: yup.array(yup.string().required()).defined(),
    ignore_auto_tag: yup.boolean().defined(),
    stash_ids: yup.mixed<GQL.StashIdInput[]>().defined(),
    image: yup.string().nullable().optional(),
  });

  const initialValues = {
    id: label.id,
    name: label.name ?? "",
    urls: label.urls ?? [],
    details: label.details ?? "",
    studio_id: label.studio?.id ?? "",
    aliases: label.aliases ?? [],
    tag_ids: (label.tags ?? []).map((t) => t.id),
    ignore_auto_tag: label.ignore_auto_tag ?? false,
    stash_ids: getStashIDs(label.stash_ids),
  };

  type InputValues = yup.InferType<typeof schema>;

  const formik = useFormik<InputValues>({
    initialValues,
    enableReinitialize: true,
    validate: yupFormikValidate(schema),
    onSubmit: (values) => onSave(schema.cast(values)),
  });

  const { tagsControl } = useTagsEdit(label.tags, (ids) =>
    formik.setFieldValue("tag_ids", ids)
  );

  function onSetStudio(item: Studio | null) {
    setParentStudio(item);
    formik.setFieldValue("studio_id", item ? item.id : "");
  }

  const encodingImage = ImageUtils.usePasteImage((imageData) =>
    formik.setFieldValue("image", imageData)
  );

  useEffect(() => {
    setParentStudio(
      label.studio
        ? {
            id: label.studio.id,
            name: label.studio.name,
            aliases: [],
          }
        : null
    );
  }, [label.studio]);

  useEffect(() => {
    setImage(formik.values.image);
  }, [formik.values.image, setImage]);

  useEffect(() => {
    setEncodingImage(encodingImage);
  }, [setEncodingImage, encodingImage]);

  // set up hotkeys
  useEffect(() => {
    Mousetrap.bind("s s", () => {
      if (formik.dirty) {
        formik.submitForm();
      }
    });

    return () => {
      Mousetrap.unbind("s s");
    };
  });

  async function onSave(input: InputValues) {
    setIsLoading(true);
    try {
      await onSubmit(input);
      if (isMounted.current) {
        formik.resetForm();
      }
    } catch (e) {
      Toast.error(e);
    }
    if (isMounted.current) {
      setIsLoading(false);
    }
  }

  function onImageLoad(imageData: string | null) {
    formik.setFieldValue("image", imageData);
  }

  function onImageChange(event: React.FormEvent<HTMLInputElement>) {
    ImageUtils.onImageChange(event, onImageLoad);
  }

  function onStashIDSelected(item?: GQL.StashIdInput) {
    if (!item) return;
    formik.setFieldValue(
      "stash_ids",
      addUpdateStashID(formik.values.stash_ids, item)
    );
  }

  const {
    renderField,
    renderInputField,
    renderStringListField,
    renderStashIDsField,
  } = formikUtils(intl, formik);

  function renderStudioField() {
    const title = intl.formatMessage({ id: "studio" });
    const control = (
      <StudioSelect
        onSelect={(items) =>
          onSetStudio(items.length > 0 ? items[0] : null)
        }
        values={parentStudio ? [parentStudio] : []}
      />
    );

    return renderField("studio_id", title, control);
  }

  function renderTagsField() {
    const title = intl.formatMessage({ id: "tags" });
    return renderField("tag_ids", title, tagsControl());
  }

  if (isLoading) return <LoadingIndicator />;

  return (
    <>
      {isStashIDSearchOpen && (
        <StashBoxIDSearchModal
          entityType="label"
          stashBoxes={stashConfig?.general.stashBoxes ?? []}
          excludedStashBoxEndpoints={formik.values.stash_ids.map(
            (s) => s.endpoint
          )}
          onSelectItem={(item) => {
            onStashIDSelected(item);
            setIsStashIDSearchOpen(false);
          }}
        />
      )}
      <Prompt
        when={formik.dirty}
        message={(location, action) => {
          if (action === "PUSH" && location.pathname.startsWith("/labels/"))
            return true;

          return handleUnsavedChanges(intl, "labels", label.id)(location);
        }}
      />

      <Form noValidate onSubmit={formik.handleSubmit} id="label-edit">
        {renderInputField("name")}
        {renderStringListField("aliases")}
        {renderStringListField("urls")}
        {renderInputField("details", "textarea")}
        {renderStudioField()}
        {renderTagsField()}
        {renderStashIDsField(
          "stash_ids",
          "labels",
          "stash_ids",
          undefined,
          <Button
            variant="success"
            className="mr-2 py-0"
            onClick={() => setIsStashIDSearchOpen(true)}
            disabled={!stashConfig?.general.stashBoxes?.length}
            title={intl.formatMessage({ id: "actions.add_stash_id" })}
          >
            <Icon icon={faPlus} />
          </Button>
        )}
        <hr />
        {renderInputField("ignore_auto_tag", "checkbox")}
      </Form>

      <DetailsEditNavbar
        objectName={label?.name ?? intl.formatMessage({ id: "label" })}
        classNames="col-xl-9 mt-3"
        isNew={isNew}
        isEditing
        onToggleEdit={onCancel}
        onSave={formik.handleSubmit}
        saveDisabled={(!isNew && !formik.dirty) || !isEqual(formik.errors, {})}
        onImageChange={onImageChange}
        onImageChangeURL={onImageLoad}
        onClearImage={() => onImageLoad(null)}
        onDelete={onDelete}
        acceptSVG
      />
    </>
  );
};
