import { Tabs, Tab, Form, Button, OverlayTrigger, Popover } from "react-bootstrap";
import React, { useEffect, useMemo, useState } from "react";
import { useHistory, Redirect, RouteComponentProps } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import { Helmet } from "react-helmet";
import cx from "classnames";
import Mousetrap from "mousetrap";

import * as GQL from "src/core/generated-graphql";
import {
  useFindStudio,
  useStudioUpdate,
  useStudioDestroy,
  useLabelCreate,
  mutateMetadataAutoTag,
  queryFindStudiosForSelect,
} from "src/core/StashService";
import { DetailsEditNavbar } from "src/components/Shared/DetailsEditNavbar";
import { ModalComponent } from "src/components/Shared/Modal";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { ErrorMessage } from "src/components/Shared/ErrorMessage";
import { useToast } from "src/hooks/Toast";
import { useConfigurationContext } from "src/hooks/Config";
import { faSyncAlt, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { StudioScenesPanel } from "./StudioScenesPanel";
import { StudioGalleriesPanel } from "./StudioGalleriesPanel";
import { StudioImagesPanel } from "./StudioImagesPanel";
import { StudioChildrenPanel } from "./StudioChildrenPanel";
import { StudioPerformersPanel } from "./StudioPerformersPanel";
import { StudioEditPanel } from "./StudioEditPanel";
import { StudioLabelsPanel } from "./StudioLabelsPanel";
import {
  CompressedStudioDetailsPanel,
  StudioDetailsPanel,
} from "./StudioDetailsPanel";
import { StudioGroupsPanel } from "./StudioGroupsPanel";
import { RatingSystem } from "src/components/Shared/Rating/RatingSystem";
import { DetailImage } from "src/components/Shared/DetailImage";
import { useRatingKeybinds } from "src/hooks/keybinds";
import { useLoadStickyHeader } from "src/hooks/detailsPanel";
import { useScrollToTopOnMount } from "src/hooks/scrollToTop";
import { BackgroundImage } from "src/components/Shared/DetailsPage/BackgroundImage";
import { Icon } from "src/components/Shared/Icon";
import { ClearableInput } from "src/components/Shared/ClearableInput";
import { ListFilterModel } from "src/models/list-filter/filter";
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
  studio: GQL.StudioDataFragment;
  tabKey?: TabKey;
}

interface IStudioParams {
  id: string;
  tab?: string;
}

const validTabs = [
  "default",
  "scenes",
  "labels",
  "groups",
  "galleries",
  "images",
  "performers",
  "childstudios",
] as const;
type TabKey = (typeof validTabs)[number];

function isTabKey(tab: string): tab is TabKey {
  return validTabs.includes(tab as TabKey);
}

