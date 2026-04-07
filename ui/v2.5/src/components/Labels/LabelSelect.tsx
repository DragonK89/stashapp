import React, { useEffect, useMemo, useState } from "react";
import {
  OptionProps,
  components as reactSelectComponents,
  SingleValueProps,
} from "react-select";
import cx from "classnames";

import * as GQL from "src/core/generated-graphql";
import {
  queryFindLabelsByIDForSelect,
  queryFindLabelsForSelect,
} from "src/core/StashService";
import { useConfigurationContext } from "src/hooks/Config";
import { useIntl } from "react-intl";
import { defaultMaxOptionsShown, IUIConfig } from "src/core/config";
import { ListFilterModel } from "src/models/list-filter/filter";
import {
  FilterSelectComponent,
  IFilterIDProps,
  IFilterProps,
  IFilterValueProps,
  Option as SelectOption,
} from "../Shared/FilterSelect";
import { useCompare, useIsMounted } from "src/hooks/state";
import { StudiosCriterion } from "src/models/list-filter/criteria/studios";

export type Label = Pick<
  GQL.Label,
  "id" | "name" | "aliases" | "image_path" | "studio"
>;

type Option = SelectOption<Label>;

type FindLabelsResult = Awaited<
  ReturnType<typeof queryFindLabelsForSelect>
>["data"]["findLabels"]["labels"];

const sortLabelsByRelevance = (
  input: string,
  labels: FindLabelsResult
) => {
  const needle = input.toLowerCase();
  return [...labels].sort((a, b) => {
    const aName = (a.name ?? "").toLowerCase();
    const bName = (b.name ?? "").toLowerCase();
    const aScore = aName.startsWith(needle) ? 2 : aName.includes(needle) ? 1 : 0;
    const bScore = bName.startsWith(needle) ? 2 : bName.includes(needle) ? 1 : 0;
    if (aScore !== bScore) return bScore - aScore;
    return aName.localeCompare(bName);
  });
};

export type LabelSelectProps = IFilterProps &
  IFilterValueProps<Label> & {
    studioId?: string;
    studioName?: string;
    excludeIds?: string[];
  };

const _LabelSelect: React.FC<LabelSelectProps> = (props) => {
  const { configuration } = useConfigurationContext();
  const intl = useIntl();
  const ui = configuration?.ui as IUIConfig | undefined;
  const hideLabels = false; // no UI config toggle yet

  const maxOptionsShown =
    configuration?.ui?.maxOptionsShown ?? defaultMaxOptionsShown;
  const exclude = useMemo(() => props.excludeIds ?? [], [props.excludeIds]);

  async function loadLabels(input: string): Promise<Option[]> {
    if (!props.studioId) return [];

    const filter = new ListFilterModel(GQL.FilterMode.Labels);
    filter.searchTerm = input;
    filter.currentPage = 1;
    filter.itemsPerPage = maxOptionsShown;
    filter.sortBy = "name";
    filter.sortDirection = GQL.SortDirectionEnum.Asc;

    // Restrict labels to the studio scope (a label is a child of a studio)
    const studioCriterion = new StudiosCriterion();
    studioCriterion.value = {
      items: [
        {
          id: props.studioId,
          label: props.studioName ?? "",
        },
      ],
      excluded: [],
      depth: 0,
    };
    filter.criteria = [studioCriterion];

    const query = await queryFindLabelsForSelect(filter);
    let ret = query.data.findLabels.labels.filter((l) => {
      return !exclude.includes(l.id.toString());
    });

    ret = sortLabelsByRelevance(input, ret);

    return ret.map((label) => ({
      value: label.id.toString(),
      object: label as Label,
    }));
  }

  const LabelOption: React.FC<OptionProps<Option, boolean>> = (optionProps) => {
    const { object } = optionProps.data;
    return (
      <reactSelectComponents.Option {...optionProps}>
        {object.name}
      </reactSelectComponents.Option>
    );
  };

  const LabelValueLabel: React.FC<SingleValueProps<Option, boolean>> = (
    optionProps
  ) => {
    const { object } = optionProps.data;
    return (
      <reactSelectComponents.SingleValue {...optionProps}>
        {object.name}
      </reactSelectComponents.SingleValue>
    );
  };

  // react-select expects an Option even when we're in single-select mode
  const placeholder =
    props.noSelectionString ??
    intl.formatMessage(
      { id: "actions.select_entity" },
      {
        entityType: intl.formatMessage({ id: "label" }),
      }
    );

  if (hideLabels) return null;

  return (
    <FilterSelectComponent<Label, boolean>
      key={props.studioId ?? "no-studio"}
      {...props}
      className={cx("label-select", props.className, {
        "label-select-active": props.active,
      })}
      loadOptions={loadLabels}
      isMulti={false}
      closeMenuOnSelect
      isClearable
      placeholder={placeholder}
      components={{
        Option: LabelOption,
        SingleValue: LabelValueLabel,
      }}
    />
  );
};

export const LabelSelect = _LabelSelect;

export interface LabelIDSelectProps
  extends Omit<LabelSelectProps, "values">,
    IFilterIDProps<Label> {
  studioId?: string;
  studioName?: string;
}

const _LabelIDSelect: React.FC<LabelIDSelectProps> = (props) => {
  const { ids, onSelect: onSelectValues } = props;

  const [values, setValues] = useState<Label[]>([]);
  const idsChanged = useCompare(ids);
  const isMounted = useIsMounted();

  function onSelect(items: Label[]) {
    setValues(items);
    onSelectValues?.(items);
  }

  async function loadObjectsByID(idsToLoad: string[]): Promise<Label[]> {
    const query = await queryFindLabelsByIDForSelect(idsToLoad);
    const { labels } = query.data.findLabels;
    return labels as unknown as Label[];
  }

  useEffect(() => {
    if (!idsChanged) return;

    if (!ids || ids.length === 0) {
      setValues([]);
      return;
    }

    const load = async () => {
      const items = await loadObjectsByID(ids);
      if (isMounted.current) {
        setValues(items);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, idsChanged]);

  return (
    <LabelSelect
      {...props}
      values={values}
      onSelect={onSelect}
      isDisabled={props.isDisabled || !props.studioId}
    />
  );
};

export const LabelIDSelect = _LabelIDSelect;

