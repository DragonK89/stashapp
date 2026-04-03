import React, { useEffect, useState } from "react";
import { Form, Col, Row } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";
import { useConfigurationContext } from "src/hooks/Config";
import { useIsMounted } from "src/hooks/state";
import { IUIConfig } from "src/core/config";
import isEqual from "lodash-es/isEqual";
import { useBulkGalleryUpdate } from "src/core/StashService";
import * as GQL from "src/core/generated-graphql";
import { StudioSelect } from "../Shared/Select";
import { ModalComponent } from "../Shared/Modal";
import { MultiSet } from "../Shared/MultiSet";
import { useToast } from "src/hooks/Toast";
import { RatingSystem } from "../Shared/Rating/RatingSystem";
import {
  getAggregateInputValue,
  getAggregatePerformerIds,
  getAggregateStateObject,
  getAggregateTagIds,
  getAggregateStudioId,
  getAggregateSceneIds,
} from "src/utils/bulkUpdate";
import { faPencilAlt } from "@fortawesome/free-solid-svg-icons";
import { IndeterminateCheckbox } from "../Shared/IndeterminateCheckbox";
import { BulkUpdateFormGroup, BulkUpdateTextInput } from "../Shared/BulkUpdate";
import { BulkUpdateDateInput } from "../Shared/DateInput";
import { getDateError } from "src/utils/yup";

interface IListOperationProps {
  selected: GQL.SlimGalleryDataFragment[];
  onClose: (applied: boolean) => void;
}

const galleryFields = [
  "code",
  "rating100",
  "details",
  "organized",
  "photographer",
  "date",
];

export const EditGalleriesDialog: React.FC<IListOperationProps> = (
  props: IListOperationProps
) => {
  const intl = useIntl();
  const Toast = useToast();

  const { configuration } = useConfigurationContext();
  const ui = configuration.ui as IUIConfig | undefined;
  const hideTags = ui?.hideTags ?? false;
  const [rating100, setRating] = useState<number>();
  const [studioId, setStudioId] = useState<string>();
  const [performerMode, setPerformerMode] =
    React.useState<GQL.BulkUpdateIdMode>(GQL.BulkUpdateIdMode.Add);
  const [performerIds, setPerformerIds] = useState<string[]>();
  const [existingPerformerIds, setExistingPerformerIds] = useState<string[]>();
  const [tagMode, setTagMode] = React.useState<GQL.BulkUpdateIdMode>(
    GQL.BulkUpdateIdMode.Add
  );
  const [tagIds, setTagIds] = useState<string[]>();
  const [existingTagIds, setExistingTagIds] = useState<string[]>();
  const [organized, setOrganized] = useState<boolean | undefined>();

  const isMounted = useIsMounted();
  const [updateGalleries] = useBulkGalleryUpdate();

  // Network state
  const [isUpdating, setIsUpdating] = useState(false);

  const aggregateState = useMemo(() => {
    const updateState: Partial<GQL.BulkGalleryUpdateInput> = {};
    const state = props.selected;
    updateState.studio_id = getAggregateStudioId(props.selected);
    const updateTagIds = getAggregateTagIds(props.selected);
    const updatePerformerIds = getAggregatePerformerIds(props.selected);
    const updateSceneIds = getAggregateSceneIds(props.selected);
    let first = true;

    state.forEach((gallery: GQL.SlimGalleryDataFragment) => {
      getAggregateStateObject(updateState, gallery, galleryFields, first);
      first = false;
    });

    return {
      state: updateState,
      tagIds: updateTagIds,
      performerIds: updatePerformerIds,
      sceneIds: updateSceneIds,
    };
  }, [props.selected]);

  // update initial state from aggregate
  useEffect(() => {
    setUpdateInput((current) => ({ ...current, ...aggregateState.state }));
  }, [aggregateState]);

  useEffect(() => {
    setDateError(getDateError(updateInput.date ?? "", intl));
  }, [updateInput.date, intl]);

  function setUpdateField(input: Partial<GQL.BulkGalleryUpdateInput>) {
    setUpdateInput((current) => ({ ...current, ...input }));
  }

  function getGalleryInput(): GQL.BulkGalleryUpdateInput {
    const galleryInput: GQL.BulkGalleryUpdateInput = {
      ...updateInput,
      tag_ids: tagIds,
      performer_ids: performerIds,
      scene_ids: sceneIds,
    };

    // we don't have unset functionality for the rating star control
    // so need to determine if we are setting a rating or not
    galleryInput.rating100 = getAggregateInputValue(
      updateInput.rating100,
      aggregateState.state.rating100
    );

    galleryInput.performer_ids = getAggregateInputIDs(
      performerMode,
      performerIds,
      aggregatePerformerIds
    );

    if (!hideTags) {
      galleryInput.tag_ids = getAggregateInputIDs(
        tagMode,
        tagIds,
        aggregateTagIds
      );
    }

    if (organized !== undefined) {
      galleryInput.organized = organized;
    }

    return galleryInput;
  }

  async function onSave() {
    setIsUpdating(true);
    try {
      await updateGalleries({ variables: { input: getGalleryInput() } });
      Toast.success(
        intl.formatMessage(
          { id: "toast.updated_entity" },
          {
            entity: intl.formatMessage({ id: "galleries" }).toLocaleLowerCase(),
          }
        )
      );
      props.onClose(true);
    } catch (e) {
      Toast.error(e);
    }
    if (isMounted.current) {
      setIsUpdating(false);
    }
  }

  function render() {
    return (
      <ModalComponent
        show
        icon={faPencilAlt}
        header={intl.formatMessage(
          { id: "dialogs.edit_entity_count_title" },
          {
            count: props?.selected?.length ?? 1,
            singularEntity: intl.formatMessage({ id: "gallery" }),
            pluralEntity: intl.formatMessage({ id: "galleries" }),
          }
        )}
        accept={{
          onClick: onSave,
          text: intl.formatMessage({ id: "actions.apply" }),
        }}
        disabled={isUpdating || !!dateError}
        cancel={{
          onClick: () => props.onClose(false),
          text: intl.formatMessage({ id: "actions.cancel" }),
          variant: "secondary",
        }}
        isRunning={isUpdating}
      >
        <Form>
          <BulkUpdateFormGroup name="rating">
            <RatingSystem
              value={updateInput.rating100}
              onSetRating={(value) =>
                setUpdateField({ rating100: value ?? undefined })
              }
              disabled={isUpdating}
            />
          </BulkUpdateFormGroup>

          <BulkUpdateFormGroup name="scene_code">
            <BulkUpdateTextInput
              value={updateInput.code}
              valueChanged={(newValue) => setUpdateField({ code: newValue })}
              unsetDisabled={unsetDisabled}
            />
          </BulkUpdateFormGroup>
          <BulkUpdateFormGroup name="date">
            <BulkUpdateDateInput
              value={updateInput.date}
              valueChanged={(newValue) => setUpdateField({ date: newValue })}
              unsetDisabled={unsetDisabled}
              error={dateError}
            />
          </BulkUpdateFormGroup>

          {!hideTags && (
            <Form.Group controlId="tags">
              <Form.Label>
                <FormattedMessage id="tags" />
              </Form.Label>
              {renderMultiSelect("tags", tagIds)}
            </Form.Group>
          )}

          <Form.Group controlId="organized">
            <IndeterminateCheckbox
              label={intl.formatMessage({ id: "organized" })}
              checked={organized ?? false}
              ref={checkboxRef}
              onChange={() => cycleOrganized()}
            />
          </Form.Group>
        </Form>
      </ModalComponent>
    );
  }

  return render();
};
