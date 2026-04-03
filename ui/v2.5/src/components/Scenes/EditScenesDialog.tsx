import React, { useEffect, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { useIntl } from "react-intl";
import { useBulkSceneUpdate } from "src/core/StashService";
import * as GQL from "src/core/generated-graphql";
import { StudioSelect } from "../Shared/Select";
import { ModalComponent } from "../Shared/Modal";
import { MultiSet } from "../Shared/MultiSet";
import { useToast } from "src/hooks/Toast";
import { RatingSystem } from "../Shared/Rating/RatingSystem";
import { LabelIDSelect } from "src/components/Labels/LabelSelect";
import { useConfigurationContext } from "src/hooks/Config";
import { useIsMounted } from "src/hooks/state";
import { IUIConfig } from "src/core/config";
import {
  getAggregateInputValue,
  getAggregateGroupIds,
  getAggregatePerformerIds,
  getAggregateStateObject,
  getAggregateTagIds,
  getAggregateStudioId,
} from "src/utils/bulkUpdate";
import { faPencilAlt } from "@fortawesome/free-solid-svg-icons";
import { IndeterminateCheckbox } from "../Shared/IndeterminateCheckbox";
import { BulkUpdateFormGroup, BulkUpdateTextInput } from "../Shared/BulkUpdate";
import { BulkUpdateDateInput } from "../Shared/DateInput";
import { getDateError } from "src/utils/yup";

interface IListOperationProps {
  selected: GQL.SlimSceneDataFragment[];
  onClose: (applied: boolean) => void;
}

const sceneFields = [
  "code",
  "rating100",
  "details",
  "organized",
  "director",
  "date",
];

export const EditScenesDialog: React.FC<IListOperationProps> = (
  props: IListOperationProps
) => {
  const intl = useIntl();
  const Toast = useToast();
  const [rating100, setRating] = useState<number>();
  const [studioId, setStudioId] = useState<string>();
  const [labelId, setLabelId] = useState<string>();
  const { configuration } = useConfigurationContext();
  const ui = configuration.ui as IUIConfig | undefined;
  const hideTags = ui?.hideTags ?? false;
  const hideGroups = ui?.hideGroups ?? false;
  const hideLabels = ui?.hideLabels ?? false;

  const [performerMode, setPerformerMode] =
    React.useState<GQL.BulkUpdateIdMode>(GQL.BulkUpdateIdMode.Add);
  const [performerIds, setPerformerIds] = useState<string[]>();
  const [existingPerformerIds, setExistingPerformerIds] = useState<string[]>();
  const [tagMode, setTagMode] = React.useState<GQL.BulkUpdateIdMode>(
    GQL.BulkUpdateIdMode.Add
  );
  const [tagIds, setTagIds] = useState<string[]>();
  const [existingTagIds, setExistingTagIds] = useState<string[]>();
  const [groupMode, setGroupMode] = React.useState<GQL.BulkUpdateIdMode>(
    GQL.BulkUpdateIdMode.Add
  );
  const [groupIds, setGroupIds] = useState<string[]>();
  const [existingGroupIds, setExistingGroupIds] = useState<string[]>();
  const [organized, setOrganized] = useState<boolean | undefined>();
  const isMounted = useIsMounted();

  const [updateInput, setUpdateInput] = useState<GQL.BulkSceneUpdateInput>({
    ids: props.selected.map((scene) => {
      return scene.id;
    }),
  });

  const [dateError, setDateError] = useState<string | undefined>();

  const unsetDisabled = props.selected.length < 2;

  const [updateScenes] = useBulkSceneUpdate();

  // Network state
  const [isUpdating, setIsUpdating] = useState(false);

  const aggregateState = useMemo(() => {
    const updateState: Partial<GQL.BulkSceneUpdateInput> = {};
    const state = props.selected;
    updateState.studio_id = getAggregateStudioId(props.selected);
    const updateTagIds = getAggregateTagIds(props.selected);
    const updatePerformerIds = getAggregatePerformerIds(props.selected);
    const updateGroupIds = getAggregateGroupIds(props.selected);
    let first = true;

    state.forEach((scene: GQL.SlimSceneDataFragment) => {
      getAggregateStateObject(updateState, scene, sceneFields, first);
      first = false;
    });

    return {
      state: updateState,
      tagIds: updateTagIds,
      performerIds: updatePerformerIds,
      groupIds: updateGroupIds,
    };
  }, [props.selected]);

  // update initial state from aggregate
  useEffect(() => {
    setUpdateInput((current) => ({ ...current, ...aggregateState.state }));
  }, [aggregateState]);

  useEffect(() => {
    setDateError(getDateError(updateInput.date ?? "", intl));
  }, [updateInput.date, intl]);

  function setUpdateField(input: Partial<GQL.BulkSceneUpdateInput>) {
    setUpdateInput((current) => ({ ...current, ...input }));
  }

  function getSceneInput(): GQL.BulkSceneUpdateInput {
    // need to determine what we are actually setting on each scene
    const aggregateRating = getAggregateRating(props.selected);
    const aggregateStudioId = getAggregateStudioId(props.selected);
    const aggregateLabelId = (() => {
      let ret: string | undefined = undefined;
      let first = true;
      props.selected.forEach((scene) => {
        const id = scene?.label?.id;
        if (first) {
          ret = id;
          first = false;
        } else if (ret !== id) {
          ret = undefined;
        }
      });
      return ret;
    })();
    const aggregatePerformerIds = getAggregatePerformerIds(props.selected);
    const aggregateTagIds = getAggregateTagIds(props.selected);
    const aggregateGroupIds = getAggregateGroupIds(props.selected);

    const sceneInput: GQL.BulkSceneUpdateInput = {
      ...updateInput,
      tag_ids: tagIds,
      performer_ids: performerIds,
      group_ids: groupIds,
    };

    sceneInput.rating100 = getAggregateInputValue(rating100, aggregateRating);
    sceneInput.studio_id = getAggregateInputValue(studioId, aggregateStudioId);
    if (!hideLabels) {
      sceneInput.label_id = getAggregateInputValue(labelId, aggregateLabelId);
    }

    sceneInput.performer_ids = getAggregateInputIDs(
      performerMode,
      performerIds,
      aggregatePerformerIds
    );

    if (!hideTags) {
      sceneInput.tag_ids = getAggregateInputIDs(
        tagMode,
        tagIds,
        aggregateTagIds
      );
    }

    if (!hideGroups) {
      sceneInput.group_ids = getAggregateInputIDs(
        groupMode,
        groupIds,
        aggregateGroupIds
      );
    }

    if (organized !== undefined) {
      sceneInput.organized = organized;
    }

    return sceneInput;
  }

  async function onSave() {
    setIsUpdating(true);
    try {
      await updateScenes({ variables: { input: getSceneInput() } });
      Toast.success(
        intl.formatMessage(
          { id: "toast.updated_entity" },
          { entity: intl.formatMessage({ id: "scenes" }).toLocaleLowerCase() }
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

  useEffect(() => {
    const state = props.selected;
    let updateRating: number | undefined;
    let updateStudioID: string | undefined;
    let updateLabelID: string | undefined;
    let updatePerformerIds: string[] = [];
    let updateTagIds: string[] = [];
    let updateGroupIds: string[] = [];
    let updateOrganized: boolean | undefined;
    let first = true;

    state.forEach((scene: GQL.SlimSceneDataFragment) => {
      const sceneRating = scene.rating100;
      const sceneStudioID = scene?.studio?.id;
      const sceneLabelID = scene?.label?.id;
      const scenePerformerIDs = (scene.performers ?? [])
        .map((p) => p.id)
        .sort();
      const sceneTagIDs = (scene.tags ?? []).map((p) => p.id).sort();
      const sceneGroupIDs = (scene.groups ?? []).map((m) => m.group.id).sort();

      if (first) {
        updateRating = sceneRating ?? undefined;
        updateStudioID = sceneStudioID;
        updateLabelID = sceneLabelID;
        updatePerformerIds = scenePerformerIDs;
        updateTagIds = sceneTagIDs;
        updateGroupIds = sceneGroupIDs;
        first = false;
        updateOrganized = scene.organized;
      } else {
        if (sceneRating !== updateRating) {
          updateRating = undefined;
        }
        if (sceneStudioID !== updateStudioID) {
          updateStudioID = undefined;
        }
        if (sceneLabelID !== updateLabelID) {
          updateLabelID = undefined;
        }
        if (!isEqual(scenePerformerIDs, updatePerformerIds)) {
          updatePerformerIds = [];
        }
        if (!isEqual(sceneTagIDs, updateTagIds)) {
          updateTagIds = [];
        }
        if (!isEqual(sceneGroupIDs, updateGroupIds)) {
          updateGroupIds = [];
        }
        if (scene.organized !== updateOrganized) {
          updateOrganized = undefined;
        }
      }
    });

    setRating(updateRating);
    setStudioId(updateStudioID);
    setLabelId(updateLabelID);
    setExistingPerformerIds(updatePerformerIds);
    setExistingTagIds(updateTagIds);
    setExistingGroupIds(updateGroupIds);
    setOrganized(updateOrganized);
  }, [props.selected]);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = organized === undefined;
    }
  }, [organized, checkboxRef]);

  function renderMultiSelect(
    type: "performers" | "tags" | "groups",
    ids: string[] | undefined
  ) {
    let mode = GQL.BulkUpdateIdMode.Add;
    let existingIds: string[] | undefined = [];
    switch (type) {
      case "performers":
        mode = performerMode;
        existingIds = existingPerformerIds;
        break;
      case "tags":
        mode = tagMode;
        existingIds = existingTagIds;
        break;
      case "groups":
        mode = groupMode;
        existingIds = existingGroupIds;
        break;
    }

    return (
      <MultiSet
        type={type}
        disabled={isUpdating}
        onUpdate={(itemIDs) => {
          switch (type) {
            case "performers":
              setPerformerIds(itemIDs);
              break;
            case "tags":
              setTagIds(itemIDs);
              break;
            case "groups":
              setGroupIds(itemIDs);
              break;
          }
        }}
        onSetMode={(newMode) => {
          switch (type) {
            case "performers":
              setPerformerMode(newMode);
              break;
            case "tags":
              setTagMode(newMode);
              break;
            case "groups":
              setGroupMode(newMode);
              break;
          }
        }}
        ids={ids ?? []}
        existingIds={existingIds ?? []}
        mode={mode}
        menuPortalTarget={document.body}
      />
    );
  }

  function cycleOrganized() {
    if (organized) {
      setOrganized(undefined);
    } else if (organized === undefined) {
      setOrganized(false);
    } else {
      setOrganized(true);
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
            singularEntity: intl.formatMessage({ id: "scene" }),
            pluralEntity: intl.formatMessage({ id: "scenes" }),
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
                onSelect={(items) => {
                  setStudioId(items.length > 0 ? items[0]?.id : undefined);
                  setLabelId(undefined);
                }}
                ids={studioId ? [studioId] : []}
                isDisabled={isUpdating}
                menuPortalTarget={document.body}
              />
            </Col>
          </Form.Group>
          {!hideLabels && (
            <Form.Group controlId="label" as={Row}>
              {FormUtils.renderLabel({
                title: intl.formatMessage({ id: "label" }),
              })}
              <Col xs={9}>
                <LabelIDSelect
                  studioId={studioId}
                  ids={labelId ? [labelId] : []}
                  onSelect={(items) =>
                    setLabelId(items.length > 0 ? items[0]?.id : undefined)
                  }
                  isDisabled={isUpdating || !studioId}
                  menuPortalTarget={document.body}
                />
              </Col>
            </Form.Group>
          )}

          <BulkUpdateFormGroup name="scene_code">
            <BulkUpdateTextInput
              value={updateInput.code}
              valueChanged={(newValue) => setUpdateField({ code: newValue })}
              unsetDisabled={unsetDisabled}
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

          {!hideGroups && (
            <Form.Group controlId="groups">
              <Form.Label>
                <FormattedMessage id="groups" />
              </Form.Label>
              {renderMultiSelect("groups", groupIds)}
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
