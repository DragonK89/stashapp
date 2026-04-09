import React, { useEffect, useMemo, useState } from "react";
import { Col, Form, Row } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";
import { useConfigurationContext } from "src/hooks/Config";
import { useIsMounted } from "src/hooks/state";
import { IUIConfig } from "src/core/config";
import { useBulkLabelUpdate } from "src/core/StashService";
import * as GQL from "src/core/generated-graphql";
import { ModalComponent } from "../Shared/Modal";
import { useToast } from "src/hooks/Toast";
import { MultiSet } from "../Shared/MultiSet";
import { RatingSystem } from "../Shared/Rating/RatingSystem";
import {
  getAggregateInputValue,
  getAggregateState,
  getAggregateStateObject,
} from "src/utils/bulkUpdate";
import { IndeterminateCheckbox } from "../Shared/IndeterminateCheckbox";
import { BulkUpdateTextInput } from "../Shared/BulkUpdateTextInput";
import { faPencilAlt } from "@fortawesome/free-solid-svg-icons";
import * as FormUtils from "src/utils/form";
import { StudioSelect } from "../Shared/Select";

interface IListOperationProps {
  selected: GQL.LabelDataFragment[];
  onClose: (applied: boolean) => void;
}

const labelFields = ["favorite", "rating100", "details", "ignore_auto_tag"];

export const EditLabelsDialog: React.FC<IListOperationProps> = (
  props: IListOperationProps
) => {
  const intl = useIntl();
  const Toast = useToast();

  const { configuration } = useConfigurationContext();
  const ui = configuration.ui as IUIConfig | undefined;
  const hideTags = Boolean(ui?.hideTags);
  const isMounted = useIsMounted();

  const [updateInput, setUpdateInput] = useState<GQL.BulkLabelUpdateInput>({
    ids: props.selected.map((label) => {
      return label.id;
    }),
  });

  const [tagIds, setTagIds] = useState<GQL.BulkUpdateIds>({
    mode: GQL.BulkUpdateIdMode.Add,
  });

  const [updateLabels] = useBulkLabelUpdate();

  // Network state
  const [isUpdating, setIsUpdating] = useState(false);

  const aggregateState = useMemo(() => {
    const updateState: Partial<GQL.BulkLabelUpdateInput> = {};
    const state = props.selected;
    let updateTagIds: string[] = [];
    let first = true;

    state.forEach((label: GQL.LabelDataFragment) => {
      getAggregateStateObject(updateState, label, labelFields, first);

      updateState.studio_id = getAggregateState(
        updateState.studio_id,
        label.studio?.id,
        first
      );

      const labelTagIDs = (label.tags ?? []).map((p) => p.id).sort();

      updateTagIds = getAggregateState(updateTagIds, labelTagIDs, first) ?? [];

      first = false;
    });

    return { state: updateState, tagIds: updateTagIds };
  }, [props.selected]);

  // update initial state from aggregate
  useEffect(() => {
    setUpdateInput((current) => ({ ...current, ...aggregateState.state }));
  }, [aggregateState]);

  function setUpdateField(input: Partial<GQL.BulkLabelUpdateInput>) {
    setUpdateInput((current) => ({ ...current, ...input }));
  }

  function getLabelInput(): GQL.BulkLabelUpdateInput {
    const labelInput: GQL.BulkLabelUpdateInput = {
      ...updateInput,
    };

    if (!hideTags) {
      labelInput.tag_ids = tagIds;
    }

    labelInput.rating100 = getAggregateInputValue(
      updateInput.rating100,
      aggregateState.state.rating100
    );

    return labelInput;
  }

  async function onSave() {
    setIsUpdating(true);
    try {
      await updateLabels({
        variables: {
          input: getLabelInput(),
        },
      });
      Toast.success(
        intl.formatMessage(
          { id: "toast.updated_entity" },
          {
            entity: intl.formatMessage({ id: "labels" }).toLocaleLowerCase(),
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
        dialogClassName="edit-labels-dialog"
        show
        icon={faPencilAlt}
        header={intl.formatMessage(
          { id: "actions.edit_entity" },
          { entityType: intl.formatMessage({ id: "labels" }) }
        )}
        accept={{
          onClick: onSave,
          text: intl.formatMessage({ id: "actions.apply" }),
        }}
        cancel={{
          onClick: () => props.onClose(false),
          text: intl.formatMessage({ id: "actions.cancel" }),
          variant: "secondary",
        }}
        isRunning={isUpdating}
      >
        <Form.Group controlId="studio" as={Row}>
          {FormUtils.renderLabel({
            title: intl.formatMessage({ id: "studio" }),
          })}
          <Col xs={9}>
            <StudioSelect
              onSelect={(items) =>
                setUpdateField({
                  studio_id: items.length > 0 ? items[0]?.id : undefined,
                })
              }
              ids={updateInput.studio_id ? [updateInput.studio_id] : []}
              isDisabled={isUpdating}
              menuPortalTarget={document.body}
            />
          </Col>
        </Form.Group>
        <Form.Group controlId="rating" as={Row}>
          {FormUtils.renderLabel({
            title: intl.formatMessage({ id: "rating" }),
          })}
          <Col xs={9}>
            <RatingSystem
              value={updateInput.rating100}
              onSetRating={(value) =>
                setUpdateField({ rating100: value ?? undefined })
              }
              disabled={isUpdating}
            />
          </Col>
        </Form.Group>
        <Form>
          <Form.Group controlId="favorite">
            <IndeterminateCheckbox
              setChecked={(checked) => setUpdateField({ favorite: checked })}
              checked={updateInput.favorite ?? undefined}
              label={intl.formatMessage({ id: "favourite" })}
            />
          </Form.Group>

          {!hideTags && (
            <Form.Group controlId="tags">
              <Form.Label>
                <FormattedMessage id="tags" />
              </Form.Label>
              <MultiSet
                type="tags"
                disabled={isUpdating}
                onUpdate={(itemIDs) =>
                  setTagIds((v) => ({ ...v, ids: itemIDs }))
                }
                onSetMode={(newMode) =>
                  setTagIds((v) => ({ ...v, mode: newMode }))
                }
                existingIds={aggregateState.tagIds ?? []}
                ids={tagIds.ids ?? []}
                mode={tagIds.mode}
                menuPortalTarget={document.body}
              />
            </Form.Group>
          )}

          <Form.Group controlId="details">
            <Form.Label>
              <FormattedMessage id="details" />
            </Form.Label>
            <BulkUpdateTextInput
              value={
                updateInput.details === null
                  ? ""
                  : updateInput.details ?? undefined
              }
              valueChanged={(newValue) => setUpdateField({ details: newValue })}
              unsetDisabled={props.selected.length < 2}
              as="textarea"
            />
          </Form.Group>

          <Form.Group controlId="ignore-auto-tags">
            <IndeterminateCheckbox
              label={intl.formatMessage({ id: "ignore_auto_tag" })}
              setChecked={(checked) =>
                setUpdateField({ ignore_auto_tag: checked })
              }
              checked={updateInput.ignore_auto_tag ?? undefined}
            />
          </Form.Group>
        </Form>
      </ModalComponent>
    );
  }

  return render();
};
