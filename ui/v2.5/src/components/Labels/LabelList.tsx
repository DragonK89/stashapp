import React, { useState } from "react";
import { useIntl } from "react-intl";
import cloneDeep from "lodash-es/cloneDeep";
import { useHistory } from "react-router-dom";
import Mousetrap from "mousetrap";
import * as GQL from "src/core/generated-graphql";
import {
  queryFindLabels,
  useFindLabels,
  useLabelsDestroy,
} from "src/core/StashService";
import { ItemList, ItemListContext, showWhenSelected } from "../List/ItemList";
import { ListFilterModel } from "src/models/list-filter/filter";
import {
  IHierarchicalLabeledIdCriterion,
  ILabeledIdCriterion,
} from "src/models/list-filter/criteria/criterion";
import { DisplayMode } from "src/models/list-filter/types";
import { ExportDialog } from "../Shared/ExportDialog";
import { DeleteEntityDialog } from "../Shared/DeleteEntityDialog";
import { LabelCardGrid } from "./LabelCardGrid";
import { View } from "../List/views";
import { EditLabelsDialog } from "./EditLabelsDialog";
import { IItemListOperation } from "../List/FilteredListToolbar";
import { PatchComponent } from "src/patch";
import { LabelTagger } from "../Tagger/labels/LabelTagger";

function getItems(result: GQL.FindLabelsQueryResult) {
  return result?.data?.findLabels?.labels ?? [];
}

function getCount(result: GQL.FindLabelsQueryResult) {
  return result?.data?.findLabels?.count ?? 0;
}

interface ILabelList {
  filterHook?: (filter: ListFilterModel) => ListFilterModel;
  view?: View;
  alterQuery?: boolean;
  extraOperations?: IItemListOperation<GQL.FindLabelsQueryResult>[];
  extraCriteria?: Record<
    string,
    IHierarchicalLabeledIdCriterion[] | ILabeledIdCriterion[]
  >;
}

export const LabelList: React.FC<ILabelList> = PatchComponent(
  "LabelList",
  ({ filterHook, view, alterQuery, extraOperations = [], extraCriteria }) => {
    const intl = useIntl();
    const history = useHistory();
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [isExportAll, setIsExportAll] = useState(false);

    const filterMode = GQL.FilterMode.Labels;

    const otherOperations = [
      ...extraOperations,
      {
        text: intl.formatMessage({ id: "actions.view_random" }),
        onClick: viewRandom,
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
          _result: GQL.FindLabelsQueryResult,
          filter: ListFilterModel
        ) => {
          filter.displayMode = DisplayMode.Tagger;
        },
      },
    ];

    function addKeybinds(
      result: GQL.FindLabelsQueryResult,
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
      result: GQL.FindLabelsQueryResult,
      filter: ListFilterModel
    ) {
      if (result.data?.findLabels) {
        const { count } = result.data.findLabels;

        const index = Math.floor(Math.random() * count);
        const filterCopy = cloneDeep(filter);
        filterCopy.itemsPerPage = 1;
        filterCopy.currentPage = index + 1;
        const singleResult = await queryFindLabels(filterCopy);
        if (singleResult.data.findLabels.labels.length === 1) {
          const { id } = singleResult.data.findLabels.labels[0];
          history.push(`/labels/${id}`);
        }
      }
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
      result: GQL.FindLabelsQueryResult,
      filter: ListFilterModel,
      selectedIds: Set<string>,
      onSelectChange: (id: string, selected: boolean, shiftKey: boolean) => void
    ) {
      function maybeRenderExportDialog() {
        if (isExportDialogOpen) {
          return (
            <ExportDialog
              exportInput={{
                labels: {
                  ids: Array.from(selectedIds.values()),
                  all: isExportAll,
                },
              }}
              onClose={() => setIsExportDialogOpen(false)}
            />
          );
        }
      }

      function renderLabels() {
        if (!result.data?.findLabels) return;

        if (filter.displayMode === DisplayMode.Grid) {
          return (
            <LabelCardGrid
              labels={result.data.findLabels.labels}
              zoomIndex={filter.zoomIndex}
              selectedIds={selectedIds}
              onSelectChange={onSelectChange}
            />
          );
        }
        if (filter.displayMode === DisplayMode.Tagger) {
          return <LabelTagger labels={result.data.findLabels.labels} />;
        }
      }

      return (
        <>
          {maybeRenderExportDialog()}
          {renderLabels()}
        </>
      );
    }

    function renderEditDialog(
      selectedLabels: GQL.LabelDataFragment[],
      onClose: (applied: boolean) => void
    ) {
      return <EditLabelsDialog selected={selectedLabels} onClose={onClose} />;
    }

    function renderDeleteDialog(
      selectedLabels: GQL.LabelDataFragment[],
      onClose: (confirmed: boolean) => void
    ) {
      return (
        <DeleteEntityDialog
          selected={selectedLabels}
          onClose={onClose}
          singularEntity={intl.formatMessage({ id: "label" })}
          pluralEntity={intl.formatMessage({ id: "labels" })}
          destroyMutation={useLabelsDestroy}
        />
      );
    }

    return (
      <ItemListContext
        filterMode={filterMode}
        useResult={useFindLabels}
        getItems={getItems}
        getCount={getCount}
        alterQuery={alterQuery}
        filterHook={filterHook}
        extraCriteria={extraCriteria}
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
