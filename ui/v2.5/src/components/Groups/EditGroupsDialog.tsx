import React, { useEffect, useState } from "react";
import { Form, Col, Row } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";
import { useConfigurationContext } from "src/hooks/Config";
import { useIsMounted } from "src/hooks/state";
import { IUIConfig } from "src/core/config";
import { useBulkGroupUpdate } from "src/core/StashService";
import * as GQL from "src/core/generated-graphql";
import { StudioSelect } from "../Shared/Select";
import { ModalComponent } from "../Shared/Modal";
import { MultiSet } from "../Shared/MultiSet";
import { useToast } from "src/hooks/Toast";
import { RatingSystem } from "../Shared/Rating/RatingSystem";
import {
  getAggregateInputValue,
  getAggregateStateObject,
  getAggregateTagIds,
  getAggregateStudioId,
  getAggregateIds,
} from "src/utils/bulkUpdate";
import { faPencilAlt } from "@fortawesome/free-solid-svg-icons";
import { BulkUpdateFormGroup, BulkUpdateTextInput } from "../Shared/BulkUpdate";
import { BulkUpdateDateInput } from "../Shared/DateInput";
import { IRelatedGroupEntry } from "./GroupDetails/RelatedGroupTable";
import { ContainingGroupsMultiSet } from "./ContainingGroupsMultiSet";
import { getDateError } from "src/utils/yup";

interface IListOperationProps {
  selected: GQL.ListGroupDataFragment[];
  onClose: (applied: boolean) => void;
}

export function getAggregateContainingGroups(
  state: Pick<GQL.ListGroupDataFragment, "containing_groups">[]
) {
  const sortedLists: IRelatedGroupEntry[][] = state.map((o) =>
    o.containing_groups
      .map((oo) => ({
        group: oo.group,
        description: oo.description,
      }))
      .sort((a, b) => a.group.id.localeCompare(b.group.id))
  );

  return getAggregateIds(sortedLists);
}

function getAggregateContainingGroupInput(
  mode: GQL.BulkUpdateIdMode,
  input: IRelatedGroupEntry[] | undefined,
  aggregateValues: IRelatedGroupEntry[]
): GQL.BulkUpdateGroupDescriptionsInput | undefined {
  if (mode === GQL.BulkUpdateIdMode.Set && (!input || input.length === 0)) {
    // and all scenes have the same ids,
    if (aggregateValues.length > 0) {
      // then unset, otherwise ignore
      return { mode, groups: [] };
    }
  } else {
    // if input non-empty, then we are setting them
    return {
      mode,
      groups:
        input?.map((e) => {
          return { group_id: e.group.id, description: e.description };
        }) || [],
    };
  }

  return undefined;
}

const groupFields = ["rating100", "synopsis", "director", "date"];

