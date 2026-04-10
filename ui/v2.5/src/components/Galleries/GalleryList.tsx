import React, { useCallback, useState } from "react";
import { useIntl } from "react-intl";
import cloneDeep from "lodash-es/cloneDeep";
import { useHistory } from "react-router-dom";
import Mousetrap from "mousetrap";
import * as GQL from "src/core/generated-graphql";
import { ItemList, ItemListContext, showWhenSelected } from "../List/ItemList";
import { ListFilterModel } from "src/models/list-filter/filter";
import { DisplayMode } from "src/models/list-filter/types";
import {
  mutateAddGalleryImagesByURL,
  mutateImageUpdate,
  mutateSetGalleryCover,
  queryFindGalleries,
  useFindGalleries,
} from "src/core/StashService";
import { useToast } from "src/hooks/Toast";
import GalleryWallCard from "./GalleryWallCard";
import { EditGalleriesDialog } from "./EditGalleriesDialog";
import { DeleteGalleriesDialog } from "./DeleteGalleriesDialog";
import { ExportDialog } from "../Shared/ExportDialog";
import { GalleryListTable } from "./GalleryListTable";
import { GalleryCardGrid } from "./GalleryGridCard";
import { View } from "../List/views";
import { PatchComponent } from "src/patch";
import { IItemListOperation } from "../List/FilteredListToolbar";
import { Tagger } from "../Tagger/galleries/GalleryTagger";
import { TaggerContext } from "../Tagger/galleryContext";

function getItems(result: GQL.FindGalleriesQueryResult) {
  return result?.data?.findGalleries?.galleries ?? [];
}

function getCount(result: GQL.FindGalleriesQueryResult) {
  return result?.data?.findGalleries?.count ?? 0;
}

interface IGalleryList {
  filterHook?: (filter: ListFilterModel) => ListFilterModel;
  galleryFilterHook?: (
    galleryFilter: GQL.GalleryFilterType
  ) => GQL.GalleryFilterType;
  view?: View;
  alterQuery?: boolean;
  extraOperations?: IItemListOperation<GQL.FindGalleriesQueryResult>[];
}