const StudioTabs: React.FC<{
  tabKey?: TabKey;
  studio: GQL.StudioDataFragment;
  abbreviateCounter: boolean;
  showAllCounts?: boolean;
}> = ({ tabKey, studio, abbreviateCounter, showAllCounts = false }) => {
  const [showAllDetails, setShowAllDetails] = useState<boolean>(
    showAllCounts && studio.child_studios.length > 0
  );

  const sceneCount =
    (showAllDetails ? studio.scene_count_all : studio.scene_count) ?? 0;
  const galleryCount =
    (showAllDetails ? studio.gallery_count_all : studio.gallery_count) ?? 0;
  const imageCount =
    (showAllDetails ? studio.image_count_all : studio.image_count) ?? 0;
  const performerCount =
    (showAllDetails ? studio.performer_count_all : studio.performer_count) ?? 0;
  const groupCount =
    (showAllDetails ? studio.group_count_all : studio.group_count) ?? 0;
  const labelCount =
    (showAllDetails ? studio.label_count_all : studio.label_count) ?? 0;

  const populatedDefaultTab = useMemo(() => {
    let ret: TabKey = "scenes";
    if (sceneCount == 0) {
      if (labelCount != 0) {
        ret = "labels";
      } else if (groupCount != 0) {
        ret = "groups";
      } else if (galleryCount != 0) {
        ret = "galleries";
      } else if (imageCount != 0) {
        ret = "images";
      } else if (performerCount != 0) {
        ret = "performers";
      } else if (studio.child_studios.length != 0) {
        ret = "childstudios";
      }
    }

    return ret;
  }, [
    sceneCount,
    labelCount,
    groupCount,
    galleryCount,
    imageCount,
    performerCount,
    studio,
  ]);

  const { setTabKey } = useTabKey({
    tabKey,
    validTabs,
    defaultTabKey: populatedDefaultTab,
    baseURL: `/studios/${studio.id}`,
  });

  const contentSwitch = useMemo(() => {
    if (!studio.child_studios.length) {
      return null;
    }

    return (
      <div className="item-list-header">
        <Form.Check
          id="showSubContent"
          checked={showAllDetails}
          onChange={() => setShowAllDetails(!showAllDetails)}
          type="switch"
          label={<FormattedMessage id="include_sub_studio_content" />}
        />
      </div>
    );
  }, [showAllDetails, studio.child_studios.length]);

  return (
    <Tabs
      id="studio-tabs"
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
        {contentSwitch}
        <StudioScenesPanel
          active={tabKey === "scenes"}
          studio={studio}
          showChildStudioContent={showAllDetails}
        />
      </Tab>
      <Tab
        eventKey="labels"
        title={
          <TabTitleCounter
            messageID="labels"
            count={labelCount}
            abbreviateCounter={abbreviateCounter}
          />
        }
      >
        {contentSwitch}
        <StudioLabelsPanel
          active={tabKey === "labels"}
          studio={studio}
          showChildStudioContent={showAllDetails}
        />
      </Tab>
      <Tab
        eventKey="groups"
        title={
          <TabTitleCounter
            messageID="groups"
            count={groupCount}
            abbreviateCounter={abbreviateCounter}
          />
        }
      >
        {contentSwitch}
        <StudioGroupsPanel
          active={tabKey === "groups"}
          studio={studio}
          showChildStudioContent={showAllDetails}
        />
      </Tab>
      <Tab
        eventKey="galleries"
        title={
          <TabTitleCounter
            messageID="galleries"
            count={galleryCount}
            abbreviateCounter={abbreviateCounter}
          />
        }
      >
        {contentSwitch}
        <StudioGalleriesPanel
          active={tabKey === "galleries"}
          studio={studio}
          showChildStudioContent={showAllDetails}
        />
      </Tab>
      <Tab
        eventKey="images"
        title={
          <TabTitleCounter
            messageID="images"
            count={imageCount}
            abbreviateCounter={abbreviateCounter}
          />
        }
      >
        {contentSwitch}
        <StudioImagesPanel
          active={tabKey === "images"}
          studio={studio}
          showChildStudioContent={showAllDetails}
        />
      </Tab>
      <Tab
        eventKey="performers"
        title={
          <TabTitleCounter
            messageID="performers"
            count={performerCount}
            abbreviateCounter={abbreviateCounter}
          />
        }
      >
        {contentSwitch}
        <StudioPerformersPanel
          active={tabKey === "performers"}
          studio={studio}
          showChildStudioContent={showAllDetails}
        />
      </Tab>
      <Tab
        eventKey="childstudios"
        title={
          <TabTitleCounter
            messageID="subsidiary_studios"
            count={studio.child_studios.length}
            abbreviateCounter={abbreviateCounter}
          />
        }
      >
        <StudioChildrenPanel
          active={tabKey === "childstudios"}
          studio={studio}
        />
      </Tab>
    </Tabs>
  );
};

