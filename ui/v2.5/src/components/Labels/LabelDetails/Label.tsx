import { Tabs, Tab } from "react-bootstrap";
import React, { useEffect, useMemo, useState } from "react";
import { useHistory, Redirect, RouteComponentProps } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import { Helmet } from "react-helmet";
import cx from "classnames";
import Mousetrap from "mousetrap";

import * as GQL from "src/core/generated-graphql";
import {
  useFindLabel,
  useLabelUpdate,
  useLabelDestroy,
  mutateMetadataAutoTag,
} from "src/core/StashService";
import { DetailsEditNavbar } from "src/components/Shared/DetailsEditNavbar";
import { ModalComponent } from "src/components/Shared/Modal";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { ErrorMessage } from "src/components/Shared/ErrorMessage";
import { useToast } from "src/hooks/Toast";
import { useConfigurationContext } from "src/hooks/Config";
import { LabelScenesPanel } from "./LabelScenesPanel";
import { LabelEditPanel } from "./LabelEditPanel";
import {
  CompressedLabelDetailsPanel,
  LabelDetailsPanel,
} from "./LabelDetailsPanel";
import { faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { RatingSystem } from "src/components/Shared/Rating/RatingSystem";
import { DetailImage } from "src/components/Shared/DetailImage";
import { useRatingKeybinds } from "src/hooks/keybinds";
import { useLoadStickyHeader } from "src/hooks/detailsPanel";
import { useScrollToTopOnMount } from "src/hooks/scrollToTop";
import { BackgroundImage } from "src/components/Shared/DetailsPage/BackgroundImage";
import {
  TabTitleCounter,
  useTabKey,
} from "src/components/Shared/DetailsPage/Tabs";
import { DetailTitle } from "src/components/Shared/DetailsPage/DetailTitle";
import { ExpandCollapseButton } from "src/components/Shared/CollapseButton";
import { FavoriteIcon } from "src/components/Shared/FavoriteIcon";
import { ExternalLinkButtons } from "src/components/Shared/ExternalLinksButton";
import { AliasList } from "src/components/Shared/DetailsPage/AliasList";
import { HeaderImage } from "src/components/Shared/DetailsPage/HeaderImage";
import { goBackOrReplace } from "src/utils/history";
import { OCounterButton } from "src/components/Shared/CountButton";

interface IProps {
  label: GQL.LabelDataFragment;
  tabKey?: TabKey;
}

interface ILabelParams {
  id: string;
  tab?: string;
}

const validTabs = ["default", "scenes"] as const;
type TabKey = (typeof validTabs)[number];

function isTabKey(tab: string): tab is TabKey {
  return validTabs.includes(tab as TabKey);
}

const LabelTabs: React.FC<{
  tabKey?: TabKey;
  label: GQL.LabelDataFragment;
  abbreviateCounter: boolean;
}> = ({ tabKey, label, abbreviateCounter }) => {
  const sceneCount = label.scene_count ?? 0;

  const populatedDefaultTab = useMemo(() => {
    return "scenes" as TabKey;
  }, []);

  const { setTabKey } = useTabKey({
    tabKey,
    validTabs,
    defaultTabKey: populatedDefaultTab,
    baseURL: `/labels/${label.id}`,
  });

  return (
    <Tabs
      id="label-tabs"
      mountOnEnter
      unmountOnExit
      activeKey={tabKey}
      onSelect={setTabKey}
    >
      <Tab
        eventKey="scenes"
        title={
          <TabTitleCounter
            messageID="scenes"
            count={sceneCount}
            abbreviateCounter={abbreviateCounter}
          />
        }
      >
        <LabelScenesPanel active={tabKey === "scenes"} label={label} />
      </Tab>
    </Tabs>
  );
};

const LabelPage: React.FC<IProps> = ({ label, tabKey }) => {
  const history = useHistory();
  const Toast = useToast();
  const intl = useIntl();

  // Configuration settings
  const { configuration } = useConfigurationContext();
  const uiConfig = configuration?.ui;
  const abbreviateCounter = uiConfig?.abbreviateCounters ?? false;
  const enableBackgroundImage = uiConfig?.enableStudioBackgroundImage ?? false;
  const showAllDetails = uiConfig?.showAllDetails ?? true;
  const compactExpandedDetails = uiConfig?.compactExpandedDetails ?? false;

  const [collapsed, setCollapsed] = useState<boolean>(!showAllDetails);
  const loadStickyHeader = useLoadStickyHeader();

  // Editing state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState<boolean>(false);

  // Editing label state
  const [image, setImage] = useState<string | null>();
  const [encodingImage, setEncodingImage] = useState<boolean>(false);

  const [updateLabel] = useLabelUpdate();
  const [deleteLabel] = useLabelDestroy({ id: label.id });

  const labelImage = useMemo(() => {
    const existingPath = label.image_path;
    if (isEditing) {
      if (image === null && existingPath) {
        const labelImageURL = new URL(existingPath);
        labelImageURL.searchParams.set("default", "true");
        return labelImageURL.toString();
      } else if (image) {
        return image;
      }
    }

    return existingPath;
  }, [isEditing, image, label.image_path]);

  function setFavorite(v: boolean) {
    if (label.id) {
      updateLabel({
        variables: {
          input: {
            id: label.id,
            favorite: v,
          },
        },
      });
    }
  }

  // set up hotkeys
  useEffect(() => {
    Mousetrap.bind("e", () => toggleEditing());
    Mousetrap.bind("d d", () => {
      setIsDeleteAlertOpen(true);
    });
    Mousetrap.bind(",", () => setCollapsed(!collapsed));
    Mousetrap.bind("f", () => setFavorite(!label.favorite));

    return () => {
      Mousetrap.unbind("e");
      Mousetrap.unbind("d d");
      Mousetrap.unbind(",");
      Mousetrap.unbind("f");
    };
  });

  useRatingKeybinds(
    true,
    configuration?.ui.ratingSystemOptions?.type,
    setRating
  );

  async function onSave(input: GQL.LabelCreateInput) {
    await updateLabel({
      variables: {
        input: {
          id: label.id,
          ...input,
        },
      },
    });
    toggleEditing(false);
    Toast.success(
      intl.formatMessage(
        { id: "toast.updated_entity" },
        { entity: intl.formatMessage({ id: "label" }).toLocaleLowerCase() }
      )
    );
  }

  async function onAutoTag() {
    if (!label.id) return;
    try {
      await mutateMetadataAutoTag({ studios: [label.id] });
      Toast.success(intl.formatMessage({ id: "toast.started_auto_tagging" }));
    } catch (e) {
      Toast.error(e);
    }
  }

  async function onDelete() {
    try {
      await deleteLabel();
    } catch (e) {
      Toast.error(e);
      return;
    }

    goBackOrReplace(history, "/labels");
  }

  function renderDeleteAlert() {
    return (
      <ModalComponent
        show={isDeleteAlertOpen}
        icon={faTrashAlt}
        accept={{
          text: intl.formatMessage({ id: "actions.delete" }),
          variant: "danger",
          onClick: onDelete,
        }}
        cancel={{ onClick: () => setIsDeleteAlertOpen(false) }}
      >
        <p>
          <FormattedMessage
            id="dialogs.delete_confirm"
            values={{
              entityName:
                label.name ??
                intl.formatMessage({ id: "label" }).toLocaleLowerCase(),
            }}
          />
        </p>
      </ModalComponent>
    );
  }

  function toggleEditing(value?: boolean) {
    if (value !== undefined) {
      setIsEditing(value);
    } else {
      setIsEditing((e) => !e);
    }
    setImage(undefined);
  }

  function setRating(v: number | null) {
    if (label.id) {
      updateLabel({
        variables: {
          input: {
            id: label.id,
            rating100: v,
          },
        },
      });
    }
  }

  const headerClassName = cx("detail-header", {
    edit: isEditing,
    collapsed,
    "full-width": !collapsed && !compactExpandedDetails,
  });

  return (
    <div id="label-page" className="row">
      <Helmet>
        <title>{label.name ?? intl.formatMessage({ id: "label" })}</title>
      </Helmet>

      <div className={headerClassName}>
        <BackgroundImage
          imagePath={label.image_path ?? undefined}
          show={enableBackgroundImage && !isEditing}
        />
        <div className="detail-container">
          <HeaderImage encodingImage={encodingImage}>
            {labelImage && (
              <DetailImage
                className="logo"
                alt={label.name}
                src={labelImage}
              />
            )}
          </HeaderImage>
          <div className="row">
            <div className="label-head col">
              <DetailTitle name={label.name ?? ""} classNamePrefix="label">
                {!isEditing && (
                  <ExpandCollapseButton
                    collapsed={collapsed}
                    setCollapsed={(v) => setCollapsed(v)}
                  />
                )}
                <span className="name-icons">
                  <FavoriteIcon
                    favorite={label.favorite}
                    onToggleFavorite={(v) => setFavorite(v)}
                  />
                  <ExternalLinkButtons urls={label.urls} />
                </span>
              </DetailTitle>

              <AliasList aliases={label.aliases} />
              <div className="quality-group">
                <RatingSystem
                  value={label.rating100}
                  onSetRating={(value) => setRating(value)}
                  clickToRate
                  withoutContext
                />
                {!!label.o_counter && (
                  <OCounterButton value={label.o_counter} />
                )}
              </div>
              {!isEditing && (
                <LabelDetailsPanel
                  label={label}
                  collapsed={collapsed}
                  fullWidth={!collapsed && !compactExpandedDetails}
                />
              )}
              {isEditing ? (
                <LabelEditPanel
                  label={label}
                  onSubmit={onSave}
                  onCancel={() => toggleEditing()}
                  onDelete={onDelete}
                  setImage={setImage}
                  setEncodingImage={setEncodingImage}
                />
              ) : (
                <DetailsEditNavbar
                  objectName={
                    label.name ?? intl.formatMessage({ id: "label" })
                  }
                  isNew={false}
                  isEditing={isEditing}
                  onToggleEdit={() => toggleEditing()}
                  onSave={() => { }}
                  onImageChange={() => { }}
                  onClearImage={() => { }}
                  onAutoTag={onAutoTag}
                  autoTagDisabled={label.ignore_auto_tag}
                  onDelete={onDelete}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {!isEditing && loadStickyHeader && (
        <CompressedLabelDetailsPanel label={label} />
      )}

      <div className="detail-body">
        <div className="label-body">
          <div className="label-tabs">
            {!isEditing && (
              <LabelTabs
                label={label}
                tabKey={tabKey}
                abbreviateCounter={abbreviateCounter}
              />
            )}
          </div>
        </div>
      </div>
      {renderDeleteAlert()}
    </div>
  );
};

const LabelLoader: React.FC<RouteComponentProps<ILabelParams>> = ({
  location,
  match,
}) => {
  const { id, tab } = match.params;
  const { data, loading, error } = useFindLabel(id);

  useScrollToTopOnMount();

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage error={error.message} />;
  if (!data?.findLabel)
    return <ErrorMessage error={`No label found with id ${id}.`} />;

  if (tab && !isTabKey(tab)) {
    return (
      <Redirect
        to={{
          ...location,
          pathname: `/labels/${id}`,
        }}
      />
    );
  }

  return (
    <LabelPage label={data.findLabel} tabKey={tab as TabKey | undefined} />
  );
};

export default LabelLoader;
