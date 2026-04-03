import React, { useEffect, useState } from "react";
import { Button, Col, Form, Row } from "react-bootstrap";
import { FormattedMessage } from "react-intl";
import Mousetrap from "mousetrap";
import * as GQL from "src/core/generated-graphql";
import { MarkerWallPanel } from "src/components/Wall/WallPanel";
import { PrimaryTags } from "./PrimaryTags";
import { SceneMarkerForm } from "./SceneMarkerForm";
import { LabelIDSelect } from "src/components/Labels/LabelSelect";
import { useSceneUpdate } from "src/core/StashService";
import { useToast } from "src/hooks/Toast";

interface ISceneMarkersPanelProps {
  sceneId: string;
  isVisible: boolean;
  onClickMarker: (marker: GQL.SceneMarkerDataFragment) => void;
  studioId?: string | null;
  studioName?: string | null;
  labelId?: string | null;
}

export const SceneMarkersPanel: React.FC<ISceneMarkersPanelProps> = ({
  sceneId,
  isVisible,
  onClickMarker,
  studioId,
  studioName,
  labelId,
}) => {
  const Toast = useToast();
  const [updateScene] = useSceneUpdate();
  const [isUpdatingLabel, setIsUpdatingLabel] = useState(false);

  const { data, loading } = GQL.useFindSceneMarkerTagsQuery({
    variables: { id: sceneId },
  });
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingMarker, setEditingMarker] =
    useState<GQL.SceneMarkerDataFragment>();

  // set up hotkeys
  useEffect(() => {
    if (!isVisible) return;

    Mousetrap.bind("n", () => onOpenEditor());

    return () => {
      Mousetrap.unbind("n");
    };
  });

  if (loading) return null;

  function onOpenEditor(marker?: GQL.SceneMarkerDataFragment) {
    setIsEditorOpen(true);
    setEditingMarker(marker ?? undefined);
  }

  async function onSetLabel(newLabelID: string | null) {
    setIsUpdatingLabel(true);
    try {
      await updateScene({
        variables: {
          input: {
            id: sceneId,
            label_id: newLabelID,
          },
        },
      });
    } catch (e) {
      Toast.error(e);
    } finally {
      setIsUpdatingLabel(false);
    }
  }

  const closeEditor = () => {
    setEditingMarker(undefined);
    setIsEditorOpen(false);
  };

  if (isEditorOpen)
    return (
      <SceneMarkerForm
        sceneID={sceneId}
        marker={editingMarker}
        onClose={closeEditor}
      />
    );

  const sceneMarkers = (
    data?.sceneMarkerTags.map((tag) => tag.scene_markers) ?? []
  ).reduce((prev, current) => [...prev, ...current], []);

  return (
    <div className="scene-markers-panel">
      <Form.Group controlId="scene_label_id" as={Row}>
        <Form.Label column sm={3}>
          Label
        </Form.Label>
        <Col xs={9}>
          <LabelIDSelect
            studioId={studioId ?? undefined}
            studioName={studioName ?? undefined}
            ids={labelId ? [labelId] : []}
            onSelect={(items) =>
              onSetLabel(items.length > 0 ? items[0].id : null)
            }
            isDisabled={isUpdatingLabel || !studioId}
            menuPortalTarget={document.body}
          />
        </Col>
      </Form.Group>
      <Button onClick={() => onOpenEditor()}>
        <FormattedMessage id="actions.create_marker" />
      </Button>
      <div className="container">
        <PrimaryTags
          sceneMarkers={sceneMarkers}
          onClickMarker={onClickMarker}
          onLoopMarker={onLoopMarker}
          onEdit={onOpenEditor}
        />
      </div>
      <MarkerWallPanel
        markers={sceneMarkers}
        clickHandler={(e, marker) => {
          e.preventDefault();
          window.scrollTo(0, 0);
          onClickMarker(marker);
        }}
      />
    </div>
  );
};

export default SceneMarkersPanel;