export const GalleryList: React.FC<IGalleryList> = PatchComponent(
  "GalleryList",
  ({
    filterHook,
    galleryFilterHook,
    view,
    alterQuery,
    extraOperations = [],
  }) => {
    const intl = useIntl();
    const history = useHistory();
    const Toast = useToast();
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [isExportAll, setIsExportAll] = useState(false);

    const filterMode = GQL.FilterMode.Galleries;
    const queryGalleries = useCallback(
      (filter: ListFilterModel) =>
        queryFindGalleries(filter, galleryFilterHook),
      [galleryFilterHook]
    );

    function useFindGalleriesForList(filter?: ListFilterModel) {
      return useFindGalleries(filter, galleryFilterHook);
    }

    const otherOperations = [
      ...extraOperations,
      {
        text: intl.formatMessage({ id: "actions.view_random" }),
        onClick: viewRandom,
      },
      {
        text: intl.formatMessage({ id: "actions.set_cover_from_first_scene" }),
        onClick: onSetCoverFromScene,
        isDisplayed: showWhenSelected,
      },
      {
        text: intl.formatMessage({ id: "actions.export" }),
        onClick: onExport,
        isDisplayed: showWhenSelected,
      },
      {
        text: intl.formatMessage({ id: "actions.export_all" }),
        onClick: onExportAll,
      },
      {
        text: intl.formatMessage({ id: "actions.tagger" }),
        onClick: async (
          _result: GQL.FindGalleriesQueryResult,
          filter: ListFilterModel
        ) => {
          filter.displayMode = DisplayMode.Tagger;
        },
      },
    ];

    function addKeybinds(
      result: GQL.FindGalleriesQueryResult,
      filter: ListFilterModel
    ) {
      Mousetrap.bind("p r", () => {
        viewRandom(result, filter);
      });

      return () => {
        Mousetrap.unbind("p r");
      };
    }

    async function viewRandom(
      result: GQL.FindGalleriesQueryResult,
      filter: ListFilterModel
    ) {
      // query for a random image
      if (result.data?.findGalleries) {
        const { count } = result.data.findGalleries;

        const index = Math.floor(Math.random() * count);
        const filterCopy = cloneDeep(filter);
        filterCopy.itemsPerPage = 1;
        filterCopy.currentPage = index + 1;
        const singleResult = await queryGalleries(filterCopy);
        if (singleResult.data.findGalleries.galleries.length === 1) {
          const { id } = singleResult.data.findGalleries.galleries[0];
          // navigate to the image player page
          history.push(`/galleries/${id}`);
        }
      }
    }

    async function onSetCoverFromScene(
      result: GQL.FindGalleriesQueryResult,
      _filter: ListFilterModel,
      selectedIds: Set<string>
    ) {
      const galleries = result.data?.findGalleries?.galleries ?? [];
      const selectedGalleries = galleries.filter((g) => selectedIds.has(g.id));

      for (const gallery of selectedGalleries) {
        const screenshotPath = gallery.scenes[0]?.paths?.screenshot;
        if (!screenshotPath) {
          continue;
        }

        const firstSceneScreenshot = screenshotPath.startsWith("/")
          ? new URL(screenshotPath, window.location.origin).toString()
          : screenshotPath;

        try {
          const addResult = await mutateAddGalleryImagesByURL({
            gallery_id: gallery.id!,
            urls: [firstSceneScreenshot],
          });

          const linkedIDs =
            addResult.data?.addGalleryImagesByURL?.linked_ids ?? [];
          if (linkedIDs.length === 0) {
            continue;
          }

          await mutateSetGalleryCover({
            gallery_id: gallery.id!,
            cover_image_id: linkedIDs[0],
          });

          const extractImageExt = (rawPath: string) => {
            try {
              const parsed = new URL(rawPath, window.location.origin);
              const fileName = parsed.pathname.split("/").pop() ?? "";
              const dotIndex = fileName.lastIndexOf(".");
              if (dotIndex > 0 && dotIndex < fileName.length - 1) {
                return fileName.slice(dotIndex + 1).toLowerCase();
              }
            } catch {
              // Fall through to default.
            }
            return "jpg";
          };

          const titleBase = (
            (gallery.code ?? "").trim() ||
            (gallery.title ?? "").trim() ||
            "gallery"
          )
            .replace(/\s+/g, "_")
            .replace(/[\\/:*?"<>|]/g, "_");
          const coverExt = extractImageExt(firstSceneScreenshot);
          const coverTitle = `${titleBase}_cover.${coverExt}`;

          await mutateImageUpdate({
            id: linkedIDs[0],
            title: coverTitle,
          });
        } catch (e) {
          console.error(e);
        }
      }

      Toast.success(
        intl.formatMessage(
          { id: "toast.updated_entity" },
          {
            entity: intl.formatMessage({ id: "galleries" }).toLocaleLowerCase(),
          }
        )
      );
    }

    async function onExport() {
      setIsExportAll(false);
      setIsExportDialogOpen(true);
    }

    async function onExportAll() {
      setIsExportAll(true);
      setIsExportDialogOpen(true);
    }

    function renderContent(
      result: GQL.FindGalleriesQueryResult,
      filter: ListFilterModel,
      selectedIds: Set<string>,
      onSelectChange: (id: string, selected: boolean, shiftKey: boolean) => void
    ) {
      function maybeRenderGalleryExportDialog() {
        if (isExportDialogOpen) {
          return (
            <ExportDialog
              exportInput={{
                galleries: {
                  ids: Array.from(selectedIds.values()),
                  all: isExportAll,
                },
              }}
              onClose={() => setIsExportDialogOpen(false)}
            />
          );
        }
      }

      function renderGalleries() {
        if (!result.data?.findGalleries) return;

        if (filter.displayMode === DisplayMode.Grid) {
          return (
            <GalleryCardGrid
              galleries={result.data.findGalleries.galleries}
              selectedIds={selectedIds}
              zoomIndex={filter.zoomIndex}
              onSelectChange={onSelectChange}
            />
          );
        }
        if (filter.displayMode === DisplayMode.List) {
          return (
            <GalleryListTable
              galleries={result.data.findGalleries.galleries}
              selectedIds={selectedIds}
              onSelectChange={onSelectChange}
            />
          );
        }
        if (filter.displayMode === DisplayMode.Wall) {
          return (
            <div className="row">
              <div className={`GalleryWall zoom-${filter.zoomIndex}`}>
                {result.data.findGalleries.galleries.map((gallery) => (
                  <GalleryWallCard key={gallery.id} gallery={gallery} />
                ))}
              </div>
            </div>
          );
        }
        if (filter.displayMode === DisplayMode.Tagger) {
          return (
            <TaggerContext>
              <Tagger galleries={result.data.findGalleries.galleries} />
            </TaggerContext>
          );
        }
      }

      return (
        <>
          {maybeRenderGalleryExportDialog()}
          {renderGalleries()}
        </>
      );
    }

    function renderEditDialog(
      selectedImages: GQL.SlimGalleryDataFragment[],
      onClose: (applied: boolean) => void
    ) {
      return (
        <EditGalleriesDialog selected={selectedImages} onClose={onClose} />
      );
    }

    function renderDeleteDialog(
      selectedImages: GQL.SlimGalleryDataFragment[],
      onClose: (confirmed: boolean) => void
    ) {
      return (
        <DeleteGalleriesDialog selected={selectedImages} onClose={onClose} />
      );
    }

    return (
      <ItemListContext
        filterMode={filterMode}
        useResult={useFindGalleriesForList}
        getItems={getItems}
        getCount={getCount}
        alterQuery={alterQuery}
        filterHook={filterHook}
        view={view}
        selectable
      >
        <ItemList
          view={view}
          otherOperations={otherOperations}
          addKeybinds={addKeybinds}
          renderContent={renderContent}
          renderEditDialog={renderEditDialog}
          renderDeleteDialog={renderDeleteDialog}
        />
      </ItemListContext>
    );
  }
);