const ConvertToLabelDropdown: React.FC<{
  currentStudioId: string;
  onSelectStudio: (studio: { id: string; name?: string } | null) => void;
}> = ({ currentStudioId, onSelectStudio }) => {
  const intl = useIntl();
  const [filter, setFilter] = useState("");
  const [studios, setStudios] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadStudios = async () => {
      const filterModel = new ListFilterModel(GQL.FilterMode.Studios);
      filterModel.searchTerm = filter;
      filterModel.currentPage = 1;
      filterModel.itemsPerPage = 40;
      filterModel.sortBy = "name";
      filterModel.sortDirection = GQL.SortDirectionEnum.Asc;
      const query = await queryFindStudiosForSelect(filterModel);
      if (!cancelled && query.data?.findStudios?.studios) {
        setStudios(query.data.findStudios.studios);
      }
    };

    loadStudios();

    return () => {
      cancelled = true;
    };
  }, [filter]);

  const popover = (
    <Popover id="convert-to-label-popover" className="scraper-menu" style={{ minWidth: "16rem", maxWidth: "24rem" }}>
      <Popover.Content className="p-0">
        <div className="dropdown-menu show position-relative border-0 w-100 mt-0" style={{ maxHeight: "300px", overflowY: "auto" }}>
          <div className="scraper-filter-container">
            <div className="btn-group">
              <ClearableInput
                placeholder={`${intl.formatMessage({ id: "filter" })}...`}
                value={filter}
                setValue={setFilter}
              />
              <Button className="reload-button" onClick={() => setFilter("")}>
                <Icon icon={faSyncAlt} />
              </Button>
            </div>
          </div>
          {studios.filter(s => s.id !== currentStudioId).map((s) => (
            <div key={s.id} className="dropdown-item" onClick={() => { document.body.click(); onSelectStudio(s); }}>
              {s.name}
            </div>
          ))}
        </div>
      </Popover.Content>
    </Popover>
  );

  return (
    <OverlayTrigger trigger="click" placement="bottom-start" rootClose overlay={popover}>
      <Button variant="primary" className="mr-2">
        <FormattedMessage id="actions.convert_to_label" defaultMessage="Convert To Label" />
      </Button>
    </OverlayTrigger>
  );
};