export const EditGroupsDialog: React.FC<IListOperationProps> = (
  props: IListOperationProps
) => {
  const intl = useIntl();
  const Toast = useToast();

  const { configuration } = useConfigurationContext();
  const ui = configuration.ui as IUIConfig | undefined;
  const hideTags = ui?.hideTags ?? false;
  const hideGroups = ui?.hideGroups ?? false;

  const [rating100, setRating] = useState<number | undefined>();
  const [studioId, setStudioId] = useState<string | undefined>();
  const [director, setDirector] = useState<string | undefined>();

  const [updateInput, setUpdateInput] = useState<GQL.BulkGroupUpdateInput>({
    ids: props.selected.map((group) => {
      return group.id;
    }),
  });

  const [tagIds, setTagIds] = useState<GQL.BulkUpdateIds>({
    mode: GQL.BulkUpdateIdMode.Add,
  });
  const [containingGroupsMode, setGroupMode] =
    React.useState<GQL.BulkUpdateIdMode>(GQL.BulkUpdateIdMode.Add);
  const [containingGroups, setGroups] = useState<IRelatedGroupEntry[]>();
  const [existingContainingGroups, setExistingContainingGroups] =
    useState<IRelatedGroupEntry[]>();
  const isMounted = useIsMounted();

  const unsetDisabled = props.selected.length < 2;

  const [updateGroups] = useBulkGroupUpdate();

  const [dateError, setDateError] = useState<string | undefined>();

  // Network state
  const [isUpdating, setIsUpdating] = useState(false);

  const aggregateState = useMemo(() => {
    const updateState: Partial<GQL.BulkGroupUpdateInput> = {};
    const state = props.selected;
    updateState.studio_id = getAggregateStudioId(props.selected);
    const updateTagIds = getAggregateTagIds(props.selected);
    const aggregateGroups = getAggregateContainingGroups(props.selected);
    let first = true;

    state.forEach((group: GQL.ListGroupDataFragment) => {
      getAggregateStateObject(updateState, group, groupFields, first);
      first = false;
    });

    return {
      state: updateState,
      tagIds: updateTagIds,
      containingGroups: aggregateGroups,
    };
  }, [props.selected]);

  // update initial state from aggregate
  useEffect(() => {
    setUpdateInput((current) => ({ ...current, ...aggregateState.state }));
  }, [aggregateState]);

  useEffect(() => {
    setDateError(getDateError(updateInput.date ?? "", intl));
  }, [updateInput.date, intl]);

  function setUpdateField(input: Partial<GQL.BulkGroupUpdateInput>) {
    setUpdateInput((current) => ({ ...current, ...input }));
  }

  function getGroupInput(): GQL.BulkGroupUpdateInput {
    const groupInput: GQL.BulkGroupUpdateInput = {
      ...updateInput,
      tag_ids: tagIds,
    };

    groupInput.rating100 = getAggregateInputValue(rating100, aggregateRating);
    groupInput.studio_id = getAggregateInputValue(studioId, aggregateStudioId);
    if (!hideTags) {
      groupInput.tag_ids = getAggregateInputIDs(tagMode, tagIds, aggregateTagIds);
    }

    if (!hideGroups) {
      groupInput.containing_groups = getAggregateContainingGroupInput(
        containingGroupsMode,
        containingGroups,
        aggregateGroups
      );
    }

    return groupInput;
  }

  async function onSave() {
    setIsUpdating(true);
    try {
      await updateGroups({ variables: { input: getGroupInput() } });
      Toast.success(
        intl.formatMessage(
          { id: "toast.updated_entity" },
          { entity: intl.formatMessage({ id: "groups" }).toLocaleLowerCase() }
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
            singularEntity: intl.formatMessage({ id: "group" }),
            pluralEntity: intl.formatMessage({ id: "groups" }),
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
          <Form.Group controlId="rating" as={Row}>
            {FormUtils.renderLabel({
              title: intl.formatMessage({ id: "rating" }),
            })}
            <Col xs={9}>
              <RatingSystem
                value={rating100}
                onSetRating={(value) => setRating(value ?? undefined)}
                disabled={isUpdating}
              />
            </Col>
          </Form.Group>
          <Form.Group controlId="studio" as={Row}>
            {FormUtils.renderLabel({
              title: intl.formatMessage({ id: "studio" }),
            })}
            <Col xs={9}>
              <StudioSelect
                onSelect={(items) =>
                  setStudioId(items.length > 0 ? items[0]?.id : undefined)
                }
                ids={studioId ? [studioId] : []}
                isDisabled={isUpdating}
                menuPortalTarget={document.body}
              />
            </Col>
          </Form.Group>
          {!hideGroups && (
            <Form.Group controlId="containing-groups">
              <Form.Label>
                <FormattedMessage id="containing_groups" />
              </Form.Label>
              <ContainingGroupsMultiSet
                disabled={isUpdating}
                onUpdate={(v) => setGroups(v)}
                onSetMode={(newMode) => setGroupMode(newMode)}
                existingValue={existingContainingGroups ?? []}
                value={containingGroups ?? []}
                mode={containingGroupsMode}
                menuPortalTarget={document.body}
              />
            </Form.Group>
          )}
          <Form.Group controlId="director">
            <Form.Label>
              <FormattedMessage id="director" />
            </Form.Label>
            <Form.Control
              className="input-control"
              type="text"
              value={director}
              onChange={(event) => setDirector(event.currentTarget.value)}
              placeholder={intl.formatMessage({ id: "director" })}
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
                onUpdate={(itemIDs) => setTagIds(itemIDs)}
                onSetMode={(newMode) => setTagMode(newMode)}
                existingIds={existingTagIds ?? []}
                ids={tagIds ?? []}
                mode={tagMode}
                menuPortalTarget={document.body}
              />
            </Form.Group>
          )}
        </Form>
      </ModalComponent>
    );
  }

  return render();
};