const StudioPage: React.FC<IProps> = ({ studio, tabKey }) => {
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

  // Editing studio state
  const [image, setImage] = useState<string | null>();
  const [encodingImage, setEncodingImage] = useState<boolean>(false);

  const [updateStudio] = useStudioUpdate();
  const [deleteStudio] = useStudioDestroy({ id: studio.id });
  const [createLabel] = useLabelCreate();

  const showAllCounts = uiConfig?.showChildStudioContent;

  const [isConvertLoading, setIsConvertLoading] = useState<boolean>(false);

  const onConvertToLabel = async (targetStudio: { id: string } | null) => {
    setIsConvertLoading(true);
    try {
      const result = await createLabel({
        variables: {
          input: {
            name: studio.name ?? "",
            studio_id: targetStudio ? targetStudio.id : "",
            aliases: studio.aliases,
            details: studio.details,
            image: studio.image_path ?? undefined,
            rating100: studio.rating100,
            urls: studio.urls,
            tag_ids: (studio.tags ?? []).map((t) => t.id),
            ignore_auto_tag: studio.ignore_auto_tag,
            stash_ids: (studio.stash_ids ?? []).map((s) => ({
              endpoint: s.endpoint,
              stash_id: s.stash_id,
            })),
          },
        },
      });

      if (result.data?.labelCreate?.id) {
        await deleteStudio();
        Toast.success(intl.formatMessage({ id: "toast.created_entity" }, { entity: intl.formatMessage({ id: "label" }).toLocaleLowerCase() }));
        history.replace(`/labels/${result.data.labelCreate.id}`);
        return;
      }
    } catch (e) {
      Toast.error(e);
    }
    setIsConvertLoading(false);
  };

  const studioImage = useMemo(() => {
    const existingPath = studio.image_path;
    if (isEditing) {
      if (image === null && existingPath) {
        const studioImageURL = new URL(existingPath);
        studioImageURL.searchParams.set("default", "true");
        return studioImageURL.toString();
      } else if (image) {
        return image;
      }
    }

    return existingPath;
  }, [isEditing, image, studio.image_path]);

  function setFavorite(v: boolean) {
    if (studio.id) {
      updateStudio({
        variables: {
          input: {
            id: studio.id,
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
    Mousetrap.bind("f", () => setFavorite(!studio.favorite));

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

  async function onSave(input: GQL.StudioCreateInput) {
    await updateStudio({
      variables: {
        input: {
          id: studio.id,
          ...input,
        },
      },
    });
    toggleEditing(false);
    Toast.success(
      intl.formatMessage(
        { id: "toast.updated_entity" },
        { entity: intl.formatMessage({ id: "studio" }).toLocaleLowerCase() }
      )
    );
  }

  async function onAutoTag() {
    if (!studio.id) return;
    try {
      await mutateMetadataAutoTag({ studios: [studio.id] });
      Toast.success(intl.formatMessage({ id: "toast.started_auto_tagging" }));
    } catch (e) {
      Toast.error(e);
    }
  }

  async function onDelete() {
    try {
      await deleteStudio();
    } catch (e) {
      Toast.error(e);
      return;
    }

    goBackOrReplace(history, "/studios");
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
                studio.name ??
                intl.formatMessage({ id: "studio" }).toLocaleLowerCase(),
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
    if (studio.id) {
      updateStudio({
        variables: {
          input: {
            id: studio.id,
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
    <div id="studio-page" className="row">
      <Helmet>
        <title>{studio.name ?? intl.formatMessage({ id: "studio" })}</title>
      </Helmet>

      <div className={headerClassName}>
        <BackgroundImage
          imagePath={studio.image_path ?? undefined}
          show={enableBackgroundImage && !isEditing}
        />
        <div className="detail-container">
          <HeaderImage encodingImage={encodingImage}>
            {studioImage && (
              <DetailImage
                className="logo"
                alt={studio.name}
                src={studioImage}
              />
            )}
          </HeaderImage>
          <div className="row">
            <div className="studio-head col">
              <DetailTitle name={studio.name ?? ""} classNamePrefix="studio">
                {!isEditing && (
                  <ExpandCollapseButton
                    collapsed={collapsed}
                    setCollapsed={(v) => setCollapsed(v)}
                  />
                )}
                <span className="name-icons">
                  <FavoriteIcon
                    favorite={studio.favorite}
                    onToggleFavorite={(v) => setFavorite(v)}
                  />
                  <ExternalLinkButtons urls={studio.urls} />
                </span>
              </DetailTitle>

              <AliasList aliases={studio.aliases} />
              <div className="quality-group">
                <RatingSystem
                  value={studio.rating100}
                  onSetRating={(value) => setRating(value)}
                  clickToRate
                  withoutContext
                />
                {!!studio.o_counter && (
                  <OCounterButton value={studio.o_counter} />
                )}
              </div>
              {!isEditing && (
                <StudioDetailsPanel
                  studio={studio}
                  collapsed={collapsed}
                  fullWidth={!collapsed && !compactExpandedDetails}
                />
              )}
              {isEditing ? (
                <StudioEditPanel
                  studio={studio}
                  onSubmit={onSave}
                  onCancel={() => toggleEditing()}
                  onDelete={onDelete}
                  setImage={setImage}
                  setEncodingImage={setEncodingImage}
                />
              ) : (
                <DetailsEditNavbar
                  objectName={
                    studio.name ?? intl.formatMessage({ id: "studio" })
                  }
                  isNew={false}
                  isEditing={isEditing}
                  onToggleEdit={() => toggleEditing()}
                  onSave={() => { }}
                  onImageChange={() => { }}
                  onClearImage={() => { }}
                  onAutoTag={onAutoTag}
                  autoTagDisabled={studio.ignore_auto_tag}
                  onDelete={onDelete}
                  customButtons={
                    (studio.label_count ?? 0) === 0 ? (
                      isConvertLoading ? (
                        <span className="ml-2 mt-2">
                          <LoadingIndicator inline />
                        </span>
                      ) : (
                        <ConvertToLabelDropdown currentStudioId={studio.id} onSelectStudio={onConvertToLabel} />
                      )
                    ) : undefined
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {!isEditing && loadStickyHeader && (
        <CompressedStudioDetailsPanel studio={studio} />
      )}

      <div className="detail-body">
        <div className="studio-body">
          <div className="studio-tabs">
            {!isEditing && (
              <StudioTabs
                studio={studio}
                tabKey={tabKey}
                abbreviateCounter={abbreviateCounter}
                showAllCounts={showAllCounts}
              />
            )}
          </div>
        </div>
      </div>
      {renderDeleteAlert()}
    </div>
  );
};

const StudioLoader: React.FC<RouteComponentProps<IStudioParams>> = ({
  location,
  match,
}) => {
  const { id, tab } = match.params;
  const { data, loading, error } = useFindStudio(id);

  useScrollToTopOnMount();

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage error={error.message} />;
  if (!data?.findStudio)
    return <ErrorMessage error={`No studio found with id ${id}.`} />;

  if (tab && !isTabKey(tab)) {
    return (
      <Redirect
        to={{
          ...location,
          pathname: `/studios/${id}`,
        }}
      />
    );
  }

  return (
    <StudioPage studio={data.findStudio} tabKey={tab as TabKey | undefined} />
  );
};

export default StudioLoader;
